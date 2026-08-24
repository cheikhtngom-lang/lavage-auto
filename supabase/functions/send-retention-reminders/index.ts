// Relance "rappel de valeur" J+3 pour les comptes inactifs — déclenchée une
// fois par jour par pg_cron (voir la requête cron.schedule fournie à part,
// jamais commitée car elle embarque CRON_SECRET). N'est JAMAIS appelée
// depuis le frontend, contrairement à send-welcome-email.
//
// "Inactif" :
//   - automobiliste : aucune ligne dans reservations (client_id) depuis l'inscription
//   - admin (station) : aucun laveur ajouté (employees.station_id) depuis l'inscription
//     — même seuil que la bannière d'activation déjà affichée sur le tableau de bord
//
// Protégée par CRON_SECRET (et non la clé service role) dans l'en-tête
// Authorization, pour limiter les dégâts si la définition du job cron
// (visible dans cron.job côté Postgres) venait à fuiter.
//
// Secrets requis (Supabase Dashboard > Edge Functions > Manage secrets) :
//   RESEND_API_KEY, RESEND_FROM (optionnel), APP_BASE_URL, CRON_SECRET
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Clean Car Galsen <onboarding@resend.dev>";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "http://localhost:5173";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sendResend(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  return res.ok;
}

function clientReminder(fullName: string | null) {
  const first = (fullName || "").split(" ")[0] || "";
  return {
    subject: "Votre 1er lavage vous attend 🚿",
    html: `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111;">
      <h1 style="font-size:20px;color:#059669;">On vous attend${first ? `, ${first}` : ""} !</h1>
      <p style="font-size:15px;line-height:1.5;">Vous n'avez pas encore réservé de lavage. Trouvez une station près de chez vous, ça prend moins d'une minute.</p>
      <p style="margin:24px 0;"><a href="${APP_BASE_URL}/dashboard/stations?onboarding=1" style="background:#059669;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;">Réserver maintenant</a></p>
      <p style="font-size:13px;color:#666;">— L'équipe Clean Car Galsen</p>
    </div>`,
  };
}

function stationReminder(fullName: string | null) {
  const first = (fullName || "").split(" ")[0] || "";
  return {
    subject: "Ajoutez votre premier laveur pour démarrer",
    html: `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111;">
      <h1 style="font-size:20px;color:#2563eb;">Votre station attend son premier lavage${first ? `, ${first}` : ""}</h1>
      <p style="font-size:15px;line-height:1.5;">Votre essai gratuit d'1 mois est en cours. Ajoutez votre premier laveur pour pouvoir démarrer un lavage dès aujourd'hui.</p>
      <p style="margin:24px 0;"><a href="${APP_BASE_URL}/admin/team" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;">Ajouter mon premier laveur</a></p>
      <p style="font-size:13px;color:#666;">— L'équipe Clean Car Galsen</p>
    </div>`,
  };
}

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const windowStart = new Date(now - 4 * DAY).toISOString(); // J-4
  const windowEnd = new Date(now - 3 * DAY).toISOString();   // J-3

  let sentCount = 0;

  // ── Automobilistes inscrits il y a 3-4 jours, sans réservation ──
  const { data: clients } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "automobiliste")
    .gte("created_at", windowStart)
    .lt("created_at", windowEnd)
    .is("retention_email_sent_at", null);

  for (const c of clients ?? []) {
    if (!c.email) continue;
    const { count } = await supabase.from("reservations").select("id", { count: "exact", head: true }).eq("client_id", c.id);
    if ((count ?? 0) > 0) continue;
    const { subject, html } = clientReminder(c.full_name);
    if (await sendResend(c.email, subject, html)) {
      await supabase.from("profiles").update({ retention_email_sent_at: new Date().toISOString() }).eq("id", c.id);
      sentCount++;
    }
  }

  // ── Stations inscrites il y a 3-4 jours, sans aucun laveur ajouté ──
  const { data: admins } = await supabase
    .from("profiles")
    .select("id, full_name, email, station_id")
    .eq("role", "admin")
    .gte("created_at", windowStart)
    .lt("created_at", windowEnd)
    .is("retention_email_sent_at", null);

  for (const a of admins ?? []) {
    if (!a.email || !a.station_id) continue;
    const { count } = await supabase.from("employees").select("id", { count: "exact", head: true }).eq("station_id", a.station_id);
    if ((count ?? 0) > 0) continue;
    const { subject, html } = stationReminder(a.full_name);
    if (await sendResend(a.email, subject, html)) {
      await supabase.from("profiles").update({ retention_email_sent_at: new Date().toISOString() }).eq("id", a.id);
      sentCount++;
    }
  }

  return new Response(JSON.stringify({ sent: sentCount }), { status: 200 });
});
