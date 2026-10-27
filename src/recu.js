// Page publique /recu.html?v=<id de la vente> : le reçu de paiement d'une vente
// sur place de la boutique, ouvert par le client depuis le lien WhatsApp.
// Même mise en page que le reçu imprimé (src/lib/shopReceipt.js) ; lecture par
// shop_public_receipt (add_shop_public_receipt.sql), sans connexion.
import { supabase } from './lib/supabaseClient';
import { RECEIPT_CSS, receiptSheet, toReceipt } from './lib/shopReceipt';

const root = document.getElementById('root');
const style = document.createElement('style');
style.textContent = RECEIPT_CSS;
document.head.appendChild(style);

function fail(title, text) {
  root.innerHTML = `<div class="state"><h1>${title}</h1><p>${text}</p><p><a href="/">galsenautocleaner.com</a></p></div>`;
}

async function show() {
  const id = new URLSearchParams(window.location.search).get('v') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('Reçu introuvable', 'Le lien est incomplet.');
  const { data, error } = await supabase.rpc('shop_public_receipt', { p_sale_id: id });
  if (error || !data) return fail('Reçu introuvable', 'Ce reçu n’existe pas ou a été supprimé par la station.');

  const r = toReceipt({ ...data, transactions: { client_name: data.client_name } });
  document.title = `Reçu de paiement ${r.ref} — ${data.station?.name || 'Clean Car Galsen'}`;
  root.innerHTML = `<div class="bar">
      <button class="btn" type="button" id="printBtn">Imprimer</button>
      <button class="btn btn--primary" type="button" id="pdfBtn">Enregistrer en PDF</button>
    </div>${receiptSheet(r, data.station)}`;

  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.getElementById('pdfBtn').addEventListener('click', () => {
    if (!window.html2pdf) { window.print(); return; }
    window.html2pdf()
      .set({ margin: 0, filename: `recu-${r.ref}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { format: 'a5' } })
      .from(document.getElementById('receipt'))
      .save();
  });
}

show().catch(() => fail('Reçu indisponible', 'Vérifiez votre connexion puis rechargez la page.'));
