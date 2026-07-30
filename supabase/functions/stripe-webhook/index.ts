// stripe-webhook — marks deposits/balances paid when Stripe confirms payment.
// Public endpoint (deploy with --no-verify-jwt); authenticity comes from the
// Stripe signature header, verified against STRIPE_WEBHOOK_SECRET.
import Stripe from "npm:stripe@14";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, WEBHOOK_SECRET);
  } catch {
    return new Response("bad signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const kind = session.metadata?.kind;
    const orderId = session.metadata?.order_id;
    const ref = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? session.id;

    let dbError = null;
    if (orderId && kind === "deposit") {
      // Stripe surfaces the collected address under shipping_details
      // (or collected_information on newer API versions). When the wizard
      // already collected the address, Stripe has none — keep ours.
      const ship = (session as unknown as Record<string, any>).shipping_details ??
        (session as unknown as Record<string, any>).collected_information?.shipping_details ?? null;
      const { error } = await supabase.from("orders").update({
        pending: false,
        stage: 0, // New request — deposit is always paid upfront
        deposit_paid_at: new Date().toISOString(),
        deposit_ref: ref,
        ...(ship?.address ? { shipping_name: ship?.name ?? null, shipping_address: ship.address } : {}),
      }).eq("id", orderId).eq("pending", true); // idempotent: no-op on retries
      dbError = error;
      // Keep the address on the customer record for reuse — but never clobber
      // an existing saved address (checkout emails are unverified; the portal
      // profile is the authoritative way to CHANGE a saved address)
      if (!error) {
        const { data: o } = await supabase.from("orders")
          .select("email, shipping_name, shipping_address").eq("id", orderId).single();
        if (o?.email && o.shipping_address) {
          const key = String(o.email).toLowerCase();
          const { data: existing } = await supabase.from("customer_prefs")
            .select("ship_to").eq("email", key).maybeSingle();
          if (!existing?.ship_to) {
            await supabase.from("customer_prefs").upsert({
              email: key,
              ship_name: o.shipping_name ?? null,
              ship_to: o.shipping_address,
              updated_at: new Date().toISOString(),
            }, { onConflict: "email" });
          }
        }
      }
    } else if (orderId && kind === "balance") {
      const { error } = await supabase.from("orders").update({
        balance_paid_at: new Date().toISOString(),
        balance_ref: ref,
      }).eq("id", orderId);
      dbError = error;
    }
    if (dbError) {
      // Non-2xx makes Stripe retry the event; both updates are idempotent
      console.error("order update failed", orderId, dbError);
      return new Response("db update failed", { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
