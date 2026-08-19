import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Crown, CheckCircle2, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';

// Clochette de notification "Abonnements Super User" — affichée dans
// SuperAdminLayout (mobile + desktop) pour que le Super Admin voie tout de
// suite qu'un automobiliste a payé pour débloquer plus de 2 véhicules, sans
// avoir à naviguer vers /superadmin/super-users. Confirmer/Rejeter directement
// depuis le dropdown appelle les mêmes fonctions que la page complète
// (useSuperAdminState), qui rafraîchit déjà superUserSubscriptions toutes les
// 8s / au focus — pas besoin d'un canal Realtime dédié pour ça.
export default function SuperUserNotifBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { superUserSubscriptions, confirmSuperUserPayment, rejectSuperUserPayment } = useSuperAdminState();
  const pending = superUserSubscriptions.filter((s) => s.status === 'PENDING');

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/10 flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 transition-colors shadow-lg"
        title="Demandes Super User"
      >
        <Bell className="w-5 h-5" />
        {pending.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-neutral-950 text-[11px] font-bold flex items-center justify-center ring-2 ring-neutral-950 animate-pulse">
            {pending.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-3 w-96 max-w-[90vw] bg-neutral-950/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-white/10 flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-white text-sm">Demandes Super User</h3>
              </div>
              {pending.length === 0 ? (
                <div className="p-6 text-center text-neutral-500 text-sm">Aucune demande en attente.</div>
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
                  {pending.map((s) => (
                    <div key={s.id} className="p-4 flex items-start justify-between gap-3 hover:bg-white/[0.03]">
                      <div className="min-w-0">
                        <p className="text-white font-medium text-sm truncate">{s.clientName || 'Sans nom'}</p>
                        <p className="text-neutral-500 text-xs truncate">{s.clientEmail || s.clientPhone || '—'}</p>
                        <p className="text-amber-400 text-xs font-medium mt-1">{(s.amount || 0).toLocaleString('fr-FR')} FCFA · {s.method || '—'}</p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => confirmSuperUserPayment(s.id)} title="Confirmer le paiement"
                          className="p-2 bg-white/5 hover:bg-emerald-500/20 hover:text-emerald-400 text-neutral-400 rounded-lg transition-colors">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => rejectSuperUserPayment(s.id)} title="Rejeter le paiement"
                          className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => { setOpen(false); navigate('/superadmin/super-users'); }}
                className="w-full p-3 text-center text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/5 border-t border-white/10 transition-colors"
              >
                Voir tous les abonnements →
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
