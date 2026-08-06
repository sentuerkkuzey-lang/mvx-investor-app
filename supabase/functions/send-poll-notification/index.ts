// Supabase Edge Function: send-poll-notification
//
// Wird vom Client aufgerufen, NACHDEM eine Abstimmung erfolgreich über
// create_poll angelegt wurde. Prüft zuerst, ob der Aufrufer wirklich
// Owner ist, lädt dann alle Push-Abos (service_role Key, umgeht RLS)
// und verschickt an jedes Gerät eine Web-Push-Nachricht mit den
// VAPID-Schlüsseln. Ungültige/abgelaufene Abos werden dabei entfernt.
//
// Benötigte Supabase Secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY   - derselbe Wert wie VITE_VAPID_PUBLIC_KEY im Frontend
//   VAPID_PRIVATE_KEY  - der zugehörige private Schlüssel (niemals im Frontend!)
//   VAPID_SUBJECT      - z.B. mailto:owner@deine-domain.de
//
// Deploy: supabase functions deploy send-poll-notification

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const URGENCY_TITLES: Record<string, string> = {
  normal: "Neue Abstimmung",
  urgent: "⚠️ Dringende Abstimmung",
  emergency: "🚨 Notfall-Abstimmung"
};

// Web-Push-eigener Priority-Header (very-low|low|normal|high)
const URGENCY_HEADERS: Record<string, string> = {
  normal: "normal",
  urgent: "high",
  emergency: "high"
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
      return json({ error: "Nur der Owner darf Benachrichtigungen auslösen." }, 403);
    }

    const body = await req.json();
    const pollId = String(body.pollId ?? "");
    if (!pollId) return json({ error: "pollId ist erforderlich." }, 400);

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: poll, error: pollError } = await adminClient
      .from("polls")
      .select("question, urgency")
      .eq("id", pollId)
      .single();

    if (pollError || !poll) return json({ error: "Abstimmung nicht gefunden." }, 404);

    const { data: subscriptions, error: subsError } = await adminClient
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth");

    if (subsError) return json({ error: subsError.message }, 500);

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT");

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return json(
        { error: "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY oder VAPID_SUBJECT fehlt als Supabase Secret." },
        500
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const urgency = (poll.urgency as string) ?? "normal";
    const payload = JSON.stringify({
      title: URGENCY_TITLES[urgency] ?? URGENCY_TITLES.normal,
      body: poll.question,
      urgency,
      url: "/abstimmungen"
    });

    let sent = 0;
    const staleIds: string[] = [];

    await Promise.all(
      (subscriptions ?? []).map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            },
            payload,
            { urgency: URGENCY_HEADERS[urgency] ?? "normal" }
          );
          sent += 1;
        } catch (err) {
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            staleIds.push(sub.id);
          }
        }
      })
    );

    if (staleIds.length > 0) {
      await adminClient.from("push_subscriptions").delete().in("id", staleIds);
    }

    return json({ sent, total: subscriptions?.length ?? 0, removed: staleIds.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
