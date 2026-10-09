import React, { useState } from 'react';
import { BellRing, Mail, MessageCircle, CheckCircle2 } from 'lucide-react';
import { dueLabel, formatDueDate, REMINDER_DAYS } from '../../lib/subscriptionReminders';

// Liste commune aux rubriques « Relances » (Super Admin : stations ; station :
// ses clients abonnés). Chaque ligne = une échéance : nom, détail (offre ou
// prix), date + jours restants, état de l'email automatique, et bouton
// WhatsApp (ouvre la conversation pré-remplie et garde la trace du clic).
//
// rows: [{ key, name, detail, due, days, state: 'due'|'late', phone, email,
//          emailSentAt, lastWhatsappAt, waLink }]
export default function ReminderList({ rows, onWhatsapp, accent = 'blue', emptyLabel }) {
  const [tab, setTab] = useState('due');
  const due = rows.filter((r) => r.state === 'due');
  const late = rows.filter((r) => r.state === 'late');
  const shown = (tab === 'due' ? due : late).slice().sort((a, b) => (tab === 'due' ? a.days - b.days : b.days - a.days));
  const on = accent === 'purple' ? 'bg-purple-600/20 border-purple-500/50 text-purple-300' : 'bg-blue-600/20 border-blue-500/50 text-blue-300';
  const chip = (active) => `px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${active ? on : 'bg-neutral-900 border-white/10 text-neutral-400 hover:text-white'}`;
  const fmt = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button onClick={() => setTab('due')} className={chip(tab === 'due')}>À relancer (J-{REMINDER_DAYS} à J) · {due.length}</button>
        <button onClick={() => setTab('late')} className={chip(tab === 'late')}>En retard · {late.length}</button>
      </div>

      {shown.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <BellRing className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <p className="text-neutral-400">{tab === 'due' ? emptyLabel : 'Aucune échéance dépassée.'}</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-5 font-semibold text-neutral-400">Abonné</th>
                <th className="p-5 font-semibold text-neutral-400">Échéance</th>
                <th className="p-5 font-semibold text-neutral-400">Email automatique</th>
                <th className="p-5 font-semibold text-neutral-400 text-right">WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="p-5">
                    <p className="font-bold text-white">{r.name || 'Sans nom'}</p>
                    <p className="text-xs text-neutral-500">{r.detail}</p>
                  </td>
                  <td className="p-5 whitespace-nowrap">
                    <p className={r.state === 'late' ? 'text-red-400 font-semibold' : r.days <= 1 ? 'text-orange-400 font-semibold' : 'text-white font-semibold'}>{dueLabel(r.days)}</p>
                    <p className="text-xs text-neutral-500">{formatDueDate(r.due)}</p>
                  </td>
                  <td className="p-5 text-sm">
                    {r.emailSentAt ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Envoyé le {fmt(r.emailSentAt)}</span>
                    ) : !r.email ? (
                      <span className="text-neutral-500">Pas d'email enregistré</span>
                    ) : r.state === 'due' ? (
                      <span className="inline-flex items-center gap-1.5 text-neutral-400"><Mail className="w-4 h-4" /> Envoi automatique à 9h</span>
                    ) : (
                      <span className="text-neutral-500">—</span>
                    )}
                  </td>
                  <td className="p-5 text-right">
                    {r.waLink ? (
                      <div className="inline-flex flex-col items-end gap-1">
                        <a href={r.waLink} target="_blank" rel="noopener noreferrer" onClick={() => onWhatsapp(r)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors text-xs font-bold whitespace-nowrap">
                          <MessageCircle className="w-4 h-4" /> Relancer
                        </a>
                        {r.lastWhatsappAt && <span className="text-[11px] text-neutral-500">Relancé le {fmt(r.lastWhatsappAt)}</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-500">Pas de téléphone</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
