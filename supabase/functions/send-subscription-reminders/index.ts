// Relance email automatique 5 jours avant l'échéance d'un abonnement —
// déclenchée une fois par jour par pg_cron (job subscription-reminders-daily,
// même en-tête CRON_SECRET que retention-reminders-daily). N'est JAMAIS
// appelée depuis le frontend.
//
//   - stations : abonnement à la plateforme (next_billing_date, ou fin
//     d'essai) → email au gérant (stations.owner_email, à défaut le compte admin) ;
//   - clients abonnés d'une station : échéance = dernier jour du dernier mois
//     payé (station_subscription_invoices), à défaut du mois de souscription
//     → email au client (client_email, à défaut son compte).
//
// Même règle que src/lib/subscriptionReminders.js (UI des rubriques Relances).
// Un seul email par échéance : la ligne subscription_reminders (index unique
// partiel channel='email') est écrite AVANT l'envoi ; si l'envoi échoue elle
// est supprimée, pour réessayer le lendemain. Le Sénégal est en UTC toute
// l'année : les dates UTC du serveur sont les dates locales.
//
// Secrets requis : RESEND_API_KEY, RESEND_FROM (optionnel), APP_BASE_URL, CRON_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Clean Car Galsen <onboarding@resend.dev>";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "http://localhost:5173";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const REMINDER_DAYS = 5;
const DAY = 86400000;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const today = () => new Date(dateKey(new Date()) + "T00:00:00Z");
const daysUntil = (due: Date) => Math.round((new Date(dateKey(due) + "T00:00:00Z").getTime() - today().getTime()) / DAY);
const endOfMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0));
const fmtDate = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

async function sendResend(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  return res.ok;
}

const layout = (title: string, body: string, cta: string, href: string, color: string) =>
  `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111;">
    <h1 style="font-size:20px;color:${color};">${title}</h1>
    ${body}
    <p style="margin:24px 0;"><a href="${href}" style="background:${color};color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;">${cta}</a></p>
    <p style="font-size:13px;color:#666;">— L'équipe Clean Car Galsen</p>
  </div>`;

const whenText = (days: number) => (days === 0 ? "aujourd'hui" : days === 1 ? "demain" : `dans ${days} jours`);

// Réserve l'envoi (une ligne par échéance) ; false si déjà envoyé.
async function claim(row: Record<string, unknown>) {
  const { data, error } = await supabase.from("subscription_reminders").insert({ ...row, channel: "email" }).select("id").single();
  if (error) return null; // 23505 = déjà envoyé pour cette échéance
  return data.id as string;
}

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  let sent = 0;
  const skipped: string[] = [];

  // ── Stations : abonnement à la plateforme ──
  const { data: stations } = await supabase
    .from("stations")
    .select("id, name, owner_name, owner_email, station_billing(plan, subscription_status, next_billing_date, trial_ends_at)");
  for (const s of stations ?? []) {
    const b = Array.isArray(s.station_billing) ? s.station_billing[0] : s.station_billing;
    if (!b || b.subscription_status === "illimite") continue;
    const dueRaw = b.subscription_status === "essai" ? b.trial_ends_at : b.next_billing_date;
    if (!dueRaw) continue;
    const due = new Date(dueRaw);
    const days = daysUntil(due);
    if (days < 0 || days > REMINDER_DAYS) continue;

    let to = s.owner_email as string | null;
    if (!to) {
      const { data: admin } = await supabase.from("profiles").select("email").eq("role", "admin").eq("station_id", s.id).limit(1).maybeSingle();
      to = admin?.email ?? null;
    }
    if (!to) { skipped.push(`station ${s.name}: pas d'email`); continue; }

    const id = await claim({ kind: "station", station_id: s.id, due_date: dateKey(due), recipient: to });
    if (!id) continue;
    const trial = b.subscription_status === "essai";
    const first = String(s.owner_name || "").split(" ")[0];
    const subject = trial ? `Votre essai gratuit se termine ${whenText(days)}` : `Votre abonnement arrive à échéance ${whenText(days)}`;
    const html = layout(
      `${first ? `${esc(first)}, v` : "V"}otre ${trial ? "essai gratuit" : `abonnement ${esc(b.plan || "")}`} se termine ${whenText(days)}`,
      `<p style="font-size:15px;line-height:1.5;">L'accès de <strong>${esc(s.name || "votre station")}</strong> à Clean Car Galsen ${trial ? "prend fin" : "arrive à échéance"} le <strong>${fmtDate(due)}</strong>. ${trial ? "Choisissez votre offre" : "Renouvelez votre abonnement"} pour continuer à gérer votre file d'attente, vos laveurs et vos encaissements sans interruption.</p>`,
      trial ? "Choisir mon offre" : "Renouveler mon abonnement",
      `${APP_BASE_URL}/admin/renouveler`,
      "#2563eb",
    );
    if (await sendResend(to, subject, html)) sent++;
    else await supabase.from("subscription_reminders").delete().eq("id", id);
  }

  // ── Clients abonnés aux stations ──
  const { data: subs } = await supabase
    .from("station_client_subscriptions")
    .select("id, station_id, client_id, client_name, client_email, price, started_at, created_at, stations(name)")
    .eq("status", "actif");
  const subIds = (subs ?? []).map((s) => s.id);
  const { data: invoices } = subIds.length
    ? await supabase.from("station_subscription_invoices").select("subscription_id, billing_month").eq("status", "paye").in("subscription_id", subIds)
    : { data: [] };
  const lastPaid: Record<string, string> = {};
  for (const inv of invoices ?? []) {
    if (!/^\d{4}-\d{2}$/.test(inv.billing_month || "")) continue;
    if (!lastPaid[inv.subscription_id] || inv.billing_month > lastPaid[inv.subscription_id]) lastPaid[inv.subscription_id] = inv.billing_month;
  }

  for (const sub of subs ?? []) {
    let due: Date;
    if (lastPaid[sub.id]) {
      const [y, m] = lastPaid[sub.id].split("-").map(Number);
      due = endOfMonth(y, m - 1);
    } else {
      const start = new Date(sub.started_at || sub.created_at);
      if (Number.isNaN(start.getTime())) continue;
      due = endOfMonth(start.getUTCFullYear(), start.getUTCMonth());
    }
    const days = daysUntil(due);
    if (days < 0 || days > REMINDER_DAYS) continue;

    let to = sub.client_email as string | null;
    if (!to && sub.client_id) {
      const { data: p } = await supabase.from("profiles").select("email").eq("id", sub.client_id).maybeSingle();
      to = p?.email ?? null;
    }
    if (!to) { skipped.push(`client ${sub.client_name}: pas d'email`); continue; }

    const id = await claim({ kind: "client", station_id: sub.station_id, subscription_id: sub.id, due_date: dateKey(due), recipient: to });
    if (!id) continue;
    const stationName = (Array.isArray(sub.stations) ? sub.stations[0]?.name : sub.stations?.name) || "votre station";
    const first = String(sub.client_name || "").split(" ")[0];
    const subject = `Votre abonnement lavage chez ${stationName} arrive à échéance ${whenText(days)}`;
    const html = layout(
      `${first ? `${esc(first)}, v` : "V"}otre abonnement se termine ${whenText(days)}`,
      `<p style="font-size:15px;line-height:1.5;">Votre abonnement lavage chez <strong>${esc(stationName)}</strong> arrive à échéance le <strong>${fmtDate(due)}</strong>${sub.price ? ` (${Number(sub.price).toLocaleString("fr-FR")} FCFA / mois)` : ""}. Pensez à le renouveler auprès de votre station pour garder vos avantages.</p>`,
      "Voir mon espace",
      `${APP_BASE_URL}/dashboard`,
      "#059669",
    );
    if (await sendResend(to, subject, html)) sent++;
    else await supabase.from("subscription_reminders").delete().eq("id", id);
  }

  return new Response(JSON.stringify({ sent, skipped }), { status: 200, headers: { "Content-Type": "application/json" } });
});
