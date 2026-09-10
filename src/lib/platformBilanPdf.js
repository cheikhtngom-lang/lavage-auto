// Export PDF du Bilan de la plateforme (Super Admin > Bilan) — même mise en
// page "rapport d'expert" que lib/bilanPdf.js (station), adaptée aux données
// Super Admin : revenu réellement encaissé + estimation récurrente, chaque
// source détaillée, statut des abonnements et lavages payés en ligne.
import jsPDF from 'jspdf';
import { fcfa } from './bilan';

const BLUE = [37, 99, 235];
const GREEN = [16, 133, 88];
const RED = [200, 50, 50];
const DARK = [26, 26, 28];
const GRAY = [110, 110, 115];
const LINE = [223, 223, 228];
const PALE = [238, 243, 254];

const PAGE_W = 210, PAGE_H = 297, MX = 16;
const CONTENT_W = PAGE_W - MX * 2;

const deltaText = (d) => (d == null ? '—' : `${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)} %`);
const deltaColor = (d) => {
  if (d == null || Math.abs(d) < 0.005) return GRAY;
  return d > 0 ? GREEN : RED;
};

export async function downloadPlatformBilanPdf({ bilan, mrrNow = 0, modulesNow = 0, statusBreakdown = [] }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const { current: cur, previous: prev, deltas, range, prevLabel, trend, partial } = bilan;
  let y = MX;

  const ensure = (need) => {
    if (y + need > PAGE_H - 18) { doc.addPage(); y = MX; }
  };
  const sectionTitle = (t) => {
    ensure(16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...BLUE);
    doc.text(t.toUpperCase(), MX, y);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(MX, y + 2, PAGE_W - MX, y + 2);
    y += 8;
  };

  // ─── En-tête ───────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...DARK);
  doc.text('Lavage Auto — Plateforme', MX, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
  doc.text('galsenautocleaner.com', MX, y + 10);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...BLUE);
  doc.text('BILAN DE LA PLATEFORME', PAGE_W - MX, y + 4, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text(range.label + (partial ? ' (en cours)' : ''), PAGE_W - MX, y + 9, { align: 'right' });
  doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, PAGE_W - MX, y + 13.5, { align: 'right' });

  y += 16 + 4;
  doc.setDrawColor(...BLUE); doc.setLineWidth(0.6); doc.line(MX, y, PAGE_W - MX, y);
  doc.setLineWidth(0.2);
  y += 9;

  // ─── Bandeau KPI ─────────────────────────────────────────────────
  const kpis = [
    { label: 'Revenu reellement encaisse', value: fcfa(cur.realCollected), d: deltas.realCollected },
    { label: 'Revenu consolide (avec est.)', value: fcfa(cur.totalRevenue), d: deltas.totalRevenue },
    { label: 'Abonnements stations (est.)', value: fcfa(cur.subscriptionEstimate), d: deltas.subscriptionEstimate },
    { label: 'Commission lavages en ligne', value: fcfa(cur.washCommissionRevenue), d: deltas.washCommissionRevenue },
  ];
  const kw = (CONTENT_W - 9) / 4;
  kpis.forEach((k, i) => {
    const x = MX + i * (kw + 3);
    doc.setFillColor(...PALE); doc.roundedRect(x, y, kw, 22, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(k.label, kw - 6)[0], x + 3, y + 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...DARK);
    doc.text(String(k.value), x + 3, y + 12);
    if (k.d != null) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...deltaColor(k.d));
      doc.text(`${deltaText(k.d)} vs ${prevLabel}`, x + 3, y + 18);
    }
  });
  y += 28;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  doc.text(
    `Reel = paiements dates (pubs, Super User, renouvellements confirmes, commission lavages). Abonnements/modules = estimation recurrente. MRR valide a ce jour : ${fcfa(mrrNow)}${modulesNow > 0 ? ` + ${fcfa(modulesNow)} modules` : ''}.`,
    MX, y, { maxWidth: CONTENT_W },
  );
  y += 10;

  // ─── Synthèse comparée ─────────────────────────────────────────────
  sectionTitle('Synthèse comparée');
  const rows = [
    ['Revenu reellement encaisse', fcfa(cur.realCollected), fcfa(prev.realCollected), deltas.realCollected],
    ['Revenu consolide (avec estimation)', fcfa(cur.totalRevenue), fcfa(prev.totalRevenue), deltas.totalRevenue],
    ['Abonnements stations (estimation)', fcfa(cur.subscriptionEstimate), fcfa(prev.subscriptionEstimate), deltas.subscriptionEstimate],
    ['Modules & add-ons (estimation)', fcfa(cur.moduleRevenue), fcfa(prev.moduleRevenue), deltas.moduleRevenue],
    ['Renouvellements confirmes (reel)', fcfa(cur.renewalRevenue), fcfa(prev.renewalRevenue), deltas.renewalRevenue],
    ['Publicites (reel)', fcfa(cur.adsRevenue), fcfa(prev.adsRevenue), deltas.adsRevenue],
    ['Super User (reel)', fcfa(cur.suRevenue), fcfa(prev.suRevenue), deltas.suRevenue],
    ['Commission lavages en ligne (reel)', fcfa(cur.washCommissionRevenue), fcfa(prev.washCommissionRevenue), deltas.washCommissionRevenue],
    ['Nouvelles stations', String(cur.newStations), String(prev.newStations), deltas.newStations],
    ['Nouveaux automobilistes', String(cur.newMotorists), String(prev.newMotorists), deltas.newMotorists],
    ['Abonnements valides (a date)', String(cur.validatedStations), String(prev.validatedStations), null],
    ['Stations actives (a date)', String(cur.activeStations), String(prev.activeStations), null],
  ];
  const c1 = MX, c2 = MX + 82, c3 = MX + 130, c4 = PAGE_W - MX;
  doc.setFillColor(...PALE); doc.rect(MX, y, CONTENT_W, 7, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLUE);
  doc.text('INDICATEUR', c1 + 2, y + 4.7);
  doc.text(range.label.toUpperCase(), c2, y + 4.7);
  doc.text(prevLabel.toUpperCase(), c3, y + 4.7);
  doc.text('EVOL.', c4 - 2, y + 4.7, { align: 'right' });
  y += 7;
  rows.forEach(([label, a, b, d], i) => {
    ensure(8);
    if (i % 2) { doc.setFillColor(249, 250, 252); doc.rect(MX, y, CONTENT_W, 7, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
    doc.text(label, c1 + 2, y + 4.8);
    doc.setFont('helvetica', 'bold');
    doc.text(String(a), c2, y + 4.8);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
    doc.text(String(b), c3, y + 4.8);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...deltaColor(d));
    doc.text(deltaText(d), c4 - 2, y + 4.8, { align: 'right' });
    y += 7;
  });
  y += 6;

  // ─── Blocs de barres ───────────────────────────────────────────────
  const barBlock = (title, entries, fmt = fcfa) => {
    const list = (entries || []).filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
    sectionTitle(title);
    if (list.length === 0) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...GRAY);
      doc.text('Aucune donnée sur cette période.', MX, y + 2); y += 10; return;
    }
    const max = Math.max(...list.map((e) => e.value));
    const barX = MX + 58, barW = CONTENT_W - 58 - 34;
    list.forEach((e) => {
      ensure(9);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
      doc.text(doc.splitTextToSize(e.label, 54)[0], MX, y + 3.4);
      doc.setFillColor(235, 237, 242); doc.roundedRect(barX, y, barW, 4, 1, 1, 'F');
      doc.setFillColor(...BLUE); doc.roundedRect(barX, y, Math.max(1, (e.value / max) * barW), 4, 1, 1, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...DARK);
      doc.text(fmt(e.value), PAGE_W - MX, y + 3.4, { align: 'right' });
      y += 8;
    });
    y += 5;
  };

  barBlock('Revenu consolidé par source (période)', [
    { label: 'Abonnements stations (est.)', value: cur.subscriptionEstimate },
    { label: 'Modules & add-ons (est.)', value: cur.moduleRevenue },
    { label: 'Publicités', value: cur.adsRevenue },
    { label: 'Super User', value: cur.suRevenue },
    { label: 'Commission lavages en ligne', value: cur.washCommissionRevenue },
  ]);
  barBlock('Revenu réellement encaissé par source (période)', [
    { label: 'Renouvellements confirmés', value: cur.renewalRevenue },
    { label: 'Publicités', value: cur.adsRevenue },
    { label: 'Super User', value: cur.suRevenue },
    { label: 'Commission lavages en ligne', value: cur.washCommissionRevenue },
  ]);
  barBlock('Revenu récurrent estimé par plan (à date)', Object.entries(cur.planRevenue || {}).map(([label, value]) => ({ label, value })));

  // ─── Statut des abonnements ────────────────────────────────────────
  if ((statusBreakdown || []).length) {
    sectionTitle('Statut des abonnements de stations (à ce jour)');
    const sc1 = MX, sc2 = MX + 90, sc3 = PAGE_W - MX;
    doc.setFillColor(...PALE); doc.rect(MX, y, CONTENT_W, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLUE);
    doc.text('STATUT', sc1 + 2, y + 4.7);
    doc.text('STATIONS', sc2, y + 4.7);
    doc.text('MRR THEORIQUE', sc3 - 2, y + 4.7, { align: 'right' });
    y += 7;
    statusBreakdown.forEach((s, i) => {
      ensure(7);
      if (i % 2) { doc.setFillColor(249, 250, 252); doc.rect(MX, y, CONTENT_W, 7, 'F'); }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
      doc.text(String(s.label), sc1 + 2, y + 4.8);
      doc.setFont('helvetica', 'bold');
      doc.text(String(s.count), sc2, y + 4.8);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
      doc.text(s.mrr > 0 ? fcfa(s.mrr) : '—', sc3 - 2, y + 4.8, { align: 'right' });
      y += 7;
    });
    y += 6;
  }

  // ─── Lavages payés en ligne ────────────────────────────────────────
  sectionTitle('Lavages payés en ligne (PayDunya) — période');
  const washRows = [
    ['Paiements en ligne', String(cur.washCount)],
    ['Volume encaisse (montant client)', fcfa(cur.washGrossVolume)],
    ['Commission plateforme', fcfa(cur.washCommissionRevenue)],
    ['Reverse aux stations (part station)', fcfa(cur.washStationPayout)],
  ];
  washRows.forEach(([label, val], i) => {
    ensure(7);
    if (i % 2) { doc.setFillColor(249, 250, 252); doc.rect(MX, y, CONTENT_W, 7, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
    doc.text(label, MX + 2, y + 4.8);
    doc.setFont('helvetica', 'bold');
    doc.text(String(val), PAGE_W - MX - 2, y + 4.8, { align: 'right' });
    y += 7;
  });
  y += 6;

  // ─── Évolution du revenu sur la période ─────────────────────────────
  sectionTitle('Évolution du revenu consolidé sur la période');
  if ((trend || []).some((t) => t.total > 0)) {
    const chH = 34, base = y + chH, maxT = Math.max(1, ...trend.map((t) => t.total));
    const slot = CONTENT_W / trend.length;
    ensure(chH + 12);
    trend.forEach((t, i) => {
      const cx = MX + i * slot + slot / 2;
      const bw = Math.min(9, slot / 2.2);
      const hT = (t.total / maxT) * chH;
      doc.setFillColor(...BLUE); doc.rect(cx - bw / 2, base - hT, bw, hT, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
      doc.text(String(t.label), cx, base + 4, { align: 'center' });
    });
    y = base + 8;
  } else {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text('Aucune donnée sur cette période.', MX, y + 2); y += 10;
  }

  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2);
    doc.line(MX, PAGE_H - 14, PAGE_W - MX, PAGE_H - 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text('Bilan généré électroniquement — Clean Car Galsen', MX, PAGE_H - 9);
    doc.text(`Page ${p} / ${total}`, PAGE_W - MX, PAGE_H - 9, { align: 'right' });
  }

  doc.save(`bilan-plateforme-${range.label.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
