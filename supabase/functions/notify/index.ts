// notify — transactional email via Resend (hello@luluandloop.com), fired by
// database triggers (pg_net) with a shared secret; never called by browsers.
// Deploy with --no-verify-jwt (pg_net sends no JWT; x-notify-secret is the auth).
// Kinds: task_created (staff) · order_created · studio_message ·
//        approval_request · order_shipped (customer) · customer_message (studio)
// Every customer email is recorded in email_log for the Customers view.
// No-ops gracefully when RESEND_API_KEY is not configured.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://luluandloop.com";
const FROM = Deno.env.get("FROM_EMAIL") ?? "Lulu & Loop <hello@luluandloop.com>";
const STUDIO_INBOX = Deno.env.get("STUDIO_INBOX") ?? "hello@luluandloop.com";

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
function btn(href: string, label: string, dark = false) {
  return `<a href="${href}" style="display:inline-block;background:${dark ? "#2A2A33" : "#E4657E"};color:${dark ? "#FFF8F0" : "#FFF4F2"};font-weight:800;padding:13px 24px;border-radius:999px;text-decoration:none;margin-top:8px">${label}</a>`;
}
async function send(to: string, subject: string, html: string, log?: { order_id?: string; kind: string }) {
  if (!RESEND_KEY) return { skipped: "no RESEND_API_KEY" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  const ok = r.status < 300;
  if (ok && log) {
    await admin.from("email_log").insert({
      order_id: log.order_id ?? null, to_email: to, kind: log.kind, subject,
    });
  }
  return { status: r.status, body: await r.text() };
}

const O_FIELDS = "id, code, customer, email, item, lang, price, deposit, balance, shipping, " +
  "tracking_number, tracking_url, share_token, balance_url, stage, balance_paid_at";
function portalLink(o: Record<string, unknown>) {
  return `${SITE_URL}/orders/?code=${encodeURIComponent(String(o.code))}&t=${o.share_token}&lang=${o.lang === "es" ? "es" : "en"}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  if (!NOTIFY_SECRET || req.headers.get("x-notify-secret") !== NOTIFY_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  let body: { kind?: string; id?: string };
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  const kind = body.kind ?? "";
  const id = body.id ?? "";
  if (!id) return Response.json({ ok: true, skipped: "no id" });

  // ---------- staff task assignment ----------
  if (kind === "task_created") {
    const { data: task } = await admin.from("tasks")
      .select("id, title, details, due_date, profiles!tasks_assignee_id_fkey(name, email)")
      .eq("id", id).single();
    const assignee = task?.profiles as { name?: string; email?: string } | null;
    if (!assignee?.email) return Response.json({ ok: true, skipped: "no assignee email" });
    const url = `${SITE_URL}/studio/?task=${task!.id}`;
    const res = await send(assignee.email, `New studio task: ${task!.title}`,
      shell(`<p style="font-size:15px">Hola ${esc(assignee.name?.split(" ")[0])} 👋</p>
        <p style="font-size:15px;line-height:1.6">You have a new task from the studio:</p>
        <p style="font-weight:800;font-size:16px;background:#FBDDE6;border-radius:12px;padding:14px 16px">${esc(task!.title)}</p>
        ${task!.details ? `<p style="font-size:14px;color:#6E6E7A;line-height:1.6">${esc(task!.details)}</p>` : ""}
        ${task!.due_date ? `<p style="font-size:13px;color:#6E6E7A">Due: <b>${esc(task!.due_date)}</b></p>` : ""}
        ${btn(url, "Open the studio →", true)}`));
    return Response.json({ ok: true, res });
  }

  // ---------- order event (e.g. customer approved) → studio inbox ----------
  if (kind === "order_event") {
    const { data: m } = await admin.from("messages")
      .select("id, body, orders(code, customer, item)").eq("id", id).single();
    const o = m?.orders as { code?: string; customer?: string; item?: string } | null;
    if (!m || !o) return Response.json({ ok: true, skipped: "no message" });
    const res = await send(STUDIO_INBOX,
      `✓ ${o.code}: ${m.body}`,
      shell(`<p style="font-size:15px"><b>${esc(o.item)}</b> (${esc(o.code)}):</p>
        <p style="font-size:15px;line-height:1.6;background:#DFE9DD;border-radius:12px;padding:14px 16px">${esc(m.body)}</p>
        ${btn(`${SITE_URL}/studio/`, "Open the studio →", true)}`));
    return Response.json({ ok: true, res });
  }

  // ---------- customer message → studio inbox ----------
  if (kind === "customer_message") {
    const { data: m } = await admin.from("messages")
      .select("id, body, order_id, orders(code, customer, item)").eq("id", id).single();
    const o = m?.orders as { code?: string; customer?: string; item?: string } | null;
    if (!m || !o) return Response.json({ ok: true, skipped: "no message" });
    const res = await send(STUDIO_INBOX,
      `💬 ${o.customer} · ${o.code}: new message`,
      shell(`<p style="font-size:15px"><b>${esc(o.customer)}</b> wrote about <b>${esc(o.item)}</b> (${esc(o.code)}):</p>
        <p style="font-size:15px;line-height:1.6;background:#FFF8F0;border-radius:12px;padding:14px 16px">${esc(m.body) || "📷 (photo)"}</p>
        ${btn(`${SITE_URL}/studio/`, "Reply in the studio →", true)}`));
    return Response.json({ ok: true, res });
  }

  // ---------- customer-facing kinds (need the order) ----------
  let order: Record<string, unknown> | null = null;
  let message: Record<string, unknown> | null = null;
  if (kind === "studio_message" || kind === "approval_request") {
    const { data: m } = await admin.from("messages")
      .select(`id, body, kind, photo_path, sender_name, orders(${O_FIELDS})`).eq("id", id).single();
    message = m;
    order = (m?.orders as Record<string, unknown>) ?? null;
  } else {
    const { data: o } = await admin.from("orders").select(O_FIELDS).eq("id", id).single();
    order = o;
  }
  if (!order?.email) return Response.json({ ok: true, skipped: "no customer email" });
  const es = order.lang === "es";
  const first = esc(String(order.customer ?? "").split(" ")[0]);
  const portal = portalLink(order);
  const to = String(order.email);
  const oid = String(order.id);

  if (kind === "order_created") {
    const res = await send(to,
      es ? `¡Recibido! Tu pedido ${order.code} está en la fila 🧶` : `Got it! Your order ${order.code} is in the queue 🧶`,
      shell(es
        ? `<p style="font-size:15px">¡Hola ${first}!</p>
           <p style="font-size:15px;line-height:1.6">Recibimos tu anticipo para <b>${esc(order.item)}</b>. Tu número de pedido es:</p>
           <p style="font-weight:900;font-size:22px;background:#FBDDE6;border-radius:12px;padding:14px 16px;text-align:center">${esc(order.code)}</p>
           <p style="font-size:15px;line-height:1.6">Lulu revisa tu idea y confirma la cotización final en 24h. Desde tu portal puedes ver el estado, escribirnos y mandar fotos de referencia:</p>
           ${btn(portal, "Ver mi pedido →")}
           <p style="font-size:13px;color:#6E6E7A;margin-top:14px">Tip: crea tu cuenta con este mismo correo en el portal y verás todos tus pedidos en un solo lugar.</p>`
        : `<p style="font-size:15px">Hi ${first}!</p>
           <p style="font-size:15px;line-height:1.6">We received your deposit for <b>${esc(order.item)}</b>. Your order number is:</p>
           <p style="font-weight:900;font-size:22px;background:#FBDDE6;border-radius:12px;padding:14px 16px;text-align:center">${esc(order.code)}</p>
           <p style="font-size:15px;line-height:1.6">Lulu is reviewing your idea and will confirm the final quote within 24h. From your portal you can track status, message us, and send reference photos:</p>
           ${btn(portal, "View my order →")}
           <p style="font-size:13px;color:#6E6E7A;margin-top:14px">Tip: create an account with this same email on the portal to see all your orders in one place.</p>`),
      { order_id: oid, kind });
    return Response.json({ ok: true, res });
  }

  if (kind === "studio_message" && message) {
    if (message.kind === "system") {
      // Quote updates arrive as staff/system messages — customers must hear about them
      const res = await send(to,
        es ? `Cotización actualizada · ${order.code}` : `Your quote was updated · ${order.code}`,
        shell(`<p style="font-size:15px">${es ? `¡Hola ${first}!` : `Hi ${first}!`}</p>
          <p style="font-size:15px;line-height:1.6;background:#FFF8F0;border-radius:12px;padding:14px 16px">${esc(message.body)}</p>
          ${btn(portal, es ? "Ver mi pedido →" : "View my order →")}`),
        { order_id: oid, kind: "quote_updated" });
      return Response.json({ ok: true, res });
    }
    const res = await send(to,
      es ? `Mensaje del estudio sobre ${order.code} 💬` : `A message from the studio about ${order.code} 💬`,
      shell(`<p style="font-size:15px">${es ? `¡Hola ${first}!` : `Hi ${first}!`}</p>
        <p style="font-size:15px;line-height:1.6"><b>${esc(message.sender_name)}</b>${es ? " te escribió sobre tu" : " wrote to you about your"} <b>${esc(order.item)}</b>:</p>
        <p style="font-size:15px;line-height:1.6;background:#FFF8F0;border-radius:12px;padding:14px 16px">${esc(message.body) || "📷"}</p>
        ${message.photo_path ? `<p style="font-size:13px;color:#6E6E7A">📷 ${es ? "Incluye una foto — mírala en tu portal." : "Includes a photo — see it on your portal."}</p>` : ""}
        ${btn(portal, es ? "Responder →" : "Reply →")}`),
      { order_id: oid, kind });
    return Response.json({ ok: true, res });
  }

  if (kind === "approval_request" && message) {
    let photoHtml = "";
    if (message.photo_path) {
      const { data: s } = await admin.storage.from("evidence")
        .createSignedUrl(String(message.photo_path), 60 * 60 * 24 * 7);
      if (s?.signedUrl) photoHtml = `<img src="${esc(s.signedUrl)}" alt="finished piece" style="width:100%;border-radius:14px;border:1px solid #F0E2D8;margin:10px 0">`;
    }
    const paid = !!order.balance_paid_at;
    const totalDue = (Number(order.balance) + (Number(order.shipping) || 0)).toFixed(2);
    const res = await send(to,
      es ? `¡Tu pieza está terminada! 🎉 Aprueba y paga el saldo · ${order.code}` : `Your piece is finished! 🎉 Approve & pay the balance · ${order.code}`,
      shell(es
        ? `<p style="font-size:15px">¡${first}, tu <b>${esc(order.item)}</b> está lista!</p>
           ${photoHtml}
           ${message.body ? `<p style="font-size:15px;line-height:1.6;font-style:italic">“${esc(message.body)}” — ${esc(message.sender_name)}</p>` : ""}
           <p style="font-size:15px;line-height:1.6">${paid
             ? "Revisa la foto y, si te encanta (sabemos que sí 💗), danos tu visto bueno — tu saldo ya está pagado."
             : `Revisa la foto y, si te encanta (sabemos que sí 💗), aprueba la pieza y paga el saldo de <b>$${esc(totalDue)}</b> (incluye envío). Nunca enviamos sin tu visto bueno.`}</p>
           ${btn(portal, paid ? "Aprobar mi pieza →" : "Aprobar y pagar saldo →")}`
        : `<p style="font-size:15px">${first}, your <b>${esc(order.item)}</b> is finished!</p>
           ${photoHtml}
           ${message.body ? `<p style="font-size:15px;line-height:1.6;font-style:italic">“${esc(message.body)}” — ${esc(message.sender_name)}</p>` : ""}
           <p style="font-size:15px;line-height:1.6">${paid
             ? "Take a look — if you love it (we think you will 💗), give it your sign-off. Your balance is already paid."
             : `Take a look — if you love it (we think you will 💗), approve the piece and pay the <b>$${esc(totalDue)}</b> balance (shipping included). We never ship without your sign-off.`}</p>
           ${btn(portal, paid ? "Approve my piece →" : "Approve & pay balance →")}`),
      { order_id: oid, kind });
    return Response.json({ ok: true, res });
  }

  if (kind === "ready_to_ship") {
    // to the studio inbox — Lulu reviews shipping cost before generating a label
    let artisanName = "the artisan";
    if (order.artisan_id) {
      const { data: a } = await admin.from("profiles").select("name").eq("id", String(order.artisan_id)).single();
      if (a?.name) artisanName = a.name;
    }
    const res = await send(STUDIO_INBOX,
      `📦 ${order.code} is ready to ship (${artisanName})`,
      shell(`<p style="font-size:15px"><b>${esc(artisanName)}</b> finished <b>${esc(order.item)}</b> (${esc(order.code)}) and marked it ready to ship.</p>
        <p style="font-size:14px;color:#6E6E7A;line-height:1.6">Next: review the shipping cost from the artisan's location, set the customer price (or waive it), and generate the label after the balance is paid.</p>
        ${btn(`${SITE_URL}/studio/`, "Review shipping →", true)}`));
    return Response.json({ ok: true, res });
  }

  if (kind === "review_request") {
    // The daily cron retries until this stamp exists — set it only on real delivery
    const markSent = async (res: { status?: number }) => {
      if (res.status && res.status < 300) {
        await admin.from("orders").update({ review_request_sent_at: new Date().toISOString() }).eq("id", oid);
      }
    };
    const res = await send(to,
      es ? `¿Cómo llegó tu pieza? 💗 · ${order.code}` : `How did your piece arrive? 💗 · ${order.code}`,
      shell(es
        ? `<p style="font-size:15px">¡Hola ${first}!</p>
           <p style="font-size:15px;line-height:1.6">Tu <b>${esc(order.item)}</b> ya debería estar contigo — esperamos que haya sido amor a primera puntada. 🧶</p>
           <p style="font-size:15px;line-height:1.6">¿Nos regalas una reseña? Dos frases y unas estrellas nos ayudan muchísimo (y a Lulu le encanta leerlas todas).</p>
           ${btn(portal, "Dejar mi reseña ⭐ →")}
           <p style="font-size:12px;color:#B6B1BC;margin-top:14px">Si algo no llegó perfecto, respóndenos — lo arreglamos.</p>`
        : `<p style="font-size:15px">Hi ${first}!</p>
           <p style="font-size:15px;line-height:1.6">Your <b>${esc(order.item)}</b> should be with you by now — we hope it was love at first stitch. 🧶</p>
           <p style="font-size:15px;line-height:1.6">Would you leave us a review? Two sentences and some stars help enormously (and Lulu reads every single one).</p>
           ${btn(portal, "Leave my review ⭐ →")}
           <p style="font-size:12px;color:#B6B1BC;margin-top:14px">If anything didn't arrive perfect, just reply — we'll make it right.</p>`),
      { order_id: oid, kind });
    await markSent(res as { status?: number });
    return Response.json({ ok: true, res });
  }

  if (kind === "order_shipped") {
    const res = await send(to,
      es ? `¡Tu pieza va en camino! 🎁 · ${order.code}` : `Your piece is on its way! 🎁 · ${order.code}`,
      shell(es
        ? `<p style="font-size:15px">¡Hola ${first}!</p>
           <p style="font-size:15px;line-height:1.6">Tu <b>${esc(order.item)}</b> ya viene en camino, envuelta como el regalo que es. 🎁</p>
           ${order.tracking_number ? `<p style="font-size:14px">Rastreo: <a href="${esc(order.tracking_url ?? "#")}" style="color:#E4657E;font-weight:800">${esc(order.tracking_number)}</a></p>` : ""}
           <p style="font-size:15px;line-height:1.6">Cuando llegue, nos encantaría ver su carita al abrirla — ¿nos compartes una foto o video?</p>
           ${btn(`${SITE_URL}/share/?code=${encodeURIComponent(String(order.code))}&t=${order.share_token}&lang=es`, "Compartir mi foto/video →")}`
        : `<p style="font-size:15px">Hi ${first}!</p>
           <p style="font-size:15px;line-height:1.6">Your <b>${esc(order.item)}</b> is on its way, wrapped like the gift it is. 🎁</p>
           ${order.tracking_number ? `<p style="font-size:14px">Tracking: <a href="${esc(order.tracking_url ?? "#")}" style="color:#E4657E;font-weight:800">${esc(order.tracking_number)}</a></p>` : ""}
           <p style="font-size:15px;line-height:1.6">When it arrives, we'd love to see its little face come out of the box — share a photo or video with us?</p>
           ${btn(`${SITE_URL}/share/?code=${encodeURIComponent(String(order.code))}&t=${order.share_token}&lang=en`, "Share my photo/video →")}`),
      { order_id: oid, kind });
    return Response.json({ ok: true, res });
  }

  return Response.json({ ok: true, skipped: "unknown kind" });
});
