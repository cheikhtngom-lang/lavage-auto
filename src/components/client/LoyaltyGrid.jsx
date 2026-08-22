import React from 'react';
import { Gift } from 'lucide-react';

// Grille de cartes de fidélité, pure (pas de fetch ici) — utilisée par la
// page dédiée Client/Loyalty.jsx. Séparée en composant réutilisable au cas
// où elle serait un jour affichée ailleurs (ex: un aperçu compact), même si
// aujourd'hui elle n'a qu'un seul appelant.
export default function LoyaltyGrid({ entries }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
        <Gift className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Pas encore de programme de fidélité actif</h3>
        <p className="text-neutral-400">Réservez un lavage payé dans une station pour démarrer votre première carte de fidélité.</p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {entries.map(({ station, count, threshold, inCycle, eligible }) => (
        <div key={station.id} className="glass-card rounded-2xl p-5 border border-white/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-white">{station.name}</h3>
            <span className="text-xs text-neutral-500">{count} lavage{count > 1 ? 's' : ''} au total</span>
          </div>
          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all" style={{ width: `${(inCycle / threshold) * 100}%` }} />
          </div>
          {eligible ? (
            <p className="text-sm text-emerald-400 font-medium flex items-center gap-1.5"><Gift className="w-4 h-4" /> Lavage gratuit disponible — montrez cet écran à la station !</p>
          ) : (
            <p className="text-sm text-neutral-400">{inCycle}/{threshold} lavages vers votre prochain lavage gratuit</p>
          )}
        </div>
      ))}
    </div>
  );
}
