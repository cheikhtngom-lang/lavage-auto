import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Building2, CreditCard, AlertTriangle, TrendingUp, Sparkles, Clock } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { GRANULARITIES, buildBuckets, countInBuckets } from '../../lib/dateBuckets';
import LineChart from '../../components/ui/LineChart';

const AnimatedCounter = ({ value, prefix = "", suffix = "" }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (value === 0) { setCount(0); return; }
    let start = 0;
    const duration = 1200;
    const increment = value / (duration / 16);

    const timer = setInterval(() => {
      start += increment;
      if (start >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <span className="font-bold">
      {prefix}{count.toLocaleString('fr-FR')}{suffix}
    </span>
  );
};

export default function SuperAdminDashboard() {
  const { stations, PLANS } = useSuperAdminState();
  const [granularity, setGranularity] = useState('mois');

  const activeStations = stations.filter(s => s.status === 'active');
  const pendingStations = stations.filter(s => s.status === 'en_attente');
  const overdueStations = stations.filter(s => s.subscriptionStatus === 'en_retard');
  const mrr = activeStations.reduce((sum, s) => sum + (PLANS[s.plan]?.price || 0), 0);
  const totalClients = stations.reduce((sum, s) => sum + (Number(s.clientsCount) || 0), 0);

  const stats = [
    { title: "Stations Actives", value: activeStations.length, icon: Building2, color: "text-blue-400", bg: "bg-blue-500/10" },
    { title: "Automobilistes Déclarés", value: totalClients, icon: Users, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { title: "En attente de validation", value: pendingStations.length, icon: Clock, color: "text-orange-400", bg: "bg-orange-500/10" },
    { title: "Revenu Récurrent (MRR)", value: mrr, suffix: " FCFA", icon: CreditCard, color: "text-purple-400", bg: "bg-purple-500/10" }
  ];

  // Croissance réelle : nouvelles stations inscrites, groupées selon la
  // granularité choisie (jour/semaine/mois/année) — même logique de buckets
  // que le graphique d'Analytique (src/lib/dateBuckets.js).
  const buckets = useMemo(() => buildBuckets(granularity), [granularity]);
  const newStationsSeries = useMemo(() => countInBuckets(buckets, stations, 'joinedAt'), [buckets, stations]);
  const newStationsPoints = buckets.map((b, i) => ({ label: b.label, value: newStationsSeries[i] }));

  return (
    <div className="p-8 max-w-7xl mx-auto relative z-10">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-12"
      >
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight flex items-center">
            Vue d'ensemble <span className="text-purple-400 ml-2">Plateforme</span>
          </h1>
          <p className="text-neutral-400 text-lg">Gérez l'ensemble de votre réseau de stations de lavage.</p>
        </div>
        <div className="hidden md:flex items-center gap-4 bg-purple-950/30 border border-purple-500/20 rounded-2xl px-5 py-3 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <span className="text-purple-400 font-medium">Vue Globale SaaS</span>
        </div>
      </motion.div>

      {stations.length === 0 && (
        <div className="glass-card rounded-2xl p-8 mb-12 border border-dashed border-white/10 text-center">
          <Building2 className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
          <p className="text-neutral-300 font-medium mb-1">Aucune station enregistrée pour le moment.</p>
          <p className="text-neutral-500 text-sm mb-4">Ajoutez votre première station partenaire pour commencer à alimenter ces statistiques.</p>
          <Link to="/superadmin/stations" className="inline-flex items-center bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl font-bold transition-colors">
            Gérer les stations
          </Link>
        </div>
      )}

      {overdueStations.length > 0 && (
        <Link to="/superadmin/billing" className="flex items-center gap-3 bg-red-950/30 border border-red-500/20 rounded-2xl px-5 py-4 mb-8 hover:bg-red-950/50 transition-colors">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-200/80">
            <strong className="text-red-400">{overdueStations.length} station(s)</strong> ont un abonnement impayé — voir la facturation.
          </p>
        </Link>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
        {stats.map((stat, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, type: "spring", stiffness: 100 }}
          >
            <div className="glass-card rounded-2xl p-6 relative overflow-hidden group hover:bg-white/[0.04] transition-colors">
              <div className={`absolute top-0 right-0 w-32 h-32 ${stat.bg} blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>

              <div className="flex justify-between items-start mb-6">
                <div className={`p-3 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>

              <div>
                <p className="text-neutral-400 text-sm font-medium mb-1">{stat.title}</p>
                <h3 className="text-3xl text-white">
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                </h3>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Croissance réelle du réseau */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4 }}
        className="glass-card rounded-2xl p-8 border-t border-t-white/10 mb-12"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <h2 className="text-xl font-bold text-white">Nouvelles stations inscrites</h2>
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

        <LineChart points={newStationsPoints} color="#a855f7" height={260} formatValue={(v) => `${v} nouvelle${v > 1 ? 's' : ''}`} />
      </motion.div>

      {/* Dernières stations inscrites */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card rounded-2xl p-8"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Dernières stations inscrites</h2>
          <Link to="/superadmin/stations" className="text-sm text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1">
            <TrendingUp className="w-4 h-4" /> Voir toutes
          </Link>
        </div>
        {stations.length === 0 ? (
          <p className="text-neutral-500 text-sm">Rien à afficher pour le moment.</p>
        ) : (
          <div className="space-y-3">
            {[...stations].sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt)).slice(0, 5).map(s => (
              <div key={s.id} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                <div>
                  <p className="font-bold text-white">{s.name}</p>
                  <p className="text-sm text-neutral-500">{s.city || s.address}</p>
                </div>
                <span className={`text-xs font-medium px-3 py-1 rounded-full border ${
                  s.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  s.status === 'en_attente' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                  'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                  {s.status === 'active' ? 'Active' : s.status === 'en_attente' ? 'En attente' : 'Suspendue'}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
