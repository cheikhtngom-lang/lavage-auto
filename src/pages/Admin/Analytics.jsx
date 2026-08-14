import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '../../components/ui/Card';
import { Activity, Clock, Users, Car, Target, TrendingUp, Banknote, Receipt, Calendar } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';

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

export default function Analytics() {
  const { queue, transactions, stationProfile, completedWashes, activeWashes } = useAppState();

  const [timeSegment, setTimeSegment] = useState('Tous');
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterMonth, setFilterMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [filterDay, setFilterDay] = useState(new Date().toISOString().split('T')[0]);
  const [peakDate, setPeakDate] = useState(todayKey());

  const segments = ['Tous', 'Par Jour', 'Par Mois', 'Par Année'];

  // `tx.id` est un timestamp `Date.now()` fiable (voir validatePayment /
  // addStationTransaction) — contrairement à `tx.date` qui est un texte
  // d'affichage ("Aujourd'hui, HH:MM") non filtrable par date réelle.
  const filteredTransactions = (transactions || []).filter((tx) => {
    const txDate = new Date(tx.id);
    if (timeSegment === 'Par Jour') {
      const [y, m, d] = filterDay.split('-').map(Number);
      return txDate.getFullYear() === y && txDate.getMonth() + 1 === m && txDate.getDate() === d;
    }
    if (timeSegment === 'Par Mois') {
      return txDate.getFullYear() === Number(filterYear) && txDate.getMonth() + 1 === Number(filterMonth);
    }
    if (timeSegment === 'Par Année') {
      return txDate.getFullYear() === Number(filterYear);
    }
    return true; // 'Tous'
  });
  const totalRevenue = filteredTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const revenuePeriodLabel = timeSegment === 'Par Jour'
    ? new Date(`${filterDay}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : timeSegment === 'Par Mois'
      ? new Date(`${filterYear}-${filterMonth}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : timeSegment === 'Par Année'
        ? filterYear
        : 'Toutes périodes confondues';
  
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

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { title: "Temps d'attente moyen", value: "18 min", icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10", trend: "-2 min" },
          { title: "Véhicules traités", value: "42", icon: Car, color: "text-purple-400", bg: "bg-purple-500/10", trend: "+5" },
          { title: "Taux de fidélité", value: "68%", icon: Users, color: "text-emerald-400", bg: "bg-emerald-500/10", trend: "+3%" },
          { title: "Score Qualité", value: "4.8/5", icon: Target, color: "text-amber-400", bg: "bg-amber-500/10", trend: "Stable" },
        ].map((stat, idx) => (
          <Card key={idx} className="border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 ${stat.bg} rounded-xl`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <span className="text-xs font-bold text-neutral-500 bg-neutral-900 px-2 py-1 rounded-md">{stat.trend}</span>
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

        {/* Services Distribution */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-6">Répartition par Service</h2>
            
            <div className="relative w-48 h-48 mx-auto mb-8">
              {/* Donut Chart SVG */}
              <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90 filter drop-shadow-xl">
                <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                
                {/* Lavage Simple 45% */}
                <motion.circle initial={{ strokeDasharray: "0 100" }} animate={{ strokeDasharray: "45 55" }} transition={{ duration: 1, delay: 0.2 }}
                  cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#3b82f6" strokeWidth="6" strokeDashoffset="0" />
                
                {/* Lavage Complet 35% */}
                <motion.circle initial={{ strokeDasharray: "0 100" }} animate={{ strokeDasharray: "35 65" }} transition={{ duration: 1, delay: 0.4 }}
                  cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#10b981" strokeWidth="6" strokeDashoffset="-45" />

                {/* Lavage Moteur 15% */}
                <motion.circle initial={{ strokeDasharray: "0 100" }} animate={{ strokeDasharray: "15 85" }} transition={{ duration: 1, delay: 0.6 }}
                  cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#a855f7" strokeWidth="6" strokeDashoffset="-80" />

                {/* Lustrage 5% */}
                <motion.circle initial={{ strokeDasharray: "0 100" }} animate={{ strokeDasharray: "5 95" }} transition={{ duration: 1, delay: 0.8 }}
                  cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#f59e0b" strokeWidth="6" strokeDashoffset="-95" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white">150k</span>
                <span className="text-xs text-neutral-400">Total FCFA</span>
              </div>
            </div>

            <div className="space-y-4">
              {[
                { name: "Lavage Simple", percent: 45, color: "bg-blue-500", text: "text-blue-400", amount: "67 500" },
                { name: "Lavage Complet", percent: 35, color: "bg-emerald-500", text: "text-emerald-400", amount: "52 500" },
                { name: "Lavage Moteur", percent: 15, color: "bg-purple-500", text: "text-purple-400", amount: "22 500" },
                { name: "Lustrage", percent: 5, color: "bg-amber-500", text: "text-amber-400", amount: "7 500" }
              ].map((service, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${service.color}`}></div>
                    <span className="text-white font-medium">{service.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-neutral-400 w-8 text-right">{service.percent}%</span>
                    <span className={`font-bold ${service.text} w-20 text-right`}>{service.amount}</span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-blue-400 mt-0.5" />
                <p className="text-sm text-blue-200/70">
                  <strong className="text-blue-400 block mb-1">Recommandation IA</strong>
                  La demande pour le Lavage Complet augmente. Pensez à ajouter un laveur supplémentaire entre 12h et 14h.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Nouveaux Graphiques (Demande Utilisateur) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        
        {/* 1. Types de Véhicules */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-6">Types de Véhicules</h2>
            <div className="space-y-5">
              {[
                { type: "Berlines", val: 55, num: 23, color: "bg-blue-500" },
                { type: "Motos", val: 20, num: 8, color: "bg-emerald-500" },
                { type: "SUV / 4x4", val: 15, num: 6, color: "bg-amber-500" },
                { type: "Camions", val: 10, num: 5, color: "bg-purple-500" }
              ].map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-neutral-300 font-medium">{item.type}</span>
                    <span className="text-neutral-400">{item.num} <span className="text-neutral-600 text-xs">({item.val}%)</span></span>
                  </div>
                  <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${item.val}%` }}
                      transition={{ duration: 1, delay: 0.3 + (idx * 0.1) }}
                      className={`h-full ${item.color} shadow-[0_0_10px_currentColor]`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 2. Fidélisation (Jauge) */}
        <Card className="border-white/5 bg-gradient-to-br from-emerald-900/10 to-black relative overflow-hidden">
          <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-bold text-white mb-2">Acquisition vs Fidélité</h2>
            <p className="text-xs text-neutral-400 mb-8">Part de clients récurrents aujourd'hui</p>
            
            <div className="relative w-40 h-20 mx-auto overflow-hidden">
              {/* Semi-circle Gauge */}
              <svg viewBox="0 0 100 50" className="w-full h-full drop-shadow-lg">
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" strokeLinecap="round" />
                <motion.path 
                  initial={{ strokeDasharray: "0 126" }}
                  animate={{ strokeDasharray: "85 126" }} // 68% of 126 (pi * r)
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  d="M 10 50 A 40 40 0 0 1 90 50" 
                  fill="none" 
                  stroke="#10b981" 
                  strokeWidth="12" 
                  strokeLinecap="round" 
                />
              </svg>
              <div className="absolute bottom-0 left-0 right-0 text-center">
                <span className="text-3xl font-bold text-white">68%</span>
              </div>
            </div>
            
            <div className="flex justify-between mt-6 px-4">
              <div className="text-left">
                <p className="text-sm font-bold text-emerald-400">28</p>
                <p className="text-xs text-neutral-500">Habitués</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-blue-400">14</p>
                <p className="text-xs text-neutral-500">Nouveaux</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Productivité Équipe */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center justify-between">
              Top Laveurs 
              <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-md">Aujourd'hui</span>
            </h2>
            
            <div className="space-y-4">
              {[
                { name: "Amadou Sarr", score: 15, target: 20, avatar: "AS", badge: "🥇" },
                { name: "Ousmane Diallo", score: 12, target: 20, avatar: "OD", badge: "🥈" },
                { name: "Fallou Niang", score: 8, target: 20, avatar: "FN", badge: "🥉" }
              ].map((emp, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-neutral-800 to-neutral-700 flex items-center justify-center font-bold text-sm text-neutral-300 relative shadow-inner">
                    {emp.avatar}
                    <span className="absolute -top-1 -right-1 text-xs">{emp.badge}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-white">{emp.name}</span>
                      <span className="text-xs text-neutral-400 font-bold">{emp.score} / {emp.target}</span>
                    </div>
                    <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(emp.score / emp.target) * 100}%` }}
                        transition={{ duration: 1, delay: 0.5 + (idx * 0.1) }}
                        className="h-full bg-amber-400"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
          </CardContent>
        </Card>
        
      </div>
    </div>
  );
}
