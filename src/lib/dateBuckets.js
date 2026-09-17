// Construction de "buckets" temporels (jour/semaine/mois/année) pour les
// graphiques d'évolution du Super Admin — extrait de SuperAdmin/Analytics.jsx
// pour être réutilisé tel quel par SuperAdmin/Dashboard.jsx (même logique de
// regroupement, pas de copie divergente).
export const GRANULARITIES = [
  { key: 'jour', label: 'Jour' },
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois', label: 'Mois' },
  { key: 'annee', label: 'Année' },
];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // lundi = 0
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

export function buildBuckets(granularity) {
  const now = new Date();
  if (granularity === 'jour') {
    return Array.from({ length: 14 }).map((_, i) => {
      const start = addDays(startOfDay(now), i - 13);
      const end = addDays(start, 1);
      return { start, end, label: start.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) };
    });
  }
  if (granularity === 'semaine') {
    return Array.from({ length: 8 }).map((_, i) => {
      const start = addDays(startOfWeek(now), (i - 7) * 7);
      const end = addDays(start, 7);
      return { start, end, label: `${start.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}` };
    });
  }
  if (granularity === 'annee') {
    return Array.from({ length: 5 }).map((_, i) => {
      const year = now.getFullYear() - (4 - i);
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      return { start, end, label: String(year) };
    });
  }
  // mois (défaut)
  return Array.from({ length: 12 }).map((_, i) => {
    const start = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), i - 11);
    const end = addMonths(start, 1);
    return { start, end, label: start.toLocaleDateString('fr-FR', { month: 'short' }) };
  });
}

// Tous les jours d'un mois calendaire donné (1 -> dernier jour), contrairement
// à buildBuckets('jour') qui montre une fenêtre glissante des 14 derniers
// jours — sert à naviguer un mois précis (voir "Recette générée par les
// stations", SuperAdmin/Dashboard.jsx : sélecteur Mois/Année dédié).
export function buildDayBucketsForMonth(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }).map((_, i) => {
    const day = i + 1;
    const start = new Date(year, month, day, 0, 0, 0, 0);
    const end = new Date(year, month, day + 1, 0, 0, 0, 0);
    return { start, end, label: String(day) };
  });
}

// Les 12 mois calendaires (Janvier -> Décembre) d'une année donnée, par
// opposition à buildBuckets('mois') qui montre une fenêtre glissante des 12
// derniers mois (pouvant chevaucher deux années civiles).
export function buildMonthBucketsForYear(year) {
  return Array.from({ length: 12 }).map((_, m) => {
    const start = new Date(year, m, 1, 0, 0, 0, 0);
    const end = new Date(year, m + 1, 1, 0, 0, 0, 0);
    return { start, end, label: start.toLocaleDateString('fr-FR', { month: 'short' }) };
  });
}

// Une ligne par année civile, de `fromYear` à l'année en cours incluse —
// contrairement à buildBuckets('annee'), qui montre toujours exactement 5 ans
// glissants (même quand la plateforme n'existait pas encore sur une partie de
// cette période).
export function buildYearBuckets(fromYear) {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = fromYear; y <= currentYear; y++) years.push(y);
  return years.map((y) => ({ start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1), label: String(y) }));
}

export function countInBuckets(buckets, items, dateField) {
  return buckets.map(b => items.filter(it => {
    const d = new Date(it[dateField]);
    return d >= b.start && d < b.end;
  }).length);
}

// Même principe que countInBuckets, mais somme une valeur numérique (ex.
// recette des lavages) au lieu de compter les lignes — voir "Recette générée
// par les stations" dans SuperAdmin/Dashboard.jsx.
export function sumInBuckets(buckets, items, dateField, valueFn) {
  return buckets.map(b => items.reduce((sum, it) => {
    const d = new Date(it[dateField]);
    return (d >= b.start && d < b.end) ? sum + (Number(valueFn(it)) || 0) : sum;
  }, 0));
}
