import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '../../components/ui/Card';
import { Clock, Users, Car, Target, TrendingUp, Banknote, Receipt, Calendar } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { PRICING_CATEGORY_LABELS } from '../../lib/vehicleBrands';

// Conversion Catmull-Rom -> Bézier cubique, pour tracer une courbe lissée
// passant par tous les points (au lieu d'un polyline anguleux).
function smoothPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

// Clé du jour au format YYYY-MM-DD (fuseau local) — même helper qu'ailleurs
// dans l'app (Washers.jsx, StationDashboard.jsx).
function dateKeyLocal(d) {
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}
function todayKey() { return dateKeyLocal(new Date()); }

// Une "fenêtre" décrit la période sélectionnée par le segmented control —
// utilisée pour filtrer transactions/lavages/avis de façon cohérente partout
// dans cette page (au lieu de dupliquer la logique de filtre par bloc).
function matchesWindow(dateVal, win) {
  if (!win || win.type === 'Tous') return true;
  if (!dateVal) return false;
  const d = new Date(dateVal);
  if (win.type === 'Par Jour') {
    const [y, m, day] = win.day.split('-').map(Number);
    return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
  }
  if (win.type === 'Par Mois') {
    return d.getFullYear() === Number(win.year) && d.getMonth() + 1 === Number(win.month);
  }
  if (win.type === 'Par Année') {
    return d.getFullYear() === Number(win.year);
  }
  return true;
}

// Période équivalente précédente (jour-1 / mois-1 / année-1) — sert au
// "Constat de la période" pour comparer sans inventer de donnée. Pas de
// période précédente sensée pour "Tous" (traité à part).
function getPreviousWindow(win) {
  if (win.type === 'Par Jour') {
    const d = new Date(`${win.day}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return { type: 'Par Jour', day: dateKeyLocal(d) };
  }
  if (win.type === 'Par Mois') {
    let m = Number(win.month) - 1;
    let y = Number(win.year);
    if (m < 1) { m = 12; y -= 1; }
    return { type: 'Par Mois', month: String(m).padStart(2, '0'), year: String(y) };
  }
  if (win.type === 'Par Année') {
    return { type: 'Par Année', year: String(Number(win.year) - 1) };
  }
  return null;
}

function revenueByService(transactions) {
  const map = {};
  transactions.forEach((tx) => { const key = tx.service || 'Autre'; map[key] = (map[key] || 0) + (parseInt(tx.amount) || 0); });
  return map;
}

const DONUT_COLORS = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4'];
const VEHICLE_CATEGORIES = [
  { key: 'Particulier', color: 'bg-blue-500', text: 'text-blue-400' },
  { key: 'Moto', color: 'bg-emerald-500', text: 'text-emerald-400' },
  { key: 'Transport', color: 'bg-amber-500', text: 'text-amber-400' },
  { key: 'Camion', color: 'bg-purple-500', text: 'text-purple-400' },
];
const RANK_BADGES = ['🥇', '🥈', '🥉'];

function initials(name) {
  return (name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatCompact(n) {
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
  return String(n);
}

export default function Analytics() {
  const { transactions, completedWashes, activeWashes, reviews, stationProfile } = useAppState();

  const [timeSegment, setTimeSegment] = useState('Tous');
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterMonth, setFilterMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [filterDay, setFilterDay] = useState(new Date().toISOString().split('T')[0]);
  const [peakDate, setPeakDate] = useState(todayKey());

  const segments = ['Tous', 'Par Jour', 'Par Mois', 'Par Année'];

  const currentWindow = { type: timeSegment, day: filterDay, month: filterMonth, year: filterYear };

  // `tx.createdAt` est l'horodatage réel (ISO) — contrairement à `tx.date` qui
  // est un texte d'affichage ("Aujourd'hui, HH:MM") non filtrable par date réelle.
  const filteredTransactions = (transactions || []).filter((tx) => matchesWindow(tx.createdAt, currentWindow));
  const totalRevenue = filteredTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const revenuePeriodLabel = timeSegment === 'Par Jour'
    ? new Date(`${filterDay}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : timeSegment === 'Par Mois'
      ? new Date(`${filterYear}-${filterMonth}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : timeSegment === 'Par Année'
        ? filterYear
        : 'Toutes périodes confondues';

  // Lavages réellement terminés/en cours sur la fenêtre sélectionnée — bases
  // réelles pour tous les blocs ci-dessous (plus aucune valeur inventée).
  const filteredCompletedWashes = (completedWashes || []).filter((w) => matchesWindow(w.completedAtISO, currentWindow));
  const filteredActiveWashes = (activeWashes || []).filter((w) => matchesWindow(w.startedAt, currentWindow));

  // Temps d'attente moyen = startedAt - createdAt (la réservation a attendu en
  // file avant que le lavage démarre), sur tout lavage démarré dans la fenêtre.
  const waitTimesMin = [...filteredCompletedWashes, ...filteredActiveWashes]
    .filter((w) => w.startedAt && w.createdAt)
    .map((w) => (new Date(w.startedAt) - new Date(w.createdAt)) / 60000)
    .filter((m) => isFinite(m) && m >= 0);
  const avgWaitMinutes = waitTimesMin.length > 0 ? Math.round(waitTimesMin.reduce((a, b) => a + b, 0) / waitTimesMin.length) : null;

  // Fidélité : parmi les clients IDENTIFIÉS (compte automobiliste lié, via
  // clientId — les passages en espèces non liés ne sont jamais comptés,
  // volontairement, plutôt que de fausser le taux) vus sur la fenêtre, combien
  // ont déjà 2+ lavages sur TOUTE l'historique de la station (pas seulement la
  // fenêtre) ? C'est la seule donnée réelle disponible pour cette métrique.
  const allTimeWashCountByClient = {};
  (completedWashes || []).forEach((w) => { if (w.clientId) allTimeWashCountByClient[w.clientId] = (allTimeWashCountByClient[w.clientId] || 0) + 1; });
  const identifiedClientsInWindow = [...new Set(filteredCompletedWashes.filter((w) => w.clientId).map((w) => w.clientId))];
  const habitues = identifiedClientsInWindow.filter((id) => (allTimeWashCountByClient[id] || 0) >= 2).length;
  const nouveaux = identifiedClientsInWindow.length - habitues;
  const totalIdentified = identifiedClientsInWindow.length;
  const tauxFidelite = totalIdentified > 0 ? Math.round((habitues / totalIdentified) * 100) : null;

  // Score Qualité : moyenne réelle des avis (station_reviews) postés sur la fenêtre.
  const filteredReviews = (reviews || []).filter((r) => matchesWindow(r.createdAt, currentWindow));
  const avgRating = filteredReviews.length > 0 ? filteredReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / filteredReviews.length : null;

  const statCards = [
    { title: "Temps d'attente moyen", value: avgWaitMinutes != null ? `${avgWaitMinutes} min` : '—', icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10', caption: waitTimesMin.length > 0 ? `${waitTimesMin.length} lavage${waitTimesMin.length > 1 ? 's' : ''} mesuré${waitTimesMin.length > 1 ? 's' : ''}` : 'Aucune donnée' },
    { title: 'Véhicules traités', value: String(filteredCompletedWashes.length), icon: Car, color: 'text-purple-400', bg: 'bg-purple-500/10', caption: 'Lavages terminés' },
    { title: 'Taux de fidélité', value: tauxFidelite != null ? `${tauxFidelite}%` : '—', icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10', caption: totalIdentified > 0 ? `${totalIdentified} client${totalIdentified > 1 ? 's' : ''} identifié${totalIdentified > 1 ? 's' : ''}` : 'Aucun client identifié' },
    { title: 'Score Qualité', value: avgRating != null ? `${avgRating.toFixed(1)}/5` : '—', icon: Target, color: 'text-amber-400', bg: 'bg-amber-500/10', caption: `${filteredReviews.length} avis` },
  ];

  // Répartition par service — regroupement réel de filteredTransactions,
  // s'adapte au nombre de services réellement configurés par la station
  // (wash_pricing peut avoir plus que les 3 par défaut).
  const serviceRevenue = revenueByService(filteredTransactions);
  const serviceEntries = Object.entries(serviceRevenue).sort((a, b) => b[1] - a[1]);
  const serviceTotal = serviceEntries.reduce((sum, [, amt]) => sum + amt, 0);

  // Types de véhicules — les 4 vrais buckets de pricing (voir washDefaults.js),
  // pas une taxonomie inventée.
  const vehicleCounts = {};
  VEHICLE_CATEGORIES.forEach(({ key }) => { vehicleCounts[key] = 0; });
  filteredCompletedWashes.forEach((w) => { if (w.category) vehicleCounts[w.category] = (vehicleCounts[w.category] || 0) + 1; });
  const vehicleTotal = filteredCompletedWashes.length;

  // Top Laveurs — regroupement réel par `assignedTo` (nom), classement relatif
  // au meilleur du groupe (aucun quota fixe n'existe réellement pour un laveur).
  const washerCounts = {};
  filteredCompletedWashes.forEach((w) => {
    // Un lavage à plusieurs laveurs (bus/camion, voir StationDashboard.jsx)
    // crédite chacun d'eux plutôt que le seul assignedTo "principal".
    const names = (w.assignedWasherNames && w.assignedWasherNames.length) ? w.assignedWasherNames : (w.assignedTo ? [w.assignedTo] : []);
    names.forEach((n) => { washerCounts[n] = (washerCounts[n] || 0) + 1; });
  });
  const topWashers = Object.entries(washerCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topWasherMax = topWashers.length > 0 ? topWashers[0][1] : 1;

  // Constat de la période — remplace l'ancienne "Recommandation IA" statique :
  // aucun pipeline IA n'existe dans ce projet, donc plutôt qu'en simuler un,
  // ceci est un vrai calcul (comparaison de parts de service vs la période
  // précédente équivalente), affiché sans habillage "IA" trompeur.
  let insight = 'Pas assez de données pour établir un constat sur cette période.';
  if (timeSegment === 'Tous') {
    if (serviceEntries.length > 0 && serviceTotal > 0) {
      const [topName, topAmt] = serviceEntries[0];
      insight = `"${topName}" est votre service le plus demandé : ${Math.round((topAmt / serviceTotal) * 100)}% du chiffre d'affaires, toutes périodes confondues.`;
    }
  } else {
    const previousWindow = getPreviousWindow(currentWindow);
    const previousTransactions = (transactions || []).filter((tx) => matchesWindow(tx.createdAt, previousWindow));
    if (filteredTransactions.length >= 3 && previousTransactions.length >= 3) {
      const previousRevenue = revenueByService(previousTransactions);
      const previousTotal = Object.values(previousRevenue).reduce((a, b) => a + b, 0);
      const allServiceNames = new Set([...Object.keys(serviceRevenue), ...Object.keys(previousRevenue)]);
      let bestService = null, bestDelta = -Infinity;
      allServiceNames.forEach((name) => {
        const curShare = serviceTotal > 0 ? (serviceRevenue[name] || 0) / serviceTotal : 0;
        const prevShare = previousTotal > 0 ? (previousRevenue[name] || 0) / previousTotal : 0;
        const delta = curShare - prevShare;
        if (delta > bestDelta) { bestDelta = delta; bestService = name; }
      });
      insight = (bestService && bestDelta > 0.01)
        ? `"${bestService}" progresse le plus cette période (+${Math.round(bestDelta * 100)} points de part du CA vs la période précédente).`
        : 'La répartition par service est restée stable par rapport à la période précédente.';
    }
  }

  // Fréquence des lavages par heure, entre l'ouverture et la fermeture de la
  // station, pour la date sélectionnée — basé sur `startedAt` (horodatage réel
  // du démarrage de chaque lavage), sur les lavages terminés ET en cours ce jour-là.
  const parseHour = (hhmm, fallback) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return m ? Number(m[1]) : fallback;
  };
  let openHour = parseHour(stationProfile?.openTime, 8);
  let closeHour = parseHour(stationProfile?.closeTime, 20);
  if (!(closeHour > openHour)) { openHour = 8; closeHour = 20; } // garde-fou si horaires mal configurés

  const hourSlots = [];
  for (let h = openHour; h < closeHour; h++) hourSlots.push(h);

  const washEvents = [...(completedWashes || []), ...(activeWashes || [])].filter(w => w.startedAt);
  const frequencyData = hourSlots.map((h) => ({
    hour: h,
    label: `${String(h).padStart(2, '0')}:00`,
    count: washEvents.filter((w) => {
      const d = new Date(w.startedAt);
      return dateKeyLocal(d) === peakDate && d.getHours() === h;
    }).length,
  }));
  const hasFrequencyData = frequencyData.some(d => d.count > 0);
  const maxCount = Math.max(1, ...frequencyData.map(d => d.count));

  const chartW = 600, chartH = 180, padX = 24, padY = 10;
  const stepX = frequencyData.length > 1 ? (chartW - padX * 2) / (frequencyData.length - 1) : 0;
  const chartPoints = frequencyData.map((d, i) => ({
    x: padX + i * stepX,
    y: padY + (chartH - padY * 2) * (1 - d.count / maxCount),
    ...d,
  }));
  const linePath = smoothPath(chartPoints);
  const baseY = chartH - padY;
  const areaPath = chartPoints.length > 0
    ? `${linePath} L ${chartPoints[chartPoints.length - 1].x} ${baseY} L ${chartPoints[0].x} ${baseY} Z`
    : '';
  const peakDateLabel = new Date(`${peakDate}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Analytique & <span className="text-purple-400">Performances</span></h1>
          <p className="text-neutral-400 text-lg">Analysez l'efficacité de votre station en temps réel.</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 flex items-center gap-3">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-sm font-medium text-emerald-400">Analyse en direct</span>
        </div>
      </div>

      {/* Segmented Control for Time Filters */}
      <div className="flex overflow-x-auto gap-2 mb-8 pb-2 scrollbar-hide">
        {segments.map(segment => (
          <div key={segment} className="flex items-center">
            <button
              onClick={() => setTimeSegment(segment)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                timeSegment === segment
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                  : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
              } ${['Par Année', 'Par Mois', 'Par Jour'].includes(segment) && timeSegment === segment ? 'rounded-r-none pr-3' : ''}`}
            >
              {segment}
            </button>

            {segment === 'Par Année' && timeSegment === 'Par Année' && (
              <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="bg-purple-700 text-white outline-none py-2 px-2 text-sm appearance-none cursor-pointer rounded-r-xl border-l border-purple-500 shadow-lg shadow-purple-500/30 font-bold">
                <option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option>
              </select>
            )}

            {segment === 'Par Mois' && timeSegment === 'Par Mois' && (
              <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="bg-purple-700 text-white outline-none py-2 px-2 text-sm appearance-none cursor-pointer rounded-r-xl border-l border-purple-500 shadow-lg shadow-purple-500/30 font-bold">
                <option value="01">Janvier</option><option value="02">Février</option><option value="03">Mars</option><option value="04">Avril</option><option value="05">Mai</option><option value="06">Juin</option><option value="07">Juillet</option><option value="08">Août</option><option value="09">Septembre</option><option value="10">Octobre</option><option value="11">Novembre</option><option value="12">Décembre</option>
              </select>
            )}

            {segment === 'Par Jour' && timeSegment === 'Par Jour' && (
              <input type="date" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} className="bg-purple-700 text-white outline-none py-[7px] px-2 text-sm cursor-pointer rounded-r-xl border-l border-purple-500 shadow-lg shadow-purple-500/30 font-bold" />
            )}
          </div>
        ))}
      </div>

      {/* Recette Collectée — carte mise en avant, calculée à partir des vraies transactions payées */}
      <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-900/20 to-black relative overflow-hidden mb-8">
        <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <CardContent className="p-8 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-emerald-500/15 rounded-2xl">
                <Banknote className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <p className="text-neutral-400 text-sm font-medium mb-1">Recette Collectée (Total)</p>
                <h2 className="text-4xl font-bold text-white tracking-tight">{totalRevenue.toLocaleString('fr-FR')} <span className="text-lg font-medium text-neutral-400">FCFA</span></h2>
                <p className="text-neutral-500 text-xs mt-1 capitalize">{revenuePeriodLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-5 py-3">
              <Receipt className="w-5 h-5 text-neutral-400" />
              <div>
                <p className="text-xl font-bold text-white">{filteredTransactions.length}</p>
                <p className="text-xs text-neutral-500">Transaction{filteredTransactions.length > 1 ? 's' : ''} encaissée{filteredTransactions.length > 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Stats — chaque valeur/légende ci-dessous est calculée depuis de
          vraies données (voir statCards plus haut) ; "—" quand la donnée
          n'existe pas, jamais un chiffre inventé. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, idx) => (
          <Card key={idx} className="border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 ${stat.bg} rounded-xl`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <span className="text-xs font-bold text-neutral-500 bg-neutral-900 px-2 py-1 rounded-md">{stat.caption}</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-1">{stat.value}</h3>
              <p className="text-neutral-400 text-sm">{stat.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fréquence des lavages */}
        <Card className="lg:col-span-2 border-white/5 bg-gradient-to-br from-purple-900/10 to-black relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>
          <CardContent className="p-6 relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
              <h2 className="text-xl font-bold text-white">Fréquence des lavages</h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-neutral-900 border border-white/10 rounded-lg px-3 py-2">
                  <Calendar className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                  <input
                    type="date"
                    value={peakDate}
                    max={todayKey()}
                    onChange={(e) => setPeakDate(e.target.value || todayKey())}
                    className="bg-transparent text-white text-sm outline-none [color-scheme:dark]"
                  />
                </div>
                {peakDate !== todayKey() && (
                  <button
                    type="button"
                    onClick={() => setPeakDate(todayKey())}
                    className="text-xs font-bold text-purple-400 hover:text-purple-300 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 transition-colors"
                  >
                    Revenir à aujourd'hui
                  </button>
                )}
              </div>
            </div>
            <p className="text-neutral-500 text-xs mb-6 capitalize">
              {stationProfile?.openTime || '08:00'} – {stationProfile?.closeTime || '20:00'} · {peakDateLabel}
            </p>

            {!hasFrequencyData ? (
              <div className="h-56 flex flex-col items-center justify-center text-center">
                <p className="text-neutral-500 text-sm">Aucun lavage démarré ce jour-là.</p>
              </div>
            ) : (
              <svg viewBox={`0 0 ${chartW} ${chartH + 22}`} className="w-full h-56">
                <defs>
                  <linearGradient id="freqFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75].map((f) => (
                  <line key={f} x1={padX} x2={chartW - padX} y1={padY + (chartH - padY * 2) * f} y2={padY + (chartH - padY * 2) * f} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                ))}
                <motion.path d={areaPath} fill="url(#freqFill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} />
                <motion.path d={linePath} fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }} />
                {chartPoints.map((p, i) => (
                  <g key={i} className="group cursor-pointer">
                    <circle cx={p.x} cy={p.y} r="9" fill="transparent" />
                    <circle cx={p.x} cy={p.y} r="3.5" fill="#0a0a0a" stroke="#a855f7" strokeWidth="2" />
                    {(i % Math.max(1, Math.ceil(chartPoints.length / 12)) === 0 || i === chartPoints.length - 1) && (
                      <text x={p.x} y={chartH + 16} textAnchor="middle" fill="#737373" fontSize="9">{p.label}</text>
                    )}
                    <g className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <rect x={p.x - 13} y={p.y - 23} width="26" height="16" rx="4" fill="#000" />
                      <text x={p.x} y={p.y - 11} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">{p.count}</text>
                    </g>
                  </g>
                ))}
              </svg>
            )}
          </CardContent>
        </Card>

        {/* Services Distribution — vraie répartition de filteredTransactions par service */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-6">Répartition par Service</h2>

            {serviceEntries.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-center">
                <p className="text-neutral-500 text-sm">Aucune transaction sur cette période.</p>
              </div>
            ) : (
              <>
                <div className="relative w-48 h-48 mx-auto mb-8">
                  <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90 filter drop-shadow-xl">
                    <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                    {(() => {
                      let cumulative = 0;
                      return serviceEntries.map(([name, amt], i) => {
                        const pct = serviceTotal > 0 ? (amt / serviceTotal) * 100 : 0;
                        const dashoffset = -cumulative;
                        cumulative += pct;
                        return (
                          <motion.circle
                            key={name}
                            initial={{ strokeDasharray: '0 100' }}
                            animate={{ strokeDasharray: `${pct} ${100 - pct}` }}
                            transition={{ duration: 1, delay: 0.2 + i * 0.15 }}
                            cx="21" cy="21" r="15.91549430918954" fill="transparent"
                            stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth="6" strokeDashoffset={dashoffset}
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-white">{formatCompact(serviceTotal)}</span>
                    <span className="text-xs text-neutral-400">Total FCFA</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {serviceEntries.map(([name, amt], idx) => (
                    <div key={name} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}></div>
                        <span className="text-white font-medium">{name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-neutral-400 w-8 text-right">{serviceTotal > 0 ? Math.round((amt / serviceTotal) * 100) : 0}%</span>
                        <span className="font-bold w-24 text-right" style={{ color: DONUT_COLORS[idx % DONUT_COLORS.length] }}>{amt.toLocaleString('fr-FR')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-blue-400 mt-0.5" />
                <p className="text-sm text-blue-200/70">
                  <strong className="text-blue-400 block mb-1">Constat de la période</strong>
                  {insight}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3 : Types de véhicules réels / fidélité réelle / top laveurs réels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">

        {/* 1. Types de Véhicules */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-6">Types de Véhicules</h2>
            {vehicleTotal === 0 ? (
              <p className="text-neutral-500 text-sm">Aucun lavage terminé sur cette période.</p>
            ) : (
              <div className="space-y-5">
                {VEHICLE_CATEGORIES.map(({ key, color }, idx) => {
                  const count = vehicleCounts[key] || 0;
                  const pct = vehicleTotal > 0 ? Math.round((count / vehicleTotal) * 100) : 0;
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-neutral-300 font-medium">{PRICING_CATEGORY_LABELS[key] || key}</span>
                        <span className="text-neutral-400">{count} <span className="text-neutral-600 text-xs">({pct}%)</span></span>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 1, delay: 0.3 + (idx * 0.1) }}
                          className={`h-full ${color} shadow-[0_0_10px_currentColor]`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Fidélisation (Jauge) — clients identifiés uniquement, voir statCards plus haut */}
        <Card className="border-white/5 bg-gradient-to-br from-emerald-900/10 to-black relative overflow-hidden">
          <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-bold text-white mb-2">Acquisition vs Fidélité</h2>
            <p className="text-xs text-neutral-400 mb-8">Clients identifiés sur la période</p>

            {totalIdentified === 0 ? (
              <p className="text-neutral-500 text-sm py-8">Aucun client identifié (compte lié) sur cette période.</p>
            ) : (
              <>
                <div className="relative w-40 h-20 mx-auto overflow-hidden">
                  <svg viewBox="0 0 100 50" className="w-full h-full drop-shadow-lg">
                    <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" strokeLinecap="round" />
                    <motion.path
                      initial={{ strokeDasharray: '0 126' }}
                      animate={{ strokeDasharray: `${(tauxFidelite / 100) * 126} 126` }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                      d="M 10 50 A 40 40 0 0 1 90 50"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="12"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute bottom-0 left-0 right-0 text-center">
                    <span className="text-3xl font-bold text-white">{tauxFidelite}%</span>
                  </div>
                </div>

                <div className="flex justify-between mt-6 px-4">
                  <div className="text-left">
                    <p className="text-sm font-bold text-emerald-400">{habitues}</p>
                    <p className="text-xs text-neutral-500">Habitués</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-400">{nouveaux}</p>
                    <p className="text-xs text-neutral-500">Nouveaux</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 3. Top Laveurs — regroupement réel par assignedTo, classement relatif au meilleur du groupe */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center justify-between">
              Top Laveurs
              <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-md">{timeSegment}</span>
            </h2>

            {topWashers.length === 0 ? (
              <p className="text-neutral-500 text-sm">Aucun lavage assigné à un laveur sur cette période.</p>
            ) : (
              <div className="space-y-4">
                {topWashers.map(([name, count], idx) => (
                  <div key={name} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-neutral-800 to-neutral-700 flex items-center justify-center font-bold text-sm text-neutral-300 relative shadow-inner">
                      {initials(name)}
                      <span className="absolute -top-1 -right-1 text-xs">{RANK_BADGES[idx]}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-white">{name}</span>
                        <span className="text-xs text-neutral-400 font-bold">{count} lavage{count > 1 ? 's' : ''}</span>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(count / topWasherMax) * 100}%` }}
                          transition={{ duration: 1, delay: 0.5 + (idx * 0.1) }}
                          className="h-full bg-amber-400"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
