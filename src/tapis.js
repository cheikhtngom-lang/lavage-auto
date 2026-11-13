// Page publique /tapis.html?t=<jeton> : le lien de suivi que la station
// envoie au client sur WhatsApp quand il dépose ses tapis ou ses chaussures
// (add_shoe_cleaning.sql). Sans connexion, le client voit l'étape en cours et
// la date promise ; le bouton principal l'amène à l'inscription (ou à la
// connexion), puis dans « Mes dépôts » où le
// dépôt est rattaché à son compte (carpet_claim). Lecture par
// carpet_public_status (add_carpet_cleaning.sql). La page se relit seule
// toutes les minutes et au retour sur l'onglet.
import { supabase } from './lib/supabaseClient';
import { stepsFor, stepIndex, fcfa, formatPromise, timeLeftLabel, rememberCarpetClaim, pieceLines, pieceLabel, workHours, totalWeight, formatKg } from './lib/carpets';

const root = document.getElementById('root');
const token = new URLSearchParams(window.location.search).get('t') || '';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  nav: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:1px"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;margin-top:1px"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
};

// Libellés selon l'activité du dépôt : « tapis » (masculin) ou « chaussures » (féminin).
const WORDS = {
  tapis: {
    things: 'tapis', ready: 'Prêts', back: 'Récupérés', wait: 'vos tapis vous attendent', piecesLabel: 'Pièces déposées',
    titles: {
      depose: 'Vos tapis sont bien reçus', lavage: 'Vos tapis sont en lavage', sechage: 'Vos tapis sèchent',
      pret: 'Vos tapis sont prêts', recupere: 'Vos tapis ont été récupérés', annule: 'Ce dépôt a été annulé',
    },
  },
  chaussures: {
    things: 'chaussures', ready: 'Prêtes', back: 'Récupérées', wait: 'vos chaussures vous attendent', piecesLabel: 'Paires déposées',
    titles: {
      depose: 'Vos chaussures sont bien reçues', lavage: 'Vos chaussures sont en lavage', sechage: 'Vos chaussures sèchent',
      pret: 'Vos chaussures sont prêtes', recupere: 'Vos chaussures ont été récupérées', annule: 'Ce dépôt a été annulé',
    },
  },
  salon: {
    things: 'meubles', ready: 'Prêts', back: 'Récupérés', wait: 'vos meubles vous attendent', piecesLabel: 'Pièces à nettoyer',
    titles: {
      depose: 'Votre demande est enregistrée', lavage: 'Nettoyage en cours', sechage: 'Vos meubles sèchent',
      pret: 'Vos meubles sont prêts', recupere: 'Nettoyage terminé', annule: 'Ce dépôt a été annulé',
    },
  },
  pressing: {
    things: 'vêtements', ready: 'Prêts', back: 'Retirés', wait: 'vos vêtements vous attendent', piecesLabel: 'Articles déposés',
    titles: {
      depose: 'Vos vêtements sont bien reçus', lavage: 'Vos vêtements sont au nettoyage', sechage: 'Vos vêtements sont au repassage',
      pret: 'Vos vêtements sont prêts', recupere: 'Vos vêtements ont été retirés', annule: 'Ce dépôt a été annulé',
    },
  },
};

const fmtTime = (t) => { const [h, m] = String(t).split(':'); return `${parseInt(h, 10)} h${m && m !== '00' ? ` ${m}` : ''}`; };
const telHref = (phone) => {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 9 && /^[73]/.test(d)) d = `221${d}`;
  return `tel:+${d}`;
};
const mapsHref = (st) => {
  if (st.lat && st.lng) return `https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}`;
  const q = [st.name, st.address, st.quartier].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
};

function fail(title, text) {
  root.innerHTML = `<div class="card state"><h1>${esc(title)}</h1><p class="muted">${esc(text)}</p><p class="small"><a href="/">galsenautocleaner.com</a></p></div>`;
}

// Compte automobiliste déjà connecté sur ce téléphone ?
async function signedInMotorist() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;
    const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    return data?.role === 'automobiliste';
  } catch { return false; }
}

function render(d, signedIn) {
  const st = d.station || {};
  const status = d.status;
  const ready = status === 'pret';
  const finished = status === 'recupere' || status === 'annule';
  const late = ['depose', 'lavage', 'sechage'].includes(status) && new Date(d.promised_at) < new Date();
  const idx = stepIndex(status);
  const w = WORDS[d.activity] || WORDS.tapis;
  const delivery = d.place === 'domicile' && d.activity === 'pressing';
  const homeVisit = d.place === 'domicile' && d.activity === 'salon';
  let title = w.titles[status] || `Suivi de vos ${w.things}`;
  if (delivery && status === 'pret') title = 'Vos vêtements sont prêts, livraison en route';
  if (delivery && status === 'recupere') title = 'Vos vêtements ont été livrés';
  document.title = `${title} — ${st.name || 'Clean Car Galsen'}`;

  const lead = homeVisit && ['depose', 'lavage', 'sechage'].includes(status)
    ? `Intervention prévue le <strong>${esc(formatPromise(d.promised_at))}</strong>.`
    : ready && delivery
    ? `${w.ready} depuis le <strong>${esc(formatPromise(d.ready_at || d.promised_at))}</strong>. La station vous les livre.`
    : ready
    ? `${w.ready} depuis le <strong>${esc(formatPromise(d.ready_at || d.promised_at))}</strong>. Vous pouvez passer les récupérer.`
    : status === 'recupere'
      ? `${w.back} le ${esc(formatPromise(d.picked_up_at || d.ready_at || d.created_at))}. Merci de votre confiance.`
      : status === 'annule'
        ? 'Contactez la station pour plus d’informations.'
        : `${w.ready} au plus tard le <strong>${esc(formatPromise(d.promised_at))}</strong>${late ? '' : ` (${esc(timeLeftLabel(d.promised_at))})`}.`;

  const flag = ready && !delivery
    ? `<div class="flag flag--ready">${ICON.check}<span>Pas besoin d’appeler : ${w.wait}${st.open_time && st.close_time ? `, de ${esc(fmtTime(st.open_time))} à ${esc(fmtTime(st.close_time))}` : ''}.</span></div>`
    : late ? `<div class="flag flag--late">${ICON.alert}<span>La date annoncée est passée. Appelez la station avant de vous déplacer.</span></div>` : '';

  const steps = status === 'annule' ? '' : `<ol class="steps${ready || status === 'recupere' ? ' done' : ''}" aria-label="Avancement">${stepsFor(d.activity).map((s, i) => `<li class="${i <= idx ? 'on' : ''}${i === idx && !ready && status !== 'recupere' ? ' now' : ''}">${esc(s.label)}</li>`).join('')}</ol>`;

  const paidPart = d.amount_paid > 0 && !d.paid;
  const amountRow = d.amount > 0
    ? `<dt>Total</dt><dd>${esc(fcfa(d.amount))}${d.paid ? ' · payé' : paidPart ? '' : ' · à régler au retrait'}</dd>${paidPart ? `<dt>Avance payée</dt><dd>${esc(fcfa(d.amount_paid))}</dd><dt>Reste à payer</dt><dd>${esc(fcfa(Math.max(0, d.amount - d.amount_paid)))}</dd>` : ''}`
    : '<dt>Montant</dt><dd>indiqué au retrait</dd>';
  const extrasRows = `${d.express_fee > 0 ? `<li><span>Express</span><span class="price">${esc(fcfa(d.express_fee))}</span></li>` : ''}${d.travel_fee > 0 ? `<li><span>${d.activity === 'salon' ? 'Déplacement' : 'Livraison'}</span><span class="price">${esc(fcfa(d.travel_fee))}</span></li>` : ''}`;

  const call = telHref(st.phone);
  const maps = mapsHref(st);
  const where = [st.address, st.quartier].filter(Boolean).join(', ');

  const register = `/login.html?mode=register&role=automobiliste&tapis=${encodeURIComponent(token)}`;
  const login = `/login.html?mode=login&role=automobiliste&tapis=${encodeURIComponent(token)}`;
  let cta = '';
  if (signedIn) {
    cta = `<section class="card cta"><h2>Suivez-le dans votre espace</h2><p class="muted">Ce dépôt rejoint la rubrique « Mes dépôts » de votre compte Galsen.</p>
      <div class="row"><a class="btn btn--primary" id="goSpace" href="/dashboard/tapis">Ouvrir « Mes dépôts »</a></div></section>`;
  } else if (!d.claimed && !finished) {
    cta = `<section class="card cta"><h2>Soyez prévenu quand c’est prêt</h2><p class="muted">Créez votre compte Galsen gratuit : ce dépôt et les suivants apparaissent dans votre espace, rubrique « Mes dépôts ».</p>
      <div class="row"><a class="btn btn--primary" href="${register}">Créer mon compte</a></div>
      <div class="row" style="margin-top:8px"><a class="btn" href="${login}">J’ai déjà un compte</a></div></section>`;
  } else if (d.claimed && !finished) {
    cta = `<section class="card"><p class="muted">Ce dépôt est déjà suivi depuis un compte Galsen.</p><div class="row"><a class="btn" href="${login}">Me connecter</a></div></section>`;
  }

  root.innerHTML = `
    <section class="card" aria-live="polite">
      <p class="eyebrow">Ticket n° ${esc(d.ticket_no)}${d.first_name ? ` · ${esc(d.first_name)}` : ''}${d.express ? ' · Express' : ''}</p>
      <h1>${esc(title)}</h1>
      <p class="lead">${lead}</p>
      ${flag}
      ${steps}
      <ul class="pieces" aria-label="${esc(w.piecesLabel)}">
        ${pieceLines(d.items).map((p) => `<li><span>${esc(pieceLabel(p))}</span><span class="price">${p.price ? esc(fcfa(p.price)) : d.amount > 0 ? '' : 'prix au retrait'}</span></li>`).join('')}${extrasRows}
      </ul>
      <dl>
        <dt>Déposé le</dt><dd>${esc(new Date(d.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }))}</dd>
        ${totalWeight(d.items) ? `<dt>Poids</dt><dd>${esc(formatKg(totalWeight(d.items)))}</dd>` : ''}
        ${workHours(d.items) ? `<dt>Temps de travail prévu</dt><dd>${esc(workHours(d.items))} h</dd>` : ''}
        ${amountRow}
      </dl>
    </section>
    ${cta}
    <section class="card">
      <h2>${esc(st.name || 'Station')}</h2>
      ${where ? `<p class="muted">${esc(where)}</p>` : ''}
      ${st.open_time && st.close_time ? `<p class="muted">Ouvert de ${esc(fmtTime(st.open_time))} à ${esc(fmtTime(st.close_time))}</p>` : ''}
      <div class="row">
        ${call ? `<a class="btn" href="${call}">${ICON.phone} Appeler</a>` : ''}
        ${maps ? `<a class="btn" href="${maps}" target="_blank" rel="noopener noreferrer">${ICON.nav} Itinéraire</a>` : ''}
      </div>
    </section>
    <p class="small" style="text-align:center">Cette page se met à jour toute seule.</p>`;

  const go = document.getElementById('goSpace');
  if (go) go.addEventListener('click', () => rememberCarpetClaim(token));
  // Les liens vers l'inscription / la connexion gardent aussi le jeton ici,
  // au cas où login.html serait ouvert sans le paramètre.
  root.querySelectorAll('a[href^="/login.html"]').forEach((a) => a.addEventListener('click', () => rememberCarpetClaim(token)));
}

let signedIn = false;
let lastJson = '';
async function refresh(first = false) {
  const { data, error } = await supabase.rpc('carpet_public_status', { p_token: token });
  if (error || !data) {
    if (first) fail('Dépôt introuvable', 'Ce lien n’existe pas ou a été supprimé par la station.');
    return;
  }
  const json = JSON.stringify(data);
  if (json === lastJson) return; // rien n'a changé : pas de re-rendu
  lastJson = json;
  render(data, signedIn);
}

async function start() {
  if (!/^[0-9a-f-]{36}$/i.test(token)) { fail('Lien incomplet', 'Demandez à la station de vous renvoyer le lien de suivi.'); return; }
  signedIn = await signedInMotorist();
  await refresh(true);
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
}

start().catch(() => fail('Page indisponible', 'Vérifiez votre connexion puis rechargez la page.'));
