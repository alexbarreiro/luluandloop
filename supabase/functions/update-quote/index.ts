// update-quote — manager adjusts the final price while an order is in
// Quote review (stage 0-1). The deposit is already paid and stays fixed;
// the balance is recomputed. A system message records the change for the
// customer thread. Deploy with JWT verification ON.
import { createClient } from "npm:@supabase/supabase-js@2";

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
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const { data: caller } = await admin
    .from("profiles").select("id, name, role, active").eq("id", userData.user.id).single();
  if (!caller?.active || (caller.role !== "owner" && caller.role !== "supervisor")) {
    return json({ error: "managers only" }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const orderId = String(body.order_id ?? "");
  const price = Number(body.price);
  const note = String(body.note ?? "").trim().slice(0, 500);
  if (!orderId || !Number.isFinite(price)) return json({ error: "order_id and price required" }, 400);

  const { data: order } = await admin.from("orders")
    .select("id, code, stage, deposit, price, lang").eq("id", orderId).single();
  if (!order) return json({ error: "order not found" }, 404);
  if (order.stage > 1) return json({ error: "the price can only change during Quote review" }, 409);

  const deposit = Number(order.deposit);
  if (price < deposit) return json({ error: `price can't be below the paid deposit ($${deposit})` }, 400);
  if (price > 2000) return json({ error: "price out of range" }, 400);
  const balance = Math.round((price - deposit) * 100) / 100;

  const { error: upErr } = await admin.from("orders")
    .update({ price, balance, quote_note: note }).eq("id", order.id);
  if (upErr) return json({ error: "could not update quote" }, 500);

  const es = order.lang === "es";
  const oldP = Number(order.price);
  const msg = (es
    ? `Cotización actualizada: $${oldP} → $${price} (anticipo pagado $${deposit} · saldo $${balance})`
    : `Quote updated: $${oldP} → $${price} (deposit paid $${deposit} · balance $${balance})`) +
    (note ? ` — ${note}` : "");
  await admin.from("messages").insert({
    order_id: order.id, sender_kind: "staff", sender_id: caller.id,
    sender_name: caller.name, kind: "system", body: msg,
  });
  return json({ ok: true, price, balance });
});
