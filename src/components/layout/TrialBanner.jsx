import React from 'react';
import { Sparkles } from 'lucide-react';
import { trialDaysRemaining, trialProgressPercent, trialUrgency, TRIAL_DURATION_DAYS } from '../../lib/stationTrial';

// Bandeau d'essai gratuit (1 mois) affiché au-dessus de l'espace station tant
// que subscription_status === 'essai' (voir add_station_trial.sql). N'agit
// jamais automatiquement sur l'abonnement à l'expiration — c'est toujours le
// Super Admin qui bascule manuellement vers "a_jour"/"en_retard" (voir
// Billing.jsx), ce bandeau est purement informatif.
const URGENCY_STYLES = {
  ok: { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-300', bar: 'bg-emerald-400' },
  warning: { bg: 'bg-orange-500/15 border-orange-500/30', text: 'text-orange-300', bar: 'bg-orange-400' },
  danger: { bg: 'bg-red-500/15 border-red-500/30', text: 'text-red-300', bar: 'bg-red-400' },
};

export default function TrialBanner({ billing }) {
  if (!billing || billing.subscriptionStatus !== 'essai' || !billing.trialEndsAt) return null;

  const daysRemaining = trialDaysRemaining(billing.trialEndsAt);
  const percent = trialProgressPercent(billing.trialEndsAt);
  const isExpired = daysRemaining <= 0;
  const style = URGENCY_STYLES[trialUrgency(billing.trialEndsAt)];

  return (
    <div className={`relative z-20 flex flex-col sm:flex-row sm:items-center gap-3 border-b px-6 py-3 text-sm ${style.bg}`}>
      <span className={`flex items-center gap-2 font-medium flex-shrink-0 ${style.text}`}>
        <Sparkles className="w-4 h-4" />
        {isExpired
          ? "Essai gratuit terminé"
          : `Essai gratuit — ${daysRemaining} jour${daysRemaining > 1 ? 's' : ''} restant${daysRemaining > 1 ? 's' : ''} sur ${TRIAL_DURATION_DAYS}`}
      </span>
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden min-w-[120px]">
        <div className={`h-full rounded-full transition-all duration-500 ${style.bar}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-neutral-400 flex-shrink-0">{TRIAL_DURATION_DAYS - daysRemaining}/{TRIAL_DURATION_DAYS} jours utilisés</span>
    </div>
  );
}
