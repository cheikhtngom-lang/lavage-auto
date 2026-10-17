// Export PowerPoint du Bilan d'activité de la station (page Admin > Bilan,
// offre Station de service ou module Bilan). Une diapo par rubrique, mêmes
// chiffres que la page : synthèse comparée à la période précédente, évolution,
// répartitions, laveurs, clients, fréquence des réservations et 2 derniers
// mois complets. Mise en page et thème communs : lib/pptxDeck.js.
import { fcfa, pct, DOW_FR_SHORT } from './bilan';
import { PRICING_CATEGORY_LABELS } from './vehicleBrands';
import { createDeck, loadImage, nb, fileSlug, MX, CONTENT_W, TOP, BOTTOM, HEX } from './pptxDeck';

const PALETTE = ['2563EB', '10B981', 'F59E0B', '8B5CF6', '06B6D4', 'EC4899', '64748B', 'EF4444', '84CC16', '0EA5E9'];
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');
const hourRange = (h) => (h == null ? '—' : `${String(h).padStart(2, '0')}h – ${String(h + 1).padStart(2, '0')}h`);

// Les rubriques « par service », « par moyen de paiement »… : triées, 9 lignes
// au plus, le reste regroupé dans « Autres ».
function entries(obj, labels = {}) {
  const list = Object.entries(obj || {})
    .map(([key, value]) => ({ label: labels[key] || key, value: +value || 0 }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
  if (list.length <= 9) return list;
  const rest = list.slice(8).reduce((s, e) => s + e.value, 0);
  return [...list.slice(0, 8), { label: 'Autres', value: rest }];
}
const colored = (list, offset = 0) => list.map((e, i) => ({ ...e, color: PALETTE[(i + offset) % PALETTE.length] }));

export async function downloadBilanPptx({ station, bilan, lastTwoMonths }) {
  const { current: cur, previous: prev, deltas, range, prevLabel, trend, partial } = bilan;
  const stationName = station.name || 'Ma station';
  const periodLabel = range.label + (partial ? ' (en cours)' : '');
  const [logo, stamp] = await Promise.all([loadImage(station.logo), loadImage(station.cachet)]);

  const deck = await createDeck({
    accent: '2563EB',
    title: `Bilan d'activité — ${stationName} — ${range.label}`,
    footer: `Bilan d'activité · ${stationName} · ${periodLabel}`,
  });
  const sideW = 3.4, sideX = MX + CONTENT_W - sideW, mainW = CONTENT_W - sideW - 0.4;
  const H = BOTTOM - TOP;
  const bucket = range.type === 'mensuel' ? 'semaine' : 'mois';
  // Libellés lisibles : « 1–7 oct. » pour les semaines, « juil. » / « Juillet » pour les mois.
  const monthOf = (i, month) => new Date(range.start.getFullYear(), range.start.getMonth() + i, 1).toLocaleDateString('fr-FR', { month });
  const bucketLabel = (l, i) => (bucket === 'semaine' ? `${l} ${monthOf(0, 'short')}` : monthOf(i, 'short'));
  const bucketName = (l, i) => (bucket === 'semaine' ? `Du ${l.replace('–', ' au ')} ${monthOf(0, 'long')}` : cap(monthOf(i, 'long')));

  // ─── Couverture ───────────────────────────────────────────────────
  deck.section('Synthèse');
  deck.cover({
    kicker: "BILAN D'ACTIVITÉ",
    name: stationName,
    period: periodLabel,
    lines: [station.address, station.phone ? `Tél : ${station.phone}` : null],
    logo,
  });

  // ─── Indicateurs clés ─────────────────────────────────────────────
  {
    const s = deck.slide('Indicateurs clés', `${periodLabel} comparé à ${prevLabel}${partial ? ' — période en cours, les chiffres évoluent jusqu’à la fin' : ''}`);
    const w = (CONTENT_W - 0.9) / 4;
    [
      { label: 'Chiffre d’affaires', value: fcfa(cur.revenue).replace(' FCFA', ''), unit: 'FCFA', delta: deltas.revenue },
      { label: 'Dépenses', value: fcfa(cur.expenseTotal).replace(' FCFA', ''), unit: 'FCFA', delta: deltas.expenseTotal, invert: true },
      { label: 'Résultat net', value: fcfa(cur.netResult).replace(' FCFA', ''), unit: 'FCFA', delta: deltas.netResult },
      { label: 'Marge nette', value: pct(cur.margin), unit: 'du chiffre d’affaires' },
    ].forEach((k, i) => deck.stat(s, { ...k, x: MX + i * (w + 0.3), y: TOP, w, h: 2.45, vs: prevLabel }));
    [
      { label: 'Lavages réalisés', value: String(cur.washCount), delta: deltas.washCount },
      { label: 'Transactions', value: String(cur.txCount) },
      { label: 'Panier moyen', value: fcfa(cur.avgTicket), delta: deltas.avgTicket },
      { label: 'Jours d’activité', value: String(cur.activeDays) },
    ].forEach((k, i) => deck.stat(s, { ...k, x: MX + i * (w + 0.3), y: TOP + 2.75, w, h: 1.95, size: 'sm', vs: prevLabel }));
  }

  // ─── Synthèse comparée ────────────────────────────────────────────
  {
    const s = deck.slide('Synthèse comparée', `${range.label} face à ${prevLabel}`);
    const rows = [
      ['Chiffre d’affaires', fcfa(cur.revenue), fcfa(prev.revenue), deltas.revenue, false],
      ['Dépenses', fcfa(cur.expenseTotal), fcfa(prev.expenseTotal), deltas.expenseTotal, true],
      ['Résultat net', fcfa(cur.netResult), fcfa(prev.netResult), deltas.netResult, false],
      ['Lavages réalisés', String(cur.washCount), String(prev.washCount), deltas.washCount, false],
      ['Transactions', String(cur.txCount), String(prev.txCount), null, false],
      ['Panier moyen', fcfa(cur.avgTicket), fcfa(prev.avgTicket), deltas.avgTicket, false],
      ['Jours d’activité', String(cur.activeDays), String(prev.activeDays), null, false],
    ];
    const toneHex = (d, inv) => {
      if (d == null || Math.abs(d) < 0.005) return HEX.muted;
      return (inv ? d < 0 : d > 0) ? HEX.good : HEX.bad;
    };
    const tw = 7.7;
    deck.table(s, {
      w: tw, colW: [2.75, 1.85, 1.85, 1.25],
      header: ['Indicateur', range.label, prevLabel, 'Évolution'],
      align: ['left', 'right', 'right', 'right'],
      rows: rows.map(([label, a, b, d, inv]) => [
        label,
        { text: nb(a), options: { bold: true } },
        { text: nb(b), options: { color: HEX.muted } },
        { text: d == null ? '—' : nb(`${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)} %`), options: { bold: true, color: toneHex(d, inv) } },
      ]),
      fontSize: 14, rowH: 0.52,
    });
    const cmpValues = [cur.revenue, cur.expenseTotal, cur.netResult, prev.revenue, prev.expenseTotal, prev.netResult];
    if (cmpValues.every((v) => !v)) deck.empty(s, { x: MX + tw + 0.4, w: CONTENT_W - tw - 0.4 });
    else deck.chart(s, 'BAR', [
      { name: range.label, labels: ['CA', 'Dépenses', 'Résultat'], values: [cur.revenue, cur.expenseTotal, cur.netResult] },
      { name: prevLabel, labels: ['CA', 'Dépenses', 'Résultat'], values: [prev.revenue, prev.expenseTotal, prev.netResult] },
    ], {
      x: MX + tw + 0.4, y: TOP, w: CONTENT_W - tw - 0.4, h: H, barDir: 'col', barGrouping: 'clustered',
      chartColors: ['2563EB', HEX.gray], showLegend: true, legendPos: 'b',
      valAxisLabelFormatCode: '#,##0," k"', barGapWidthPct: 70,
    });
  }

  // ─── Évolution sur la période ─────────────────────────────────────
  deck.section('Activité');
  {
    const s = deck.slide('Évolution sur la période', `Chiffre d’affaires, dépenses et résultat net par ${bucket} (FCFA)`);
    if ((trend || []).some((t) => t.revenue > 0 || t.expenses > 0)) {
      const labels = trend.map((t, i) => bucketLabel(t.label, i));
      deck.chart(s, 'LINE', [
        { name: 'Chiffre d’affaires', labels, values: trend.map((t) => t.revenue) },
        { name: 'Dépenses', labels, values: trend.map((t) => t.expenses) },
        { name: 'Résultat net', labels, values: trend.map((t) => t.net) },
      ], {
        x: MX, y: TOP, w: mainW, h: H, chartColors: [HEX.green, HEX.amber, '2563EB'],
        lineSize: 2.5, lineDataSymbol: 'circle', lineDataSymbolSize: 7,
        showLegend: true, legendPos: 't', valAxisLabelFormatCode: '#,##0," k"',
      });
      const bestIdx = trend.reduce((bi, t, i) => (t.revenue > trend[bi].revenue ? i : bi), 0);
      const best = trend[bestIdx];
      const withRevenue = trend.filter((t) => t.revenue > 0);
      deck.panel(s, {
        x: sideX, y: TOP, w: sideW, h: H,
        items: [
          { label: `Meilleur${bucket === 'semaine' ? 'e semaine' : ' mois'}`, value: bucketName(best.label, bestIdx), sub: fcfa(best.revenue) },
          { label: `CA moyen par ${bucket} ${bucket === 'semaine' ? 'active' : 'actif'}`, value: fcfa(withRevenue.length ? cur.revenue / withRevenue.length : 0) },
          { label: 'Résultat net de la période', value: fcfa(cur.netResult), tone: cur.netResult >= 0 ? 'good' : 'bad' },
        ],
      });
    } else deck.empty(s);
  }

  // ─── Répartitions (anneau + tableau) ──────────────────────────────
  const donutSlide = (title, subtitle, list, total, centerLabel, mirror, labelHeader) => {
    const s = deck.slide(title, subtitle);
    if (!list.length) { deck.empty(s); return; }
    const dw = 5.0, tw = CONTENT_W - dw - 0.5;
    const dx = mirror ? MX + tw + 0.5 : MX, tx = mirror ? MX : MX + dw + 0.5;
    deck.donut(s, { x: dx, y: TOP, w: dw, h: H, items: list, centerValue: fcfa(total), centerLabel });
    deck.legendTable(s, { x: tx, y: TOP + 0.2, w: tw, items: list, total, labelHeader, format: fcfa });
  };
  donutSlide('Chiffre d’affaires par service', `${plural(cur.txCount, 'transaction')} sur la période`, colored(entries(cur.byService)), cur.revenue, 'CA total', false, 'Service');
  donutSlide('Moyens de paiement', 'Montants encaissés par moyen de paiement', colored(entries(cur.byMethod), 2), cur.revenue, 'encaissé', true, 'Moyen de paiement');

  // ─── Barres + encadré ─────────────────────────────────────────────
  {
    const list = entries(cur.washByCategory, PRICING_CATEGORY_LABELS);
    const s = deck.slide('Types de véhicules lavés', `${plural(cur.washCount, 'lavage')} terminé${cur.washCount > 1 ? 's' : ''} sur la période`);
    if (list.length) {
      deck.bars(s, { x: MX, y: TOP, w: mainW, h: H, items: list, color: '2563EB' });
      const top = list[0];
      deck.panel(s, {
        x: sideX, y: TOP, w: sideW, h: H,
        items: [
          { label: 'Lavages terminés', value: String(cur.washCount) },
          { label: 'Catégorie principale', value: top.label, sub: `${cur.washCount > 0 ? Math.round((top.value / cur.washCount) * 100) : 0} % des lavages` },
          { label: 'Catégories lavées', value: String(list.length) },
        ],
      });
    } else deck.empty(s);
  }
  {
    const list = entries(cur.expenseByCategory);
    const s = deck.slide('Postes de dépenses', `${fcfa(cur.expenseTotal)} de dépenses sur la période, par poste`);
    if (list.length) {
      deck.bars(s, { x: MX, y: TOP, w: mainW, h: H, items: list, color: HEX.amber });
      deck.panel(s, {
        x: sideX, y: TOP, w: sideW, h: H,
        items: [
          { label: 'Total des dépenses', value: fcfa(cur.expenseTotal) },
          { label: 'Premier poste', value: list[0].label, sub: fcfa(list[0].value) },
          { label: 'Part du chiffre d’affaires', value: cur.revenue > 0 ? pct(cur.expenseTotal / cur.revenue) : '—' },
        ],
      });
    } else deck.empty(s);
  }

  // ─── Laveurs ──────────────────────────────────────────────────────
  deck.section('Équipe et clients');
  {
    const s = deck.slide('Productivité des laveurs', 'Lavages réalisés et valeur traitée sur la période');
    const washers = (cur.washers || []).slice(0, 10);
    if (washers.length) {
      const cw = 5.4;
      deck.bars(s, { x: MX, y: TOP, w: cw, h: H, items: washers.slice(0, 8).map((w) => ({ label: w.name, value: w.washes })), color: HEX.violet });
      deck.table(s, {
        x: MX + cw + 0.4, y: TOP, w: CONTENT_W - cw - 0.4, colW: [0.55, 3.1, 1.25, CONTENT_W - cw - 0.4 - 4.9],
        header: ['#', 'Laveur', 'Lavages', 'Valeur traitée'],
        align: ['left', 'left', 'right', 'right'],
        rows: washers.map((w, i) => [String(i + 1), w.name, String(w.washes), fcfa(w.value)]),
        fontSize: 13, rowH: 0.42,
      });
    } else deck.empty(s, { label: 'Aucun lavage assigné à un laveur sur cette période.' });
  }

  // ─── Clients, satisfaction & rythme ───────────────────────────────
  {
    const s = deck.slide('Clients, satisfaction et rythme d’activité', 'Comptes automobilistes liés, avis clients et moments forts de la période');
    const w = (CONTENT_W - 0.9) / 4, h = 2.25;
    const ratingDelta = prev.avgRating != null && cur.avgRating != null ? (cur.avgRating - prev.avgRating) / prev.avgRating : null;
    [
      { label: 'Clients identifiés', value: String(cur.clients.total) },
      { label: 'Nouveaux clients', value: String(cur.clients.new) },
      { label: 'Clients récurrents', value: String(cur.clients.returning) },
      { label: 'Taux de récurrence', value: cur.clients.total > 0 ? `${Math.round((cur.clients.returning / cur.clients.total) * 100)} %` : '—' },
      { label: 'Note moyenne', value: cur.avgRating != null ? `${cur.avgRating.toFixed(1).replace('.', ',')} / 5` : '—', sub: `${cur.reviewCount} avis`, delta: ratingDelta },
      { label: 'Jour le plus actif', value: cap(cur.busiestDow) },
      { label: 'Heure de pointe', value: hourRange(cur.busiestHour) },
      { label: 'Avis reçus', value: String(cur.reviewCount) },
    ].forEach((k, i) => deck.stat(s, {
      ...k, size: 'sm', vs: prevLabel,
      x: MX + (i % 4) * (w + 0.3), y: TOP + Math.floor(i / 4) * (h + 0.3), w, h,
    }));
  }

  // ─── Fréquence des réservations ───────────────────────────────────
  {
    const s = deck.slide('Réservations par jour de semaine', 'Lavages terminés sur la période, du lundi au dimanche');
    const order = [1, 2, 3, 4, 5, 6, 0];
    const items = order.map((i) => ({ label: DOW_FR_SHORT[i], value: cur.dowCounts[i] || 0 }));
    if (items.some((i) => i.value > 0)) {
      deck.bars(s, { x: MX, y: TOP, w: mainW, h: H, items, color: HEX.cyan, horizontal: false, labelSize: 13 });
      const total = items.reduce((a, b) => a + b.value, 0);
      const weekend = (cur.dowCounts[6] || 0) + (cur.dowCounts[0] || 0);
      deck.panel(s, {
        x: sideX, y: TOP, w: sideW, h: H,
        items: [
          { label: 'Jour le plus actif', value: cap(cur.busiestDow), sub: plural(Math.max(...items.map((i) => i.value)), 'lavage') },
          { label: 'Moyenne par jour de semaine', value: (total / 7).toFixed(1).replace('.', ','), sub: 'lavages' },
          { label: 'Part du week-end', value: total > 0 ? `${Math.round((weekend / total) * 100)} %` : '—', sub: 'samedi et dimanche' },
        ],
      });
    } else deck.empty(s);
  }
  {
    const s = deck.slide('Réservations par heure de la journée', 'Répartition des lavages terminés de 0h à 23h');
    const items = cur.hourCounts.map((value, h) => ({ label: `${h}h`, value: value || 0 }));
    if (items.some((i) => i.value > 0)) {
      deck.bars(s, { x: MX, y: TOP, w: mainW, h: H, items, color: HEX.cyan, horizontal: false, labelSize: 10 });
      const total = items.reduce((a, b) => a + b.value, 0);
      const morning = cur.hourCounts.slice(0, 12).reduce((a, b) => a + (b || 0), 0);
      deck.panel(s, {
        x: sideX, y: TOP, w: sideW, h: H,
        items: [
          { label: 'Heure de pointe', value: hourRange(cur.busiestHour) },
          { label: 'Avant midi', value: total > 0 ? `${Math.round((morning / total) * 100)} %` : '—', sub: 'des lavages' },
          { label: 'À partir de midi', value: total > 0 ? `${Math.round(((total - morning) / total) * 100)} %` : '—', sub: 'des lavages' },
        ],
      });
    } else deck.empty(s);
  }

  // ─── 2 derniers mois complets (fixe, indépendant de la période choisie) ─
  if (lastTwoMonths?.months?.length === 2) {
    const [mOlder, mRecent] = lastTwoMonths.months;
    deck.section('Mois complets');
    const s = deck.slide('2 derniers mois complets', `${mOlder.label} et ${mRecent.label} — le mois en cours n’est jamais inclus, ses chiffres sont partiels`);
    const labels = ['CA', 'Dépenses', 'Résultat'];
    const monthValues = [mOlder.revenue, mOlder.expenseTotal, mOlder.netResult, mRecent.revenue, mRecent.expenseTotal, mRecent.netResult];
    if (monthValues.every((v) => !v)) deck.empty(s, { w: mainW, label: 'Aucune activité sur ces deux mois.' });
    else deck.chart(s, 'BAR', [
      { name: mOlder.label, labels, values: [mOlder.revenue, mOlder.expenseTotal, mOlder.netResult] },
      { name: mRecent.label, labels, values: [mRecent.revenue, mRecent.expenseTotal, mRecent.netResult] },
    ], {
      x: MX, y: TOP, w: mainW, h: H, barDir: 'col', barGrouping: 'clustered',
      chartColors: [HEX.gray, '2563EB'], showLegend: true, legendPos: 't',
      showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '#,##0',
      valAxisHidden: true, valGridLine: { style: 'none' }, barGapWidthPct: 70,
    });
    const washDelta = mOlder.washCount > 0 ? (mRecent.washCount - mOlder.washCount) / mOlder.washCount : null;
    deck.panel(s, {
      x: sideX, y: TOP, w: sideW, h: H,
      items: [
        { label: `Lavages — ${mOlder.label}`, value: String(mOlder.washCount) },
        { label: `Lavages — ${mRecent.label}`, value: String(mRecent.washCount), sub: washDelta == null ? null : `${washDelta >= 0 ? '+' : ''}${(washDelta * 100).toFixed(0)} % sur un mois` },
        { label: `Résultat net — ${mRecent.label}`, value: fcfa(mRecent.netResult), tone: mRecent.netResult >= 0 ? 'good' : 'bad' },
      ],
    });
  }

  // ─── Clôture ──────────────────────────────────────────────────────
  deck.section('Clôture');
  deck.closing({
    headline: 'Bilan généré électroniquement',
    lines: [`${stationName} — ${periodLabel}`, 'Clean Car Galsen · galsenautocleaner.com'],
    stamp,
    stampCaption: 'Cachet de la station',
  });

  await deck.save(`bilan-${station.slug || fileSlug(stationName) || 'station'}-${fileSlug(range.label)}.pptx`);
}
