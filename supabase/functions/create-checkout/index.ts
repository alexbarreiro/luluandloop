// create-checkout — creates a pending order + Stripe Checkout Session for the 40% deposit.
// Public endpoint (deploy with --no-verify-jwt); called by the order wizard.
// The PRICE CATALOG LIVES HERE, server-side — the client only sends stable
// identifiers (cat_id + size_idx + rush), so amounts cannot be tampered with.
import Stripe from "npm:stripe@14";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://luluandloop.com";

// Source of truth: mirrors CATS in js/site.js (keep in sync when prices change)
type Size = { en: string; es: string; dim: string; p: number };
const CATALOG: Record<string, { en: string; es: string; img: string; sizes: Size[] }> = {
  dolls: { en: "Custom Companions", es: "Compañeros a medida", img: "/assets/doll-blonde.jpg", sizes: [
    { en: "Mini", es: "Mini", dim: "4in / 10cm", p: 45 },
    { en: "Small", es: "Chico", dim: "6in / 15cm", p: 65 },
    { en: "Classic", es: "Clásico", dim: "10in / 25cm", p: 95 },
    { en: "Grand", es: "Grande", dim: "14in / 35cm", p: 140 },
    { en: "Showpiece", es: "Gigante", dim: "20in / 50cm", p: 220 }] },
  blankets: { en: "Heirloom Blankets", es: "Cobijas de herencia", img: "/assets/blanket-yellow.jpg", sizes: [
    { en: "Lovey", es: "Apego", dim: "12×12in", p: 55 },
    { en: "Stroller", es: "Carriola", dim: "30×36in", p: 165 },
    { en: "Crib", es: "Cuna", dim: "36×48in", p: 240 },
    { en: "Throw", es: "Sofá", dim: "50×60in", p: 340 }] },
  baby: { en: "Baby Sets", es: "Sets de bebé", img: "/assets/blanket-mint.jpg", sizes: [
    { en: "Booties + bonnet", es: "Zapatitos + gorrito", dim: "0–12m", p: 48 },
    { en: "Set + rattle", es: "Set + sonaja", dim: "0–12m", p: 68 },
    { en: "Full layette", es: "Ajuar completo", dim: "5 pieces", p: 120 }] },
  wear: { en: "Wearables", es: "Para vestir", img: "/assets/bunny-overalls.jpg", sizes: [
    { en: "Beanie", es: "Gorro", dim: "baby–adult", p: 42 },
    { en: "Scarf", es: "Bufanda", dim: "60in", p: 75 },
    { en: "Kids cardigan", es: "Cárdigan infantil", dim: "1–8y", p: 110 }] },
  minis: { en: "Minis & Charms", es: "Minis y llaveros", img: "/assets/squirrel-red.jpg", sizes: [
    { en: "Single charm", es: "Llavero", dim: "2.5in", p: 18 },
    { en: "Trio", es: "Trío", dim: "2.5in ×3", p: 45 },
    { en: "Party set (10)", es: "Set fiesta (10)", dim: "2.5in ×10", p: 130 }] },
  home: { en: "Home & Decor", es: "Hogar y decoración", img: "/assets/blanket-white.jpg", sizes: [
    { en: "Pillow", es: "Cojín", dim: "16×16in", p: 85 },
    { en: "Garland", es: "Guirnalda", dim: "6ft", p: 70 },
    { en: "Wall piece", es: "Pieza de pared", dim: "up to 20in", p: 95 }] },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return bad("POST only", 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("invalid JSON");
  }

  const name = String(body.name ?? "").trim().slice(0, 120);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
  const desc = String(body.desc ?? "").trim().slice(0, 2000);
  const colors = String(body.colors ?? "—").trim().slice(0, 300) || "—";
  const rush = Boolean(body.rush);
  const lang = body.lang === "es" ? "es" : "en";
  const catId = String(body.cat_id ?? "");
  const sizeIdx = Number(body.size_idx);

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("name and valid email required");
  if (!desc) return bad("description required");

  // Everything financial is derived server-side from the catalog
  const cat = CATALOG[catId];
  if (!cat) return bad("unknown category");
  const size = Number.isInteger(sizeIdx) ? cat.sizes[sizeIdx] : undefined;
  if (!size) return bad("unknown size");
  const base = size.p;
  const price = rush ? base + Math.round(base * 0.25) : base;
  const deposit = Math.round(price * 0.4);
  const balance = price - deposit;
  const item = `${cat.en} · ${size.en}`;
  const sizeLabel = `${size.en} · ${size.dim}`;

  const { data: codeRow, error: codeErr } = await supabase.rpc("next_order_code");
  if (codeErr) return bad("could not allocate order code", 500);
  const code = codeRow as string;

  const { data: order, error: insErr } = await supabase
    .from("orders")
    .insert({
      code, customer: name, email, item, size_label: sizeLabel,
      desc_text: desc, colors, rush, lang, price, deposit, balance,
      stage: 0, pending: true, img: cat.img,
    })
    .select("id, code")
    .single();
  if (insErr) return bad("could not create order", 500);

  const label = lang === "es"
    ? `Anticipo 40% · ${cat.es} · ${size.es} · ${code}`
    : `40% deposit · ${item} · ${code}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: email,
    // Collect the shipping address up front so the studio can quote real
    // shipping (Shippo) when the piece is ready
    shipping_address_collection: {
      allowed_countries: [
        "US", "CA", "MX", "GB", "IE", "FR", "ES", "DE", "IT", "PT", "NL", "BE",
        "CH", "AT", "SE", "NO", "DK", "FI", "PL", "CZ", "AU", "NZ", "JP", "KR",
        "SG", "BR", "AR", "CL", "CO", "CR", "PA", "DO", "PR",
      ],
    },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: deposit * 100,
        product_data: {
          name: label,
          description: lang === "es"
            ? `Total ${price} USD · saldo ${balance} USD + envío al terminar`
            : `Total ${price} USD · ${balance} USD balance + shipping when finished`,
        },
      },
    }],
    metadata: { kind: "deposit", order_id: order.id, code, rush: String(rush) },
    locale: lang === "es" ? "es" : "en",
    success_url: `${SITE_URL}/?paid=deposit&code=${encodeURIComponent(code)}#order`,
    cancel_url: `${SITE_URL}/?canceled=1#order`,
  });

  await supabase.from("orders").update({ deposit_session_id: session.id }).eq("id", order.id);

  return new Response(JSON.stringify({ url: session.url, code }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
