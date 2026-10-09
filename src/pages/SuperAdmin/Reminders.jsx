import React, { useCallback, useEffect, useState } from 'react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import ReminderList from '../../components/reminders/ReminderList';
import {
  stationDueDate, daysUntil, reminderState, dateKey, formatDueDate, whatsappLink, loadReminderLog, logWhatsappReminder, REMINDER_DAYS,
} from '../../lib/subscriptionReminders';

// Super Admin > Relances : stations dont l'abonnement à la plateforme (ou
// l'essai) arrive à échéance dans les 5 jours, ou est dépassé. L'email part
// tout seul (send-subscription-reminders, 9h) ; WhatsApp = bouton manuel.
export default function Reminders() {
  useDocumentTitle('Relances');
  const { stations, PLANS } = useSuperAdminState();
  const [log, setLog] = useState({});
  const refresh = useCallback(async () => setLog(await loadReminderLog('station')), []);
  useEffect(() => { refresh(); }, [refresh]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://galsenautocleaner.com';
  const rows = stations.map((s) => {
    const due = stationDueDate(s);
    if (!due) return null;
    const days = daysUntil(due);
    const state = reminderState(days);
    if (!state) return null;
    const trial = s.subscriptionStatus === 'essai';
    const planLabel = PLANS?.[s.plan]?.label || s.plan;
    const first = (s.ownerName || '').split(' ')[0];
    const message = trial
      ? `Bonjour${first ? ` ${first}` : ''}, l'essai gratuit de ${s.name} sur Galsen Auto Cleaner ${days < 0 ? 'est terminé depuis le' : 'se termine le'} ${formatDueDate(due)}. Choisissez votre offre pour continuer : ${origin}/admin/renouveler`
      : `Bonjour${first ? ` ${first}` : ''}, l'abonnement ${planLabel} de ${s.name} sur Galsen Auto Cleaner ${days < 0 ? 'est arrivé à échéance le' : 'arrive à échéance le'} ${formatDueDate(due)}. Renouvelez-le ici : ${origin}/admin/renouveler`;
    const entry = log[`${s.id}|${dateKey(due)}`] || {};
    return {
      key: s.id, stationId: s.id, name: s.name,
      detail: `${trial ? 'Essai gratuit' : planLabel}${s.ownerName ? ` · ${s.ownerName}` : ''}${s.ownerPhone ? ` · ${s.ownerPhone}` : ''}`,
      due, days, state, phone: s.ownerPhone, email: s.ownerEmail,
      emailSentAt: entry.emailSentAt, lastWhatsappAt: entry.lastWhatsappAt,
      waLink: whatsappLink(s.ownerPhone, message),
    };
  }).filter(Boolean);

  const onWhatsapp = async (r) => {
    await logWhatsappReminder({ kind: 'station', stationId: r.stationId, due: r.due, phone: r.phone });
    refresh();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight">Relances <span className="text-purple-400">abonnements</span></h1>
        <p className="text-neutral-400 text-lg">Stations dont l'abonnement ou l'essai se termine dans les {REMINDER_DAYS} jours. Un email part automatiquement chaque matin ; relancez aussi par WhatsApp en un clic.</p>
      </div>
      <ReminderList rows={rows} onWhatsapp={onWhatsapp} accent="purple" emptyLabel={`Aucune station n'arrive à échéance dans les ${REMINDER_DAYS} jours.`} />
    </div>
  );
}
