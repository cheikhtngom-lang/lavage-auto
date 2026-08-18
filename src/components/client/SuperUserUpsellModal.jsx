import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SUPER_USER_MONTHLY_PRICE } from '../../lib/superUser';

// Modal d'upsell affiché quand un automobiliste gratuit tente de dépasser la
// limite de 2 véhicules (ajout d'un 3e véhicule, ou réservation avec plus de
// 2 véhicules à la fois) — voir Garage.jsx et Stations.jsx. Ne fait aucun
// paiement lui-même : redirige vers "Mon abonnement" (Client/Settings.jsx),
// seul endroit où vit le vrai flux de paiement Wave/Orange Money.
export default function SuperUserUpsellModal({ open, onClose }) {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    onClose();
    navigate('/dashboard/parametres#abonnement');
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
              Vous avez atteint la limite de <strong className="text-amber-400">2 véhicules</strong> de l'offre gratuite.
              <br /><br />
              Passez à <strong className="text-white">Super User</strong> pour {SUPER_USER_MONTHLY_PRICE.toLocaleString('fr-FR')} FCFA/mois et utilisez autant de véhicules que vous le souhaitez.
            </p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 transition-colors font-medium text-sm">
                Plus tard
              </button>
              <button onClick={handleUpgrade}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm">
                <Crown className="w-4 h-4" /> Passer à Super User
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
