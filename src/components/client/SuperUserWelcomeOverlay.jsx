import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Sparkles, X } from 'lucide-react';
import { useClientAccount } from '../../hooks/useClientAccount';

// Écran de bienvenue "niveau supérieur débloqué", affiché une seule fois par
// activation Super User (pas à chaque connexion) — voir la persistance ci-
// dessous. Se déclenche dès que superUserStatus passe à ACTIVE, que ce soit
// juste après une confirmation Super Admin (dashboard.jsx en fond) ou détecté
// au focus/refresh suivant (voir useClientAccount, pas de push serveur ici).
const SEEN_KEY_PREFIX = 'ccg:super-user-welcome-seen:';

export default function SuperUserWelcomeOverlay() {
  const { account, superUserStatus, superUserSub } = useClientAccount();
  const [show, setShow] = useState(false);

  // Clé par (client, id de la ligne d'abonnement) : un renouvellement crée une
  // nouvelle ligne (voir src/lib/superUser.js createSuperUserPayment), donc
  // fête à nouveau le passage ACTIVE à chaque réabonnement, pas seulement la
  // toute première fois.
  useEffect(() => {
    if (!account?.id || superUserStatus !== 'ACTIVE' || !superUserSub?.id) return;
    const key = `${SEEN_KEY_PREFIX}${account.id}`;
    if (localStorage.getItem(key) === superUserSub.id) return;
    localStorage.setItem(key, superUserSub.id);
    setShow(true);
  }, [account?.id, superUserStatus, superUserSub?.id]);

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="relative w-full max-w-md rounded-3xl border border-amber-500/30 bg-gradient-to-b from-neutral-900 to-neutral-950 p-8 text-center shadow-2xl shadow-amber-500/10 overflow-hidden"
          >
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-500/20 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fbbf24 1px, transparent 1px)', backgroundSize: '18px 18px' }} />

            <button onClick={() => setShow(false)} className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>

            <motion.div
              initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.15, type: 'spring', stiffness: 300 }}
              className="relative mx-auto mb-5 w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/40"
            >
              <Crown className="w-10 h-10 text-white" />
            </motion.div>

            <p className="relative text-amber-400 text-xs font-bold tracking-[0.2em] uppercase mb-2 flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Niveau supérieur débloqué <Sparkles className="w-3.5 h-3.5" />
            </p>
            <h2 className="relative text-2xl font-bold text-white mb-3">
              Bienvenue chez les <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-400">Super User</span>
            </h2>
            <p className="relative text-neutral-400 text-sm mb-6">
              Votre paiement a été confirmé. Gérez désormais autant de véhicules que vous le souhaitez dans votre Parking, sans limite.
            </p>
            <button
              onClick={() => setShow(false)}
              className="relative w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold py-3 rounded-xl transition-all"
            >
              Découvrir mon Parking
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
