// Reçu d'une vente sur place de la boutique : texte prêt pour WhatsApp, ou
// ticket imprimable (ou enregistrable en PDF). Tout est fait dans le
// navigateur à partir de la vente déjà chargée : rien à stocker en plus.
// Voir src/components/ui/ShopSales.jsx et ShopSaleModal.jsx.

const fcfa = (n) => `${(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;
const formatDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Numéro court lisible à partir de l'identifiant de la vente.
const saleRef = (id) => `V-${String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase()}`;

// Une vente de l'historique (loadShopSales) ou le résultat de recordShopSale,
// ramenés à la même forme.
export function toReceipt(sale, extra = {}) {
  return {
    ref: saleRef(sale.id || sale.sale_id),
    date: sale.created_at || new Date().toISOString(),
    items: (sale.items || []).map((it) => ({
      name: it.name,
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unit_price) || 0,
      amount: Number(it.amount) || (Number(it.unit_price) || 0) * (Number(it.quantity) || 0),
    })),
    amount: sale.amount,
    method: sale.payment_method || extra.method || '',
    client: sale.transactions?.client_name || extra.clientName || '',
    note: sale.note || extra.note || '',
    cancelled: sale.status === 'annulee',
  };
}

const stationLine = (station) => [station?.address, station?.quartier].filter(Boolean).join(', ');

export function receiptText(r, station) {
  return [
    `*${station?.name || 'Boutique'}* — Reçu ${r.ref}`,
    `Date : ${formatDate(r.date)}`,
    ...(r.client ? [`Client : ${r.client}`] : []),
    ...(r.cancelled ? ['VENTE ANNULÉE'] : []),
    '',
    ...r.items.map((it) => `• ${it.name} × ${it.quantity} : ${fcfa(it.amount)}`),
    '',
    `*Total : ${fcfa(r.amount)}*`,
    `Paiement : ${r.method}`,
    ...(r.note ? [`Note : ${r.note}`] : []),
    '',
    `Merci pour votre achat !${station?.phone ? ` ${station.phone}` : ''}`,
  ].join('\n');
}

// WhatsApp s'ouvre avec le reçu rédigé ; la station choisit le contact du client.
export function sendReceiptWhatsApp(r, station) {
  window.open(`https://wa.me/?text=${encodeURIComponent(receiptText(r, station))}`, '_blank', 'noopener');
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Ticket de caisse 80 mm dans une nouvelle fenêtre, impression lancée à l'ouverture.
export function printReceipt(r, station) {
  const win = window.open('', '_blank', 'width=420,height=640');
  if (!win) return;
  const rows = r.items
    .map((it) => `<tr><td>${esc(it.name)}<br><small>${it.quantity} × ${esc(fcfa(it.unitPrice))}</small></td><td class="r">${esc(fcfa(it.amount))}</td></tr>`)
    .join('');
  const place = stationLine(station);
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Reçu ${esc(r.ref)}</title><style>
    body{font-family:system-ui,sans-serif;color:#111;max-width:80mm;margin:0 auto;padding:12px;font-size:13px}
    h1{font-size:18px;margin:0;text-align:center} p{margin:2px 0} .c{text-align:center} .m{color:#555;font-size:12px}
    table{width:100%;border-collapse:collapse;margin:10px 0} td{padding:5px 0;border-bottom:1px dashed #bbb;vertical-align:top} .r{text-align:right;white-space:nowrap}
    .t{display:flex;justify-content:space-between;font-size:16px;font-weight:800;border-top:2px solid #111;padding-top:6px}
    small{color:#555} @media print{@page{margin:6mm}}
  </style></head><body>
    <h1>${esc(station?.name || 'Boutique')}</h1>
    ${place ? `<p class="c m">${esc(place)}</p>` : ''}
    ${station?.phone ? `<p class="c m">Tél. ${esc(station.phone)}</p>` : ''}
    <p class="c" style="margin-top:8px"><b>Reçu ${esc(r.ref)}</b></p>
    <p class="c m">${esc(formatDate(r.date))}${r.client ? ` · ${esc(r.client)}` : ''}</p>
    ${r.cancelled ? '<p class="c" style="color:#b91c1c;font-weight:800">VENTE ANNULÉE</p>' : ''}
    <table>${rows}</table>
    <div class="t"><span>Total</span><span>${esc(fcfa(r.amount))}</span></div>
    <p style="margin-top:6px">Paiement : ${esc(r.method)}</p>
    ${r.note ? `<p class="m">Note : ${esc(r.note)}</p>` : ''}
    <p class="c" style="margin-top:14px">Merci pour votre achat !</p>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`);
  win.document.close();
}
