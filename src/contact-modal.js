// Comportement de la fenêtre « Contact » et des petits gestes du footer public.
// Le HTML vient de src/lib/siteFooter.js (renderContactModal / renderSiteFooter)
// et les pages le chargent via <script type="module" src="/src/contact-modal.js">.
//
// Ouverture : tout élément [data-open-contact], l'appel window.openContactModal(),
// ou l'ancre #contact dans l'URL. Envoi : Edge Function `send-contact-message`
// (supabase/functions/send-contact-message) — le client Supabase n'est chargé
// qu'à l'envoi, pour ne pas alourdir les pages légales.

import { getCountry } from './lib/countries.js';
import { detectCountry, getCountryOverride, getUrlCountry } from './lib/userCountry.js';

const MIN_FILL_MS = 2500; // en dessous : formulaire rempli par un robot (vérifié aussi côté serveur)

const root = document.getElementById('ccg-contact');
let lastFocus = null;
let openedAt = 0;

function $(selector) {
  return root ? root.querySelector(selector) : null;
}

function focusables() {
  return Array.from(
    root.querySelectorAll('a[href], button:not([disabled]), input:not([tabindex="-1"]), select, textarea')
  ).filter((el) => el.offsetParent !== null);
}

function setError(message) {
  const box = $('[data-contact-error]');
  if (!box) return;
  box.textContent = message || '';
  box.classList.toggle('hidden', !message);
}

function showForm() {
  $('[data-contact-form-wrap]').classList.remove('hidden');
  $('[data-contact-success]').classList.add('hidden');
}

function openModal() {
  if (!root || !root.classList.contains('hidden')) return;
  lastFocus = document.activeElement;
  openedAt = Date.now();
  setError('');
  showForm();
  root.classList.remove('hidden');
  root.classList.add('flex');
  document.documentElement.style.overflow = 'hidden';
  const first = $('#ccg-c-name');
  if (first) setTimeout(() => first.focus(), 30);
}

function closeModal() {
  if (!root || root.classList.contains('hidden')) return;
  root.classList.add('hidden');
  root.classList.remove('flex');
  document.documentElement.style.overflow = '';
  if (location.hash === '#contact') {
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
}

window.openContactModal = openModal;

function closePhoneMenus(except) {
  document.querySelectorAll('[data-phone-menu]').forEach((m) => {
    if (m !== except) m.classList.add('hidden');
  });
}

document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  if (target.closest('[data-open-contact]')) {
    e.preventDefault();
    openModal();
    return;
  }

  const phoneToggle = target.closest('[data-phone-toggle]');
  if (phoneToggle) {
    e.stopPropagation();
    const menu = phoneToggle.parentElement.querySelector('[data-phone-menu]');
    closePhoneMenus(menu);
    if (menu) menu.classList.toggle('hidden');
    return;
  }
  closePhoneMenus(null);

  if (!root) return;
  // Clic sur le fond sombre (hors panneau) ou sur un bouton/lien de fermeture.
  if (target === root || target.closest('[data-close-contact]')) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (!root || root.classList.contains('hidden')) return;
  if (e.key === 'Escape') {
    closeModal();
    return;
  }
  if (e.key === 'Tab') {
    // Focus piégé dans la fenêtre tant qu'elle est ouverte.
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

if (root) {
  const form = $('#ccg-contact-form');
  const submitBtn = $('[data-contact-submit]');
  const submitLabel = $('[data-contact-submit-label]');
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  $('[data-contact-again]').addEventListener('click', () => {
    form.reset();
    openedAt = Date.now();
    setError('');
    showForm();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const email = String(data.get('email') || '').trim();
    const subject = String(data.get('subject') || '');
    const message = String(data.get('message') || '').trim();

    if (name.length < 2) return setError('Merci de renseigner votre nom.');
    if (!emailRe.test(email)) return setError('Merci de renseigner une adresse email valide.');
    if (!subject) return setError('Merci de choisir un sujet.');
    if (message.length < 10) return setError('Votre message est trop court (10 caractères minimum).');

    setError('');
    submitBtn.disabled = true;
    submitLabel.textContent = 'Envoi en cours…';
    try {
      const { supabase } = await import('./lib/supabaseClient.js');
      const { error } = await supabase.functions.invoke('send-contact-message', {
        body: {
          name,
          email,
          subject,
          message,
          company_website: String(data.get('company_website') || ''), // honeypot
          elapsedMs: Date.now() - openedAt,
        },
      });
      if (error) {
        let detail = '';
        try {
          detail = (await error.context.json()).error || '';
        } catch (_) { /* réponse non JSON */ }
        throw new Error(detail);
      }
      form.reset();
      $('[data-contact-form-wrap]').classList.add('hidden');
      $('[data-contact-success]').classList.remove('hidden');
    } catch (err) {
      setError(
        err && err.message
          ? err.message
          : "Impossible d'envoyer votre message pour le moment. Réessayez, ou écrivez-nous directement par email."
      );
    } finally {
      submitBtn.disabled = false;
      submitLabel.textContent = 'Envoyer le message';
    }
  });
}

// Colonne « Stations » du footer : liste par défaut = régions du Sénégal (rendue côté
// serveur). Pour un visiteur d'un autre pays déclaré, on affiche SES régions — sinon un
// client d'Abidjan verrait des liens « Lavage auto Dakar ». Sans détection possible, la
// liste par défaut reste (aucun appel base de données ici : le pays peut ne pas être
// ouvert, le lien mène alors au message « pas encore disponible »).
async function localizeFooterRegions() {
  const list = document.querySelector('[data-footer-regions]');
  if (!list) return;
  const code = getUrlCountry() || getCountryOverride() || (await detectCountry());
  const country = code && getCountry(code);
  if (!country || country.code === 'SN') return;
  const cls = 'text-neutral-400 hover:text-white transition-colors';
  const items = country.regions.slice(0, 7).map((r) => '<li><a href="/?country=' + country.code + '&region=' + r.value + '#stations-section" class="' + cls + '">Lavage auto ' + r.label + '</a></li>');
  items.push('<li><a href="/?country=' + country.code + '#stations-section" class="' + cls + '">Toutes les stations</a></li>');
  list.innerHTML = items.join('');
}
localizeFooterRegions();

// L'année du copyright reste juste même sur une page servie depuis le cache.
document.querySelectorAll('[data-year]').forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

if (location.hash === '#contact') openModal();
window.addEventListener('hashchange', () => {
  if (location.hash === '#contact') openModal();
});
