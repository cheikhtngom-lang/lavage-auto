// Reçu d'une vente sur place de la boutique : texte prêt pour WhatsApp, ou
// reçu de paiement à imprimer / enregistrer en PDF, sur le modèle du reçu de
// Depann'Afrik (bandeau, « Émis par », montant payé en grand). Tout est fait
// dans le navigateur à partir de la vente déjà chargée : rien à stocker en plus.
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

// Comme sur Depann'Afrik, le reçu part sur WhatsApp en vrai fichier (image ou
// PDF), pas en texte : il s'ouvre dans sa fenêtre, qui prépare les fichiers
// tout de suite pour que le partage parte directement du clic.
export function sendReceiptWhatsApp(r, station) {
  printReceipt(r, station);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const RECEIPT_CSS = `
  :root { --ink: #16161A; --muted: #6B6B75; --line: #E7E5E0; --accent: #2563EB; --ok: #0E8A55; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #EFEDE8; color: var(--ink); font: 15px/1.5 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .bar { position: sticky; top: 0; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; padding: 12px; background: #0B0D10; z-index: 2; }
  .btn { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: 11px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06); color: #F4F4F5; font: 600 .88rem 'Inter', sans-serif; cursor: pointer; }
  .btn--primary { background: linear-gradient(120deg, #60A5FA, #2563EB 55%, #1E40AF); color: #fff; border-color: transparent; }
  .btn--wa { background: #25D366; color: #0B0D10; border-color: transparent; }
  .btn:disabled { opacity: .5; cursor: wait; }
  .hint { width: 100%; margin: 0; text-align: center; color: #B4B4BD; font-size: .8rem; }
  .sheet { width: min(640px, calc(100% - 24px)); margin: 24px auto 48px; background: #fff; border-radius: 20px; box-shadow: 0 30px 80px -30px rgba(0,0,0,.35); overflow: hidden; }
  .band { height: 8px; background: linear-gradient(90deg, #60A5FA, #2563EB 55%, #1E40AF); }
  .inner { padding: clamp(22px, 5vw, 44px); }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  .kicker { margin: 0; font-size: .74rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  h1 { margin: 4px 0 0; font: 800 1.7rem/1.1 'Bricolage Grotesque', sans-serif; letter-spacing: -.03em; }
  .meta { text-align: right; }
  .meta p { margin: 2px 0; color: var(--muted); }
  .meta strong { color: var(--ink); }
  .paid { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: #E7F8EF; color: var(--ok); font-weight: 700; font-size: .78rem; }
  .paid--off { background: #FDECEC; color: #B91C1C; }
  .issuer { margin: 26px 0 0; padding: 18px 20px; border-radius: 14px; background: #F7F6F2; }
  .issuer strong { display: block; font: 800 1.25rem 'Bricolage Grotesque', sans-serif; letter-spacing: -.02em; }
  .issuer p { margin: 2px 0; color: var(--muted); }
  .issuer .job { color: var(--accent); font-weight: 700; }
  .rows { margin: 24px 0 0; display: grid; gap: 14px; }
  .rows div { display: grid; grid-template-columns: 140px 1fr; gap: 12px; }
  .rows dt { color: var(--muted); font-size: .82rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; padding-top: 2px; }
  .rows dd { margin: 0; font-weight: 600; }
  .items { width: 100%; margin-top: 22px; border-collapse: collapse; }
  .items th { text-align: left; color: var(--muted); font-size: .74rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; padding: 0 0 8px; border-bottom: 1px solid var(--line); }
  .items td { padding: 10px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  .items small { display: block; color: var(--muted); }
  .items .num { text-align: right; white-space: nowrap; font-weight: 600; }
  .total { margin-top: 26px; padding: 20px 22px; border-radius: 16px; background: #0B0D10; color: #fff; }
  .total span { display: block; font-size: .78rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #B4B4BD; }
  .total strong { display: block; margin-top: 4px; font: 800 2.3rem/1.1 'Bricolage Grotesque', sans-serif; letter-spacing: -.03em; color: #34D399; }
  .total--off strong { color: #F87171; text-decoration: line-through; }
  .foot { margin-top: 30px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: .8rem; }
  .foot a { color: var(--accent); font-weight: 600; }
  @media (max-width: 520px) { .meta { text-align: left; } .rows div { grid-template-columns: 1fr; gap: 2px; } }
  @media print { body { background: #fff; } .bar { display: none; } .sheet { box-shadow: none; margin: 0 auto; border-radius: 0; } }
`;

// Reçu de paiement dans une nouvelle fenêtre : envoi sur WhatsApp en image ou
// en PDF, « Imprimer » ou « Enregistrer en PDF » (A5).
export function printReceipt(r, station) {
  const win = window.open('', '_blank');
  if (!win) return;
  const place = stationLine(station);
  const caption = `Reçu ${r.ref} — ${station?.name || 'Boutique'} — ${fcfa(r.amount)}. Merci pour votre achat !`;
  const captionJs = JSON.stringify(caption).replace(/</g, '\\u003c');
  const rows = r.items
    .map((it) => `<tr><td>${esc(it.name)}<small>${it.quantity} × ${esc(fcfa(it.unitPrice))}</small></td><td class="num">${esc(fcfa(it.amount))}</td></tr>`)
    .join('');
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reçu de paiement ${esc(r.ref)} — ${esc(station?.name || 'Boutique')}</title>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${RECEIPT_CSS}</style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js" integrity="sha384-Yv5O+t3uE3hunW8uyrbpPW3iw6/5/Y7HitWJBLgqfMoA36NogMmy+8wWZMpn3HWc" crossorigin="anonymous" referrerpolicy="no-referrer" defer></script>
  </head><body>
  <div class="bar">
    <button class="btn btn--wa" type="button" id="waImg" disabled>WhatsApp (image)</button>
    <button class="btn btn--wa" type="button" id="waPdf" disabled>WhatsApp (PDF)</button>
    <button class="btn" type="button" onclick="window.print()">Imprimer</button>
    <button class="btn btn--primary" type="button" id="pdfBtn">Enregistrer en PDF</button>
    <p class="hint" id="hint">Préparation du reçu…</p>
  </div>
  <article class="sheet" id="receipt">
    <div class="band"></div>
    <div class="inner">
      <header class="head">
        <div>
          <p class="kicker">Reçu de paiement</p>
          <h1>N° ${esc(r.ref)}</h1>
        </div>
        <div class="meta">
          <p>Date : <strong>${esc(formatDate(r.date))}</strong></p>
          <p>${r.cancelled ? '<span class="paid paid--off">Vente annulée</span>' : '<span class="paid">✓ Paiement reçu</span>'}</p>
        </div>
      </header>
      <section class="issuer">
        <p class="kicker">Émis par</p>
        <strong>${esc(station?.name || 'Boutique')}</strong>
        <p class="job">Boutique de la station</p>
        ${place ? `<p>${esc(place)}</p>` : ''}
        ${station?.phone ? `<p>Tél. ${esc(station.phone)}</p>` : ''}
      </section>
      <dl class="rows">
        <div><dt>Reçu de</dt><dd>${esc(r.client || 'Client en station')}</dd></div>
        <div><dt>Payé par</dt><dd>${esc(r.method)}</dd></div>
        ${r.note ? `<div><dt>Note</dt><dd>${esc(r.note)}</dd></div>` : ''}
      </dl>
      <table class="items"><thead><tr><th>Article</th><th class="num">Montant</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="total${r.cancelled ? ' total--off' : ''}"><span>Montant payé</span><strong>${esc(fcfa(r.amount))}</strong></div>
      <p class="foot">Ce reçu a été établi par la station ci-dessus avec l’outil de gestion de <strong>Clean Car Galsen</strong>. Pour toute question sur votre achat, contactez directement la station.<br><a href="https://galsenautocleaner.com">galsenautocleaner.com</a></p>
    </div>
  </article>
  <script>
    var NAME = 'recu-${esc(r.ref)}';
    var TEXT = ${captionJs};
    var opts = { margin: 0, filename: NAME + '.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { format: 'a5' } };
    var files = {};
    var hint = document.getElementById('hint');
    var sheet = function () { return document.getElementById('receipt'); };
    function saveFile(f) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(f); a.download = f.name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    // Image et PDF préparés dès l'ouverture : le partage doit partir directement du clic
    function prepare() {
      if (!window.html2pdf) { setTimeout(prepare, 200); return; }
      window.html2pdf().set(opts).from(sheet()).toCanvas().get('canvas')
        .then(function (c) { return new Promise(function (ok) { c.toBlob(ok, 'image/png'); }); })
        .then(function (png) {
          files.png = new File([png], NAME + '.png', { type: 'image/png' });
          document.getElementById('waImg').disabled = false;
          return window.html2pdf().set(opts).from(sheet()).outputPdf('blob');
        })
        .then(function (pdf) {
          files.pdf = new File([pdf], NAME + '.pdf', { type: 'application/pdf' });
          document.getElementById('waPdf').disabled = false;
          hint.textContent = 'Reçu prêt : choisissez WhatsApp, puis la discussion du client.';
        })
        .catch(function () { hint.textContent = 'Le reçu n’a pas pu être préparé sur cet appareil : utilisez « Imprimer ».'; });
    }
    // Téléphone : feuille de partage (WhatsApp, puis la discussion du client).
    // Ordinateur sans partage de fichiers : le reçu est téléchargé et WhatsApp s'ouvre pour l'y joindre.
    function send(kind) {
      var f = files[kind];
      if (!f) return;
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        navigator.share({ files: [f], text: TEXT }).catch(function (err) { if (!err || err.name !== 'AbortError') fallback(f); });
        return;
      }
      fallback(f);
    }
    function fallback(f) {
      saveFile(f);
      window.open('https://wa.me/?text=' + encodeURIComponent(TEXT), '_blank', 'noopener');
      hint.textContent = 'Reçu téléchargé (' + (f.type === 'application/pdf' ? 'PDF' : 'image') + ') : dans WhatsApp, joignez-le à la discussion avec le trombone.';
    }
    document.getElementById('waImg').addEventListener('click', function () { send('png'); });
    document.getElementById('waPdf').addEventListener('click', function () { send('pdf'); });
    document.getElementById('pdfBtn').addEventListener('click', function () {
      if (files.pdf) { saveFile(files.pdf); return; }
      if (!window.html2pdf) { window.print(); return; }
      window.html2pdf().set(opts).from(sheet()).save();
    });
    window.addEventListener('load', function () { (document.fonts ? document.fonts.ready : Promise.resolve()).then(prepare); });
  </script>
  </body></html>`);
  win.document.close();
}
