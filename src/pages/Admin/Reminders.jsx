import React, { useCallback, useEffect, useState } from 'react';
import { useAppState } from '../../hooks/useAppState';
import { getCurrentStationId } from '../../lib/accounts';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import ReminderList from '../../components/reminders/ReminderList';
import {
  clientDueDate, daysUntil, reminderState, dateKey, formatDueDate, whatsappLink, loadReminderLog, logWhatsappReminder, REMINDER_DAYS,
} from '../../lib/subscriptionReminders';

// Station > Relances : clients abonnés (mensuel) dont la période payée se
// termine dans les 5 jours, ou est dépassée. L'email part tout seul
// (send-subscription-reminders, 9h) ; WhatsApp = bouton manuel.
export default function Reminders() {
  useDocumentTitle('Relances');
  const { clientSubscriptions, clientSubscriptionInvoices, stationProfile } = useAppState();
  const stationId = getCurrentStationId();
  const [log, setLog] = useState({});
  const refresh = useCallback(async () => setLog(await loadReminderLog('client', stationId)), [stationId]);
  useEffect(() => { refresh(); }, [refresh]);

  const stationName = stationProfile?.name || 'votre station';
  const rows = clientSubscriptions.filter((s) => s.status === 'actif').map((s) => {
    const due = clientDueDate(s, clientSubscriptionInvoices.filter((i) => i.subscriptionId === s.id));
    if (!due) return null;
    const days = daysUntil(due);
    const state = reminderState(days);
    if (!state) return null;
    const first = (s.clientName || '').split(' ')[0];
    const price = s.price ? ` (${Number(s.price).toLocaleString('fr-FR')} FCFA / mois)` : '';
    const message = `Bonjour${first ? ` ${first}` : ''}, votre abonnement lavage chez ${stationName}${price} ${days < 0 ? 'est arrivé à échéance le' : 'arrive à échéance le'} ${formatDueDate(due)}. Pensez à le renouveler pour garder vos avantages. Merci !`;
    const entry = log[`${s.id}|${dateKey(due)}`] || {};
    return {
      key: s.id, subscriptionId: s.id, name: s.clientName,
      detail: `${s.price ? `${Number(s.price).toLocaleString('fr-FR')} FCFA / mois` : 'Abonnement mensuel'}${s.clientPhone ? ` · ${s.clientPhone}` : ''}`,
      due, days, state, phone: s.clientPhone, email: s.clientEmail,
      emailSentAt: entry.emailSentAt, lastWhatsappAt: entry.lastWhatsappAt,
      waLink: whatsappLink(s.clientPhone, message),
    };
  }).filter(Boolean);

  const onWhatsapp = async (r) => {
    await logWhatsappReminder({ kind: 'client', stationId, subscriptionId: r.subscriptionId, due: r.due, phone: r.phone });
    refresh();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight">Relances <span className="text-blue-400">abonnés</span></h1>
        <p className="text-neutral-400 text-lg">Clients dont l'abonnement se termine dans les {REMINDER_DAYS} jours. Un email part automatiquement chaque matin ; relancez aussi par WhatsApp en un clic.</p>
      </div>
      <ReminderList rows={rows} onWhatsapp={onWhatsapp} emptyLabel={`Aucun abonnement n'arrive à échéance dans les ${REMINDER_DAYS} jours.`} />
    </div>
  );
}
