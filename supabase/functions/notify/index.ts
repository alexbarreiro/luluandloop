// notify — sends transactional email via Resend (hello@luluandloop.com).
// Called by database triggers (pg_net) with a shared secret; never by browsers.
// Deploy with --no-verify-jwt (pg_net sends no JWT; x-notify-secret is the auth).
// Kinds: task_created (staff), order_shipped (customer, incl. share link).
// No-ops gracefully when RESEND_API_KEY is not configured yet.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://luluandloop.com";
const FROM = Deno.env.get("FROM_EMAIL") ?? "Lulu & Loop <hello@luluandloop.com>";

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function shell(inner: string) {
  return `<div style="background:#FFF8F0;padding:32px 16px;font-family:'Nunito Sans',Verdana,sans-serif;color:#2A2A33">
  <div style="max-width:520px;margin:0 auto;background:#FFFEFC;border:1px solid #F0E2D8;border-radius:18px;padding:28px">
  <div style="font-weight:900;font-size:20px;margin-bottom:16px">Lulu <span style="color:#E4657E">&amp;</span> Loop</div>
  ${inner}
  <div style="font-size:12px;color:#B6B1BC;margin-top:24px">Lulu &amp; Loop · Boston, MA · hello@luluandloop.com</div>
  </div></div>`;
}
async function send(to: string, subject: string, html: string) {
  if (!RESEND_KEY) return { skipped: "no RESEND_API_KEY" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  return { status: r.status, body: await r.text() };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  if (!NOTIFY_SECRET || req.headers.get("x-notify-secret") !== NOTIFY_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  let body: { kind?: string; id?: string };
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  if (body.kind === "task_created" && body.id) {
    const { data: task } = await admin.from("tasks")
      .select("id, title, details, due_date, assignee_id, profiles!tasks_assignee_id_fkey(name, email)")
      .eq("id", body.id).single();
    const assignee = task?.profiles as { name?: string; email?: string } | null;
    if (!assignee?.email) return Response.json({ ok: true, skipped: "no assignee email" });
    const url = `${SITE_URL}/studio/?task=${task!.id}`;
    const res = await send(assignee.email,
      `New studio task: ${task!.title}`,
      shell(`<p style="font-size:15px">Hola ${esc(assignee.name?.split(" ")[0])} 👋</p>
        <p style="font-size:15px;line-height:1.6">You have a new task from the studio:</p>
        <p style="font-weight:800;font-size:16px;background:#FBDDE6;border-radius:12px;padding:14px 16px">${esc(task!.title)}</p>
        ${task!.details ? `<p style="font-size:14px;color:#6E6E7A;line-height:1.6">${esc(task!.details)}</p>` : ""}
        ${task!.due_date ? `<p style="font-size:13px;color:#6E6E7A">Due: <b>${esc(task!.due_date)}</b></p>` : ""}
        <a href="${url}" style="display:inline-block;background:#2A2A33;color:#FFF8F0;font-weight:800;padding:13px 24px;border-radius:999px;text-decoration:none;margin-top:8px">Open the studio →</a>
        <p style="font-size:12px;color:#B6B1BC;margin-top:14px">Sign in and upload your evidence right on the task.</p>`));
    return Response.json({ ok: true, res });
  }

  if (body.kind === "order_shipped" && body.id) {
    const { data: o } = await admin.from("orders")
      .select("code, customer, email, item, lang, tracking_number, tracking_url, share_token")
      .eq("id", body.id).single();
    if (!o?.email) return Response.json({ ok: true, skipped: "no customer email" });
    const share = `${SITE_URL}/share/?code=${encodeURIComponent(o.code)}&t=${o.share_token}&lang=${o.lang === "es" ? "es" : "en"}`;
    const es = o.lang === "es";
    const first = esc((o.customer || "").split(" ")[0]);
    const res = await send(o.email,
      es ? `¡Tu pieza va en camino! 🎁 · ${o.code}` : `Your piece is on its way! 🎁 · ${o.code}`,
      shell(es
        ? `<p style="font-size:15px">¡Hola ${first}!</p>
           <p style="font-size:15px;line-height:1.6">Tu <b>${esc(o.item)}</b> ya viene en camino, envuelta como el regalo que es. 🎁</p>
           ${o.tracking_number ? `<p style="font-size:14px">Rastreo: <a href="${esc(o.tracking_url ?? "#")}" style="color:#E4657E;font-weight:800">${esc(o.tracking_number)}</a></p>` : ""}
           <p style="font-size:15px;line-height:1.6">Cuando llegue, nos encantaría ver su carita al abrirla — ¿nos compartes una foto o video? Nos haría el día (y a Lulu la semana).</p>
           <a href="${share}" style="display:inline-block;background:#E4657E;color:#FFF4F2;font-weight:800;padding:13px 24px;border-radius:999px;text-decoration:none;margin-top:8px">Compartir mi foto/video →</a>
           <p style="font-size:12px;color:#B6B1BC;margin-top:14px">Sin cuentas ni contraseñas — el enlace ya conoce tu pedido.</p>`
        : `<p style="font-size:15px">Hi ${first}!</p>
           <p style="font-size:15px;line-height:1.6">Your <b>${esc(o.item)}</b> is on its way, wrapped like the gift it is. 🎁</p>
           ${o.tracking_number ? `<p style="font-size:14px">Tracking: <a href="${esc(o.tracking_url ?? "#")}" style="color:#E4657E;font-weight:800">${esc(o.tracking_number)}</a></p>` : ""}
           <p style="font-size:15px;line-height:1.6">When it arrives, we'd love to see its little face come out of the box — would you share a photo or video? It makes our day (and Lulu's whole week).</p>
           <a href="${share}" style="display:inline-block;background:#E4657E;color:#FFF4F2;font-weight:800;padding:13px 24px;border-radius:999px;text-decoration:none;margin-top:8px">Share my photo/video →</a>
           <p style="font-size:12px;color:#B6B1BC;margin-top:14px">No account needed — the link already knows your order.</p>`));
    return Response.json({ ok: true, res });
  }

  return Response.json({ ok: true, skipped: "unknown kind" });
});
