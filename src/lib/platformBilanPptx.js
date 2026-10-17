// Export PowerPoint du Bilan de la plateforme (Super Admin > Bilan) — même
// présentation que le Bilan d'une station (lib/bilanPptx.js), adaptée aux
// données Super Admin : revenu réellement encaissé + estimation récurrente,
// chaque source détaillée, statut des abonnements et lavages payés en ligne.
import { fcfa } from './bilan';
import { createDeck, nb, fileSlug, MX, CONTENT_W, TOP, BOTTOM, HEX } from './pptxDeck';

const ACCENT = '7C3AED';
const SOURCES = [
  { key: 'subscription', label: 'Abonnements stations (est.)', color: '2563EB' },
  { key: 'modules', label: 'Modules & add-ons (est.)', color: '6366F1' },
  { key: 'ads', label: 'Publicités', color: HEX.amber },
  { key: 'superUser', label: 'Super User', color: 'A855F7' },
  { key: 'washCommission', label: 'Commission lavages en ligne', color: HEX.green },
];
const amount = (v) => fcfa(v).replace(' FCFA', '');

export async function downloadPlatformBilanPptx({ bilan, mrrNow = 0, modulesNow = 0, statusBreakdown = [], PLANS = {} }) {
  const { current: cur, previous: prev, deltas, range, prevLabel, trend, partial } = bilan;
  const periodLabel = range.label + (partial ? ' (en cours)' : '');

  const deck = await createDeck({
    accent: ACCENT,
    title: `Bilan de la plateforme — ${range.label}`,
    footer: `Bilan de la plateforme · Clean Car Galsen · ${periodLabel}`,
  });
  const sideW = 3.4, sideX = MX + CONTENT_W - sideW, mainW = CONTENT_W - sideW - 0.4;
  const H = BOTTOM - TOP;
  const bucket = range.type === 'mensuel' ? 'semaine' : 'mois';
  // Libellés lisibles : « 1–7 oct. » pour les semaines, « juil. » / « Juillet » pour les mois.
  const monthOf = (i, month) => new Date(range.start.getFullYear(), range.start.getMonth() + i, 1).toLocaleDateString('fr-FR', { month });
  const bucketLabel = (l, i) => (bucket === 'semaine' ? `${l} ${monthOf(0, 'short')}` : monthOf(i, 'short'));
  const bucketName = (l, i) => (bucket === 'semaine' ? `Du ${l.replace('–', ' au ')} ${monthOf(0, 'long')}` : monthOf(i, 'long').replace(/^./, (c) => c.toUpperCase()));

  // ─── Couverture ───────────────────────────────────────────────────
  deck.section('Synthèse');
  deck.cover({
    kicker: 'BILAN DE LA PLATEFORME',
    name: 'Clean Car Galsen',
    period: periodLabel,
    lines: ['galsenautocleaner.com', 'Abonnements, modules, publicités, Super User et lavages en ligne'],
  });

  // ─── Indicateurs clés ─────────────────────────────────────────────
  {
    const s = deck.slide('Indicateurs clés', `${periodLabel} comparé à ${prevLabel}${partial ? ' — période en cours, les chiffres évoluent jusqu’à la fin' : ''}`);
    const w = (CONTENT_W - 0.9) / 4;
    [
      { label: 'Revenu encaissé (réel)', value: amount(cur.realCollected), unit: 'FCFA', delta: deltas.realCollected },
      { label: 'Revenu consolidé', value: amount(cur.totalRevenue), unit: 'FCFA', delta: deltas.totalRevenue },
      { label: 'Abonnements (est.)', value: amount(cur.subscriptionEstimate), unit: 'FCFA', delta: deltas.subscriptionEstimate },
      { label: 'Commission lavages', value: amount(cur.washCommissionRevenue), unit: 'FCFA', delta: deltas.washCommissionRevenue },
    ].forEach((k, i) => deck.stat(s, { ...k, x: MX + i * (w + 0.3), y: TOP, w, h: 2.3, vs: prevLabel }));
    [
      { label: 'Renouvellements confirmés', value: fcfa(cur.renewalRevenue), delta: deltas.renewalRevenue },
      { label: 'Publicités', value: fcfa(cur.adsRevenue), delta: deltas.adsRevenue },
      { label: 'Nouvelles stations', value: String(cur.newStations), delta: deltas.newStations },
      { label: 'Nouveaux automobilistes', value: String(cur.newMotorists), delta: deltas.newMotorists },
    ].forEach((k, i) => deck.stat(s, { ...k, x: MX + i * (w + 0.3), y: TOP + 2.55, w, h: 1.6, size: 'sm', vs: prevLabel }));
    deck.note(s, `Réel = paiements datés (publicités, Super User, renouvellements confirmés, commission des lavages en ligne). Abonnements et modules = estimation récurrente (prix du plan × stations à l’abonnement validé). MRR validé à ce jour : ${nb(fcfa(mrrNow))}${modulesNow > 0 ? ` + ${nb(fcfa(modulesNow))} de modules` : ''}.`, { y: TOP + 4.3, h: 0.6 });
  }

  // ─── Synthèse comparée ────────────────────────────────────────────
  {
    const s = deck.slide('Synthèse comparée', `${range.label} face à ${prevLabel}`);
    const rows = [
      ['Revenu réellement encaissé', fcfa(cur.realCollected), fcfa(prev.realCollected), deltas.realCollected],
      ['Revenu consolidé (avec estimation)', fcfa(cur.totalRevenue), fcfa(prev.totalRevenue), deltas.totalRevenue],
      ['Abonnements stations (estimation)', fcfa(cur.subscriptionEstimate), fcfa(prev.subscriptionEstimate), deltas.subscriptionEstimate],
      ['Modules & add-ons (estimation)', fcfa(cur.moduleRevenue), fcfa(prev.moduleRevenue), deltas.moduleRevenue],
      ['Renouvellements confirmés (réel)', fcfa(cur.renewalRevenue), fcfa(prev.renewalRevenue), deltas.renewalRevenue],
      ['Publicités (réel)', fcfa(cur.adsRevenue), fcfa(prev.adsRevenue), deltas.adsRevenue],
      ['Super User (réel)', fcfa(cur.suRevenue), fcfa(prev.suRevenue), deltas.suRevenue],
      ['Commission lavages en ligne (réel)', fcfa(cur.washCommissionRevenue), fcfa(prev.washCommissionRevenue), deltas.washCommissionRevenue],
      ['Nouvelles stations', String(cur.newStations), String(prev.newStations), deltas.newStations],
      ['Nouveaux automobilistes', String(cur.newMotorists), String(prev.newMotorists), deltas.newMotorists],
      ['Abonnements validés (à date)', String(cur.validatedStations), String(prev.validatedStations), null],
      ['Stations actives (à date)', String(cur.activeStations), String(prev.activeStations), null],
    ];
    const toneHex = (d) => (d == null || Math.abs(d) < 0.005 ? HEX.muted : d > 0 ? HEX.good : HEX.bad);
    deck.table(s, {
      w: CONTENT_W, colW: [5.4, 2.5, 2.5, CONTENT_W - 10.4],
      header: ['Indicateur', range.label, prevLabel, 'Évolution'],
      align: ['left', 'right', 'right', 'right'],
      rows: rows.map(([label, a, b, d]) => [
        label,
        { text: nb(a), options: { bold: true } },
        { text: nb(b), options: { color: HEX.muted } },
        { text: d == null ? '—' : nb(`${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)} %`), options: { bold: true, color: toneHex(d) } },
      ]),
      fontSize: 13, rowH: 0.36,
    });
  }

  // ─── Évolution du revenu consolidé ────────────────────────────────
  deck.section('Revenus');
  {
    const s = deck.slide('Évolution du revenu consolidé', `Revenu par source et par ${bucket} (FCFA) — abonnements et modules estimés, le reste réel`);
    if ((trend || []).some((t) => t.total > 0)) {
      const labels = trend.map((t, i) => bucketLabel(t.label, i));
      deck.chart(s, 'BAR', SOURCES.map((src) => ({ name: src.label, labels, values: trend.map((t) => t[src.key] || 0) })), {
        x: MX, y: TOP, w: mainW, h: H, barDir: 'col', barGrouping: 'stacked',
        chartColors: SOURCES.map((src) => src.color), showLegend: true, legendPos: 'b', legendFontSize: 11,
        valAxisLabelFormatCode: '#,##0," k"', barGapWidthPct: 60,
      });
      const bestIdx = trend.reduce((bi, t, i) => (t.total > trend[bi].total ? i : bi), 0);
      const best = trend[bestIdx];
      deck.panel(s, {
        x: sideX, y: TOP, w: sideW, h: H,
        items: [
          { label: 'Revenu consolidé de la période', value: fcfa(cur.totalRevenue) },
          { label: `Meilleur${bucket === 'semaine' ? 'e semaine' : ' mois'}`, value: bucketName(best.label, bestIdx), sub: fcfa(best.total) },
          { label: 'Dont réellement encaissé', value: fcfa(cur.realCollected), tone: 'good' },
        ],
      });
    } else deck.empty(s);
  }

  // ─── Répartitions par source ──────────────────────────────────────
  const donutSlide = (title, subtitle, list, total, centerLabel, mirror) => {
    const s = deck.slide(title, subtitle);
    const items = list.filter((i) => i.value > 0);
    if (!items.length) { deck.empty(s); return; }
    const dw = 5.0, tw = CONTENT_W - dw - 0.5;
    const dx = mirror ? MX + tw + 0.5 : MX, tx = mirror ? MX : MX + dw + 0.5;
    deck.donut(s, { x: dx, y: TOP, w: dw, h: H, items, centerValue: fcfa(total), centerLabel });
    deck.legendTable(s, { x: tx, y: TOP + 0.2, w: tw, items, total, labelHeader: 'Source', format: fcfa });
  };
  donutSlide('Revenu consolidé par source', 'Estimations récurrentes et flux réels de la période', [
    { label: 'Abonnements stations (est.)', value: cur.subscriptionEstimate, color: '2563EB' },
    { label: 'Modules & add-ons (est.)', value: cur.moduleRevenue, color: '6366F1' },
    { label: 'Publicités', value: cur.adsRevenue, color: HEX.amber },
    { label: 'Super User', value: cur.suRevenue, color: 'A855F7' },
    { label: 'Commission lavages en ligne', value: cur.washCommissionRevenue, color: HEX.green },
  ], cur.totalRevenue, 'revenu consolidé', false);
  donutSlide('Revenu réellement encaissé par source', 'Uniquement les paiements datés de la période', [
    { label: 'Renouvellements confirmés', value: cur.renewalRevenue, color: '2563EB' },
    { label: 'Publicités', value: cur.adsRevenue, color: HEX.amber },
    { label: 'Super User', value: cur.suRevenue, color: 'A855F7' },
    { label: 'Commission lavages en ligne', value: cur.washCommissionRevenue, color: HEX.green },
  ], cur.realCollected, 'encaissé réel', true);

  {
    const s = deck.slide('Revenu récurrent estimé par plan', 'Abonnements validés à date (FCFA)');
    const items = Object.entries(cur.planRevenue || {})
      .map(([key, value]) => ({ label: PLANS[key]?.label || key, value: +value || 0 }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value);
    if (items.length) {
      deck.bars(s, { x: MX, y: TOP, w: mainW, h: H, items, color: ACCENT });
      deck.panel(s, {
        x: sideX, y: TOP, w: sideW, h: H,
        items: [
          { label: 'MRR validé à ce jour', value: fcfa(mrrNow) },
          { label: 'Modules (par mois)', value: fcfa(modulesNow) },
          { label: 'Plan le plus rentable', value: items[0].label, sub: fcfa(items[0].value) },
        ],
      });
    } else deck.empty(s);
  }

  // ─── Abonnements et lavages en ligne ──────────────────────────────
  deck.section('Abonnements et lavages');
  {
    const s = deck.slide('Statut des abonnements de stations', 'Instantané à ce jour, toutes stations');
    const items = (statusBreakdown || [])
      .filter((st) => st.count > 0)
      .map((st) => ({ label: st.label, value: st.count, mrr: st.mrr, color: String(st.color || '#64748B').replace('#', '').toUpperCase() }));
    if (items.length) {
      const total = items.reduce((a, b) => a + b.value, 0);
      const dw = 5.0, tw = CONTENT_W - dw - 0.5;
      deck.donut(s, { x: MX, y: TOP, w: dw, h: H, items, centerValue: String(total), centerLabel: total > 1 ? 'stations' : 'station' });
      deck.table(s, {
        x: MX + dw + 0.5, y: TOP + 0.2, w: tw, colW: [0.4, tw - 0.4 - 1.4 - 2.3, 1.4, 2.3],
        header: ['', 'Statut', 'Stations', 'MRR théorique'],
        align: ['center', 'left', 'right', 'right'],
        rows: items.map((i) => [
          { text: '●', options: { color: i.color, fontSize: 16 } },
          i.label,
          String(i.value),
          i.mrr > 0 ? fcfa(i.mrr) : '—',
        ]),
        rowH: 0.44,
      });
    } else deck.empty(s, { label: 'Aucune station inscrite pour le moment.' });
  }
  {
    const s = deck.slide('Lavages payés en ligne', `PayDunya — ${range.label}`);
    const w = (mainW - 0.3) / 2, h = (H - 0.3) / 2;
    [
      { label: 'Paiements en ligne', value: String(cur.washCount), sub: 'factures payées' },
      { label: 'Volume encaissé', value: amount(cur.washGrossVolume), unit: 'FCFA (montant client)' },
      { label: 'Commission plateforme', value: amount(cur.washCommissionRevenue), unit: 'FCFA', delta: deltas.washCommissionRevenue },
      { label: 'Reversé aux stations', value: amount(cur.washStationPayout), unit: 'FCFA (part station)' },
    ].forEach((k, i) => deck.stat(s, { ...k, vs: prevLabel, x: MX + (i % 2) * (w + 0.3), y: TOP + Math.floor(i / 2) * (h + 0.3), w, h }));
    if (cur.washGrossVolume > 0) {
      deck.donut(s, {
        x: sideX, y: TOP, w: sideW, h: H,
        items: [
          { label: 'Commission plateforme', value: cur.washCommissionRevenue, color: ACCENT },
          { label: 'Reversé aux stations', value: cur.washStationPayout, color: HEX.muted },
        ],
        centerValue: `${Math.round((cur.washCommissionRevenue / cur.washGrossVolume) * 100)} %`,
        centerLabel: 'de commission',
      });
    } else deck.empty(s, { x: sideX, w: sideW, label: 'Aucun paiement en ligne.' });
  }

  // ─── Clôture ──────────────────────────────────────────────────────
  deck.section('Clôture');
  deck.closing({
    headline: 'Bilan généré électroniquement',
    lines: [`Bilan de la plateforme — ${periodLabel}`, 'Clean Car Galsen · galsenautocleaner.com'],
  });

  await deck.save(`bilan-plateforme-${fileSlug(range.label)}.pptx`);
}
