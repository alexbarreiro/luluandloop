// design-agent — turns a customer's dictated (or typed) idea into a structured
// design + a concept image of the finished crochet piece.
//
// Flow: transcript → Claude (structured output: category, size, refined EN/ES
// description, colors, image prompt) → image model renders an amigurumi-style
// concept → stored in the private `evidence` bucket → signed URL returned.
// The wizard shows the concept and passes concept_path through checkout so the
// image follows the order into the studio and the customer portal.
//
// Public endpoint (deploy with --no-verify-jwt). Degrades gracefully:
// without ANTHROPIC_API_KEY → 501; without OPENAI_API_KEY → returns the
// structured design with no image.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

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

const DESIGN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cat_id", "size_idx", "desc_en", "desc_es", "colors", "image_prompt"],
  properties: {
    cat_id: { type: "string", enum: ["dolls", "blankets", "baby", "wear", "minis", "home"] },
    size_idx: { type: "integer" },
    desc_en: { type: "string", description: "Refined one-paragraph description of the piece, English" },
    desc_es: { type: "string", description: "The same description in warm natural Spanish" },
    colors: { type: "string", description: "Comma-separated color palette, max 4 colors" },
    image_prompt: { type: "string", description: "Prompt for an image model to render the finished crochet piece" },
  },
};

const SIZES: Record<string, number> = { dolls: 5, blankets: 4, baby: 3, wear: 3, minis: 3, home: 3 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!ANTHROPIC_KEY) return json({ error: "design agent not configured yet" }, 501);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const stage = String(body.stage ?? "full"); // 'design' (fast) | 'image' | 'full' (legacy)
  const transcript = String(body.transcript ?? "").trim().slice(0, 1500);
  const lang = body.lang === "es" ? "es" : "en";

  // Stage 2: render the concept image only (the client already has the design)
  if (stage === "image") {
    const imagePrompt = String(body.image_prompt ?? "").trim().slice(0, 1200);
    if (imagePrompt.length < 8) return json({ error: "image_prompt required" }, 400);
    if (!OPENAI_KEY) return json({ concept_path: null, concept_url: null });
    const rendered = await renderConcept(imagePrompt);
    return json(rendered);
  }

  if (transcript.length < 8) return json({ error: "tell us a little more about your idea" }, 400);

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 2000,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: DESIGN_SCHEMA },
    },
    system: `You are the design assistant for Lulu & Loop, a custom crochet studio.
A customer just described (often by voice, so expect filler words and meandering)
the piece they dream of. Turn it into a clean commission spec.

Categories & size indexes:
- dolls (Custom Companions): 0 Mini 4in · 1 Small 6in · 2 Classic 10in · 3 Grand 14in · 4 Showpiece 20in
- blankets (Heirloom Blankets): 0 Lovey 12x12in · 1 Stroller 30x36in · 2 Crib 36x48in · 3 Throw 50x60in
- baby (Baby Sets): 0 Booties+bonnet · 1 Set+rattle · 2 Full layette
- wear (Wearables): 0 Beanie · 1 Scarf · 2 Kids cardigan
- home (Home & Decor): 0 Pillow · 1 Garland · 2 Wall piece
- minis (Minis & Charms): 0 Single charm · 1 Trio · 2 Party set of 10

Pick the best-fitting category and size (default to the middle size when unstated).
desc_en/desc_es: 2-4 warm sentences a crochet artisan could work from — keep every
concrete detail the customer gave (colors, accessories, expressions, occasion).
colors: up to 4, from the customer's words or tasteful choices that fit.
image_prompt: describe the FINISHED piece for an image model — always as a
handmade crochet/amigurumi object photographed on a warm cream background, soft
natural light, visible yarn stitch texture. Never a real animal/person — always
the crocheted version.`,
    messages: [{ role: "user", content: `Customer language: ${lang}\nCustomer's idea (dictated): ${transcript}` }],
  });

  if (response.stop_reason === "refusal") {
    return json({ error: "we couldn't work with that idea — try describing your piece again" }, 422);
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return json({ error: "no design produced — try again" }, 500);
  let design: {
    cat_id: string; size_idx: number; desc_en: string; desc_es: string;
    colors: string; image_prompt: string;
  };
  try { design = JSON.parse(text.text); } catch { return json({ error: "design parse failed — try again" }, 500); }
  design.size_idx = Math.min(Math.max(0, design.size_idx | 0), (SIZES[design.cat_id] ?? 3) - 1);

  // Stage 1 ('design'): return the structured design immediately — the client
  // shows it while requesting the image in a second call. 'full' keeps the
  // legacy single-call behavior.
  if (stage === "design") return json({ design });

  const rendered = OPENAI_KEY ? await renderConcept(design.image_prompt) : { concept_path: null, concept_url: null };
  return json({ design, ...rendered });
});

async function renderConcept(imagePrompt: string) {
  let conceptPath: string | null = null;
  let conceptUrl: string | null = null;
  try {
    const img = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: `Product concept photo of a handmade crochet piece: ${imagePrompt}. ` +
          "Amigurumi crochet style, visible yarn stitches, warm cream studio background, soft natural light, no text.",
        size: "1024x1024", quality: "medium", n: 1,
      }),
    });
    const imgData = await img.json();
    const b64 = imgData?.data?.[0]?.b64_json;
    if (b64) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      conceptPath = `concepts/${crypto.randomUUID()}.png`;
      const { error: upErr } = await admin.storage.from("evidence")
        .upload(conceptPath, bytes, { contentType: "image/png" });
      if (upErr) conceptPath = null;
      else {
        const { data: signed } = await admin.storage.from("evidence")
          .createSignedUrl(conceptPath, 60 * 60 * 24 * 30);
        conceptUrl = signed?.signedUrl ?? null;
      }
    }
  } catch { /* image is a bonus — the structured design still stands */ }
  return { concept_path: conceptPath, concept_url: conceptUrl };
}
