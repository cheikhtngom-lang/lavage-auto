import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, X, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MAX_FREE_VEHICLES, CLIENT_PLANS } from '../../lib/superUser';

// Modal d'upsell affiché quand un automobiliste gratuit tente de dépasser la
// limite de 2 véhicules (ajout d'un 3e véhicule, ou réservation avec plus de
// 2 véhicules à la fois) — voir Garage.jsx et Stations.jsx. Ne fait aucun
// paiement lui-même : redirige vers "Mon abonnement" (Client/Settings.jsx),
// avec le palier choisi pré-sélectionné, seul endroit où vit le vrai flux de
// paiement Wave/Orange Money.
export default function SuperUserUpsellModal({ open, onClose }) {
  const navigate = useNavigate();

  const handleUpgrade = (planKey) => {
    onClose();
    navigate(`/dashboard/parametres?plan=${planKey}#abonnement`);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-white"><X className="w-6 h-6" /></button>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-amber-500/20 rounded-xl"><Crown className="w-5 h-5 text-amber-400" /></div>
              <h2 className="text-xl font-bold text-white">Limite de l'offre gratuite</h2>
            </div>
            <p className="text-sm text-neutral-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-6">
              Vous avez atteint la limite de <strong className="text-amber-400">{MAX_FREE_VEHICLES} véhicules</strong> de l'offre gratuite.
            </p>

            <div className="space-y-3 mb-5">
              <button onClick={() => handleUpgrade('PLUS')}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-white/10 bg-white/5 hover:border-blue-500/40 hover:bg-blue-500/10 transition-colors text-left">
                <div>
                  <p className="text-white font-bold flex items-center gap-1.5"><Check className="w-4 h-4 text-blue-400" /> Plus — {CLIENT_PLANS.PLUS.maxVehicles} véhicules</p>
                  <p className="text-neutral-500 text-xs mt-0.5">Pour une petite famille ou une flotte réduite.</p>
                </div>
                <span className="text-white font-bold text-sm whitespace-nowrap">{CLIENT_PLANS.PLUS.price.toLocaleString('fr-FR')} F/mois</span>
              </button>
              <button onClick={() => handleUpgrade('SUPER_USER')}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 transition-colors text-left">
                <div>
                  <p className="text-white font-bold flex items-center gap-1.5"><Crown className="w-4 h-4 text-amber-400" /> Super User — Illimité</p>
                  <p className="text-neutral-500 text-xs mt-0.5">Autant de véhicules que vous le souhaitez.</p>
                </div>
                <span className="text-amber-400 font-bold text-sm whitespace-nowrap">{CLIENT_PLANS.SUPER_USER.price.toLocaleString('fr-FR')} F/mois</span>
              </button>
            </div>

            <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 transition-colors font-medium text-sm">
              Plus tard
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
