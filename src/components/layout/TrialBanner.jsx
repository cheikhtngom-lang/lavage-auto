import React from 'react';
import { Sparkles } from 'lucide-react';
import { trialDaysRemaining, trialProgressPercent, TRIAL_DURATION_DAYS } from '../../lib/stationTrial';

// Bandeau d'essai gratuit (1 mois) affiché au-dessus de l'espace station tant
// que subscription_status === 'essai' (voir add_station_trial.sql). N'agit
// jamais automatiquement sur l'abonnement à l'expiration — c'est toujours le
// Super Admin qui bascule manuellement vers "a_jour"/"en_retard" (voir
// Billing.jsx), ce bandeau est purement informatif.
export default function TrialBanner({ billing }) {
  if (!billing || billing.subscriptionStatus !== 'essai' || !billing.trialEndsAt) return null;

  const daysRemaining = trialDaysRemaining(billing.trialEndsAt);
  const percent = trialProgressPercent(billing.trialEndsAt);
  const isUrgent = daysRemaining <= 7;
  const isExpired = daysRemaining <= 0;

  return (
    <div className={`relative z-20 flex flex-col sm:flex-row sm:items-center gap-3 border-b px-6 py-3 text-sm ${
      isExpired ? 'bg-red-500/15 border-red-500/30' : isUrgent ? 'bg-orange-500/15 border-orange-500/30' : 'bg-blue-500/10 border-blue-500/20'
    }`}>
      <span className={`flex items-center gap-2 font-medium flex-shrink-0 ${isExpired ? 'text-red-300' : isUrgent ? 'text-orange-300' : 'text-blue-300'}`}>
        <Sparkles className="w-4 h-4" />
        {isExpired
          ? "Essai gratuit terminé"
          : `Essai gratuit — ${daysRemaining} jour${daysRemaining > 1 ? 's' : ''} restant${daysRemaining > 1 ? 's' : ''}`}
      </span>
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden min-w-[120px]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isExpired ? 'bg-red-400' : isUrgent ? 'bg-orange-400' : 'bg-blue-400'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs text-neutral-400 flex-shrink-0">{TRIAL_DURATION_DAYS - daysRemaining}/{TRIAL_DURATION_DAYS} jours utilisés</span>
    </div>
  );
}
