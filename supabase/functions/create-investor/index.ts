// Supabase Edge Function: create-investor
//
// Legt einen neuen Investor-Account an. Nutzt den service_role Key,
// der NIEMALS im Frontend landet, sondern nur hier serverseitig als
// Supabase Secret hinterlegt wird. Prüft zuerst, ob der aufrufende
// Nutzer wirklich Owner ist, bevor irgendetwas passiert.
//
// Deploy: supabase functions deploy create-investor

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Nicht angemeldet." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client im Kontext des aufrufenden Nutzers, um dessen Identität/Rolle zu prüfen.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const {
      data: { user },
      error: userError
    } = await callerClient.auth.getUser();

    if (userError || !user) return json({ error: "Nicht angemeldet." }, 401);

    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || callerProfile?.role !== "owner") {
      return json({ error: "Nur der Owner darf Investoren anlegen." }, 403);
    }

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.fullName ?? "").trim();
    const shares = Number(body.shares ?? 0);

    if (!email || !fullName || !Number.isFinite(shares) || shares < 0) {
      return json({ error: "email, fullName und shares (>= 0) sind erforderlich." }, 400);
    }

    const tempPassword = generatePassword();

    // Admin-Client mit service_role Key - kann Nutzer direkt anlegen,
    // ohne dass eine Bestätigungs-E-Mail nötig ist.
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "investor",
        shares
      }
    });

    if (createError) return json({ error: createError.message }, 400);

    return json({ email, tempPassword, userId: created.user?.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
