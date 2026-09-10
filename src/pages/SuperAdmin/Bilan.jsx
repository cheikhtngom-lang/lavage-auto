import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '../../components/ui/Card';
import {
  Download, TrendingUp, TrendingDown, Minus, Wallet, Building2, Megaphone, Crown, Users, Loader2,
  RefreshCw, Droplets, BadgeCheck, Boxes,
} from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import {
  PERIOD_TYPES, availablePeriods, periodRange, periodKey, isCurrentPeriod, buildPlatformBilan,
  fcfa, fcfaCompact,
} from '../../lib/platformBilan';
import { validatedMRR, modulesMRR, subscriptionBreakdown } from '../../lib/platformRevenue';
import { downloadPlatformBilanPdf } from '../../lib/platformBilanPdf';
import { Donut, Legend, Bars, GroupedBars, AreaLine, CHART_COLORS } from '../../components/ui/charts';
import AnimatedCounter from '../../components/ui/AnimatedCounter';

function Delta({ d, className = '' }) {
  if (d == null) return <span className={`text-xs text-neutral-500 ${className}`}>—</span>;
  const flat = Math.abs(d) < 0.005;
  const color = flat ? 'text-neutral-400' : d > 0 ? 'text-emerald-400' : 'text-red-400';
  const Icon = flat ? Minus : d > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${color} ${className}`}>
      <Icon className="w-3.5 h-3.5" />{d >= 0 ? '+' : ''}{(d * 100).toFixed(0)} %
    </span>
  );
}

function Section({ title, subtitle, children, className = '' }) {
  return (
    <Card className={`border-white/5 bg-white/[0.02] ${className}`}>
      <CardContent className="p-6">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export default function SuperAdminBilan() {
  useDocumentTitle('Bilan');
  const {
    stations, clientAccounts, stationAds, superUserSubscriptions,
    stationRenewalPayments, lavagePayments, PLANS,
  } = useSuperAdminState();

  const data = useMemo(
    () => ({ stations, clientAccounts, stationAds, superUserSubscriptions, stationRenewalPayments, lavagePayments, PLANS }),
    [stations, clientAccounts, stationAds, superUserSubscriptions, stationRenewalPayments, lavagePayments, PLANS],
  );

  // Instantané "à ce jour" (indépendant de la période) — le MRR réellement
  // validé maintenant, à comparer à l'estimation de la période.
  const mrrNow = useMemo(() => validatedMRR(stations, PLANS), [stations, PLANS]);
  const modulesNow = useMemo(() => modulesMRR(stations), [stations]);
  const statusBreakdown = useMemo(() => subscriptionBreakdown(stations, PLANS), [stations, PLANS]);

  const earliest = useMemo(() => {
    const ds = (stations || []).map((s) => s.joinedAt).filter(Boolean).sort();
    return ds[0] || null;
  }, [stations]);

  const [type, setType] = useState('mensuel');
  const periods = useMemo(() => availablePeriods(type, earliest), [type, earliest]);
  const [selKey, setSelKey] = useState(null);

  useEffect(() => {
    setSelKey(periods[0] ? periodKey(periods[0]) : null);
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const period = periods.find((p) => periodKey(p) === selKey) || periods[0];
  const bilan = useMemo(() => (period ? buildPlatformBilan(data, period) : null), [data, period]);

  const [pdfBusy, setPdfBusy] = useState(false);
  const handlePdf = async () => {
    if (!bilan) return;
    setPdfBusy(true);
    try {
      await downloadPlatformBilanPdf({ bilan, mrrNow, modulesNow, statusBreakdown });
    } catch (e) {
      alert('Export PDF impossible : ' + (e?.message || e));
    } finally {
      setPdfBusy(false);
    }
  };

  if (!bilan) {
    return (
      <div className="p-8 flex items-center gap-3 text-neutral-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Préparation du bilan…
      </div>
    );
  }

  const { current: cur, previous: prev, deltas, prevLabel, trend, partial } = bilan;

  // KPIs : d'abord les 2 chiffres de synthèse (réel encaissé / vue consolidée),
  // puis chaque source dans le détail.
  const kpis = [
    { label: 'Revenu réellement encaissé', value: cur.realCollected, suffix: ' FCFA', icon: BadgeCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', d: deltas.realCollected,
      detail: 'Somme des paiements réellement reçus sur la période : publicités + Super User + renouvellements de station confirmés + commission des lavages payés en ligne. Chaque montant correspond à un événement de paiement daté.' },
    { label: 'Revenu consolidé (avec estimation)', value: cur.totalRevenue, suffix: ' FCFA', icon: Wallet, color: 'text-cyan-400', bg: 'bg-cyan-500/10', d: deltas.totalRevenue,
      detail: 'Estimation du récurrent (abonnements validés + modules, plan × stations à date) + flux réels non récurrents (publicités, Super User, commission lavages). Les renouvellements confirmés ne sont pas ré-additionnés : ils réalisent une partie du récurrent déjà estimé.' },
    { label: 'Abonnements stations (est. récurrent)', value: cur.subscriptionEstimate, suffix: ' FCFA', icon: Building2, color: 'text-blue-400', bg: 'bg-blue-500/10', d: deltas.subscriptionEstimate,
      detail: `Estimation mensuelle : prix du plan × stations à l'abonnement validé (paiement à jour) à cette date. Aucun registre de paiement n'existe pour les abonnements marqués payés à la main. MRR validé à ce jour : ${fcfa(mrrNow)}.` },
    { label: 'Modules & add-ons (est. récurrent)', value: cur.moduleRevenue, suffix: ' FCFA', icon: Boxes, color: 'text-indigo-400', bg: 'bg-indigo-500/10', d: deltas.moduleRevenue,
      detail: `Estimation mensuelle des modules add-on activés sur les stations à l'abonnement validé (voir Super Admin > Modules). Récurrent actuel : ${fcfa(modulesNow)}/mois.` },
    { label: 'Renouvellements confirmés (réel)', value: cur.renewalRevenue, suffix: ' FCFA', icon: RefreshCw, color: 'text-teal-400', bg: 'bg-teal-500/10', d: deltas.renewalRevenue,
      detail: 'Paiements de renouvellement d\'abonnement réellement confirmés sur la période (Super Admin > Facturation). Part réelle et datée du revenu d\'abonnement.' },
    { label: 'Publicités (réel)', value: cur.adsRevenue, suffix: ' FCFA', icon: Megaphone, color: 'text-amber-400', bg: 'bg-amber-500/10', d: deltas.adsRevenue,
      detail: 'Revenu réel des publicités confirmées sur la période (voir Super Admin > Publicités).' },
    { label: 'Super User (réel)', value: cur.suRevenue, suffix: ' FCFA', icon: Crown, color: 'text-purple-400', bg: 'bg-purple-500/10', d: deltas.suRevenue,
      detail: 'Revenu réel des abonnements automobiliste Plus / Super User confirmés sur la période.' },
    { label: 'Commission lavages en ligne (réel)', value: cur.washCommissionRevenue, suffix: ' FCFA', icon: Droplets, color: 'text-sky-400', bg: 'bg-sky-500/10', d: deltas.washCommissionRevenue,
      detail: `Part plateforme prélevée sur les lavages payés en ligne (PayDunya) sur la période. ${cur.washCount} paiement(s), ${fcfa(cur.washGrossVolume)} encaissés au total, dont ${fcfa(cur.washStationPayout)} reversés aux stations.` },
    { label: 'Nouvelles stations', value: cur.newStations, icon: Building2, color: 'text-cyan-400', bg: 'bg-cyan-500/10', d: deltas.newStations,
      detail: 'Stations inscrites sur la période, tous statuts confondus.' },
    { label: 'Nouveaux automobilistes', value: cur.newMotorists, icon: Users, color: 'text-pink-400', bg: 'bg-pink-500/10', d: deltas.newMotorists,
      detail: 'Comptes automobilistes créés sur la période.' },
  ];

  const streamData = [
    { label: 'Abonnements (est.)', value: cur.subscriptionEstimate, color: CHART_COLORS[0] },
    { label: 'Modules (est.)', value: cur.moduleRevenue, color: CHART_COLORS[5] },
    { label: 'Publicités', value: cur.adsRevenue, color: CHART_COLORS[3] },
    { label: 'Super User', value: cur.suRevenue, color: CHART_COLORS[2] },
    { label: 'Commission lavages', value: cur.washCommissionRevenue, color: CHART_COLORS[1] },
  ];
  const realStreamData = [
    { label: 'Renouvellements', value: cur.renewalRevenue, color: CHART_COLORS[0] },
    { label: 'Publicités', value: cur.adsRevenue, color: CHART_COLORS[3] },
    { label: 'Super User', value: cur.suRevenue, color: CHART_COLORS[2] },
    { label: 'Commission lavages', value: cur.washCommissionRevenue, color: CHART_COLORS[1] },
  ];
  const planData = Object.entries(cur.planRevenue || {})
    .map(([key, value], i) => ({ label: PLANS[key]?.label || key, value, color: CHART_COLORS[i % CHART_COLORS.length] }))
    .sort((a, b) => b.value - a.value);

  const statusData = statusBreakdown.map((s) => ({ label: s.label, value: s.count, color: s.color }));
  const statusMrrData = statusBreakdown
    .filter((s) => s.mrr > 0)
    .map((s) => ({ label: s.label, value: s.mrr, color: s.color }));

  const compareGroups = [
    { label: 'Encaissé réel', a: cur.realCollected, b: prev.realCollected },
    { label: 'Consolidé', a: cur.totalRevenue, b: prev.totalRevenue },
    { label: 'Abonn. (est.)', a: cur.subscriptionEstimate, b: prev.subscriptionEstimate },
    { label: 'Pubs', a: cur.adsRevenue, b: prev.adsRevenue },
    { label: 'Super User', a: cur.suRevenue, b: prev.suRevenue },
    { label: 'Lavages', a: cur.washCommissionRevenue, b: prev.washCommissionRevenue },
  ];

  const topStationsByClients = [...(stations || [])].sort((a, b) => (b.clientsCount || 0) - (a.clientsCount || 0)).slice(0, 5);
  const cityCounts = (stations || []).reduce((acc, s) => {
    const city = s.city || 'Ville non renseignée';
    acc[city] = (acc[city] || 0) + 1;
    return acc;
  }, {});
  const topCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value }));

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto relative z-10">
      {/* En-tête */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Bilan de la <span className="text-purple-400">Plateforme</span></h1>
          <p className="text-neutral-400">Tous les revenus : abonnements, modules, publicités, Super User, renouvellements et commission des lavages en ligne — avec comparaison à la période précédente.</p>
        </div>
        <button
          onClick={handlePdf}
          disabled={pdfBusy}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white px-5 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-purple-500/20 flex items-center gap-2 flex-shrink-0"
        >
          {pdfBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          Télécharger le PDF
        </button>
      </div>

      {/* Contrôles de période */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="flex overflow-x-auto gap-2 scrollbar-hide">
          {PERIOD_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                type === t.key ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={selKey || ''}
          onChange={(e) => setSelKey(e.target.value)}
          className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-purple-500 [color-scheme:dark] sm:w-64"
        >
          {periods.map((p) => {
            const k = periodKey(p);
            return <option key={k} value={k}>{periodRange(p).label}{isCurrentPeriod(p) ? ' — en cours' : ''}</option>;
          })}
        </select>
      </div>

      {partial && (
        <div className="mb-6 text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
          Période <strong>en cours</strong> : les chiffres évoluent jusqu'à la fin de la période.
        </div>
      )}

      <div className="mb-6 text-sm text-blue-300/90 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 leading-relaxed">
        <strong>Deux lectures du revenu.</strong> « Réellement encaissé » ne compte que des paiements datés
        (publicités, Super User, renouvellements de station confirmés, commission des lavages en ligne).
        « Abonnements » et « Modules » sont une <strong>estimation récurrente</strong> (prix du plan × stations
        à l'abonnement validé) car la plateforme ne conserve pas d'historique quand un abonnement est marqué
        payé à la main. MRR validé à ce jour : <strong>{fcfa(mrrNow)}</strong>
        {modulesNow > 0 ? <> · modules : <strong>{fcfa(modulesNow)}</strong>/mois</> : null}.
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 100 }}
          >
            <div className="glass-card rounded-2xl p-6 relative overflow-hidden group hover:bg-white/[0.04] transition-colors h-full">
              <div className={`absolute top-0 right-0 w-32 h-32 ${k.bg} blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>

              <div className="flex justify-between items-start mb-6">
                <div className={`p-3 rounded-xl ${k.bg}`}>
                  <k.icon className={`w-6 h-6 ${k.color}`} />
                </div>
                <Delta d={k.d} />
              </div>

              <div>
                <p className="text-neutral-400 text-sm font-medium mb-1">{k.label}</p>
                <h3 className="text-2xl md:text-3xl text-white font-bold">
                  <AnimatedCounter value={k.value} suffix={k.suffix} />
                </h3>
                {k.d != null && <p className="text-xs text-neutral-500 mt-2">vs {prevLabel}</p>}
              </div>

              <div className="absolute inset-0 bg-white rounded-2xl p-6 flex flex-col justify-center opacity-0 invisible translate-y-3 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-300 shadow-2xl shadow-black/40 z-10">
                <h4 className="text-neutral-900 font-bold text-sm mb-1.5">{k.label}</h4>
                <p className="text-neutral-600 text-xs leading-relaxed">{k.detail}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Évolution + Comparaison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Section title="Évolution du revenu sur la période" subtitle="Abonnements et modules estimés, publicités, Super User et commission lavages réels" className="lg:col-span-2">
          <AreaLine
            data={trend}
            keys={[
              { key: 'subscription', color: '#3b82f6', label: 'Abonnements (est.)' },
              { key: 'modules', color: '#6366f1', label: 'Modules (est.)' },
              { key: 'ads', color: '#f59e0b', label: 'Publicités' },
              { key: 'superUser', color: '#a855f7', label: 'Super User' },
              { key: 'washCommission', color: '#10b981', label: 'Commission lavages' },
            ]}
            formatValue={fcfaCompact}
          />
          <div className="flex flex-wrap gap-4 mt-3 text-xs">
            {[['Abonnements (est.)', '#3b82f6'], ['Modules (est.)', '#6366f1'], ['Publicités', '#f59e0b'], ['Super User', '#a855f7'], ['Commission lavages', '#10b981']].map(([l, c]) => (
              <span key={l} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} /><span className="text-neutral-400">{l}</span></span>
            ))}
          </div>
        </Section>

        <Section title={`Période vs ${prevLabel}`} subtitle="Comparaison directe">
          <GroupedBars groups={compareGroups} labelA="Cette période" labelB={prevLabel} colorA="#a855f7" colorB="#525252" formatValue={fcfaCompact} />
        </Section>
      </div>

      {/* Répartitions revenu */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Section title="Revenu consolidé par source" subtitle="Estimations récurrentes + flux réels de la période">
          <div className="grid sm:grid-cols-2 gap-6 items-center">
            <Donut data={streamData} centerLabel={fcfaCompact(cur.totalRevenue)} centerSub="revenu consolidé" />
            <Legend data={streamData} formatValue={(v) => fcfa(v)} />
          </div>
        </Section>
        <Section title="Revenu réellement encaissé par source" subtitle="Uniquement les paiements datés de la période">
          <div className="grid sm:grid-cols-2 gap-6 items-center">
            <Donut data={realStreamData} centerLabel={fcfaCompact(cur.realCollected)} centerSub="encaissé réel" />
            <Legend data={realStreamData} formatValue={(v) => fcfa(v)} />
          </div>
        </Section>
      </div>

      {/* Abonnements : statut + plan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Section title="Statut des abonnements de stations" subtitle="Instantané à ce jour, toutes stations">
          <div className="grid sm:grid-cols-2 gap-6 items-center">
            <Donut data={statusData} centerLabel={String((stations || []).length)} centerSub="stations" />
            <Legend data={statusData} formatValue={(v) => `${v}`} />
          </div>
          {statusMrrData.length > 0 && (
            <div className="mt-6 pt-5 border-t border-white/5">
              <p className="text-xs text-neutral-500 mb-3">MRR théorique par statut (prix du plan)</p>
              <Bars data={statusMrrData} formatValue={(v) => fcfa(v)} />
            </div>
          )}
        </Section>
        <Section title="Revenu récurrent estimé par plan" subtitle="Abonnements validés à date">
          <Bars data={planData} formatValue={(v) => fcfa(v)} />
        </Section>
      </div>

      {/* Lavages payés en ligne */}
      <div className="mb-6">
        <Section title="Lavages payés en ligne (PayDunya)" subtitle={`Période ${bilan.range.label}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Paiements', value: String(cur.washCount), sub: 'factures en ligne' },
              { label: 'Volume encaissé', value: fcfa(cur.washGrossVolume), sub: 'montant total client' },
              { label: 'Commission plateforme', value: fcfa(cur.washCommissionRevenue), sub: 'revenu plateforme', accent: true },
              { label: 'Reversé aux stations', value: fcfa(cur.washStationPayout), sub: 'part station' },
            ].map((c) => (
              <div key={c.label} className={`rounded-xl p-4 border ${c.accent ? 'border-sky-500/30 bg-sky-500/[0.06]' : 'border-white/5 bg-white/[0.02]'}`}>
                <p className="text-xs text-neutral-500 mb-1">{c.label}</p>
                <p className={`text-lg font-bold ${c.accent ? 'text-sky-300' : 'text-white'}`}>{c.value}</p>
                <p className="text-[11px] text-neutral-600 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Top stations par automobilistes déclarés" subtitle="Toutes périodes confondues">
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
        </Section>

        <Section title="Répartition géographique des stations" subtitle="Toutes périodes confondues">
          {topCities.length === 0 ? (
            <p className="text-neutral-500 text-sm">Aucune donnée pour le moment.</p>
          ) : (
            <Bars data={topCities} color="#3b82f6" formatValue={(v) => String(v)} />
          )}
        </Section>
      </div>
    </div>
  );
}
