// Alerte « temps de lavage écoulé » : une seule règle pour le minuteur de la
// carte (File d'attente), le bip et le bandeau de l'espace station. Avant,
// chacun refaisait son calcul.

export const DEFAULT_WASH_MINUTES = 30;

// Durée estimée d'un lavage, en minutes. Une durée absente ou nulle vaut 30.
export function washDurationMinutes(durationConfig, item) {
  const cat = item?.category || 'Particulier';
  const minutes = Number(durationConfig?.[cat]?.[item?.service]);
  return minutes > 0 ? minutes : DEFAULT_WASH_MINUTES;
}

// Lavage commencé avant aujourd'hui (heure locale) : resté « en cours » par
// oubli. Il reste affiché dans la file mais ne bipe pas : un bip continu dès
// l'ouverture de l'appli, sans véhicule qui vient de finir, ne prévient de rien.
export function startedBeforeToday(startedAt, now = Date.now()) {
  if (!startedAt) return false;
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return new Date(startedAt).getTime() < midnight.getTime();
}

// Lavages en cours dont le temps estimé est écoulé, du plus ancien au plus récent.
export function findOverdueWashes(activeWashes, durationConfig, now = Date.now()) {
  return (activeWashes || [])
    .filter((item) => item?.startedAt)
    .map((item) => {
      const dueAt = new Date(item.startedAt).getTime() + washDurationMinutes(durationConfig, item) * 60000;
      return {
        id: item.id,
        vehicle: item.vehicle,
        washer: (item.assignedWasherNames && item.assignedWasherNames.length)
          ? item.assignedWasherNames.join(', ')
          : (item.assignedTo || ''),
        dueAt,
        stale: startedBeforeToday(item.startedAt, now),
      };
    })
    .filter((w) => w.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt);
}

// Lavages pour lesquels l'appli doit biper (et afficher le bandeau) : temps
// écoulé aujourd'hui, son pas encore coupé par le gérant.
export function ringingWashes(overdueWashes, silencedWashIds) {
  const silenced = silencedWashIds || [];
  return (overdueWashes || []).filter((w) => !w.stale && !silenced.includes(w.id));
}

// Même liste (mêmes lavages, même état) : évite de redessiner tout l'espace
// station toutes les 5 secondes quand rien n'a changé.
export function sameOverdueList(a, b) {
  if (a.length !== b.length) return false;
  return a.every((w, i) => w.id === b[i].id && w.stale === b[i].stale && w.vehicle === b[i].vehicle && w.washer === b[i].washer);
}

// Lavages dont le gérant a coupé le son (« Voir » ou « Couper le son » sur le
// bandeau) : gardés dans le navigateur pour qu'un rechargement ne refasse pas
// biper, et partagés entre les onglets (événement « storage », voir
// useAppState). Les identifiants de réservation sont uniques : pas besoin de
// les purger, on garde simplement les 50 derniers.
export const SILENCED_WASH_IDS_KEY = 'ccg_wash_alarm_silenced';

export function readSilencedWashIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(SILENCED_WASH_IDS_KEY) || '[]');
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export function writeSilencedWashIds(ids) {
  const kept = ids.slice(-50);
  try { localStorage.setItem(SILENCED_WASH_IDS_KEY, JSON.stringify(kept)); } catch { /* stockage indisponible : le son reviendra au rechargement */ }
  return kept;
}
