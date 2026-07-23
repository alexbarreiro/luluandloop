// customer-upload — public, no-auth upload of a customer's photo/video,
// gated by the order's share token (emailed to them when the piece ships).
// Deploy with --no-verify-jwt.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const MAX_BYTES = 50 * 1024 * 1024; // 50MB — enough for a short phone video
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
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

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "multipart form expected" }, 400); }
  const code = String(form.get("code") ?? "").slice(0, 20);
  const token = String(form.get("token") ?? "").slice(0, 40);
  const note = String(form.get("note") ?? "").slice(0, 1000);
  const file = form.get("file");

  if (!code || !token) return json({ error: "missing code/token" }, 400);
  const { data: order } = await admin.from("orders")
    .select("id, code, share_token").eq("code", code).single();
  if (!order || String(order.share_token) !== token) {
    return json({ error: "This link doesn't match an order — check the link from your email" }, 403);
  }
  if (!(file instanceof File)) return json({ error: "no file attached" }, 400);
  if (file.size > MAX_BYTES) return json({ error: "file too large (max 50MB)" }, 413);
  // Concrete allowlist — notably NO image/svg+xml, which can carry scripts
  const ALLOWED = /^(image\/(jpeg|png|gif|webp|heic|heif)|video\/(mp4|quicktime|webm))$/;
  if (!ALLOWED.test(file.type)) return json({ error: "photos or videos only (JPG, PNG, GIF, WebP, HEIC, MP4, MOV, WebM)" }, 415);

  const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(0, 80);
  const path = `customer/${order.code}/${Date.now()}-${safeName}`;
  const { error: upErr } = await admin.storage.from("evidence")
    .upload(path, file.stream(), { contentType: file.type, duplex: "half" });
  if (upErr) return json({ error: "upload failed — try again" }, 500);

  await admin.from("customer_uploads").insert({ order_id: order.id, file_path: path, note });
  return json({ ok: true });
});
