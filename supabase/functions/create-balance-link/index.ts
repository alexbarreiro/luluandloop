// create-balance-link — staff-only: locks in the shipping amount for the
// 60% balance and stores the customer's PORTAL link on the order row.
// The portal collects the balance with Stripe Embedded Checkout, so the
// customer never leaves luluandloop.com (the session itself is created at
// pay time by order-portal's `pay-balance` action, which mirrors the
// shipping precedence below).
// Deployed with JWT verification ON; additionally requires an active staff profile.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://luluandloop.com";

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

  // Identify the caller from their JWT and require an active staff profile
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const { data: profile } = await admin
    .from("profiles").select("id, role, active").eq("id", userData.user.id).single();
  if (!profile?.active || (profile.role !== "owner" && profile.role !== "supervisor")) {
    return json({ error: "managers only" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const orderId = String(body.order_id ?? "");
  const shipping = Number(body.shipping ?? 0);
  if (!orderId) return json({ error: "order_id required" }, 400);
  if (!Number.isFinite(shipping) || shipping < 0 || shipping > 500) {
    return json({ error: "bad shipping amount" }, 400);
  }

  const { data: order, error: ordErr } = await admin
    .from("orders")
    .select("id, code, item, email, balance, lang, balance_paid_at, shipping_rate, shipping, shipping_waived, share_token")
    .eq("id", orderId).single();
  if (ordErr || !order) return json({ error: "order not found" }, 404);
  if (order.balance_paid_at) return json({ error: "balance already paid" }, 409);

  // Shipping precedence: explicit override → customer price set in the studio
  // (markup/waived) → the chosen rate's cost → 0
  const rateAmount = Number((order.shipping_rate as { amount?: string } | null)?.amount ?? NaN);
  let effectiveShipping: number;
  if (body.shipping != null) effectiveShipping = shipping;
  else if (order.shipping_waived) effectiveShipping = 0;
  else if (order.shipping != null) effectiveShipping = Number(order.shipping);
  else if (Number.isFinite(rateAmount)) effectiveShipping = Math.round(rateAmount * 100) / 100;
  else effectiveShipping = 0;

  const lang = order.lang === "es" ? "es" : "en";
  const portalUrl =
    `${SITE_URL}/orders/?code=${encodeURIComponent(order.code)}&t=${order.share_token}&lang=${lang}`;

  await admin.from("orders").update({
    balance_url: portalUrl,
    balance_sent_at: new Date().toISOString(),
    shipping: effectiveShipping,
    // the courtesy flag only survives if the customer truly pays $0 shipping
    shipping_waived: order.shipping_waived && effectiveShipping === 0,
  }).eq("id", order.id);

  return json({ url: portalUrl, shipping: effectiveShipping });
});
