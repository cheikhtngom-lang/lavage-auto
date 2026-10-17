// Mesure de provenance du site public (Super Admin > Affiliés) : une visite
// par onglet, avec sa source (réseau social, recherche, lien d'affilié…), et
// les clics vers le WhatsApp / le téléphone de la plateforme.
//
// Chargé par toutes les pages qui ont la fenêtre Contact (import dans
// src/contact-modal.js) et par login.html / sur-mesure.html. Voir
// lib/attribution.js pour ce qui est gardé et pourquoi.
import { captureLanding, isTrackable, sendSiteEvent, visitAlreadySent, markVisitSent } from './lib/attribution.js';
import { SITE } from './lib/siteFooter.js';

const landing = captureLanding();

if (isTrackable()) {
  if (landing && !visitAlreadySent()) {
    markVisitSent();
    sendSiteEvent('visite', landing);
  }

  // Numéro de la plateforme sans indicatif (777156545) : les liens WhatsApp /
  // téléphone des stations de l'annuaire ne sont pas comptés.
  const platformNumber = SITE.phoneTel.replace(/\D/g, '').slice(-9);
  document.addEventListener('click', (e) => {
    const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (!href.replace(/\D/g, '').includes(platformNumber)) return;
    if (/^tel:/i.test(href)) sendSiteEvent('appel');
    else if (/wa\.me|whatsapp/i.test(href)) sendSiteEvent('whatsapp');
  }, true);
}
