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
    .select("id, code, item, size_label, email, shipping_name, shipping_address, shipping_rate, tracking_number, balance_paid_at, balance_sent_at, shipping, shipping_waived, artisan_id")
    .eq("id", orderId).single();
  if (!order) return json({ error: "order not found" }, 404);
  // Once the balance link exists the customer's shipping price is locked
  const priceLocked = !!(order.balance_sent_at || order.balance_paid_at);

  // Ship-from: the assigned artisan's own address (e.g. Mexico) when set,
  // otherwise the studio's Boston address
  let shipFrom: Record<string, unknown> = SHIP_FROM as Record<string, unknown>;
  if (order.artisan_id) {
    const { data: artisan } = await admin.from("profiles")
      .select("ship_from").eq("id", order.artisan_id).single();
    const af = artisan?.ship_from as Record<string, unknown> | null;
    if (af?.street1 && af?.city && af?.country) shipFrom = af;
  }
  const originCountry = String(shipFrom.country ?? "US").toUpperCase();

  // 'manual-ship' — shipping handled outside Shippo (e.g. an Envia.com label
  // for a Mexico-origin shipment): manager records cost, optional customer
  // price, tracking number and label URL
  if (action === "manual-ship") {
    if (!isManager) return json({ error: "managers only" }, 403);
    const cost = Number(body.cost);
    const tracking = String(body.tracking ?? "").trim().slice(0, 60);
    const labelUrl = String(body.label_url ?? "").trim().slice(0, 500);
    if (!Number.isFinite(cost) || cost < 0 || cost > 1000) return json({ error: "bad cost" }, 400);
    const patch: Record<string, unknown> = {
      shipping_cost: Math.round(cost * 100) / 100,
      shipping_rate: { rate_id: "manual", provider: String(body.provider ?? "Manual").slice(0, 40),
        service: String(body.service ?? "").slice(0, 80), amount: String(cost), currency: "USD", days: null },
    };
    if (!priceLocked && body.price != null) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0 || price > 1000) return json({ error: "bad price" }, 400);
      patch.shipping = Math.round(price * 100) / 100;
      patch.shipping_waived = false;
    }
    if (tracking) {
      patch.tracking_number = tracking;
      patch.tracking_url = /^https?:\/\//.test(String(body.tracking_url ?? "")) ? String(body.tracking_url) : null;
    }
    if (labelUrl && /^https?:\/\//.test(labelUrl)) patch.label_url = labelUrl;
    const { error } = await admin.from("orders").update(patch).eq("id", order.id);
    if (error) return json({ error: "could not save manual shipping" }, 500);
    return json({ ok: true });
  }

  // 'choose' stores the picked rate; our cost + a default customer price
  if (action === "choose") {
    if (!isManager) return json({ error: "managers only" }, 403);
    const r = body.rate as Record<string, unknown> | null;
    if (!r || !r.rate_id || !Number.isFinite(Number(r.amount))) return json({ error: "bad rate" }, 400);
    const clean = {
      rate_id: String(r.rate_id).slice(0, 64), provider: String(r.provider ?? "").slice(0, 40),
      service: String(r.service ?? "").slice(0, 80), amount: String(Number(r.amount)),
      currency: String(r.currency ?? "USD").slice(0, 4), days: Number(r.days) || null,
    };
    const cost = Math.round(Number(r.amount) * 100) / 100;
    const patch: Record<string, unknown> = { shipping_rate: clean, shipping_cost: cost };
    if (!priceLocked) {
      patch.shipping = cost;   // default customer price = our cost (markup via set-shipping)
      patch.shipping_waived = false;
    }
    const { error } = await admin.from("orders").update(patch).eq("id", order.id);
    if (error) return json({ error: "could not save rate" }, 500);
    return json({ ok: true, rate: clean });
  }

  // 'set-shipping' — manager sets the customer-facing price (markup or waive)
  if (action === "set-shipping") {
    if (!isManager) return json({ error: "managers only" }, 403);
    if (priceLocked) return json({ error: "shipping price is locked — the balance link was already sent" }, 409);
    const waived = Boolean(body.waived);
    const price = waived ? 0 : Number(body.price);
    if (!waived && (!Number.isFinite(price) || price < 0 || price > 500)) {
      return json({ error: "bad shipping price" }, 400);
    }
    const { error } = await admin.from("orders").update({
      shipping: Math.round(price * 100) / 100,
      shipping_waived: waived,
    }).eq("id", order.id);
    if (error) return json({ error: "could not save shipping price" }, 500);
    return json({ ok: true, shipping: price, waived });
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
      address_from: shipFrom, address_to: addressTo,
      parcels: [parcelFor(order.item, order.size_label ?? "")],
      async: false,
      ...(addr.country !== originCountry ? {
        customs_declaration: await shippo("/customs/declarations/", {
          contents_type: "MERCHANDISE", non_delivery_option: "RETURN", certify: true,
          certify_signer: String(shipFrom.name ?? "Lulu & Loop"), eel_pfc: "NOEEI_30_37_a",
          items: [{
            description: "Handmade crochet item", quantity: 1,
            net_weight: parcelFor(order.item, order.size_label ?? "").weight,
            mass_unit: "lb", value_amount: "50", value_currency: "USD",
            origin_country: originCountry,
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
    if (!rates.length && originCountry !== "US") {
      return json({ rates, origin_country: originCountry,
        hint: "No Shippo rates for this origin — Shippo needs your own DHL/FedEx/UPS account for non-US origins. Buy the label on Envia.com and record it with Manual shipping below." });
    }
    return json({ rates, origin_country: originCountry });
  }

  if (action === "buy") {
    if (!isManager) return json({ error: "managers only" }, 403);
    // The shipping fee (part of the balance) must be paid before we print,
    // even when shipping was waived — the balance itself is still due
    if (!order.balance_paid_at) {
      return json({ error: "The balance (incl. shipping fee) must be paid before printing the label" }, 409);
    }
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
