import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Building2, CreditCard, AlertTriangle, TrendingUp, Sparkles, Clock, Wallet, CalendarDays, ChevronDown } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { GRANULARITIES, buildBuckets, countInBuckets, sumInBuckets, buildDayBucketsForMonth, buildMonthBucketsForYear, buildYearBuckets } from '../../lib/dateBuckets';
import { validatedMRR, validatedStations, modulesMRR, subscriptionBreakdown } from '../../lib/platformRevenue';
import LineChart from '../../components/ui/LineChart';
import AnimatedCounter from '../../components/ui/AnimatedCounter';
import SearchSelect from '../../components/ui/SearchSelect';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

// Filtre date compact façon Power BI (un bouton qui ouvre un calendrier/une
// grille au clic, au lieu de l'afficher en permanence dans la carte — voir
// "Recette générée par les stations" ci-dessous, qui devenait encombrée avec
// la grille + le graphique affichés ensemble en continu).
function RevenueDateFilter({ granularity, day, month, year, monthOptions, yearOptions, daysInMonth, triggerLabel, onSelectDay, onSelectMonth, onSelectYear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (granularity === 'semaine') return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-neutral-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white hover:border-white/20 transition-colors"
      >
        <CalendarDays className="w-4 h-4 text-neutral-400 flex-shrink-0" />
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className={`w-4 h-4 text-neutral-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 right-0 mt-2 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl p-3"
            style={{ width: granularity === 'annee' ? 220 : 280 }}
          >
            {granularity === 'jour' && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <select
                    value={month}
                    onChange={(e) => onSelectMonth(Number(e.target.value))}
                    className="flex-1 min-w-0 bg-neutral-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 appearance-none"
                  >
                    {monthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select
                    value={year}
                    onChange={(e) => onSelectYear(Number(e.target.value))}
                    className="bg-neutral-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 appearance-none"
                  >
                    {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => { onSelectDay(d); setOpen(false); }}
                      className={`aspect-square rounded-md text-xs font-medium transition-colors ${
                        d === day ? 'bg-purple-600 text-white' : 'text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </>
            )}
            {granularity === 'mois' && (
              <>
                <select
                  value={year}
                  onChange={(e) => onSelectYear(Number(e.target.value))}
                  className="w-full mb-3 bg-neutral-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 appearance-none"
                >
                  {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <div className="grid grid-cols-3 gap-1.5">
                  {monthOptions.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => { onSelectMonth(m.value); setOpen(false); }}
                      className={`px-2 py-2 rounded-md text-xs font-medium transition-colors truncate ${
                        m.value === month ? 'bg-purple-600 text-white' : 'text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      {m.label.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </>
            )}
            {granularity === 'annee' && (
              <div className="grid grid-cols-3 gap-1.5">
                {yearOptions.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => { onSelectYear(y); setOpen(false); }}
                    className={`px-2 py-2 rounded-md text-xs font-medium transition-colors ${
                      y === year ? 'bg-purple-600 text-white' : 'text-neutral-300 hover:bg-white/10'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SuperAdminDashboard() {
  useDocumentTitle('Tableau de bord');
  const { stations, clientAccounts, PLANS, stationTransactions } = useSuperAdminState();
  const [granularity, setGranularity] = useState('mois');
  const [revenueGranularity, setRevenueGranularity] = useState('mois');
  const [revenueStationId, setRevenueStationId] = useState('all');
  // Jour/mois/année précis choisis via les grilles ci-dessous — jamais
  // utilisés en granularité "Semaine" (fenêtre glissante inchangée).
  const today = new Date();
  const [revenueDay, setRevenueDay] = useState(today.getDate());
  const [revenueMonth, setRevenueMonth] = useState(today.getMonth());
  const [revenueYear, setRevenueYear] = useState(today.getFullYear());
  // Première année avec de vraies données — pas une constante figée : calculée
  // depuis la 1re station inscrite, pour ne proposer que des années où la
  // plateforme existait réellement (aujourd'hui : 2026 seul, l'appli venant
  // d'être lancée ; les années suivantes s'ajouteront d'elles-mêmes).
  const REVENUE_FIRST_YEAR = stations.length > 0
    ? Math.min(today.getFullYear(), ...stations.map((s) => new Date(s.joinedAt).getFullYear()))
    : today.getFullYear();
  const revenueYearOptions = [];
  for (let y = REVENUE_FIRST_YEAR; y <= today.getFullYear(); y++) revenueYearOptions.push(y);
  const monthOptions = Array.from({ length: 12 }).map((_, m) => {
    const label = new Date(2000, m, 1).toLocaleDateString('fr-FR', { month: 'long' });
    return { value: m, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
  const daysInSelectedMonth = new Date(revenueYear, revenueMonth + 1, 0).getDate();
  // Un jour choisi dans un mois de 31 jours (ex: le 31) doit être ramené à la
  // fin du mois si on bascule sur un mois plus court (ex: février) — sans ça
  // selectedRange calculerait une plage sur un jour qui n'existe pas.
  useEffect(() => {
    if (revenueDay > daysInSelectedMonth) setRevenueDay(daysInSelectedMonth);
  }, [daysInSelectedMonth, revenueDay]);

  const activeStations = stations.filter(s => s.status === 'active');
  const pendingStations = stations.filter(s => s.status === 'en_attente');
  const overdueStations = stations.filter(s => s.subscriptionStatus === 'en_retard');

  // MRR = abonnements RÉELLEMENT validés (paiement à jour) uniquement — jamais
  // les essais gratuits, les impayés ni les accès illimités offerts. Source
  // partagée avec Analytique / Facturation / Bilan (lib/platformRevenue.js).
  const paidStations = validatedStations(stations);
  const mrr = validatedMRR(stations, PLANS);
  const modMrr = modulesMRR(stations);
  const statusBreakdown = subscriptionBreakdown(stations, PLANS);
  // Comptes automobilistes réellement inscrits (profiles role=automobiliste),
  // pas la somme des estimations "clients déclarés" saisies par station.
  const totalClients = clientAccounts.length;

  const stats = [
    { title: "Stations Actives", value: activeStations.length, icon: Building2, color: "text-blue-400", bg: "bg-blue-500/10", detail: "Stations avec un compte validé et opérationnel sur la plateforme (tous statuts d'abonnement confondus)." },
    { title: "Automobilistes inscrits", value: totalClients, icon: Users, color: "text-emerald-400", bg: "bg-emerald-500/10", detail: "Nombre réel de comptes automobilistes créés sur la plateforme, toutes stations confondues." },
    { title: "En attente de validation", value: pendingStations.length, icon: Clock, color: "text-orange-400", bg: "bg-orange-500/10", detail: "Nouvelles inscriptions de stations en attente de validation manuelle avant activation." },
    { title: "Revenu Récurrent (MRR)", value: mrr, suffix: " FCFA", icon: CreditCard, color: "text-purple-400", bg: "bg-purple-500/10", detail: `${paidStations.length} abonnement(s) validé(s) (paiement à jour) × prix du plan. Hors essais gratuits, impayés et accès illimités.${modMrr > 0 ? ` Modules & add-ons en sus : +${modMrr.toLocaleString('fr-FR')} FCFA/mois.` : ''}` }
  ];

  // Nombre de stations par plan (indépendant du statut de paiement — une
  // station en essai a quand même un plan choisi) — alimente la barre de
  // répartition ci-dessous, triée par prix croissant pour un ordre stable.
  const planEntries = Object.entries(PLANS).sort((a, b) => a[1].price - b[1].price);
  const PLAN_BAR_COLORS = ['bg-emerald-400', 'bg-purple-500', 'bg-amber-400', 'bg-blue-400'];

  // Croissance réelle : nouvelles stations inscrites, groupées selon la
  // granularité choisie (jour/semaine/mois/année) — même logique de buckets
  // que le graphique d'Analytique (src/lib/dateBuckets.js).
  const buckets = useMemo(() => buildBuckets(granularity), [granularity]);
  const newStationsSeries = useMemo(() => countInBuckets(buckets, stations, 'joinedAt'), [buckets, stations]);
  const newStationsPoints = buckets.map((b, i) => ({ label: b.label, value: newStationsSeries[i] }));

  // Recette générée par les stations (chiffre d'affaires réel des lavages —
  // espèces + en ligne, table `transactions`) — jamais le MRR de l'abonnement
  // SaaS ci-dessus. Filtrable par période (jour/semaine/mois/année) et par
  // station, indépendamment du graphique "Nouvelles stations" au-dessus.
  // Une station sans `name` renseigné produisait une ligne vide dans l'ancien
  // <select> natif — la filtrer la rendait invisible/introuvable (régression
  // signalée : "Baye Lavage" avait disparu). On la garde désormais TOUJOURS
  // sélectionnable, avec un nom de secours (raison sociale puis ville) plutôt
  // que de la masquer.
  const stationLabel = (s) => (s.name || '').trim() || (s.ownerName || '').trim() || (s.city || '').trim() || 'Station sans nom';
  const sortedStationsForFilter = useMemo(
    () => [...stations].sort((a, b) => stationLabel(a).localeCompare(stationLabel(b))),
    [stations]
  );
  const stationFilterOptions = useMemo(
    () => [{ value: 'all', label: 'Toutes les stations' }, ...sortedStationsForFilter.map((s) => ({ value: s.id, label: stationLabel(s) }))],
    [sortedStationsForFilter]
  );
  // "Jour"/"Mois" sont calendaires (jour 1 -> fin du mois choisi, Janvier ->
  // Décembre de l'année choisie) plutôt qu'une fenêtre glissante — voir
  // lib/dateBuckets.js. "Semaine" garde la fenêtre glissante existante
  // (non demandée en calendaire), "Année" liste chaque année depuis
  // REVENUE_FIRST_YEAR jusqu'à aujourd'hui.
  const revenueBuckets = useMemo(() => {
    if (revenueGranularity === 'jour') return buildDayBucketsForMonth(revenueYear, revenueMonth);
    if (revenueGranularity === 'mois') return buildMonthBucketsForYear(revenueYear);
    if (revenueGranularity === 'annee') return buildYearBuckets(REVENUE_FIRST_YEAR);
    return buildBuckets(revenueGranularity);
  }, [revenueGranularity, revenueYear, revenueMonth]);
  const scopedTransactions = useMemo(
    () => revenueStationId === 'all' ? stationTransactions : stationTransactions.filter((t) => t.stationId === revenueStationId),
    [stationTransactions, revenueStationId]
  );
  const revenueSeries = useMemo(
    () => sumInBuckets(revenueBuckets, scopedTransactions, 'createdAt', (t) => t.amount),
    [revenueBuckets, scopedTransactions]
  );
  // Le tableau ci-dessous garde tout le mois/toute l'année comme contexte,
  // mais les 2 chiffres clés ("Total", "Lavages encaissés") portent sur le
  // seul jour/mois/année précisément choisi — jamais la somme de toute la
  // fenêtre affichée. "Semaine" (non demandée en précis) reste la somme de
  // toute la fenêtre glissante visible, comme avant.
  const selectedRange = useMemo(() => {
    if (revenueGranularity === 'jour') {
      const start = new Date(revenueYear, revenueMonth, revenueDay, 0, 0, 0, 0);
      return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
    }
    if (revenueGranularity === 'mois') {
      return { start: new Date(revenueYear, revenueMonth, 1), end: new Date(revenueYear, revenueMonth + 1, 1) };
    }
    if (revenueGranularity === 'annee') {
      return { start: new Date(revenueYear, 0, 1), end: new Date(revenueYear + 1, 0, 1) };
    }
    return null;
  }, [revenueGranularity, revenueYear, revenueMonth, revenueDay]);

  const selectedPeriodLabel = revenueGranularity === 'jour'
    ? new Date(revenueYear, revenueMonth, revenueDay).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : revenueGranularity === 'mois'
      ? (() => { const l = new Date(revenueYear, revenueMonth, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return l.charAt(0).toUpperCase() + l.slice(1); })()
      : revenueGranularity === 'annee'
        ? `Année ${revenueYear}`
        : null;

  const viewStart = selectedRange ? selectedRange.start : revenueBuckets[0]?.start;
  const viewEnd = selectedRange ? selectedRange.end : revenueBuckets[revenueBuckets.length - 1]?.end;
  const transactionsInSelection = scopedTransactions.filter((t) => {
    const d = new Date(t.createdAt);
    return viewStart && viewEnd && d >= viewStart && d < viewEnd;
  });
  const totalRevenueInView = transactionsInSelection.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const washCountInView = transactionsInSelection.length;

  // Total/nombre de lavages sur TOUTE la période affichée par le tableau
  // (ligne "Total" en pied de tableau) — distinct de totalRevenueInView, qui
  // ne porte que sur la ligne précisément sélectionnée.
  const fullRangeStart = revenueBuckets[0]?.start;
  const fullRangeEnd = revenueBuckets[revenueBuckets.length - 1]?.end;
  const fullRangeWashCount = scopedTransactions.filter((t) => {
    const d = new Date(t.createdAt);
    return fullRangeStart && fullRangeEnd && d >= fullRangeStart && d < fullRangeEnd;
  }).length;
  const fullRangeRevenue = revenueSeries.reduce((s, v) => s + v, 0);

  // Cliquer une ligne du tableau équivaut à cliquer le jour/mois/année
  // correspondant dans RevenueDateFilter — même sélection, deux chemins.
  const handleBucketClick = (bucket) => {
    if (revenueGranularity === 'jour') setRevenueDay(bucket.start.getDate());
    else if (revenueGranularity === 'mois') setRevenueMonth(bucket.start.getMonth());
    else if (revenueGranularity === 'annee') setRevenueYear(bucket.start.getFullYear());
  };

  const revenueColumnLabel = revenueGranularity === 'jour' ? 'Jour' : revenueGranularity === 'mois' ? 'Mois' : revenueGranularity === 'annee' ? 'Année' : 'Semaine';

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

              {/* Détail au survol — même principe que les cartes KPI de
                  GestionImmo (admin-dashboard.css, .kpi-tooltip) : un panneau
                  clair recouvre la carte plutôt que d'alourdir l'affichage
                  par défaut avec du texte supplémentaire. */}
              <div className="absolute inset-0 bg-white rounded-2xl p-6 flex flex-col justify-center opacity-0 invisible translate-y-3 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300 shadow-2xl shadow-black/40 z-10">
                <h4 className="text-neutral-900 font-bold text-sm mb-1.5">{stat.title}</h4>
                <p className="text-neutral-600 text-xs leading-relaxed">{stat.detail}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Recette générée par les stations (chiffre d'affaires lavages réel,
          pas l'abonnement SaaS — voir Répartition des Abonnements/MRR plus bas) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card rounded-2xl p-8 mb-12"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-400" /> Recette générée par les stations
            </h2>
            <p className="text-neutral-500 text-sm mt-1">Chiffre d'affaires réel des lavages (espèces + en ligne) — pas l'abonnement SaaS des stations.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SearchSelect
              value={revenueStationId}
              onChange={setRevenueStationId}
              options={stationFilterOptions}
              placeholder="Rechercher une station..."
              className="w-56"
            />
            <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 w-fit">
              {GRANULARITIES.map(g => (
                <button
                  key={g.key}
                  onClick={() => setRevenueGranularity(g.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    revenueGranularity === g.key ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {/* Bouton compact façon Power BI : ouvre le calendrier/la grille au
                clic au lieu de l'afficher en permanence (voir RevenueDateFilter
                en haut du fichier). */}
            <RevenueDateFilter
              granularity={revenueGranularity}
              day={revenueDay}
              month={revenueMonth}
              year={revenueYear}
              monthOptions={monthOptions}
              yearOptions={revenueYearOptions}
              daysInMonth={daysInSelectedMonth}
              triggerLabel={selectedPeriodLabel || 'Fenêtre glissante'}
              onSelectDay={setRevenueDay}
              onSelectMonth={setRevenueMonth}
              onSelectYear={setRevenueYear}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-8 my-6">
          <div>
            <span className="text-neutral-500 text-xs uppercase tracking-wider">
              {selectedPeriodLabel ? `Total — ${selectedPeriodLabel}` : 'Total sur la période affichée'}
            </span>
            <p className="text-3xl font-bold text-white">{totalRevenueInView.toLocaleString('fr-FR')} <span className="text-lg text-neutral-400">FCFA</span></p>
          </div>
          <div>
            <span className="text-neutral-500 text-xs uppercase tracking-wider">Lavages encaissés</span>
            <p className="text-3xl font-bold text-white">{washCountInView.toLocaleString('fr-FR')}</p>
          </div>
        </div>

        {/* Tableau façon Power BI (visuel Table) — remplace le graphique en
            ligne, jugé encombré une fois combiné à la grille de sélection.
            Une ligne par jour/mois/année/semaine visible, cliquable pour
            sélectionner (même effet que RevenueDateFilter), triée
            chronologiquement, total en pied de tableau. */}
        {stationTransactions.length === 0 ? (
          <p className="text-neutral-500 text-sm">Aucun encaissement enregistré pour le moment.</p>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-900 z-10">
                  <tr className="text-neutral-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">{revenueColumnLabel}</th>
                    <th className="text-right px-4 py-3 font-medium">Recette</th>
                    <th className="text-right px-4 py-3 font-medium">Lavages</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueBuckets.map((b, i) => {
                    const isSelectable = revenueGranularity !== 'semaine';
                    const isSelected = selectedRange && b.start.getTime() === selectedRange.start.getTime();
                    const count = scopedTransactions.filter((t) => {
                      const d = new Date(t.createdAt);
                      return d >= b.start && d < b.end;
                    }).length;
                    return (
                      <tr
                        key={i}
                        onClick={isSelectable ? () => handleBucketClick(b) : undefined}
                        className={`border-t border-white/5 transition-colors ${isSelectable ? 'cursor-pointer' : ''} ${
                          isSelected ? 'bg-purple-600/15' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <td className={`px-4 py-2.5 capitalize ${isSelected ? 'text-white font-semibold' : 'text-neutral-300'}`}>{b.label}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${isSelected ? 'text-white font-semibold' : 'text-neutral-300'}`}>{revenueSeries[i].toLocaleString('fr-FR')} FCFA</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${isSelected ? 'text-white font-semibold' : 'text-neutral-400'}`}>{count}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10 bg-white/[0.03]">
                    <td className="px-4 py-3 font-bold text-white">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-white tabular-nums">{fullRangeRevenue.toLocaleString('fr-FR')} FCFA</td>
                    <td className="px-4 py-3 text-right font-bold text-white tabular-nums">{fullRangeWashCount.toLocaleString('fr-FR')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </motion.div>

      {/* Répartition des Abonnements */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="glass-card rounded-2xl p-8 mb-12 grid grid-cols-1 md:grid-cols-3 gap-8"
      >
        <div className="md:col-span-2">
          <h2 className="text-xl font-bold text-white mb-6">Répartition des Abonnements</h2>
          <div className="space-y-5">
            {planEntries.map(([key, def], i) => {
              const count = stations.filter((s) => s.plan === key).length;
              const percent = stations.length > 0 ? (count / stations.length) * 100 : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-2 text-sm">
                    <span className="text-neutral-300">
                      {def.label} <span className="text-neutral-500">({def.price.toLocaleString('fr-FR')} FCFA/mois)</span>
                    </span>
                    <span className="text-neutral-400">{count} station{count > 1 ? 's' : ''}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ duration: 0.6, delay: 0.1 * i }}
                      className={`h-full rounded-full ${PLAN_BAR_COLORS[i % PLAN_BAR_COLORS.length]}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col">
          <span className="text-neutral-500 text-xs uppercase tracking-wider mb-2">MRR validé</span>
          <span className="text-3xl font-bold text-white">{mrr.toLocaleString('fr-FR')} <span className="text-lg text-neutral-400">FCFA</span></span>
          <span className="text-neutral-500 text-xs mb-4">{paidStations.length} abonnement{paidStations.length > 1 ? 's' : ''} validé{paidStations.length > 1 ? 's' : ''} · paiement à jour{modMrr > 0 ? ` · +${modMrr.toLocaleString('fr-FR')} FCFA modules` : ''}</span>
          <div className="space-y-2 mt-auto pt-4 border-t border-white/10">
            {statusBreakdown.map((s) => (
              <div key={s.key} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-neutral-400">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
                <span className="text-neutral-300 font-medium">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

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
