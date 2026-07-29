// admin-create-staff — owner-only: creates a staff login + profile.
// Deployed with JWT verification ON; additionally requires role 'owner'.
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
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const { data: caller } = await admin
    .from("profiles").select("role, active").eq("id", userData.user.id).single();
  if (!caller?.active || caller.role !== "owner") return json({ error: "owner only" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const name = String(body.name ?? "").trim().slice(0, 80);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(body.password ?? "");
  const role = ["owner", "supervisor", "artisan"].includes(String(body.role))
    ? String(body.role) : "artisan";
  const specialty = String(body.specialty ?? "").trim().slice(0, 120);
  const sfRaw = body.ship_from as Record<string, unknown> | null;
  const shipFrom = sfRaw && sfRaw.street1 ? {
    name, street1: String(sfRaw.street1).slice(0, 120), city: String(sfRaw.city ?? "").slice(0, 80),
    state: String(sfRaw.state ?? "").slice(0, 40), zip: String(sfRaw.zip ?? "").slice(0, 16),
    country: String(sfRaw.country ?? "MX").toUpperCase().slice(0, 2), phone: String(sfRaw.phone ?? "").slice(0, 24),
  } : null;
  const color = /^#[0-9A-Fa-f]{6}$/.test(String(body.color)) ? String(body.color) : "#8A6FA8";
  const capacity = Math.min(12, Math.max(1, Number(body.capacity) || 4));

  if (!name) return json({ error: "name required" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "valid email required" }, 400);
  if (password.length < 8) return json({ error: "password must be at least 8 characters" }, 400);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    return json({ error: createErr?.message ?? "could not create user" }, 400);
  }

  const { error: profErr } = await admin.from("profiles").insert({
    id: created.user.id, email, name, role, specialty, color, capacity, active: true, ship_from: shipFrom,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "could not create profile" }, 500);
  }

  return json({ id: created.user.id, email, name, role });
});
