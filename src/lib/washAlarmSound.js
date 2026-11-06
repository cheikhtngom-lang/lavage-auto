// Son de l'alerte « temps de lavage écoulé ». Seul WashAlarmBanner le joue,
// et seulement pendant qu'il est affiché : pas de bip sans bandeau à l'écran.
//
// Un AudioContext créé (et jamais débloqué par un clic) démarre "suspended"
// dans la plupart des navigateurs — un son déclenché depuis un simple
// setInterval, sans qu'aucun clic n'ait eu lieu sur la page depuis son
// chargement, restait donc silencieux. On garde UN SEUL contexte pour
// l'onglet et on le débloque dès le tout premier clic/toucher/touche du
// gérant, plutôt que d'attendre le bip.
let ctx = null;
let unlockInstalled = false;

function getCtx() {
  if (!ctx) {
    const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function installAudioUnlock() {
  if (unlockInstalled || typeof document === 'undefined') return;
  unlockInstalled = true;
  const unlock = () => { getCtx()?.resume().catch(() => {}); };
  ['click', 'touchstart', 'keydown'].forEach((evt) => document.addEventListener(evt, unlock));
}

// Bips courts, aigus (onde carrée, plus perçante qu'un sinus) et répétés
// par salves — pensé pour porter à travers la vitre d'un véhicule,
// pas pour être agréable (un "ding" doux ne s'entend pas de dehors).
export function playWashChime() {
  try {
    const audio = getCtx();
    if (!audio) return;
    audio.resume().catch(() => {});
    const now = audio.currentTime;
    const freq = 2800;
    const beepDuration = 0.1;
    const beepGap = 0.08;
    const beepsPerRound = 3;
    const roundGap = 0.3;
    const rounds = 2;
    for (let round = 0; round < rounds; round++) {
      for (let beep = 0; beep < beepsPerRound; beep++) {
        const t = now + round * (beepsPerRound * (beepDuration + beepGap) + roundGap) + beep * (beepDuration + beepGap);
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.5, t + 0.008);
        gain.gain.setValueAtTime(0.5, t + beepDuration - 0.015);
        gain.gain.linearRampToValueAtTime(0, t + beepDuration);
        osc.connect(gain).connect(audio.destination);
        osc.start(t);
        osc.stop(t + beepDuration + 0.01);
      }
    }
  } catch { /* AudioContext indisponible — pas bloquant */ }
}
