// Footer public + fenêtre « Contact » : UNE seule source, rendue en HTML.
//
// - Pages statiques (index.html, pages légales…) : le plugin `htmlPartials`
//   de vite.config.js remplace les marqueurs <!--@site-footer-->,
//   <!--@contact-modal--> et <!--@legal-nav--> par ce HTML, au build comme en dev.
// - Page React /stations (MainLayout.jsx) : même HTML via dangerouslySetInnerHTML
//   (contenu 100 % statique défini ici, jamais de saisie utilisateur).
//
// Fichier volontairement sans dépendance ni import.meta.env : il est aussi
// exécuté par Node (vite.config.js). Le comportement (ouverture de la fenêtre,
// envoi du formulaire, menu téléphone) est dans src/contact-modal.js, qui
// s'appuie sur les attributs data-* posés ici.

export const SITE = {
  name: 'Clean Car Galsen',
  email: 'bustaneimmo2021@gmail.com',
  phoneDisplay: '77 715 65 45',
  phoneTel: '+221777156545',
  whatsapp: 'https://wa.me/221777156545',
  location: 'Rufisque, Sénégal',
  responseDelay: 'Sous 24-48h ouvrées',
  tagline:
    "Le logiciel des stations de lavage auto au Sénégal : file d'attente virtuelle, réservation en ligne et paiement mobile.",
};

export const SUBJECTS = [
  'Question générale',
  'Support technique',
  'Abonnement et facturation',
  'Devenir station partenaire',
  'Protection des données (CDP · RGPD)',
  'Signaler un problème',
  'Autre',
];

// Pages légales (ordre = ordre du footer et de la barre de navigation légale).
export const LEGAL_PAGES = [
  { slug: 'reglement', href: '/reglement.html', label: 'Règlement' },
  { slug: 'confidentialite', href: '/confidentialite.html', label: 'Confidentialité' },
  { slug: 'mentions-legales', href: '/mentions-legales.html', label: 'Mentions légales' },
  { slug: 'conditions-generales', href: '/conditions-generales.html', label: 'CGU & CGV' },
  { slug: 'accord-traitement-donnees', href: '/accord-traitement-donnees.html', label: 'Accord de traitement (DPA)' },
];

const NAV_LINKS = [
  { href: '/', label: 'Accueil' },
  { href: '/#comment-ca-marche', label: 'Comment ça marche' },
  { href: '/#tarifs', label: 'Tarifs' },
  { href: '/#faq', label: 'FAQ' },
];

// Liens « région » : la page d'accueil lit ?region=<valeur> et lance la
// recherche de stations correspondante (voir applyRegionFromUrl dans index.html).
const REGION_LINKS = [
  ['dakar', 'Dakar'],
  ['thies', 'Thiès'],
  ['saint-louis', 'Saint-Louis'],
  ['kaolack', 'Kaolack'],
  ['ziguinchor', 'Ziguinchor'],
  ['diourbel', 'Diourbel'],
  ['louga', 'Louga'],
];

// Icônes (tracés Lucide, viewBox 24) — inline pour ne dépendre d'aucune lib.
const ICON_PATHS = {
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
};

export function icon(name, cls = 'w-4 h-4') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

const HEART =
  '<svg class="w-3.5 h-3.5 text-emerald-400 inline-block -mt-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';

const SOCIALS = [
  {
    label: 'Facebook',
    href: 'https://web.facebook.com/bustane11',
    svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.89h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94z"/></svg>',
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/144611952/',
    svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.114 20.452H3.56V9h3.554v11.452z"/></svg>',
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/saasbycheikh/',
    svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>',
  },
];

const linkCls = 'text-neutral-400 hover:text-white transition-colors';

function column(title, itemsHtml) {
  return `<div>
        <h3 class="text-xs font-bold uppercase tracking-wider text-white mb-4">${title}</h3>
        <ul class="space-y-2.5">${itemsHtml}</ul>
      </div>`;
}

function chip(iconName, inner) {
  return `<li class="flex items-center gap-3">
            <span class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">${icon(iconName)}</span>
            ${inner}
          </li>`;
}

export function renderSiteFooter({ version = '' } = {}) {
  const year = new Date().getFullYear();

  const nav = NAV_LINKS.map((l) => `<li><a href="${l.href}" class="${linkCls}">${l.label}</a></li>`).join('')
    + `<li><button type="button" data-open-contact class="${linkCls} text-left">Contact</button></li>`;

  const stations = REGION_LINKS.map(
    ([value, label]) => `<li><a href="/?region=${value}#stations-section" class="${linkCls}">Lavage auto ${label}</a></li>`
  ).join('')
    + `<li><a href="/#stations-section" class="${linkCls}">Toutes les stations</a></li>`;

  const legal = LEGAL_PAGES.map((l) => `<li><a href="${l.href}" class="${linkCls}">${l.label}</a></li>`).join('');

  const socials = SOCIALS.map(
    (s) => `<a href="${s.href}" target="_blank" rel="noopener noreferrer" aria-label="${s.label}" class="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors">${s.svg}</a>`
  ).join('');

  return `<footer class="w-full border-t border-white/10 bg-[#070b14] text-sm text-left" data-site-footer>
  <div class="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.6fr]">
    <div>
      <a href="/" class="inline-flex items-center gap-2 mb-4">
        <img src="/icons/icon-192.png" alt="${SITE.name}" width="28" height="28" class="w-7 h-7 rounded-lg object-cover">
        <span class="font-bold text-lg tracking-tight text-white">${SITE.name}</span>
      </a>
      <p class="text-neutral-400 leading-relaxed mb-5 max-w-xs">${SITE.tagline}</p>
      <a href="/login.html?mode=register&amp;role=agence" class="inline-flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm px-5 py-2.5 transition-colors">Créer mon espace ${icon('arrow')}</a>
      <a href="/confidentialite.html" class="mt-4 flex w-fit items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 px-3.5 py-2.5 transition-colors">
        <span class="text-emerald-400">${icon('shield', 'w-5 h-5')}</span>
        <span class="leading-tight"><span class="block text-xs font-bold text-white">RGPD · CDP</span><span class="block text-[11px] text-emerald-400">Données protégées</span></span>
      </a>
      <div class="mt-5 flex items-center gap-3">${socials}</div>
    </div>
    ${column('Navigation', nav)}
    ${column('Stations', stations)}
    ${column('Légal', legal)}
    <div>
      <h3 class="text-xs font-bold uppercase tracking-wider text-white mb-4">Contact</h3>
      <ul class="space-y-3">
        ${chip('mail', `<a href="mailto:${SITE.email}" class="text-neutral-300 hover:text-white transition-colors [overflow-wrap:anywhere]">${SITE.email}</a>`)}
        ${chip('phone', `<span class="relative inline-block">
              <button type="button" data-phone-toggle aria-haspopup="true" class="text-neutral-300 hover:text-white transition-colors">${SITE.phoneDisplay}</button>
              <span data-phone-menu class="hidden absolute z-20 mt-2 left-0 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden text-sm whitespace-nowrap">
                <a href="tel:${SITE.phoneTel}" class="flex items-center gap-2 px-4 py-2.5 text-neutral-200 hover:bg-white/5 transition-colors">📞 Appeler</a>
                <a href="${SITE.whatsapp}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 px-4 py-2.5 text-neutral-200 hover:bg-white/5 transition-colors border-t border-white/5">💬 WhatsApp</a>
              </span>
            </span>`)}
        ${chip('pin', `<span class="text-neutral-300">${SITE.location}</span>`)}
      </ul>
    </div>
  </div>
  <div class="border-t border-white/10">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-500">
      <p>&copy; <span data-year>${year}</span> ${SITE.name}. Tous droits réservés.</p>
      <p>Fait avec ${HEART} au Sénégal</p>
      <p>${version}</p>
    </div>
  </div>
</footer>`;
}

const fieldCls =
  'w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-base sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors';
const labelCls = 'block text-xs font-semibold text-neutral-300 mb-1.5';

function infoCard(iconName, label, valueHtml) {
  return `<div class="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/5 p-3.5">
            <span class="w-10 h-10 rounded-xl bg-emerald-500 text-black flex items-center justify-center shrink-0">${icon(iconName, 'w-5 h-5')}</span>
            <div class="min-w-0">
              <p class="text-[11px] text-neutral-500 leading-none mb-1">${label}</p>
              <p class="text-sm font-semibold text-white break-words">${valueHtml}</p>
            </div>
          </div>`;
}

export function renderContactModal() {
  const options = SUBJECTS.map((s) => `<option value="${s}">${s}</option>`).join('');
  return `<div id="ccg-contact" class="hidden fixed inset-0 z-[10000] items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="ccg-contact-title" data-contact-overlay>
  <div class="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950 shadow-2xl text-left" data-contact-panel>
    <button type="button" data-close-contact aria-label="Fermer la fenêtre de contact" class="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white flex items-center justify-center transition-colors">${icon('close', 'w-4 h-4')}</button>
    <div class="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <aside class="order-2 md:order-1 p-6 sm:p-8 bg-white/[0.02] border-t md:border-t-0 md:border-r border-white/10">
        <h2 id="ccg-contact-title" class="text-lg font-bold text-white mb-5">Nos coordonnées</h2>
        <div class="space-y-3">
          ${infoCard('mail', 'Email', `<a href="mailto:${SITE.email}" class="hover:text-emerald-400 transition-colors">${SITE.email}</a>`)}
          ${infoCard('phone', 'Téléphone / WhatsApp', `<a href="tel:${SITE.phoneTel}" class="hover:text-emerald-400 transition-colors">${SITE.phoneDisplay}</a> <span class="text-neutral-600">·</span> <a href="${SITE.whatsapp}" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:underline">WhatsApp</a>`)}
          ${infoCard('pin', 'Adresse', SITE.location)}
          ${infoCard('clock', 'Délai de réponse', SITE.responseDelay)}
        </div>
        <div class="mt-5 flex gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-200">
          <span class="shrink-0 mt-0.5">${icon('help', 'w-4 h-4')}</span>
          <p>Consultez notre <a href="/#faq" data-close-contact class="font-semibold underline">FAQ</a> pour trouver rapidement des réponses aux questions fréquentes.</p>
        </div>
      </aside>
      <div class="order-1 md:order-2 p-6 sm:p-8">
        <div data-contact-form-wrap>
          <h3 class="text-lg font-bold text-white mb-5 pr-10">Envoyez-nous un message</h3>
          <form id="ccg-contact-form" novalidate class="space-y-4">
            <div>
              <label for="ccg-c-name" class="${labelCls}">Votre nom <span class="text-red-400">*</span></label>
              <input id="ccg-c-name" name="name" type="text" required minlength="2" maxlength="100" autocomplete="name" placeholder="Prénom et nom" class="${fieldCls}">
            </div>
            <div>
              <label for="ccg-c-email" class="${labelCls}">Votre email <span class="text-red-400">*</span></label>
              <input id="ccg-c-email" name="email" type="email" required maxlength="254" autocomplete="email" placeholder="exemple@email.com" class="${fieldCls}">
            </div>
            <div>
              <label for="ccg-c-subject" class="${labelCls}">Sujet <span class="text-red-400">*</span></label>
              <select id="ccg-c-subject" name="subject" required class="${fieldCls}">
                <option value="">Sélectionnez un sujet</option>
                ${options}
              </select>
            </div>
            <div>
              <label for="ccg-c-message" class="${labelCls}">Votre message <span class="text-red-400">*</span></label>
              <textarea id="ccg-c-message" name="message" required minlength="10" maxlength="2000" rows="5" placeholder="Décrivez votre demande en détail..." class="${fieldCls} resize-y"></textarea>
            </div>
            <div class="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
              <label>Ne pas remplir<input type="text" name="company_website" tabindex="-1" autocomplete="off"></label>
            </div>
            <p data-contact-error role="alert" class="hidden rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300"></p>
            <button type="submit" data-contact-submit class="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3 transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed">
              <span data-contact-submit-icon>${icon('send', 'w-4 h-4')}</span><span data-contact-submit-label>Envoyer le message</span>
            </button>
            <p class="text-[11px] leading-relaxed text-neutral-500">En envoyant ce message, vous acceptez que ${SITE.name} (Bustane Holding) traite vos données pour répondre à votre demande. Elles ne sont pas partagées et sont conservées 12 mois au plus. Vos droits et la procédure : <a href="/confidentialite.html" class="text-emerald-400 hover:underline">Politique de confidentialité</a>.</p>
          </form>
        </div>
        <div data-contact-success class="hidden py-10 text-center">
          <span class="mx-auto mb-4 w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">${icon('check', 'w-8 h-8')}</span>
          <h3 class="text-xl font-bold text-white mb-2">Message envoyé</h3>
          <p class="text-neutral-400 text-sm mb-6 max-w-sm mx-auto">Merci ! Nous vous répondons par email ${SITE.responseDelay.toLowerCase()}.</p>
          <div class="flex items-center justify-center gap-3">
            <button type="button" data-close-contact class="rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm px-5 py-2.5 transition-colors">Fermer</button>
            <button type="button" data-contact-again class="rounded-xl border border-white/10 hover:bg-white/5 text-neutral-300 text-sm px-5 py-2.5 transition-colors">Envoyer un autre message</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<script type="module" src="/src/contact-modal.js"></script>`;
}

// Barre de navigation entre les pages légales (pastilles) — `activeSlug`
// identifie la page courante.
export function renderLegalNav(activeSlug) {
  const pills = LEGAL_PAGES.map((l) => {
    const active = l.slug === activeSlug;
    const cls = active
      ? 'bg-emerald-500 text-black border-emerald-500'
      : 'bg-white/[0.03] text-neutral-300 border-white/10 hover:border-white/25 hover:text-white';
    return `<a href="${l.href}"${active ? ' aria-current="page"' : ''} class="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${cls}">${l.label}</a>`;
  }).join('');
  return `<nav aria-label="Documents légaux" class="flex flex-wrap gap-2 mb-10">${pills}</nav>`;
}
