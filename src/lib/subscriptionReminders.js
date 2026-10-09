// Relances d'échéance d'abonnement (add_subscription_reminders.sql) :
//   - « station » : abonnement d'une station à la plateforme (Super Admin >
//     Relances) — échéance = next_billing_date, ou fin d'essai ;
//   - « client » : abonnement mensuel d'un client à une station (Admin >
//     Relances) — échéance = dernier jour du dernier mois payé (factures
//     station_subscription_invoices), à défaut du mois de souscription.
// L'email automatique part une fois par échéance, dans les REMINDER_DAYS jours
// qui la précèdent (Edge Function send-subscription-reminders, même règle,
// recopiée côté Deno) ; la relance WhatsApp est un bouton manuel.
import { supabase } from './supabaseClient';

export const REMINDER_DAYS = 5;

const DAY = 86400000;

// Date locale AAAA-MM-JJ (clé d'échéance, sans heure).
export const dateKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// Jours entiers restants avant l'échéance (0 = aujourd'hui, négatif = dépassée).
export function daysUntil(due, now = new Date()) {
  const a = new Date(now); a.setHours(0, 0, 0, 0);
  const b = new Date(due); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / DAY);
}

export function stationDueDate(station) {
  // Illimité : rien à relancer ; à payer : jamais activée, pas d'échéance.
  if (station.subscriptionStatus === 'illimite' || station.subscriptionStatus === 'a_payer') return null;
  if (station.subscriptionStatus === 'essai') return station.trialEndsAt || null;
  return station.nextBillingDate || null;
}

const endOfMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0);

// `invoices` : factures de CET abonnement. billing_month = 'AAAA-MM'.
export function clientDueDate(subscription, invoices) {
  const paid = invoices.filter((i) => i.status === 'paye' && /^\d{4}-\d{2}$/.test(i.billingMonth || '')).map((i) => i.billingMonth).sort();
  if (paid.length) {
    const [y, m] = paid[paid.length - 1].split('-').map(Number);
    return endOfMonth(y, m - 1);
  }
  const start = new Date(subscription.startedAt || subscription.createdAt);
  return Number.isNaN(start.getTime()) ? null : endOfMonth(start.getFullYear(), start.getMonth());
}

// 'due' = dans la fenêtre de relance, 'late' = échéance dépassée, null = rien à faire.
export function reminderState(days) {
  if (days == null) return null;
  if (days < 0) return 'late';
  if (days <= REMINDER_DAYS) return 'due';
  return null;
}

export const dueLabel = (days) => (days < 0 ? `En retard de ${-days} j` : days === 0 ? "Aujourd'hui" : `Dans ${days} j`);

// Numéro WhatsApp international : un numéro sénégalais saisi en local (9
// chiffres, 7x / 3x) reçoit l'indicatif 221.
export function whatsappLink(phone, message) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9 && /^[73]/.test(digits)) digits = `221${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export const formatDueDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

// ─── Journal des relances (table subscription_reminders) ───────────────

// Dernier email et dernier WhatsApp par échéance, indexés par
// `${refId}|${dueKey}` (refId = station_id pour kind 'station',
// subscription_id pour kind 'client').
export async function loadReminderLog(kind, stationId) {
  let q = supabase.from('subscription_reminders').select('*').eq('kind', kind).order('sent_at', { ascending: false });
  if (stationId) q = q.eq('station_id', stationId);
  const { data } = await q;
  const log = {};
  (data || []).forEach((r) => {
    const k = `${kind === 'client' ? r.subscription_id : r.station_id}|${r.due_date}`;
    const e = log[k] || (log[k] = {});
    const field = r.channel === 'email' ? 'emailSentAt' : 'lastWhatsappAt';
    if (!e[field]) e[field] = r.sent_at;
  });
  return log;
}

export async function logWhatsappReminder({ kind, stationId, subscriptionId, due, phone }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('subscription_reminders').insert({
    kind, station_id: stationId, subscription_id: subscriptionId || null,
    due_date: dateKey(due), channel: 'whatsapp', recipient: phone || null, sent_by: user?.id,
  });
  if (error) console.error('logWhatsappReminder:', error);
  return !error;
}
