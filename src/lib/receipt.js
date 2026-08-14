// Génère et télécharge un reçu de paiement au format PDF, en local dans le
// navigateur (pas de backend) — utilisé après un paiement Wave/Orange Money
// et depuis "Mes rendez-vous & Reçus" côté automobiliste.
//
// Mise en page façon facture professionnelle (A5) : en-tête station (logo +
// coordonnées) à gauche, bloc "Reçu N°/Date" à droite, tableau des
// prestations, ligne TOTAL mise en évidence, cachet de l'entreprise en pied
// de page si configuré.
import jsPDF from 'jspdf';

const BLUE = [37, 99, 235];   // Tailwind blue-600 — couleur d'accent de l'app
const DARK = [23, 23, 23];
const GRAY = [110, 110, 110];
const LIGHT_GRAY = [225, 225, 225];
const PALE_BLUE = [235, 242, 254];

// Formatage manuel des milliers avec un espace normal — `toLocaleString('fr-FR')`
// insère une espace fine insécable (U+202F) que les polices PDF standards ne
// savent pas dessiner, ce qui casse l'espacement de tout le texte qui suit.
function money(n) {
  const grouped = Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} FCFA`;
}

function imageFormat(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,/i.exec(dataUrl || '');
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return ext === 'webp' ? 'WEBP' : ext === 'png' ? 'PNG' : 'JPEG';
}

function loadImageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Dessine une image dans une boîte carrée `box` (mm) en conservant ses
// proportions. Retourne ses dimensions finales, ou null si absente/invalide
// (le reçu reste utilisable sans logo/cachet).
async function fitImage(doc, dataUrl, x, y, box) {
  const format = imageFormat(dataUrl);
  if (!format) return null;
  const size = await loadImageSize(dataUrl);
  if (!size || !size.width || !size.height) return null;
  const ratio = size.width / size.height;
  let w = box, h = box / ratio;
  if (h > box) { h = box; w = box * ratio; }
  try {
    doc.addImage(dataUrl, format, x, y, w, h);
    return { w, h };
  } catch {
    return null;
  }
}

// `items`: [{ label, service, amount }] — une ligne par véhicule/prestation.
export async function downloadReceiptPdf({
  stationName, stationAddress, stationPhone, stationLogo, stationCachet,
  receiptId, date, client, items = [], method, total,
}) {
  const pageW = 148, pageH = 210; // A5 portrait — plus de place qu'un ticket, rendu plus soigné
  const marginX = 14;
  const contentW = pageW - marginX * 2;
  const doc = new jsPDF({ unit: 'mm', format: [pageW, pageH] });

  // ─── En-tête : logo + station à gauche, "Reçu N°/Date" à droite ───────────
  let leftY = marginX;
  let logoDims = null;
  if (stationLogo) {
    logoDims = await fitImage(doc, stationLogo, marginX, leftY, 14);
  }
  const textX = logoDims ? marginX + logoDims.w + 4 : marginX;
  let textY = leftY + 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...DARK);
  doc.text(stationName || 'Ma Station', textX, textY);
  textY += 5.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  if (stationAddress) { doc.text(stationAddress, textX, textY); textY += 4.5; }
  if (stationPhone) { doc.text(`Tel: ${stationPhone}`, textX, textY); textY += 4.5; }

  const rightX = pageW - marginX;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BLUE);
  doc.text('REÇU DE PAIEMENT', rightX, marginX + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text(`N° ${receiptId ?? '—'}`, rightX, marginX + 10.5, { align: 'right' });
  doc.setTextColor(...GRAY);
  doc.text(String(date ?? '—'), rightX, marginX + 15, { align: 'right' });

  let y = Math.max(textY, marginX + 20) + 6;
  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, pageW - marginX, y);
  doc.setLineWidth(0.2);
  y += 10;

  // ─── Bloc client ────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  doc.text('CLIENT', marginX, y);
  doc.text('PAIEMENT', rightX, y, { align: 'right' });
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(String(client ?? '—'), marginX, y);
  doc.text(String(method || 'Payé'), rightX, y, { align: 'right' });
  y += 10;

  // ─── Tableau des prestations ────────────────────────────────────────────
  const amountColW = 34;
  const descColW = contentW - amountColW;

  doc.setFillColor(...PALE_BLUE);
  doc.rect(marginX, y, contentW, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...BLUE);
  doc.text('DESCRIPTION', marginX + 3, y + 5.5);
  doc.text('MONTANT', pageW - marginX - 3, y + 5.5, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  items.forEach((item) => {
    const label = item.service ? `${item.label}` : (item.label || '');
    const lines = doc.splitTextToSize(label, descColW - 6);
    const serviceLines = item.service ? doc.splitTextToSize(item.service, descColW - 6) : [];
    const rowLines = lines.length + serviceLines.length;
    const rowH = Math.max(10, rowLines * 4.6 + 3);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(lines, marginX + 3, y + 5.5);
    if (serviceLines.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...GRAY);
      doc.text(serviceLines, marginX + 3, y + 5.5 + lines.length * 4.6);
      doc.setFontSize(10);
    }
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(money(item.amount), pageW - marginX - 3, y + 5.5, { align: 'right' });

    y += rowH;
    doc.setDrawColor(...LIGHT_GRAY);
    doc.line(marginX, y, pageW - marginX, y);
    y += 4;
  });

  y += 2;
  doc.setFillColor(...DARK);
  doc.rect(marginX, y, contentW, 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL', marginX + 4, y + 8);
  doc.text(money(total), pageW - marginX - 4, y + 8, { align: 'right' });
  y += 12 + 14;

  // ─── Pied de page : cachet + remerciements ─────────────────────────────
  if (stationCachet) {
    const dims = await fitImage(doc, stationCachet, pageW - marginX - 24, y, 24);
    if (dims) y += dims.h + 4;
  }

  doc.setDrawColor(...LIGHT_GRAY);
  doc.line(marginX, pageH - 22, pageW - marginX, pageH - 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text('Merci de votre confiance !', pageW / 2, pageH - 15, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text('Reçu généré électroniquement', pageW / 2, pageH - 10, { align: 'center' });

  doc.save(`recu-${receiptId || Date.now()}.pdf`);
}
