// Export PDF du Bilan d'activité de la station (page Admin > Bilan, forfait
// Business). Généré 100% côté navigateur avec jsPDF — mise en page "rapport
// d'expert" : A4 portrait, thème clair, en-tête station, bandeau KPI,
// tableau de synthèse comparée, puis une section par rubrique avec un
// mini-graphique vectoriel. Aucune capture d'écran (rendu net et léger).
import jsPDF from 'jspdf';
import { fcfa, pct } from './bilan';

const BLUE = [37, 99, 235];
const GREEN = [16, 133, 88];
const RED = [200, 50, 50];
const DARK = [26, 26, 28];
const GRAY = [110, 110, 115];
const LINE = [223, 223, 228];
const PALE = [238, 243, 254];

const PAGE_W = 210, PAGE_H = 297, MX = 16;
const CONTENT_W = PAGE_W - MX * 2;

function imageFormat(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,/i.exec(dataUrl || '');
  if (!m) return null;
  const e = m[1].toLowerCase();
  return e === 'webp' ? 'WEBP' : e === 'png' ? 'PNG' : 'JPEG';
}
function loadSize(dataUrl) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => res(null);
    img.src = dataUrl;
  });
}
async function fitImage(doc, dataUrl, x, y, box) {
  const fmt = imageFormat(dataUrl);
  if (!fmt) return null;
  const s = await loadSize(dataUrl);
  if (!s || !s.w || !s.h) return null;
  const r = s.w / s.h;
  let w = box, h = box / r;
  if (h > box) { h = box; w = box * r; }
  try { doc.addImage(dataUrl, fmt, x, y, w, h); return { w, h }; } catch { return null; }
}

const deltaText = (d) => (d == null ? '—' : `${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)} %`);
const deltaColor = (d, invert = false) => {
  if (d == null || Math.abs(d) < 0.005) return GRAY;
  const good = invert ? d < 0 : d > 0;
  return good ? GREEN : RED;
};

export async function downloadBilanPdf({ station, bilan }) {
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
  let headTextX = MX;
  if (station.logo) {
    const d = await fitImage(doc, station.logo, MX, y, 16);
    if (d) headTextX = MX + d.w + 4;
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...DARK);
  doc.text(station.name || 'Ma station', headTextX, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
  let ht = y + 10;
  if (station.address) { doc.text(station.address, headTextX, ht); ht += 4; }
  if (station.phone) { doc.text(`Tél : ${station.phone}`, headTextX, ht); ht += 4; }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...BLUE);
  doc.text("BILAN D'ACTIVITÉ", PAGE_W - MX, y + 4, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text(range.label + (partial ? ' (en cours)' : ''), PAGE_W - MX, y + 9, { align: 'right' });
  doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, PAGE_W - MX, y + 13.5, { align: 'right' });

  y = Math.max(ht, y + 16) + 4;
  doc.setDrawColor(...BLUE); doc.setLineWidth(0.6); doc.line(MX, y, PAGE_W - MX, y);
  doc.setLineWidth(0.2);
  y += 9;

  // ─── Bandeau KPI (4 cases) ─────────────────────────────────────────
  const kpis = [
    { label: 'Chiffre d’affaires', value: fcfa(cur.revenue), d: deltas.revenue, invert: false },
    { label: 'Dépenses', value: fcfa(cur.expenseTotal), d: deltas.expenseTotal, invert: true },
    { label: 'Résultat net', value: fcfa(cur.netResult), d: deltas.netResult, invert: false },
    { label: 'Marge nette', value: pct(cur.margin), d: null },
  ];
  const kw = (CONTENT_W - 9) / 4;
  kpis.forEach((k, i) => {
    const x = MX + i * (kw + 3);
    doc.setFillColor(...PALE); doc.roundedRect(x, y, kw, 22, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(k.label, x + 3, y + 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...DARK);
    doc.text(String(k.value), x + 3, y + 12);
    if (k.d != null) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...deltaColor(k.d, k.invert));
      doc.text(`${deltaText(k.d)} vs ${prevLabel}`, x + 3, y + 18);
    }
  });
  y += 30;

  // ─── Synthèse comparée ─────────────────────────────────────────────
  sectionTitle('Synthèse comparée');
  const rows = [
    ['Chiffre d’affaires', fcfa(cur.revenue), fcfa(prev.revenue), deltas.revenue, false],
    ['Dépenses', fcfa(cur.expenseTotal), fcfa(prev.expenseTotal), deltas.expenseTotal, true],
    ['Résultat net', fcfa(cur.netResult), fcfa(prev.netResult), deltas.netResult, false],
    ['Lavages réalisés', String(cur.washCount), String(prev.washCount), deltas.washCount, false],
    ['Transactions', String(cur.txCount), String(prev.txCount), null, false],
    ['Panier moyen', fcfa(cur.avgTicket), fcfa(prev.avgTicket), deltas.avgTicket, false],
    ['Jours d’activité', String(cur.activeDays), String(prev.activeDays), null, false],
  ];
  const c1 = MX, c2 = MX + 78, c3 = MX + 128, c4 = PAGE_W - MX;
  doc.setFillColor(...PALE); doc.rect(MX, y, CONTENT_W, 7, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLUE);
  doc.text('INDICATEUR', c1 + 2, y + 4.7);
  doc.text(range.label.toUpperCase(), c2, y + 4.7);
  doc.text(prevLabel.toUpperCase(), c3, y + 4.7);
  doc.text('ÉVOL.', c4 - 2, y + 4.7, { align: 'right' });
  y += 7;
  rows.forEach(([label, a, b, d, inv], i) => {
    ensure(8);
    if (i % 2) { doc.setFillColor(249, 250, 252); doc.rect(MX, y, CONTENT_W, 7, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
    doc.text(label, c1 + 2, y + 4.8);
    doc.setFont('helvetica', 'bold');
    doc.text(String(a), c2, y + 4.8);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
    doc.text(String(b), c3, y + 4.8);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...deltaColor(d, inv));
    doc.text(deltaText(d), c4 - 2, y + 4.8, { align: 'right' });
    y += 7;
  });
  y += 6;

  // ─── Barres génériques (rubrique) ─────────────────────────────────
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

  const toEntries = (obj) => Object.entries(obj || {}).map(([label, value]) => ({ label, value }));
  barBlock('Chiffre d’affaires par service', toEntries(cur.byService));
  barBlock('Moyens de paiement', toEntries(cur.byMethod));
  barBlock('Types de véhicules lavés', toEntries(cur.washByCategory), (v) => `${v} lavage${v > 1 ? 's' : ''}`);
  barBlock('Postes de dépenses', toEntries(cur.expenseByCategory));

  // ─── Évolution sur la période (mini colonnes CA) ─────────────────
  sectionTitle('Évolution du chiffre d’affaires sur la période');
  if ((trend || []).some((t) => t.revenue > 0 || t.expenses > 0)) {
    const chH = 34, base = y + chH, maxT = Math.max(1, ...trend.map((t) => Math.max(t.revenue, t.expenses)));
    const slot = CONTENT_W / trend.length;
    ensure(chH + 12);
    trend.forEach((t, i) => {
      const cx = MX + i * slot + slot / 2;
      const bw = Math.min(9, slot / 3);
      const hR = (t.revenue / maxT) * chH, hE = (t.expenses / maxT) * chH;
      doc.setFillColor(...BLUE); doc.rect(cx - bw - 1, base - hR, bw, hR, 'F');
      doc.setFillColor(200, 205, 214); doc.rect(cx + 1, base - hE, bw, hE, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
      doc.text(String(t.label), cx, base + 4, { align: 'center' });
    });
    y = base + 8;
    doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text('  Barres foncées : CA   ·   Barres claires : dépenses', MX, y);
    y += 8;
  } else {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text('Aucune donnée sur cette période.', MX, y + 2); y += 10;
  }

  // ─── Productivité des laveurs ───────────────────────────────────
  sectionTitle('Productivité des laveurs');
  if ((cur.washers || []).length) {
    doc.setFillColor(...PALE); doc.rect(MX, y, CONTENT_W, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLUE);
    doc.text('LAVEUR', MX + 2, y + 4.7);
    doc.text('LAVAGES', MX + 110, y + 4.7);
    doc.text('VALEUR TRAITÉE', PAGE_W - MX - 2, y + 4.7, { align: 'right' });
    y += 7;
    cur.washers.slice(0, 12).forEach((w, i) => {
      ensure(7);
      if (i % 2) { doc.setFillColor(249, 250, 252); doc.rect(MX, y, CONTENT_W, 6.5, 'F'); }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
      doc.text(String(w.name), MX + 2, y + 4.4);
      doc.setFont('helvetica', 'bold');
      doc.text(String(w.washes), MX + 110, y + 4.4);
      doc.text(fcfa(w.value), PAGE_W - MX - 2, y + 4.4, { align: 'right' });
      y += 6.5;
    });
    y += 6;
  } else {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text('Aucun lavage assigné à un laveur sur cette période.', MX, y + 2); y += 10;
  }

  // ─── Clients, satisfaction, rythme ─────────────────────────────
  sectionTitle('Clients, satisfaction & rythme d’activité');
  const facts = [
    ['Clients identifiés', String(cur.clients.total)],
    ['dont nouveaux', String(cur.clients.new)],
    ['dont récurrents', String(cur.clients.returning)],
    ['Note moyenne', cur.avgRating != null ? `${cur.avgRating.toFixed(1)} / 5  (${cur.reviewCount} avis)` : `— (${cur.reviewCount} avis)`],
    ['Jour le plus actif', cur.busiestDow ? cur.busiestDow.charAt(0).toUpperCase() + cur.busiestDow.slice(1) : '—'],
    ['Heure de pointe', cur.busiestHour != null ? `${String(cur.busiestHour).padStart(2, '0')}h – ${String(cur.busiestHour + 1).padStart(2, '0')}h` : '—'],
  ];
  facts.forEach(([k, v], i) => {
    ensure(7);
    if (i % 2) { doc.setFillColor(249, 250, 252); doc.rect(MX, y, CONTENT_W, 6.5, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...DARK);
    doc.text(k, MX + 2, y + 4.4);
    doc.setFont('helvetica', 'bold');
    doc.text(v, PAGE_W - MX - 2, y + 4.4, { align: 'right' });
    y += 6.5;
  });
  y += 4;

  if (station.cachet) {
    ensure(28);
    const d = await fitImage(doc, station.cachet, PAGE_W - MX - 24, y, 24);
    if (d) y += d.h;
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

  doc.save(`bilan-${station.slug || 'station'}-${range.label.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
