// Export PDF du Bilan de la plateforme (Super Admin > Bilan) — même mise en
// page "rapport d'expert" que lib/bilanPdf.js (station), adaptée aux
// données Super Admin (pas de logo/cachet de station, revenus par source
// plutôt que par service/moyen de paiement).
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

export async function downloadPlatformBilanPdf({ bilan }) {
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
    { label: 'Revenu total plateforme', value: fcfa(cur.totalRevenue), d: deltas.totalRevenue },
    { label: 'Abonnements stations (est.)', value: fcfa(cur.stationRevenue), d: deltas.stationRevenue },
    { label: 'Publicités', value: fcfa(cur.adsRevenue), d: deltas.adsRevenue },
    { label: 'Super User', value: fcfa(cur.suRevenue), d: deltas.suRevenue },
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
  y += 30;

  // ─── Synthèse comparée ─────────────────────────────────────────────
  sectionTitle('Synthèse comparée');
  const rows = [
    ['Revenu total plateforme', fcfa(cur.totalRevenue), fcfa(prev.totalRevenue), deltas.totalRevenue],
    ['Abonnements stations (estimation)', fcfa(cur.stationRevenue), fcfa(prev.stationRevenue), deltas.stationRevenue],
    ['Publicités (réel)', fcfa(cur.adsRevenue), fcfa(prev.adsRevenue), deltas.adsRevenue],
    ['Super User (réel)', fcfa(cur.suRevenue), fcfa(prev.suRevenue), deltas.suRevenue],
    ['Nouvelles stations', String(cur.newStations), String(prev.newStations), deltas.newStations],
    ['Nouveaux automobilistes', String(cur.newMotorists), String(prev.newMotorists), deltas.newMotorists],
    ['Stations actives (à date)', String(cur.activeStations), String(prev.activeStations), null],
  ];
  const c1 = MX, c2 = MX + 78, c3 = MX + 128, c4 = PAGE_W - MX;
  doc.setFillColor(...PALE); doc.rect(MX, y, CONTENT_W, 7, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLUE);
  doc.text('INDICATEUR', c1 + 2, y + 4.7);
  doc.text(range.label.toUpperCase(), c2, y + 4.7);
  doc.text(prevLabel.toUpperCase(), c3, y + 4.7);
  doc.text('ÉVOL.', c4 - 2, y + 4.7, { align: 'right' });
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

  // ─── Répartition par plan ───────────────────────────────────────────
  const barBlock = (title, entries, fmt = fcfa) => {
    const list = (entries || []).filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
    sectionTitle(title);
    if (list.length === 0) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...GRAY);
      doc.text('Aucune donnée sur cette période.', MX, y + 2); y += 10; return;
    }
    const max = Math.max(...list.map((e) => e.value));
    const barX = MX + 52, barW = CONTENT_W - 52 - 32;
    list.forEach((e) => {
      ensure(9);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
      doc.text(doc.splitTextToSize(e.label, 48)[0], MX, y + 3.4);
      doc.setFillColor(235, 237, 242); doc.roundedRect(barX, y, barW, 4, 1, 1, 'F');
      doc.setFillColor(...BLUE); doc.roundedRect(barX, y, Math.max(1, (e.value / max) * barW), 4, 1, 1, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...DARK);
      doc.text(fmt(e.value), PAGE_W - MX, y + 3.4, { align: 'right' });
      y += 8;
    });
    y += 5;
  };

  barBlock('Revenu par source (période)', [
    { label: 'Abonnements stations', value: cur.stationRevenue },
    { label: 'Publicités', value: cur.adsRevenue },
    { label: 'Super User', value: cur.suRevenue },
  ]);
  barBlock('Revenu estimé par plan (à date)', Object.entries(cur.planRevenue || {}).map(([label, value]) => ({ label, value })));

  // ─── Évolution du revenu sur la période ─────────────────────────────
  sectionTitle('Évolution du revenu sur la période');
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
