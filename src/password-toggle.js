// Icône œil sur les champs mot de passe des pages HTML publiques (connexion,
// inscription, mot de passe oublié/réinitialisation, invitation, cession,
// Sur mesure). Les pages le chargent via
// <script type="module" src="/src/password-toggle.js"></script>.
// Côté React, même rendu avec src/components/ui/PasswordInput.jsx.

const EYE = '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>';
const EYE_OFF = '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>';

const CSS = `
.pw-wrap { position: relative; }
.pw-wrap > input { padding-right: 44px; }
.pw-wrap > input::-ms-reveal { display: none; }
.pw-toggle {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px;
  background: transparent; color: rgba(255,255,255,0.45); cursor: pointer;
  transition: color 0.2s;
}
.pw-toggle:hover, .pw-toggle:focus-visible { color: #fff; outline: none; }
.pw-toggle svg { width: 18px; height: 18px; }
`;

function icon(paths) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function enhance(input) {
  if (input.closest('.pw-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'pw-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pw-toggle';
  const render = () => {
    const visible = input.type === 'text';
    const label = visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe';
    btn.innerHTML = icon(visible ? EYE_OFF : EYE);
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(visible));
    btn.title = label;
  };
  // Garde le curseur dans le champ pendant le clic.
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    render();
  });
  render();
  wrap.appendChild(btn);
}

const style = document.createElement('style');
style.textContent = CSS;
document.head.appendChild(style);
document.querySelectorAll('input[type="password"]').forEach(enhance);
