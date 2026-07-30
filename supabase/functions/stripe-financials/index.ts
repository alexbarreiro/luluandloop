// stripe-financials — staff-only: pulls charge-level financials (gross, Stripe
// fee, net, refunds) for a date range so the Studio's Financials view can show
// real money numbers and export them. Deployed with JWT verification ON.
import Stripe from "npm:stripe@14";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const { data: profile } = await admin
    .from("profiles").select("role, active").eq("id", userData.user.id).single();
  if (!profile?.active || (profile.role !== "owner" && profile.role !== "supervisor")) {
    return json({ error: "managers only" }, 403);
  }

  let body: { from?: string; to?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const from = Date.parse(String(body.from ?? ""));
  const to = Date.parse(String(body.to ?? ""));
  if (!Number.isFinite(from) || !Number.isFinite(to)) return json({ error: "from/to dates required" }, 400);
  const gte = Math.floor(from / 1000);
  const lte = Math.floor(to / 1000) + 24 * 3600 - 1; // include the whole "to" day

  const charges: {
    created: string; amount: number; fee: number; net: number;
    payment_intent: string | null; status: string; refunded: number; currency: string;
  }[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 4; page++) {
    const res = await stripe.charges.list({
      created: { gte, lte }, limit: 100,
      expand: ["data.balance_transaction"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const ch of res.data) {
      if (ch.status !== "succeeded") continue;
      const bt = ch.balance_transaction as Stripe.BalanceTransaction | null;
      charges.push({
        created: new Date(ch.created * 1000).toISOString(),
        amount: ch.amount / 100,
        fee: bt ? bt.fee / 100 : 0,
        net: bt ? bt.net / 100 : ch.amount / 100,
        payment_intent: typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id ?? null,
        status: ch.status,
        refunded: (ch.amount_refunded ?? 0) / 100,
        currency: ch.currency,
      });
    }
    if (!res.has_more || !res.data.length) break;
    startingAfter = res.data[res.data.length - 1].id;
  }

  const totals = charges.reduce((t, c) => ({
    gross: t.gross + c.amount, fees: t.fees + c.fee,
    net: t.net + c.net, refunded: t.refunded + c.refunded, count: t.count + 1,
  }), { gross: 0, fees: 0, net: 0, refunded: 0, count: 0 });

  return json({ charges, totals });
});
