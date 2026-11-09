import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, BellOff, ArrowRight } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { ringingWashes } from '../../lib/washAlarm';
import { installAudioUnlock, playWashChime } from '../../lib/washAlarmSound';

const hhmm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const ALERT_TITLE = 'Temps de lavage écoulé';
const VERIFY_TIMEOUT_MS = 4000;

// Bandeau fixe, visible sur toutes les pages de l'espace station, qui dit
// quel véhicule a dépassé son temps et permet d'arrêter le son. C'est lui
// qui joue le bip, et seulement pendant qu'il est affiché : pas de son sans
// bandeau à l'écran (voir useAppState et lib/washAlarm.js).
export default function WashAlarmBanner() {
  const navigate = useNavigate();
  const { overdueWashes, silencedWashIds, silenceWashAlarm, refreshReservations } = useAppState();
  const ringing = ringingWashes(overdueWashes, silencedWashIds);
  const ringingKey = ringing.map((w) => w.id).join(',');

  useEffect(() => { installAudioUnlock(); }, []);

  // Avant le premier bip, on relit la file sur le serveur : un lavage terminé
  // depuis un autre appareil (caisse, téléphone d'un laveur) ne doit pas faire
  // biper celui-ci. Puis une salve toutes les 5 s, et une relecture par minute
  // tant que ça sonne (la relecture habituelle est suspendue quand l'onglet
  // est en arrière-plan).
  const refreshRef = useRef(refreshReservations);
  refreshRef.current = refreshReservations;
  useEffect(() => {
    if (!ringingKey) return undefined;
    let cancelled = false;
    let beep = null;
    let verify = null;
    const verifyNow = () => Promise.race([
      Promise.resolve().then(() => refreshRef.current?.()),
      new Promise((resolve) => { setTimeout(resolve, VERIFY_TIMEOUT_MS); }), // réseau lent : on alerte quand même
    ]).catch(() => {});
    verifyNow().then(() => {
      if (cancelled) return;
      playWashChime();
      beep = setInterval(playWashChime, 5000);
      verify = setInterval(verifyNow, 60000);
    });
    return () => { cancelled = true; clearInterval(beep); clearInterval(verify); };
  }, [ringingKey]);

  // Titre de l'onglet qui clignote : on sait quel onglet sonne quand plusieurs
  // sites sont ouverts. Le titre de la page en cours est repris à chaque tour
  // (il change si le gérant change de rubrique).
  useEffect(() => {
    if (!ringingKey) return undefined;
    let base = document.title;
    const id = setInterval(() => {
      if (document.title !== ALERT_TITLE) base = document.title;
      document.title = document.title === ALERT_TITLE ? base : ALERT_TITLE;
    }, 1000);
    return () => {
      clearInterval(id);
      if (document.title === ALERT_TITLE) document.title = base;
    };
  }, [ringingKey]);

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
