// Rapport PDF du groupe (Sur mesure > Tableau de bord). Même esprit que le
// Bilan d'une station (lib/bilanPdf.js) : A4 portrait, thème clair, généré
// 100 % côté navigateur avec jsPDF (rendu net et léger, aucune capture d'écran).
import jsPDF from 'jspdf';
import { fcfa, pct } from './bilan';

const BLUE = [37, 99, 235];
const GREEN = [16, 133, 88];
const RED = [200, 50, 50];
const ORANGE = [200, 110, 20];
const DARK = [26, 26, 28];
const GRAY = [110, 110, 115];
const LINE = [223, 223, 228];
const PALE = [238, 243, 254];

const PAGE_W = 210, PAGE_H = 297, MX = 16;
const CONTENT_W = PAGE_W - MX * 2;

const deltaText = (d) => (d == null ? '—' : `${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)} %`);
const deltaColor = (d, invert) => {
  if (d == null || Math.abs(d) < 0.005) return GRAY;
  return (invert ? d < 0 : d > 0) ? GREEN : RED;
};
const num = (v) => (Number.isFinite(+v) ? +v : 0);

export async function downloadGroupReportPdf({
  orgName, periodLabel, filterLabel, cur, prev, deltas, stations, insights,
  byService, byMethod, expenseByCategory, washers,
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MX;

  const ensure = (need) => { if (y + need > PAGE_H - 18) { doc.addPage(); y = MX; } };
  const sectionTitle = (t) => {
    ensure(16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...BLUE);
    doc.text(t.toUpperCase(), MX, y);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(MX, y + 2, PAGE_W - MX, y + 2);
    y += 8;
  };

  // ─── En-tête ───────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...DARK);
  doc.text(orgName, MX, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
  doc.text(`Offre Sur mesure — ${filterLabel}`, MX, y + 10.5);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...BLUE);
  doc.text('RAPPORT DU GROUPE', PAGE_W - MX, y + 4, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text(periodLabel, PAGE_W - MX, y + 9, { align: 'right' });
  doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, PAGE_W - MX, y + 13.5, { align: 'right' });

  y += 18;
  doc.setDrawColor(...BLUE); doc.setLineWidth(0.6); doc.line(MX, y, PAGE_W - MX, y);
  doc.setLineWidth(0.2);
  y += 9;

  // ─── KPI (2 rangées de 3) ──────────────────────────────────────────
  const kpis = [
    { label: 'Chiffre d’affaires', value: fcfa(cur.revenue), d: deltas.revenue },
    { label: 'Lavages', value: String(cur.washes), d: deltas.washes },
    { label: 'Panier moyen', value: fcfa(cur.avgTicket), d: deltas.avgTicket },
    { label: 'Dépenses', value: fcfa(cur.expenses), d: deltas.expenses, invert: true },
    { label: `Résultat net${cur.margin != null ? ` (marge ${pct(cur.margin)})` : ''}`, value: fcfa(cur.net), d: deltas.net },
    { label: `Note moyenne${cur.reviewCount ? ` (${cur.reviewCount} avis)` : ''}`, value: cur.rating != null ? `${cur.rating.toFixed(1)} / 5` : '—', d: null },
  ];
  const kw = (CONTENT_W - 6) / 3;
  kpis.forEach((k, i) => {
    const x = MX + (i % 3) * (kw + 3);
    const yy = y + Math.floor(i / 3) * 25;
    doc.setFillColor(...PALE); doc.roundedRect(x, yy, kw, 22, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(k.label, x + 3, yy + 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...DARK);
    doc.text(String(k.value), x + 3, yy + 12.5);
    if (k.d != null) {
      doc.setFontSize(8); doc.setTextColor(...deltaColor(k.d, k.invert));
      doc.text(`${deltaText(k.d)} vs période préc.`, x + 3, yy + 18.5);
    }
  });
  y += 56;

  // ─── Classement des stations ───────────────────────────────────────
  sectionTitle('Classement des stations');
  const cols = { name: MX + 2, rev: MX + 82, wash: MX + 96, ticket: MX + 118, exp: MX + 140, net: MX + 162, note: PAGE_W - MX - 1 };
  const head = () => {
    doc.setFillColor(...PALE); doc.rect(MX, y, CONTENT_W, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...BLUE);
    doc.text('STATION', cols.name, y + 4.7);
    doc.text('CA', cols.rev, y + 4.7, { align: 'right' });
    doc.text('LAVAGES', cols.wash, y + 4.7, { align: 'right' });
    doc.text('PANIER', cols.ticket, y + 4.7, { align: 'right' });
    doc.text('DÉPENSES', cols.exp, y + 4.7, { align: 'right' });
    doc.text('RÉSULTAT', cols.net, y + 4.7, { align: 'right' });
    doc.text('NOTE', cols.note, y + 4.7, { align: 'right' });
    y += 7;
  };
  head();
  (stations || []).forEach((s, i) => {
    if (y + 9 > PAGE_H - 18) { doc.addPage(); y = MX; head(); }
    if (i % 2) { doc.setFillColor(249, 250, 252); doc.rect(MX, y, CONTENT_W, 8, 'F'); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
    doc.text(doc.splitTextToSize(s.name, 52)[0], cols.name, y + 5.2);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(fcfa(s.revenue), cols.rev, y + 5.2, { align: 'right' });
    doc.text(String(s.washes), cols.wash, y + 5.2, { align: 'right' });
    doc.text(s.avgTicket ? fcfa(s.avgTicket) : '—', cols.ticket, y + 5.2, { align: 'right' });
    doc.text(fcfa(s.expenses), cols.exp, y + 5.2, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...(s.net < 0 ? RED : GREEN));
    doc.text(fcfa(s.net), cols.net, y + 5.2, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK);
    doc.text(s.rating != null ? `${s.rating.toFixed(1)}/5` : '—', cols.note, y + 5.2, { align: 'right' });
    y += 8;
  });
  y += 8;

  // ─── Points d'attention ────────────────────────────────────────────
  if (insights && insights.length) {
    sectionTitle('Points d’attention');
    insights.forEach((it) => {
      const color = it.severity === 'danger' ? RED : it.severity === 'warning' ? ORANGE : GREEN;
      const lines = doc.splitTextToSize(it.text, CONTENT_W - 6);
      ensure(lines.length * 4.2 + 4);
      doc.setFillColor(...color); doc.circle(MX + 1.2, y + 1.6, 1.1, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
      doc.text(lines, MX + 5, y + 2.6);
      y += lines.length * 4.2 + 2.5;
    });
    y += 5;
  }

  // ─── Barres génériques ─────────────────────────────────────────────
  const barBlock = (title, entries, fmt = fcfa) => {
    const list = (entries || []).map((e) => ({ label: e.label, value: num(e.value) })).filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
    // Un petit bloc ne doit pas être coupé entre deux pages : titre et barres restent ensemble.
    ensure(14 + Math.min(Math.max(list.length, 1), 10) * 8);
    sectionTitle(title);
    if (list.length === 0) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...GRAY);
      doc.text('Aucune donnée sur cette période.', MX, y + 2); y += 10; return;
    }
    const max = Math.max(...list.map((e) => e.value));
    const barX = MX + 62, barW = CONTENT_W - 62 - 32;
    list.forEach((e) => {
      ensure(9);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
      doc.text(doc.splitTextToSize(e.label, 58)[0], MX, y + 3.4);
      doc.setFillColor(235, 237, 242); doc.roundedRect(barX, y, barW, 4, 1, 1, 'F');
      doc.setFillColor(...BLUE); doc.roundedRect(barX, y, Math.max(1, (e.value / max) * barW), 4, 1, 1, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(fmt(e.value), PAGE_W - MX, y + 3.4, { align: 'right' });
      y += 8;
    });
    y += 5;
  };

  barBlock('Chiffre d’affaires par service', byService);
  barBlock('Modes de paiement', byMethod);
  barBlock('Dépenses par catégorie', expenseByCategory);
  barBlock(
    'Productivité des laveurs (10 premiers)',
    (washers || []).slice(0, 10).map((w) => ({ label: `${w.name} · ${w.station}`, value: w.washes })),
    (v) => `${v} lavage${v > 1 ? 's' : ''}`,
  );

  // ─── Pied de page ──────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text(`${orgName} — Rapport du groupe — ${periodLabel}`, MX, PAGE_H - 8);
    doc.text(`Page ${p} / ${pages}`, PAGE_W - MX, PAGE_H - 8, { align: 'right' });
  }

  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'groupe';
  doc.save(`rapport-${slug}-${periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.pdf`);
}
