import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, BellOff, ArrowRight } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';

const hhmm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

// Bandeau fixe, visible sur toutes les pages de l'espace station tant que
// l'appli bipe : il dit quel véhicule a dépassé son temps et permet d'arrêter
// le son. Le bip et ce bandeau vont toujours ensemble (voir useAppState et
// lib/washAlarm.js) : plus de bip sans rien à l'écran.
export default function WashAlarmBanner() {
  const navigate = useNavigate();
  const { overdueWashes, silencedWashIds, silenceWashAlarm } = useAppState();
  const ringing = (overdueWashes || []).filter((w) => !w.stale && !(silencedWashIds || []).includes(w.id));
  if (!ringing.length) return null;

  const ids = ringing.map((w) => w.id);
  const first = ringing[0];
  const title = ringing.length === 1
    ? `Temps écoulé : ${first.vehicle || 'véhicule'}`
    : `${ringing.length} lavages ont dépassé leur temps`;
  const detail = ringing.length === 1
    ? [first.washer, `fin prévue à ${hhmm(first.dueAt)}`].filter(Boolean).join(' · ')
    : ringing.map((w) => w.vehicle || 'véhicule').join(', ');

  const view = () => {
    silenceWashAlarm(ids);
    // Nouvel état à chaque appui : la File d'attente défile jusqu'à la carte,
    // même si elle est déjà ouverte.
    navigate('/admin/queue', { state: { focusWashId: first.id, focusAt: Date.now() } });
  };

  return (
    <div
      role="alert"
      className="fixed z-[60] left-1/2 -translate-x-1/2 top-[4.5rem] lg:top-4 w-[calc(100%-2rem)] max-w-2xl"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-orange-500/40 bg-neutral-950/95 px-4 py-3 shadow-2xl shadow-black/50">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center flex-shrink-0">
            <BellRing className="w-5 h-5 text-orange-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{title}</p>
            <p className="text-xs text-neutral-400 truncate">{detail}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => silenceWashAlarm(ids)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-neutral-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <BellOff className="w-4 h-4" /> Couper le son
          </button>
          <button
            type="button"
            onClick={view}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-neutral-950 hover:bg-orange-400 transition-colors"
          >
            Voir <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
