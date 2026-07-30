// lulu-agent — the conversational Lulu AI that powers the mobile apps.
// A Claude agent with the studio's full business knowledge and tools that
// call real site functions: design previews, checkout creation, the
// customer's own orders, and support messages to the studio.
//
// Stateless: the app sends the running message history each turn; tool
// results the app must act on (concept image, checkout link, orders) are
// ALSO returned as structured `actions` so the UI can render rich cards.
//
// Public endpoint (deploy with --no-verify-jwt). Account-bound tools require
// the Supabase JWT the app passes in the `jwt` field.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const STUDIO_INBOX = Deno.env.get("STUDIO_INBOX") ?? "hello@luluandloop.com";
const FROM = Deno.env.get("FROM_EMAIL") ?? "Lulu & Loop <hello@luluandloop.com>";
const FN_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const SYSTEM = `You are Lulu — Lourdes Solis, founder of Lulu & Loop, a bilingual custom
crochet studio (luluandloop.com, Boston + a small circle of artisans in Mexico). You are
warm, abuela-hearted, playful, and professional. You learned to crochet as a girl in Cuba,
built the craft into a company in Mexico, and now work near your grandkids in Boston.
Speak the customer's language (Spanish or English — mirror them; warm Mexican Spanish).
Keep replies SHORT for a chat app: 1-3 sentences plus a question, never walls of text.
Use at most one emoji per message. 🧶💗 fit the brand.

WHAT WE MAKE (categories · sizes · prices in USD — final quote confirmed by you within 24h):
- dolls "Custom Companions": 0 Mini 4in $55 · 1 Small 6in $85 · 2 Classic 10in $125 · 3 Grand 14in $185 · 4 Showpiece 20in $295
- blankets "Heirloom Blankets": 0 Lovey 12x12 $68 · 1 Stroller 30x36 $185 · 2 Crib 36x48 $265 · 3 Throw 50x60 $365
- baby "Baby Sets": 0 Booties+bonnet $58 · 1 Set+rattle $80 · 2 Full layette $145
- wear "Wearables": 0 Beanie $48 · 1 Scarf $85 · 2 Kids cardigan $130
- minis "Minis & Charms": 0 Single charm $24 · 1 Trio $60 · 2 Party set of 10 $165
- home "Home & Decor": 0 Pillow $95 · 1 Garland $80 · 2 Wall piece $115
Rush (+30%, cuts the wait ~40%). Timelines 1-8 weeks by size. Ships worldwide.

HOW ORDERING WORKS: customer pays a 40% deposit today; I personally review and confirm
the final quote within 24 hours; an artisan is assigned; the customer gets progress photos
and messages; when the piece is finished they approve the final photo and pay the 60%
balance + shipping; then it ships with tracking. They can see everything (photos, messages,
invoices, reviews) in their portal at luluandloop.com/orders — the app shows the same.

YOUR JOB IN THIS APP:
1) First-time customers: guide them to their first order. Ask about their dream piece
   (who it's for, colors, any photo/idea). When you have a real description, call
   preview_design to show them an AI sketch — it helps them fall in love. Then confirm
   category/size/price and ask for their name + email, then call create_checkout and tell
   them to tap the payment button that appears (payment opens right in the app, 40% today).
2) After paying, warmly suggest creating an account (the app shows a button) with the SAME
   email used at checkout so all their pieces appear in "My creations".
3) Returning customers: help them start new pieces, check their orders (call my_orders),
   or answer support questions. For anything you can't resolve — refunds, address changes,
   complaints, custom timelines — call contact_studio so the human team follows up, and
   say you've passed it along.

CONTEXT: On the website there is also a step-by-step Design wizard — if the customer
prefers filling forms, you can mention it ("el asistente de diseño arriba") — but most
people who open this chat want YOU to guide them; do that with joy.

RULES: Never invent prices, discounts, or dates beyond the table above. Never promise a
delivery date — give the size's week range. Don't take payment details in chat — payment
happens only through the checkout button. If asked about anything outside Lulu & Loop,
gently bring the conversation back to the studio. If a request is inappropriate for a
family craft studio, decline sweetly.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "preview_design",
    description: "Turn the customer's described idea into a structured design and an AI concept sketch of the finished crochet piece. Call once you have a concrete description. The app shows the image automatically.",
    input_schema: {
      type: "object",
      properties: {
        transcript: { type: "string", description: "The customer's idea in their own words, with every detail they gave" },
        lang: { type: "string", enum: ["en", "es"] },
      },
      required: ["transcript", "lang"],
    },
  },
  {
    name: "create_checkout",
    description: "Create the 40% deposit checkout for a confirmed design. Only call after the customer confirmed category, size, price, and gave name + email. The app shows a payment button automatically.",
    input_schema: {
      type: "object",
      properties: {
        cat_id: { type: "string", enum: ["dolls", "blankets", "baby", "wear", "minis", "home"] },
        size_idx: { type: "integer" },
        rush: { type: "boolean" },
        desc: { type: "string", description: "The agreed piece description" },
        colors: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        lang: { type: "string", enum: ["en", "es"] },
        concept_path: { type: "string", description: "concept_path from preview_design, if one was made" },
      },
      required: ["cat_id", "size_idx", "rush", "desc", "colors", "name", "email", "lang"],
    },
  },
  {
    name: "my_orders",
    description: "List the signed-in customer's orders (item, stage, code). Requires the customer to be signed in — if not, the tool says so; invite them to sign in via the app's account button.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "contact_studio",
    description: "Send the customer's question or issue to the human studio team (Lulu reads these). Use for refunds, address changes, complaints, or anything needing human follow-up.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Clear summary of what the customer needs, with their words" },
        order_code: { type: "string", description: "Related order code if known (LU-…)" },
        reply_email: { type: "string", description: "Customer email for the reply, if known" },
      },
      required: ["message"],
    },
  },
];

type Action = Record<string, unknown>;

async function runTool(name: string, input: Record<string, unknown>, jwtEmail: string | null, actions: Action[], embedded: boolean): Promise<string> {
  if (name === "preview_design") {
    const r1 = await fetch(`${FN_BASE}/design-agent`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "design", transcript: input.transcript, lang: input.lang }),
    }).then((r) => r.json());
    if (!r1?.design) return "Design failed — apologize and ask them to describe the piece again.";
    const r2 = await fetch(`${FN_BASE}/design-agent`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "image", image_prompt: r1.design.image_prompt, lang: input.lang }),
    }).then((r) => r.json()).catch(() => ({}));
    if (r2?.concept_url) {
      actions.push({ type: "concept", url: r2.concept_url, path: r2.concept_path });
    }
    return JSON.stringify({ design: r1.design, concept_created: !!r2?.concept_url,
      note: "The app is now showing the sketch to the customer. Confirm size + price next." });
  }

  if (name === "create_checkout") {
    const r = await fetch(`${FN_BASE}/create-checkout`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name, email: input.email, cat_id: input.cat_id, size_idx: input.size_idx,
        rush: input.rush, desc: input.desc, colors: input.colors, lang: input.lang,
        concept_path: input.concept_path || undefined,
        embedded: true,
      }),
    }).then((r) => r.json());
    if ((r?.url || r?.client_secret) && r?.code) {
      // non-embedded clients (mobile app) get a luluandloop.com payment page
      // that mounts the embedded form — the customer never sees stripe.com
      const url = r.url ?? (r.client_secret
        ? `https://luluandloop.com/pay/#cs=${encodeURIComponent(r.client_secret)}`
        : null);
      actions.push({ type: "checkout", url, client_secret: r.client_secret ?? null, code: r.code });
      return JSON.stringify({ ok: true, order_code: r.code,
        note: "Payment button is now visible in the app. Tell them to tap it to pay the 40% deposit." });
    }
    return JSON.stringify({ error: r?.error ?? "checkout failed" });
  }

  if (name === "my_orders") {
    if (!jwtEmail) return "Customer is not signed in. Invite them to tap the account button in the app to sign in or create their account.";
    const { data } = await admin.from("orders")
      .select("code, item, stage, price, created_at, tracking_number")
      .ilike("email", jwtEmail.replace(/([\\%_])/g, "\\$1"))
      .eq("pending", false)
      .order("created_at", { ascending: false }).limit(20);
    const STAGES = ["New request", "Quote review", "In progress", "Ready", "Shipped"];
    const orders = (data ?? []).map((o) => ({
      code: o.code, item: o.item, stage: STAGES[o.stage] ?? o.stage, price: o.price,
      tracking: o.tracking_number ?? null,
    }));
    if (orders.length) actions.push({ type: "orders", orders });
    return JSON.stringify({ orders, note: orders.length ? "The app is showing their pieces as cards." : "No orders under this account yet." });
  }

  if (name === "contact_studio") {
    if (!RESEND_KEY) return "Studio inbox unavailable right now; give them hello@luluandloop.com.";
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: [STUDIO_INBOX],
        subject: `📱 Lulu AI support${input.order_code ? ` · ${input.order_code}` : ""}`,
        html: `<p><b>From the app${input.reply_email ? ` (${input.reply_email})` : ""}${jwtEmail ? ` · signed in as ${jwtEmail}` : ""}:</b></p><p>${String(input.message).replace(/</g, "&lt;")}</p>`,
      }),
    });
    return JSON.stringify({ ok: true, note: "Sent to the studio team. Tell the customer a human will follow up by email." });
  }
  return "unknown tool";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!ANTHROPIC_KEY) return json({ error: "Lulu AI not configured yet" }, 501);

  let body: {
    messages?: Array<{ role: string; content: unknown }>;
    message?: string; visitor_id?: string; history?: boolean; since?: string;
    jwt?: string; embedded?: boolean; source?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  let jwtEmail: string | null = null;
  if (body.jwt) {
    const { data } = await admin.auth.getUser(body.jwt);
    jwtEmail = data?.user?.email?.toLowerCase() ?? null;
  }

  const visitorId = String(body.visitor_id ?? "").slice(0, 64);

  // ---- history fetch / polling for widget + app (visitor-scoped) ----
  if (body.history && visitorId) {
    const { data: chat } = await admin.from("chats").select("id").eq("visitor_id", visitorId).maybeSingle();
    if (!chat) return json({ messages: [] });
    let q = admin.from("chat_messages")
      .select("id, role, body, meta, staff_name, created_at")
      .eq("chat_id", chat.id).order("created_at", { ascending: true }).limit(200);
    if (body.since) q = q.gt("created_at", String(body.since));
    const { data: msgs } = await q;
    return json({ messages: msgs ?? [] });
  }

  // ---- persistent conversation turn ----
  let chatId: string | null = null;
  let history: Array<{ role: string; content: unknown }> = [];
  if (visitorId && typeof body.message === "string") {
    const text = body.message.trim().slice(0, 2000);
    if (!text) return json({ error: "empty message" }, 400);
    let { data: chat } = await admin.from("chats").select("id, email").eq("visitor_id", visitorId).maybeSingle();
    if (!chat) {
      const ins = await admin.from("chats").insert({
        visitor_id: visitorId, email: jwtEmail,
        source: body.source === "app" ? "app" : "web",
      }).select("id, email").single();
      chat = ins.data;
    } else if (jwtEmail && chat.email !== jwtEmail) {
      await admin.from("chats").update({ email: jwtEmail }).eq("id", chat.id);
    }
    if (!chat) return json({ error: "could not open chat" }, 500);
    chatId = chat.id as string;

    // the agent sees the ENTIRE conversation (bounded), including human
    // staff replies, so it never loses context
    const { data: past } = await admin.from("chat_messages")
      .select("role, body").eq("chat_id", chatId)
      .order("created_at", { ascending: false }).limit(80);
    const ordered = (past ?? []).reverse();
    for (const m of ordered) {
      if (m.role === "user") history.push({ role: "user", content: m.body });
      else if (m.role === "lulu") history.push({ role: "assistant", content: m.body });
      else history.push({ role: "assistant", content: "[Message written by the HUMAN studio team]: " + m.body });
    }
    history.push({ role: "user", content: text });
    await admin.from("chat_messages").insert({ chat_id: chatId, role: "user", body: text });
  } else {
    // legacy stateless contract (older clients)
    history = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
    if (!history.length) return json({ error: "messages required" }, 400);
  }
  if (JSON.stringify(history).length > 120000) history = history.slice(-40);

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const actions: Action[] = [];
  const messages = history as Anthropic.MessageParam[];

  let reply = "";
  for (let i = 0; i < 6; i++) {
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 1500,
      output_config: { effort: "low" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      reply = "Ay, corazón — I can't help with that one. Shall we get back to your piece? 🧶";
      break;
    }

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();

    if (!toolUses.length) { reply = text; break; }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let out: string;
      try {
        out = await runTool(tu.name, tu.input as Record<string, unknown>, jwtEmail, actions, body.embedded === true);
      } catch (e) {
        out = `tool error: ${String(e).slice(0, 200)}`;
      }
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }

  if (!reply) reply = "Hmm, se me enredó el estambre — could you say that once more? 🧶";
  if (chatId) {
    await admin.from("chat_messages").insert({
      chat_id: chatId, role: "lulu", body: reply,
      meta: actions.length ? { actions } : null,
    });
  }
  return json({ reply, actions, chat_id: chatId });
});
