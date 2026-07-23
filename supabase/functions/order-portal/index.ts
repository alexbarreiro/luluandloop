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

const ORDER_FIELDS = "id, code, item, size_label, desc_text, colors, rush, lang, price, deposit, " +
  "balance, shipping, stage, img, created_at, approved_at, quote_note, balance_url, " +
  "balance_paid_at, deposit_paid_at, tracking_number, tracking_url, customer, email, share_token";

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

  // ---- multipart: send a message (optionally with a photo) ----
  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try { form = await req.formData(); } catch { return json({ error: "bad form" }, 400); }
    const code = String(form.get("code") ?? "").slice(0, 20);
    const token = String(form.get("token") ?? "").slice(0, 40);
    const body = String(form.get("body") ?? "").trim().slice(0, 2000);
    const file = form.get("file");
    const order = await loadOrder(code, token, email);
    if (!order) return json({ error: "order not found — check your link" }, 403);
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

  if (action === "list") {
    if (!email) return json({ error: "sign in to list your orders" }, 401);
    // Escape LIKE metacharacters — the email must match literally (case-insensitive)
    const pattern = email.replace(/([\\%_])/g, "\\$1");
    const { data } = await admin.from("orders").select(ORDER_FIELDS)
      .eq("pending", false).ilike("email", pattern)
      .order("created_at", { ascending: false });
    return json({ orders: (data ?? []).map(publicOrder) });
  }

  const order = await loadOrder(code, token, email);
  if (!order) return json({ error: "order not found — check your link or sign in" }, 403);

  if (action === "get") {
    return json({ order: publicOrder(order), messages: await messagesFor(order.id as string) });
  }

  if (action === "approve") {
    if (order.approved_at) return json({ ok: true, already: true });
    const { error } = await admin.from("orders")
      .update({ approved_at: new Date().toISOString() }).eq("id", order.id);
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
