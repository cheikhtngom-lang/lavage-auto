import React, { useEffect, useRef, useState } from 'react';
import { Lock, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { clearSession, getCurrentStationId } from '../lib/accounts';

// Écran affiché à la place de la redirection quand la session d'une station
// expire pour inactivité (voir setSessionExpiredHandler dans lib/idleTimeout.js).
// La page reste ouverte et continue de surveiller la file via les données
// PUBLIQUES (RPC all_stations_queue_snapshot + wash_pricing, lisibles sans
// session) : dès qu'un lavage en cours dépasse sa durée estimée, on bipe et
// on fait clignoter le titre de l'onglet — le gérant sait qu'il doit se
// reconnecter pour cliquer « Terminer le lavage ».
const POLL_MS = 15000;
const DEFAULT_DURATION_MIN = 30;

export default function SessionLockOverlay({ stationName }) {
  const [overdue, setOverdue] = useState(0);
  const durMapRef = useRef(null);
  const audioRef = useRef(null);
  const baseTitleRef = useRef(typeof document !== 'undefined' ? document.title : '');

  // Débloque l'AudioContext à la première interaction (un navigateur bloque le
  // son tant qu'aucun geste utilisateur n'a eu lieu).
  useEffect(() => {
    const unlock = () => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC && !audioRef.current) audioRef.current = new AC();
        audioRef.current?.resume?.().catch(() => {});
      } catch { /* pas d'audio : le visuel + le titre suffisent */ }
    };
    ['click', 'touchstart', 'keydown'].forEach((e) => document.addEventListener(e, unlock));
    return () => ['click', 'touchstart', 'keydown'].forEach((e) => document.removeEventListener(e, unlock));
  }, []);

  const beep = () => {
    const ctx = audioRef.current;
    if (!ctx) return;
    try {
      ctx.resume().catch(() => {});
      const t0 = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const t = t0 + i * 0.18;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 2800;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5, t + 0.008);
        g.gain.linearRampToValueAtTime(0, t + 0.11);
        osc.connect(g).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.13);
      }
    } catch { /* ignore */ }
  };

  // Surveillance de la file (données publiques).
  useEffect(() => {
    const stationId = getCurrentStationId();
    if (!stationId || stationId === 'default') return;
    let cancelled = false;

    const durations = async () => {
      if (durMapRef.current) return durMapRef.current;
      const { data } = await supabase
        .from('wash_pricing')
        .select('category, service, duration_minutes')
        .eq('station_id', stationId);
      const map = {};
      (data || []).forEach((r) => { (map[r.category] ||= {})[r.service] = r.duration_minutes; });
      durMapRef.current = map;
      return map;
    };

    const check = async () => {
      try {
        const map = await durations();
        const { data } = await supabase.rpc('all_stations_queue_snapshot');
        const mine = (data || []).filter(
          (r) => r.station_id === stationId && r.status === 'en_cours' && r.started_at,
        );
        let n = 0;
        for (const w of mine) {
          const mins = map?.[w.category]?.[w.service] ?? DEFAULT_DURATION_MIN;
          const elapsed = (Date.now() - new Date(w.started_at).getTime()) / 1000;
          if (elapsed >= mins * 60) n += 1;
        }
        if (!cancelled) setOverdue(n);
      } catch { /* réseau : nouvelle tentative au prochain tick */ }
    };

    check();
    const id = setInterval(check, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Bip répété + clignotement du titre tant qu'un lavage est terminé.
  useEffect(() => {
    if (overdue <= 0) { document.title = baseTitleRef.current; return; }
    beep();
    const beepId = setInterval(beep, 5000);
    let on = false;
    const titleId = setInterval(() => {
      on = !on;
      document.title = on
        ? `🔴 ${overdue} lavage${overdue > 1 ? 's' : ''} terminé${overdue > 1 ? 's' : ''} !`
        : baseTitleRef.current;
    }, 1000);
    return () => {
      clearInterval(beepId);
      clearInterval(titleId);
      document.title = baseTitleRef.current;
    };
  }, [overdue]);

  const reconnect = () => {
    clearSession();
    window.location.replace('/login.html?expired=1');
  };

  const alerting = overdue > 0;

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-950/95 backdrop-blur-xl flex items-center justify-center p-4">
      <div className={`w-full max-w-md rounded-2xl border p-8 text-center ${alerting ? 'border-red-500/40 bg-red-950/30 animate-pulse' : 'border-white/10 bg-white/[0.03]'}`}>
        <div className={`w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center ${alerting ? 'bg-red-500/20' : 'bg-white/5'}`}>
          {alerting ? <AlertTriangle className="w-8 h-8 text-red-400" /> : <Lock className="w-8 h-8 text-neutral-400" />}
        </div>

        {alerting ? (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">
              {overdue} lavage{overdue > 1 ? 's' : ''} terminé{overdue > 1 ? 's' : ''} !
            </h1>
            <p className="text-red-200/90 mb-6">
              Reconnectez-vous pour valider {overdue > 1 ? 'les lavages' : 'le lavage'} et libérer {overdue > 1 ? 'les laveurs' : 'le laveur'}.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Session expirée</h1>
            <p className="text-neutral-400 mb-6">
              Votre session a expiré après une période d'inactivité.
              {stationName ? ` (${stationName})` : ''} Reconnectez-vous pour reprendre.
            </p>
          </>
        )}

        <button onClick={reconnect}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
          <RefreshCw className="w-4 h-4" /> Se reconnecter
        </button>
        <p className="text-neutral-600 text-xs mt-4">
          Laissez cette page ouverte : elle continue de surveiller la file et vous préviendra
          dès qu'un lavage est terminé.
        </p>
      </div>
    </div>
  );
}
