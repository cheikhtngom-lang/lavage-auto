import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Users, CreditCard, TrendingUp, Wallet, Gauge,
  Crown, MapPin, Repeat, Sparkles, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { GRANULARITIES, buildBuckets, countInBuckets } from '../../lib/dateBuckets';
import LineChart from '../../components/ui/LineChart';

const STATUS_META = {
  a_jour: { label: 'À jour', color: '#10b981' },
  en_retard: { label: 'Impayé', color: '#ef4444' },
  essai: { label: 'Essai gratuit', color: '#3b82f6' },
};

const PLAN_COLORS = ['#a855f7', '#3b82f6', '#f59e0b', '#10b981', '#ec4899'];

const MRR_PERIODS = [
  { key: 'trimestre', label: 'Trimestre', months: 3 },
  { key: 'semestre', label: 'Semestre', months: 6 },
  { key: 'annuelle', label: 'Année', months: 12 },
];

function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

const fmtFCFA = (n) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

function AnimatedNumber({ value }) {
  return <span>{Math.round(value).toLocaleString('fr-FR')}</span>;
}

export default function SuperAdminAnalytics() {
  const { stations, clientAccounts, PLANS } = useSuperAdminState();
  const [granularity, setGranularity] = useState('mois');
  const [mrrPeriod, setMrrPeriod] = useState('semestre');

  const now = new Date();
  const activeStations = stations.filter(s => s.status === 'active');
  const totalAutomobilistes = clientAccounts.length;

  const buckets = useMemo(() => buildBuckets(granularity), [granularity]);
  const stationSeries = useMemo(() => countInBuckets(buckets, stations, 'joinedAt'), [buckets, stations]);
  const motoristSeries = useMemo(() => countInBuckets(buckets, clientAccounts, 'createdAt'), [buckets, clientAccounts]);
  const maxSeries = Math.max(1, ...stationSeries, ...motoristSeries);

  // Fenêtre "période courante" vs "période précédente" pour les deltas des KPIs,
  // calquée sur le dernier bucket de la granularité sélectionnée.
  const lastBucket = buckets[buckets.length - 1];
  const prevBucket = buckets[buckets.length - 2] || lastBucket;
  const newStationsThisPeriod = stations.filter(s => new Date(s.joinedAt) >= lastBucket.start && new Date(s.joinedAt) < lastBucket.end).length;
  const newStationsPrevPeriod = stations.filter(s => new Date(s.joinedAt) >= prevBucket.start && new Date(s.joinedAt) < prevBucket.end).length;
  const newMotoristsThisPeriod = clientAccounts.filter(c => new Date(c.createdAt) >= lastBucket.start && new Date(c.createdAt) < lastBucket.end).length;
  const newMotoristsPrevPeriod = clientAccounts.filter(c => new Date(c.createdAt) >= prevBucket.start && new Date(c.createdAt) < prevBucket.end).length;

  const mrr = activeStations.reduce((sum, s) => sum + (PLANS[s.plan]?.price || 0), 0);
  const arpu = activeStations.length > 0 ? mrr / activeStations.length : 0;

  // Estimation des recettes cumulées : prix du plan x nombre de mois écoulés depuis l'inscription,
  // pour les stations actives / à jour. Faute d'historique de facturation réel, c'est une estimation
  // clairement identifiée comme telle dans l'UI, pas un montant encaissé garanti.
  const cumulativeRevenue = stations
    .filter(s => s.status === 'active' || s.subscriptionStatus === 'a_jour')
    .reduce((sum, s) => {
      const price = PLANS[s.plan]?.price || 0;
      const months = Math.max(1, Math.floor((now - new Date(s.joinedAt)) / (30 * 24 * 3600 * 1000)) + 1);
      return sum + price * months;
    }, 0);

  const retentionRate = stations.length > 0 ? Math.round((activeStations.length / stations.length) * 100) : 0;

  const planDistribution = Object.keys(PLANS).map((key, i) => {
    const count = stations.filter(s => s.plan === key).length;
    const revenue = stations.filter(s => s.plan === key && s.status === 'active').reduce((sum) => sum + (PLANS[key]?.price || 0), 0);
    return { key, label: PLANS[key].label, count, revenue, color: PLAN_COLORS[i % PLAN_COLORS.length] };
  });
  const totalPlanCount = Math.max(1, planDistribution.reduce((s, p) => s + p.count, 0));

  const statusDistribution = Object.keys(STATUS_META).map(key => ({
    key,
    ...STATUS_META[key],
    count: stations.filter(s => s.subscriptionStatus === key).length,
  }));
  const totalStatusCount = Math.max(1, statusDistribution.reduce((s, p) => s + p.count, 0));

  // MRR mois par mois sur la période choisie (trimestre/semestre/année),
  // basé sur les stations déjà inscrites à cette date-là.
  const mrrMonthsCount = MRR_PERIODS.find(p => p.key === mrrPeriod)?.months || 6;
  const mrrMonths = useMemo(() => Array.from({ length: mrrMonthsCount }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (mrrMonthsCount - 1 - i), 1);
    const end = addMonths(d, 1);
    const value = stations
      .filter(s => new Date(s.joinedAt) < end && s.status !== 'suspendue')
      .reduce((sum, s) => sum + (PLANS[s.plan]?.price || 0), 0);
    return { label: d.toLocaleDateString('fr-FR', { month: 'short', ...(mrrMonthsCount > 12 ? { year: '2-digit' } : {}) }), value };
  }), [mrrMonthsCount, stations, PLANS]);

  const topStationsByClients = [...stations].sort((a, b) => (b.clientsCount || 0) - (a.clientsCount || 0)).slice(0, 5);

  const cityCounts = stations.reduce((acc, s) => {
    const city = s.city || 'Ville non renseignée';
    acc[city] = (acc[city] || 0) + 1;
    return acc;
  }, {});
  const topCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCity = Math.max(1, ...topCities.map(([, c]) => c));

  const kpis = [
    {
      title: 'Abonnements de stations actifs', value: activeStations.length, icon: Building2,
      color: 'text-blue-400', bg: 'bg-blue-500/10',
      delta: newStationsThisPeriod - newStationsPrevPeriod, deltaLabel: `${newStationsThisPeriod} nouvelles sur la période`,
    },
    {
      title: 'Automobilistes inscrits', value: totalAutomobilistes, icon: Users,
      color: 'text-emerald-400', bg: 'bg-emerald-500/10',
      delta: newMotoristsThisPeriod - newMotoristsPrevPeriod, deltaLabel: `${newMotoristsThisPeriod} nouveaux sur la période`,
    },
    {
      title: 'Revenu Récurrent Mensuel', value: mrr, suffix: ' FCFA', icon: CreditCard,
      color: 'text-purple-400', bg: 'bg-purple-500/10', deltaLabel: `${activeStations.length} stations facturées`,
    },
    {
      title: 'Recettes cumulées (estimation)', value: cumulativeRevenue, suffix: ' FCFA', icon: Wallet,
      color: 'text-amber-400', bg: 'bg-amber-500/10', deltaLabel: 'Depuis l’inscription de chaque station',
    },
    {
      title: 'Revenu moyen par station (ARPU)', value: arpu, suffix: ' FCFA', icon: TrendingUp,
      color: 'text-pink-400', bg: 'bg-pink-500/10', deltaLabel: 'Par station active / mois',
    },
    {
      title: 'Taux de rétention réseau', value: retentionRate, suffix: '%', icon: Gauge,
      color: 'text-cyan-400', bg: 'bg-cyan-500/10', deltaLabel: `${activeStations.length}/${stations.length} stations actives`,
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10 pb-24">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4"
      >
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight flex items-center">
            Analytique <span className="text-purple-400 ml-2">& Abonnements</span>
          </h1>
          <p className="text-neutral-400 text-lg">Volumes d'abonnements, fréquences et recettes de toute la plateforme.</p>
        </div>
        <div className="hidden md:flex items-center gap-4 bg-purple-950/30 border border-purple-500/20 rounded-2xl px-5 py-3 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <span className="text-purple-400 font-medium">Données en direct</span>
        </div>
      </motion.div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-10">
        {kpis.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, type: 'spring', stiffness: 100 }}
          >
            <div className="glass-card rounded-2xl p-6 relative overflow-hidden group hover:bg-white/[0.04] transition-colors h-full">
              <div className={`absolute top-0 right-0 w-32 h-32 ${stat.bg} blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
              <div className="flex justify-between items-start mb-6">
                <div className={`p-3 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                {typeof stat.delta === 'number' && stat.delta !== 0 && (
                  <span className={`text-xs font-bold flex items-center gap-1 ${stat.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {stat.delta > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    {Math.abs(stat.delta)}
                  </span>
                )}
              </div>
              <div>
                <p className="text-neutral-400 text-sm font-medium mb-1">{stat.title}</p>
                <h3 className="text-2xl md:text-3xl text-white font-bold">
                  <AnimatedNumber value={stat.value} />{stat.suffix || ''}
                </h3>
                <p className="text-xs text-neutral-500 mt-2">{stat.deltaLabel}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Segmented growth chart: stations vs automobilistes */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="glass-card rounded-2xl p-8 mb-10"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Volume d'abonnements dans le temps</h2>
            <p className="text-neutral-500 text-sm">Nouvelles stations abonnées vs. nouveaux automobilistes inscrits.</p>
          </div>
          <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 w-fit">
            {GRANULARITIES.map(g => (
              <button
                key={g.key}
                onClick={() => setGranularity(g.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  granularity === g.key ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6 mb-4 text-xs">
          <span className="flex items-center gap-2 text-neutral-400"><span className="w-2.5 h-2.5 rounded-full bg-gradient-to-t from-purple-600 to-blue-500"></span> Stations abonnées</span>
          <span className="flex items-center gap-2 text-neutral-400"><span className="w-2.5 h-2.5 rounded-full bg-gradient-to-t from-emerald-600 to-emerald-400"></span> Automobilistes inscrits</span>
        </div>

        <div className="h-64 w-full flex items-end justify-between gap-1.5 md:gap-3 overflow-x-auto">
          {buckets.map((b, i) => (
            <div key={i} className="flex-1 min-w-[24px] flex flex-col items-center gap-1.5 group h-full justify-end">
              <div className="w-full flex items-end justify-center gap-0.5 h-full">
                <div className="w-1/2 bg-neutral-900 rounded-t-md relative flex items-end overflow-hidden h-full">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(stationSeries[i] / maxSeries) * 100}%` }}
                    transition={{ duration: 0.7, delay: 0.03 * i }}
                    className="w-full bg-gradient-to-t from-purple-600/60 to-blue-500/60 rounded-t-md group-hover:from-purple-500 group-hover:to-blue-400 transition-colors"
                  />
                </div>
                <div className="w-1/2 bg-neutral-900 rounded-t-md relative flex items-end overflow-hidden h-full">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(motoristSeries[i] / maxSeries) * 100}%` }}
                    transition={{ duration: 0.7, delay: 0.03 * i }}
                    className="w-full bg-gradient-to-t from-emerald-600/60 to-emerald-400/60 rounded-t-md group-hover:from-emerald-500 group-hover:to-emerald-300 transition-colors"
                  />
                </div>
              </div>
              <span className="text-[10px] text-neutral-500 whitespace-nowrap capitalize">{b.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Fréquence des abonnements : répartition par plan + statut de paiement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card rounded-2xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <Repeat className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white">Fréquence d'abonnement par plan</h2>
          </div>
          <div className="space-y-5">
            {planDistribution.map(p => (
              <div key={p.key}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-white font-medium">{p.label}</span>
                  <span className="text-neutral-400">{p.count} station{p.count > 1 ? 's' : ''} <span className="text-neutral-600 text-xs">({Math.round((p.count / totalPlanCount) * 100)}%)</span></span>
                </div>
                <div className="w-full h-2 bg-neutral-900 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(p.count / totalPlanCount) * 100}%` }}
                    transition={{ duration: 0.9, delay: 0.1 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: p.color, boxShadow: `0 0 10px ${p.color}80` }}
                  />
                </div>
                <p className="text-xs text-neutral-500 mt-1">{fmtFCFA(p.revenue)} / mois si actives</p>
              </div>
            ))}
            {planDistribution.every(p => p.count === 0) && (
              <p className="text-neutral-500 text-sm">Aucune station enregistrée pour le moment.</p>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card rounded-2xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <Gauge className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Fiabilité de paiement des abonnements</h2>
          </div>
          <div className="relative w-44 h-44 mx-auto mb-8">
            <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90 filter drop-shadow-xl">
              <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
              {(() => {
                let offset = 0;
                return statusDistribution.map((s) => {
                  const pct = (s.count / totalStatusCount) * 100;
                  const circle = (
                    <motion.circle
                      key={s.key}
                      initial={{ strokeDasharray: '0 100' }}
                      animate={{ strokeDasharray: `${pct} ${100 - pct}` }}
                      transition={{ duration: 1, delay: 0.2 }}
                      cx="21" cy="21" r="15.91549430918954" fill="transparent"
                      stroke={s.color} strokeWidth="6" strokeDashoffset={-offset}
                    />
                  );
                  offset += pct;
                  return circle;
                });
              })()}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">{stations.length}</span>
              <span className="text-xs text-neutral-400">Stations</span>
            </div>
          </div>
          <div className="space-y-3">
            {statusDistribution.map(s => (
              <div key={s.key} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }}></div>
                  <span className="text-white font-medium">{s.label}</span>
                </div>
                <span className="text-neutral-400">{s.count} <span className="text-neutral-600 text-xs">({Math.round((s.count / totalStatusCount) * 100)}%)</span></span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Recettes : évolution du MRR */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="glass-card rounded-2xl p-8 mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white">Évolution des recettes d'abonnement (MRR)</h2>
          </div>
          <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 w-fit">
            {MRR_PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setMrrPeriod(p.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  mrrPeriod === p.key ? 'bg-amber-500 text-neutral-950 shadow-lg shadow-amber-500/30' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <LineChart points={mrrMonths} color="#f59e0b" height={260} formatValue={fmtFCFA} />
      </motion.div>

      {/* Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card rounded-2xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <Crown className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white">Top stations par automobilistes déclarés</h2>
          </div>
          {topStationsByClients.length === 0 ? (
            <p className="text-neutral-500 text-sm">Aucune donnée pour le moment.</p>
          ) : (
            <div className="space-y-4">
              {topStationsByClients.map((s, i) => (
                <div key={s.id} className="flex items-center gap-4">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-amber-500/20 text-amber-400' : i === 1 ? 'bg-neutral-400/20 text-neutral-300' : i === 2 ? 'bg-orange-700/20 text-orange-400' : 'bg-white/5 text-neutral-500'}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{s.name}</p>
                    <p className="text-xs text-neutral-500">{s.city || 'Ville non renseignée'}</p>
                  </div>
                  <span className="text-purple-400 font-bold text-sm flex-shrink-0">{s.clientsCount || 0}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="glass-card rounded-2xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <MapPin className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-white">Répartition géographique des stations</h2>
          </div>
          {topCities.length === 0 ? (
            <p className="text-neutral-500 text-sm">Aucune donnée pour le moment.</p>
          ) : (
            <div className="space-y-4">
              {topCities.map(([city, count]) => (
                <div key={city}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-white font-medium">{city}</span>
                    <span className="text-neutral-400">{count}</span>
                  </div>
                  <div className="w-full h-2 bg-neutral-900 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(count / maxCity) * 100}%` }}
                      transition={{ duration: 0.9 }}
                      className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
