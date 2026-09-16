// Bannière de consentement cookies (mesure d'audience Google Analytics) —
// RGPD. La mesure d'audience démarre en "denied" par défaut (voir le
// gtag('consent','default',...) posé AVANT le chargement de gtag.js dans
// chaque page, Google Consent Mode v2) : ce script ne fait que basculer ce
// consentement sur "granted" si le visiteur accepte, et mémorise son choix
// dans localStorage — partagé entre index.html/login.html/dashboard.html/
// reset-password.html (même origine), un choix fait une fois vaut pour tout
// le site. Voir confidentialite.html#cookies pour le texte complet.
(function () {
  var KEY = 'ccg_cookie_consent';
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* stockage indisponible : re-demande à chaque visite */ }

  function applyConsent(value) {
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', { analytics_storage: value === 'granted' ? 'granted' : 'denied' });
    }
  }

  if (stored === 'granted' || stored === 'denied') {
    applyConsent(stored);
    return;
  }

  function save(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
    applyConsent(value);
    var el = document.getElementById('ccg-cookie-banner');
    if (el) el.remove();
  }

  function show() {
    var el = document.createElement('div');
    el.id = 'ccg-cookie-banner';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Gestion des cookies');
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;'
      + 'background:rgba(10,10,10,0.97);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);'
      + 'border-top:1px solid rgba(255,255,255,0.1);'
      + 'padding:16px max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));'
      + 'display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;'
      + 'font-family:Inter,system-ui,-apple-system,sans-serif;color:#d4d4d4;font-size:13px;';
    el.innerHTML =
      '<p style="margin:0;flex:1;min-width:240px;max-width:640px;line-height:1.5;">'
      + "Nous utilisons des cookies de mesure d'audience (Google Analytics) pour comprendre l'utilisation du site et l'améliorer. "
      + '<a href="/confidentialite.html#cookies" style="color:#60a5fa;text-decoration:underline;">En savoir plus</a>'
      + '</p>'
      + '<div style="display:flex;gap:8px;flex-shrink:0;">'
      + '<button id="ccg-cookie-refuse" type="button" style="padding:10px 18px;border-radius:9999px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;font-weight:600;cursor:pointer;font-size:13px;">Refuser</button>'
      + '<button id="ccg-cookie-accept" type="button" style="padding:10px 18px;border-radius:9999px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;font-size:13px;">Accepter</button>'
      + '</div>';
    document.body.appendChild(el);
    document.getElementById('ccg-cookie-accept').addEventListener('click', function () { save('granted'); });
    document.getElementById('ccg-cookie-refuse').addEventListener('click', function () { save('denied'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
})();
