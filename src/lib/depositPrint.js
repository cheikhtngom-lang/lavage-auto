// Impression d'un dépôt (rubriques Tapis, Chaussures, Salon, Pressing) :
//  - le ticket remis au client (pièces, prix, avance, reste, date promise,
//    lien de suivi) ;
//  - les étiquettes à coudre ou épingler sur chaque article (pressing) : code
//    « 12-3 » = ticket 12, article 3, pour ne jamais mélanger deux clients.
// Une fenêtre s'ouvre avec la page prête, l'impression part toute seule.
// Format pensé pour une imprimante de tickets 58/80 mm comme pour l'A4.
import { activityConfig, pieceLines, pieceLabel, pieceTag, fcfa, formatPromise, carpetTrackingUrl, amountDue } from './carpets';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

const BASE_CSS = `
  *{box-sizing:border-box} body{margin:0;font:13px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;background:#fff}
  .ticket{width:76mm;margin:0 auto;padding:4mm}
  h1{font-size:15px;margin:0 0 2px} .muted{color:#555} .big{font-size:26px;font-weight:800;letter-spacing:-.02em;margin:6px 0}
  table{width:100%;border-collapse:collapse;margin:8px 0} td{padding:3px 0;vertical-align:top} td.r{text-align:right;white-space:nowrap;padding-left:8px}
  tr.sum td{border-top:1px dashed #999;padding-top:6px;font-weight:700}
  .tag{font-weight:700;font-variant-numeric:tabular-nums;margin-right:4px}
  .url{word-break:break-all;font-size:11px}
  hr{border:0;border-top:1px dashed #999;margin:10px 0}
  .labels{display:flex;flex-wrap:wrap;gap:3mm;padding:4mm}
  .label{width:60mm;height:32mm;border:1px solid #111;border-radius:2mm;padding:2.5mm 3mm;display:flex;flex-direction:column;justify-content:space-between;page-break-inside:avoid;break-inside:avoid}
  .label .code{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
  .label .what{font-size:11px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .label .row{display:flex;justify-content:space-between;gap:2mm;font-size:10px}
  .express{display:inline-block;border:1.5px solid #111;border-radius:1mm;padding:0 1.5mm;font-size:10px;font-weight:800}
  @media print{@page{margin:4mm}}
`;

function ticketHtml(order, stationName) {
  const cfg = activityConfig(order.activity);
  const lines = pieceLines(order.items);
  const due = amountDue(order);
  const home = order.place === 'domicile';
  return `
  <div class="ticket">
    <h1>${esc(stationName || 'Clean Car Galsen')}</h1>
    <div class="muted">${esc(cfg.title)} · ${esc(new Date(order.createdAt || Date.now()).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }))}</div>
    <div class="big">Ticket n° ${esc(order.ticketNo)}${order.express ? ' <span class="express">EXPRESS</span>' : ''}</div>
    <div><strong>${esc(order.clientName)}</strong>${order.clientPhone ? ` · ${esc(order.clientPhone)}` : ''}</div>
    ${home && order.address ? `<div class="muted">${esc(cfg.homeLabel || 'À domicile')} : ${esc(order.address)}</div>` : ''}
    <table>
      ${lines.map((p, i) => `<tr><td>${cfg.labels ? `<span class="tag">${esc(pieceTag(order.ticketNo, i))}</span>` : ''}${esc(pieceLabel(p))}</td><td class="r">${p.price ? esc(fcfa(p.price)) : ''}</td></tr>`).join('')}
      ${order.expressFee > 0 ? `<tr><td>Express</td><td class="r">${esc(fcfa(order.expressFee))}</td></tr>` : ''}
      ${order.travelFee > 0 ? `<tr><td>${esc(cfg.feeLabel || 'Déplacement')}</td><td class="r">${esc(fcfa(order.travelFee))}</td></tr>` : ''}
      ${order.amount > 0 ? `<tr class="sum"><td>Total</td><td class="r">${esc(fcfa(order.amount))}</td></tr>` : ''}
      ${order.amountPaid > 0 && !order.paid ? `<tr><td>Avance payée</td><td class="r">${esc(fcfa(order.amountPaid))}</td></tr><tr><td><strong>Reste à payer</strong></td><td class="r"><strong>${esc(fcfa(due))}</strong></td></tr>` : ''}
      ${order.paid ? '<tr><td colspan="2"><strong>Payé</strong></td></tr>' : ''}
    </table>
    <div>${home && order.activity === 'salon' ? 'Intervention le' : 'Prêt le'} <strong>${esc(formatPromise(order.promisedAt))}</strong></div>
    <hr>
    <div class="muted">Suivez l'avancement :</div>
    <div class="url">${esc(carpetTrackingUrl(order.publicToken))}</div>
    <hr>
    <div class="muted" style="font-size:11px">Présentez ce ticket au retrait. Articles non retirés après 30 jours : contactez la station.</div>
  </div>`;
}

function labelsHtml(order, stationName) {
  const cfg = activityConfig(order.activity);
  const lines = pieceLines(order.items);
  const first = String(order.clientName || '').trim().split(/\s+/)[0] || '';
  return `<div class="labels">${lines.map((p, i) => `
    <div class="label">
      <div class="row"><span class="code">${esc(pieceTag(order.ticketNo, i))}</span>${order.express ? '<span class="express">EXPRESS</span>' : ''}</div>
      <div class="what">${esc(pieceLabel(p))}</div>
      <div class="row"><span>${esc(first)}</span><span>${esc(cfg.nav)} · ${esc(shortDate(order.promisedAt))}</span></div>
      <div class="row muted"><span>${esc(stationName || '')}</span><span>${i + 1}/${lines.length}</span></div>
    </div>`).join('')}</div>`;
}

// what : 'ticket' | 'labels'. Imprime depuis un cadre caché : aucune fenêtre
// à autoriser (les bloqueurs de fenêtres et les tablettes ne gênent pas).
export function printDeposit(order, { stationName, what = 'ticket' } = {}) {
  const body = what === 'labels' ? labelsHtml(order, stationName) : ticketHtml(order, stationName);
  const title = `${what === 'labels' ? 'Étiquettes' : 'Ticket'} n° ${order.ticketNo}`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE_CSS}</style></head><body>${body}</body></html>`;
  try {
    document.getElementById('deposit-print-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'deposit-print-frame';
    frame.title = title;
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); }, 150);
    return true;
  } catch {
    return false; // l'appelant prévient
  }
}
