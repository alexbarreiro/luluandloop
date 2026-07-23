// shippo — shipping rates + label purchase for an order.
// Actions: {action:'rates', order_id} → live rates for the order's address
//          {action:'buy', order_id, rate_id} → purchase label, store tracking
// Staff JWT required; 'buy' is manager-only (owner/supervisor).
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const SHIPPO_TOKEN = Deno.env.get("SHIPPO_API_TOKEN") ?? "";
// Ship-from studio address (JSON secret; placeholder until the real one is set).
// Parsed defensively: a malformed secret must not brick the whole function.
const SHIP_FROM_DEFAULT = {
  name: "Lulu & Loop", street1: "1 Beacon St", city: "Boston",
  state: "MA", zip: "02108", country: "US",
  email: "hello@luluandloop.com", phone: "6175550100", // USPS requires a phone
};
let SHIP_FROM: Record<string, string> | null = SHIP_FROM_DEFAULT;
const rawShipFrom = Deno.env.get("SHIP_FROM");
if (rawShipFrom) {
  try { SHIP_FROM = JSON.parse(rawShipFrom); } catch { SHIP_FROM = null; }
}

// Default parcels per category (inches / lb), scaled a little by size index
const PARCELS: Record<string, { l: number; w: number; h: number; lb: number }> = {
  dolls: { l: 10, w: 8, h: 6, lb: 0.8 },
  blankets: { l: 12, w: 10, h: 6, lb: 1.6 },
  baby: { l: 10, w: 8, h: 4, lb: 0.9 },
  wear: { l: 10, w: 8, h: 4, lb: 0.8 },
  minis: { l: 7, w: 5, h: 3, lb: 0.4 },
  home: { l: 12, w: 10, h: 6, lb: 1.4 },
};
function parcelFor(item: string, sizeLabel: string) {
  const key = /blanket|cobija/i.test(item) ? "blankets"
    : /baby|bebé|layette|ajuar/i.test(item) ? "baby"
    : /beanie|scarf|cardigan|gorro|bufanda/i.test(item) ? "wear"
    : /charm|mini|llavero/i.test(item) ? "minis"
    : /pillow|garland|wall|cojín|guirnalda/i.test(item) ? "home"
    : "dolls";
  const p = PARCELS[key];
  const big = /grand|showpiece|throw|crib|gigante|sofá|cuna|full/i.test(sizeLabel) ? 1.6 : 1;
  return {
    length: String(p.l * (big > 1 ? 1.3 : 1)), width: String(p.w), height: String(p.h),
    distance_unit: "in", weight: String((p.lb * big).toFixed(1)), mass_unit: "lb",
  };
}

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
function shippo(path: string, body?: unknown) {
  return fetch(`https://api.goshippo.com${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `ShippoToken ${SHIPPO_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.detail ?? "Shippo request failed");
    return j;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    return await handle(req);
  } catch (e) {
    // Shippo/API errors must come back with CORS so the studio can show them
    return json({ error: e instanceof Error ? e.message : "unexpected error" }, 502);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const { data: caller } = await admin
    .from("profiles").select("role, active").eq("id", userData.user.id).single();
  if (!caller?.active) return json({ error: "forbidden" }, 403);
  const isManager = caller.role === "owner" || caller.role === "supervisor";

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const action = String(body.action ?? "");
  const orderId = String(body.order_id ?? "");
  if (!orderId) return json({ error: "order_id required" }, 400);

  const { data: order } = await admin.from("orders")
    .select("id, code, item, size_label, email, shipping_name, shipping_address, shipping_rate, tracking_number")
    .eq("id", orderId).single();
  if (!order) return json({ error: "order not found" }, 404);

  // 'choose' stores the picked rate (no Shippo call, manager-only)
  if (action === "choose") {
    if (!isManager) return json({ error: "managers only" }, 403);
    const r = body.rate as Record<string, unknown> | null;
    if (!r || !r.rate_id || !Number.isFinite(Number(r.amount))) return json({ error: "bad rate" }, 400);
    const clean = {
      rate_id: String(r.rate_id).slice(0, 64), provider: String(r.provider ?? "").slice(0, 40),
      service: String(r.service ?? "").slice(0, 80), amount: String(Number(r.amount)),
      currency: String(r.currency ?? "USD").slice(0, 4), days: Number(r.days) || null,
    };
    const { error } = await admin.from("orders").update({ shipping_rate: clean }).eq("id", order.id);
    if (error) return json({ error: "could not save rate" }, 500);
    return json({ ok: true, rate: clean });
  }
  if (!SHIPPO_TOKEN) return json({ error: "Shipping is not configured yet (missing Shippo token)" }, 501);
  if (!SHIP_FROM) return json({ error: "SHIP_FROM secret is not valid JSON — re-set it as a JSON object" }, 500);
  const addr = order.shipping_address as Record<string, string> | null;
  if (!addr?.line1 || !addr?.country) {
    return json({ error: "No shipping address on this order yet (collected at deposit checkout)" }, 409);
  }
  const addressTo = {
    name: order.shipping_name || "Customer", email: order.email ?? undefined,
    street1: addr.line1, street2: addr.line2 ?? "", city: addr.city ?? "",
    state: addr.state ?? "", zip: addr.postal_code ?? "", country: addr.country,
  };

  if (action === "rates") {
    const shipment = await shippo("/shipments/", {
      address_from: SHIP_FROM, address_to: addressTo,
      parcels: [parcelFor(order.item, order.size_label ?? "")],
      async: false,
      ...(addr.country !== "US" ? {
        customs_declaration: await shippo("/customs/declarations/", {
          contents_type: "MERCHANDISE", non_delivery_option: "RETURN", certify: true,
          certify_signer: SHIP_FROM.name, eel_pfc: "NOEEI_30_37_a",
          items: [{
            description: "Handmade crochet item", quantity: 1,
            net_weight: parcelFor(order.item, order.size_label ?? "").weight,
            mass_unit: "lb", value_amount: "50", value_currency: "USD",
            origin_country: "US",
          }],
        }).then((d: { object_id: string }) => d.object_id),
      } : {}),
    });
    const rates = (shipment.rates ?? [])
      .map((r: Record<string, unknown>) => ({
        rate_id: r.object_id, provider: r.provider, service: (r.servicelevel as Record<string, unknown>)?.name,
        amount: r.amount, currency: r.currency, days: r.estimated_days,
      }))
      .sort((a: { amount: string }, b: { amount: string }) => Number(a.amount) - Number(b.amount))
      .slice(0, 6);
    return json({ rates });
  }

  if (action === "buy") {
    if (!isManager) return json({ error: "managers only" }, 403);
    const rateId = String(body.rate_id ?? "");
    if (!rateId) return json({ error: "rate_id required" }, 400);
    // Atomically claim the purchase so concurrent clicks can't buy two labels
    const { data: claimed } = await admin.from("orders")
      .update({ tracking_number: "PENDING" })
      .eq("id", order.id).is("tracking_number", null).select("id");
    if (!claimed?.length) return json({ error: "label already purchased" }, 409);
    let tx: Record<string, any>;
    try {
      tx = await shippo("/transactions/", { rate: rateId, label_file_type: "PDF", async: false });
    } catch (e) {
      await admin.from("orders").update({ tracking_number: null }).eq("id", order.id);
      throw e;
    }
    if (tx.status !== "SUCCESS") {
      await admin.from("orders").update({ tracking_number: null }).eq("id", order.id);
      return json({ error: (tx.messages ?? []).map((m: { text: string }) => m.text).join("; ") || "label purchase failed" }, 502);
    }
    // The PDF can lag the SUCCESS status by a few seconds — poll briefly
    let labelUrl = tx.label_url ?? null;
    for (let i = 0; i < 3 && !labelUrl; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const fresh = await shippo(`/transactions/${tx.object_id}`);
      labelUrl = fresh.label_url ?? null;
    }
    const { error: upErr } = await admin.from("orders").update({
      label_url: labelUrl,
      tracking_number: tx.tracking_number,
      tracking_url: tx.tracking_url_provider,
    }).eq("id", order.id);
    if (upErr) return json({ error: "label bought but could not be saved — check Shippo dashboard" }, 500);
    return json({ label_url: labelUrl, tracking_number: tx.tracking_number, tracking_url: tx.tracking_url_provider });
  }

  // Recover a label PDF that Shippo generated late (e.g. after billing was fixed)
  if (action === "refresh-label") {
    if (!isManager) return json({ error: "managers only" }, 403);
    if (!order.tracking_number) return json({ error: "no label purchased yet" }, 409);
    const list = await shippo("/transactions/?results=50");
    const tx = (list.results ?? []).find(
      (t: Record<string, unknown>) => t.tracking_number === order.tracking_number);
    if (!tx?.label_url) return json({ error: "Label PDF not available yet — check Shippo billing/settings" }, 404);
    await admin.from("orders").update({ label_url: tx.label_url }).eq("id", order.id);
    return json({ label_url: tx.label_url });
  }

  return json({ error: "unknown action" }, 400);
}
