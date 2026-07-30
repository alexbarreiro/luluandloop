// order-portal — the customer's window into their order.
// Public endpoint (deploy with --no-verify-jwt). Two ways in:
//   · anonymous: order code + share token (from the confirmation email)
//   · account:   Supabase auth JWT whose email matches the order
// Actions: get · list (JWT only) · message (multipart, optional photo) · approve
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

// shipping_cost (our label cost) is intentionally absent — customers see only
// their price; shipping_waived lets the portal celebrate the courtesy
const ORDER_FIELDS = "id, code, item, size_label, desc_text, colors, rush, lang, price, deposit, " +
  "balance, shipping, shipping_waived, stage, img, created_at, approved_at, quote_note, balance_url, " +
  "balance_paid_at, deposit_paid_at, deposit_ref, balance_ref, tracking_number, tracking_url, " +
  "customer, email, share_token, concept_path, photo_path";

async function jwtEmail(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  return data?.user?.email ?? null;
}

function publicOrder(o: Record<string, unknown>) {
  const { share_token: _t, email: _e, ...rest } = o;
  return rest;
}

// The order's display picture: approved final photo > AI concept > stock img.
// Returns a signed URL for bucket paths, null when only the stock img applies.
async function orderImgUrl(o: Record<string, unknown>): Promise<string | null> {
  const path = (o.photo_path ?? o.concept_path) as string | null;
  if (!path) return null;
  const { data } = await admin.storage.from("evidence").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

async function loadOrder(code: string, token: string, email: string | null) {
  if (!code) return null;
  const { data: o } = await admin.from("orders").select(ORDER_FIELDS)
    .eq("code", code).eq("pending", false).single();
  if (!o) return null;
  const tokenOk = token && String(o.share_token) === token;
  const emailOk = email && o.email && o.email.toLowerCase() === email.toLowerCase();
  return tokenOk || emailOk ? o : null;
}

async function messagesFor(orderId: string) {
  const { data } = await admin.from("messages")
    .select("id, sender_kind, sender_name, kind, body, photo_path, created_at")
    .eq("order_id", orderId).order("created_at");
  const out = [];
  for (const m of data ?? []) {
    let photo_url = null;
    if (m.photo_path) {
      const { data: s } = await admin.storage.from("evidence").createSignedUrl(m.photo_path, 3600);
      photo_url = s?.signedUrl ?? null;
    }
    out.push({ ...m, photo_path: undefined, photo_url });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const email = await jwtEmail(req);
  const ct = req.headers.get("content-type") ?? "";

  // ---- multipart: send a message OR submit a review (optional photo) ----
  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try { form = await req.formData(); } catch { return json({ error: "bad form" }, 400); }
    const code = String(form.get("code") ?? "").slice(0, 20);
    const token = String(form.get("token") ?? "").slice(0, 40);
    const body = String(form.get("body") ?? "").trim().slice(0, 2000);
    const file = form.get("file");
    const rating = form.get("rating") != null ? Number(form.get("rating")) : null;
    const order = await loadOrder(code, token, email);
    if (!order) return json({ error: "order not found — check your link" }, 403);

    // Review submission (rating present)
    if (rating != null) {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: "rating must be 1-5" }, 400);
      if (order.stage < 4) return json({ error: "reviews open once your piece has shipped" }, 409);
      let photoPath: string | null = null;
      if (file instanceof File && file.size > 0) {
        if (file.size > 25 * 1024 * 1024) return json({ error: "photo too large (max 25MB)" }, 413);
        const ALLOWED = /^(image\/(jpeg|png|gif|webp|heic|heif)|video\/(mp4|quicktime|webm))$/;
        if (!ALLOWED.test(file.type)) return json({ error: "photos or short videos only" }, 415);
        const safe = file.name.replace(/[^\w.-]+/g, "_").slice(0, 80);
        photoPath = `reviews/${order.code}/${Date.now()}-${safe}`;
        const { error } = await admin.storage.from("evidence")
          .upload(photoPath, file.stream(), { contentType: file.type, duplex: "half" });
        if (error) return json({ error: "photo upload failed — try again" }, 500);
      }
      const { error: revErr } = await admin.from("reviews").insert({
        order_id: order.id, rating, body: body.slice(0, 1500), photo_path: photoPath,
      });
      if (revErr) {
        if (photoPath) await admin.storage.from("evidence").remove([photoPath]);
        return json({ error: String(revErr.code) === "23505"
          ? "you already reviewed this piece — thank you!" : "could not save review" }, 409);
      }
      return json({ ok: true, review: { rating, body } });
    }

    if (!body && !(file instanceof File)) return json({ error: "empty message" }, 400);

    let photoPath: string | null = null;
    if (file instanceof File) {
      if (file.size > 25 * 1024 * 1024) return json({ error: "photo too large (max 25MB)" }, 413);
      const ALLOWED = /^(image\/(jpeg|png|gif|webp|heic|heif)|video\/(mp4|quicktime|webm))$/;
      if (!ALLOWED.test(file.type)) return json({ error: "photos or short videos only" }, 415);
      const safe = file.name.replace(/[^\w.-]+/g, "_").slice(0, 80);
      photoPath = `chat/${order.code}/${Date.now()}-${safe}`;
      const { error } = await admin.storage.from("evidence")
        .upload(photoPath, file.stream(), { contentType: file.type, duplex: "half" });
      if (error) return json({ error: "photo upload failed — try again" }, 500);
    }
    const { error: msgErr } = await admin.from("messages").insert({
      order_id: order.id, sender_kind: "customer", sender_name: order.customer,
      kind: "chat", body, photo_path: photoPath,
    });
    if (msgErr) return json({ error: "could not send" }, 500);
    return json({ ok: true, messages: await messagesFor(order.id as string) });
  }

  // ---- JSON actions ----
  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const action = String(payload.action ?? "");
  const code = String(payload.code ?? "").slice(0, 20);
  const token = String(payload.token ?? "").slice(0, 40);

  // ---- customer profile (account mode only) ----
  if (action === "profile-get" || action === "profile-set") {
    if (!email) return json({ error: "sign in first" }, 401);
    const key = email.toLowerCase();
    if (action === "profile-set") {
      const p = payload.prefs as Record<string, unknown> | null;
      // sanitize the shipping address to the Stripe address shape
      const ALLOWED = [
        "US", "CA", "MX", "GB", "IE", "FR", "ES", "DE", "IT", "PT", "NL", "BE",
        "CH", "AT", "SE", "NO", "DK", "FI", "PL", "CZ", "AU", "NZ", "JP", "KR",
        "SG", "BR", "AR", "CL", "CO", "CR", "PA", "DO", "PR",
      ];
      const rawShip = (p?.ship_to ?? null) as Record<string, unknown> | null;
      const clearShip = p?.ship_clear === true;
      const sf = (k: string, max = 200) => String(rawShip?.[k] ?? "").trim().slice(0, max);
      let shipTo: Record<string, string> | null = null;
      if (rawShip) {
        const a = {
          line1: sf("line1"), line2: sf("line2"), city: sf("city", 120),
          state: sf("state", 120), postal_code: sf("postal_code", 20),
          country: sf("country", 2).toUpperCase(),
        };
        const anyFilled = a.line1 || a.line2 || a.city || a.state || a.postal_code;
        if (a.line1 && a.city && a.postal_code && ALLOWED.includes(a.country)) shipTo = a;
        else if (anyFilled) return json({ error: "incomplete shipping address — street, city and postal code are required" }, 400);
      }
      const shipName = String(p?.ship_name ?? "").trim().slice(0, 120);
      const { error: prefErr } = await admin.from("customer_prefs").upsert({
        email: key,
        display_name: String(p?.display_name ?? "").trim().slice(0, 80),
        lang: p?.lang === "es" ? "es" : "en",
        marketing: p?.marketing !== false,
        ...(shipTo ? { ship_name: shipName || null, ship_to: shipTo } : {}),
        ...(clearShip ? { ship_name: null, ship_to: null } : {}),
        updated_at: new Date().toISOString(),
      });
      if (prefErr) return json({ error: "could not save profile — try again" }, 500);
      if (shipTo) {
        // Apply the new address only where shipping is still fluid: no label,
        // not shipped, and no balance link/payment (those lock the priced rate).
        // A previously chosen Shippo rate is cleared — it was quoted for the
        // OLD address and would print a label to the wrong place.
        const { data: affected, error: updErr } = await admin.from("orders")
          .update({
            shipping_address: shipTo, shipping_name: shipName || null,
            shipping_rate: null, shipping_cost: null,
          })
          .eq("email", key).is("shipped_at", null).is("label_url", null)
          .is("balance_sent_at", null).is("balance_paid_at", null)
          .select("id, code");
        if (updErr) return json({ error: "could not update your orders — try again" }, 500);
        // Active orders we intentionally did NOT touch still need staff eyes
        const { data: locked } = await admin.from("orders")
          .select("id, code").eq("email", key)
          .is("shipped_at", null).not("balance_sent_at", "is", null)
          .is("balance_paid_at", null);
        const note = (code: string, touched: boolean) => touched
          ? `Customer updated their shipping address — the previously chosen shipping rate for ${code} was cleared; please re-quote shipping.`
          : `Customer updated their shipping address AFTER the balance link for ${code} was sent — review shipping and the label address before buying.`;
        for (const o of [...(affected ?? []).map((o) => ({ ...o, touched: true })),
                         ...(locked ?? []).map((o) => ({ ...o, touched: false }))]) {
          await admin.from("messages").insert({
            order_id: o.id, sender_kind: "system", sender_name: "system", kind: "system",
            body: note(String(o.code), o.touched),
          });
        }
      }
    }
    const { data: prefs } = await admin.from("customer_prefs")
      .select("display_name, lang, marketing, ship_name, ship_to")
      .eq("email", key).maybeSingle();
    return json({ prefs: prefs ?? { display_name: "", lang: "en", marketing: true, ship_name: "", ship_to: null }, email: key });
  }

  if (action === "list") {
    if (!email) return json({ error: "sign in to list your orders" }, 401);
    // Escape LIKE metacharacters — the email must match literally (case-insensitive)
    const pattern = email.replace(/([\\%_])/g, "\\$1");
    const { data } = await admin.from("orders").select(ORDER_FIELDS)
      .eq("pending", false).ilike("email", pattern)
      .order("created_at", { ascending: false });
    const out = [];
    for (const o of data ?? []) {
      out.push({ ...publicOrder(o), img_url: await orderImgUrl(o) });
    }
    return json({ orders: out });
  }

  const order = await loadOrder(code, token, email);
  if (!order) return json({ error: "order not found — check your link or sign in" }, 403);

  // ---- pay balance without leaving the site (embedded Stripe Checkout) ----
  // Creates the session at payment time; the webhook's existing kind=balance
  // handling completes the order exactly as with emailed hosted links.
  if (action === "pay-balance") {
    if (order.balance_paid_at) return json({ error: "balance already paid" }, 409);
    if (order.stage < 3) return json({ error: "your piece isn't ready for the balance yet" }, 409);
    const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!STRIPE_KEY) return json({ error: "payments not configured" }, 501);
    const { default: Stripe } = await import("npm:stripe@14");
    const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2023-10-16" });
    // shipping precedence mirrors create-balance-link
    const rateAmount = Number((order.shipping_rate as { amount?: string } | null)?.amount ?? NaN);
    let ship: number;
    if (order.shipping_waived) ship = 0;
    else if (order.shipping != null) ship = Number(order.shipping);
    else if (Number.isFinite(rateAmount)) ship = Math.round(rateAmount * 100) / 100;
    else ship = 0;
    const total = Number(order.balance) + ship;
    const es = order.lang === "es";
    const SITE_URL = Deno.env.get("SITE_URL") ?? "https://luluandloop.com";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded",
      payment_method_types: ["card"],
      customer_email: String(order.email ?? "") || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(total * 100),
          product_data: {
            name: es
              ? `Saldo 60% + envío · ${order.item} · ${order.code}`
              : `60% balance + shipping · ${order.item} · ${order.code}`,
          },
        },
      }],
      metadata: { kind: "balance", order_id: String(order.id), code: String(order.code) },
      locale: es ? "es" : "en",
      return_url: `${SITE_URL}/thanks/?kind=balance&code=${encodeURIComponent(String(order.code))}&lang=${es ? "es" : "en"}`,
    });
    return json({ client_secret: session.client_secret, total });
  }

  if (action === "get") {
    const { data: review } = await admin.from("reviews")
      .select("rating, body, created_at").eq("order_id", order.id).maybeSingle();
    let conceptUrl: string | null = null;
    if (order.concept_path) {
      const { data: signed } = await admin.storage.from("evidence")
        .createSignedUrl(order.concept_path as string, 3600);
      conceptUrl = signed?.signedUrl ?? null;
    }
    return json({ order: { ...publicOrder(order), img_url: await orderImgUrl(order) }, messages: await messagesFor(order.id as string), review, concept_url: conceptUrl });
  }

  if (action === "approve") {
    if (order.approved_at) return json({ ok: true, already: true });
    // the final photo the studio sent for approval becomes the order's picture
    const { data: apMsg } = await admin.from("messages")
      .select("photo_path").eq("order_id", order.id).eq("kind", "approval_request")
      .not("photo_path", "is", null).order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    const { error } = await admin.from("orders")
      .update({
        approved_at: new Date().toISOString(),
        ...(apMsg?.photo_path ? { photo_path: apMsg.photo_path } : {}),
      }).eq("id", order.id);
    if (error) return json({ error: "could not save approval" }, 500);
    await admin.from("messages").insert({
      order_id: order.id, sender_kind: "system", sender_name: "system", kind: "system",
      body: order.lang === "es"
        ? `${order.customer} aprobó la pieza terminada ✓`
        : `${order.customer} approved the finished piece ✓`,
    });
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
});
