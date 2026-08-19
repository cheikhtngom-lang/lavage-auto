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

export function countInBuckets(buckets, items, dateField) {
  return buckets.map(b => items.filter(it => {
    const d = new Date(it[dateField]);
    return d >= b.start && d < b.end;
  }).length);
}
