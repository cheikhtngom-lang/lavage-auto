// Héros de l'accueil (index.html, section #accueil), animé avec anime.js
// (https://animejs.com, MIT). Inspiré des composants de React Bits (BlurText,
// RotatingText, CountUp, fond interactif) et des héros « horizon lumineux » :
//   1. entrée : horizon qui se lève, titre lettre par lettre qui sort du flou,
//      trait dessiné sous « Fini le cahier. », photo qui s'ouvre, cartes ;
//   2. ensuite, en boucle : bulles de mousse qui montent et s'écartent du
//      curseur, mot qui tourne (stations de lavage → pressings → tapis),
//      file d'attente qui vit (voiture finie, paiement, total, suivante).
// « Réduire les animations » : rien ne bouge, tout est visible. Les boucles
// s'arrêtent hors de l'écran, onglet caché, ou avec le bouton Pause.
import { animate, createTimeline, createDrawable, splitText, stagger, utils } from 'animejs';

const hero = document.querySelector('#accueil.lp-hero');
const root = document.documentElement;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

const fmt = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (hero && !calm) start();
else root.classList.remove('hero-intro');

function start() {
  const state = { paused: false, visible: true, hidden: document.hidden };
  const running = () => !state.paused && state.visible && !state.hidden;
  const waiters = new Set();
  const whenRunning = () => (running() ? Promise.resolve() : new Promise((r) => waiters.add(r)));
  const wake = () => { if (running()) { waiters.forEach((r) => r()); waiters.clear(); } };

  // Script venu tard (réseau lent) : le texte est déjà apparu, pas d'entrée.
  const late = performance.now() > 2600;
  intro(late).then(() => {
    rotateWords(whenRunning);
    liveQueue(whenRunning);
  });
  const bubbles = bubbleField(running);

  const pause = hero.querySelector('.lp-hero__pause');
  if (pause) {
    pause.hidden = false;
    pause.addEventListener('click', () => {
      state.paused = !state.paused;
      pause.setAttribute('aria-pressed', String(state.paused));
      pause.querySelector('span').textContent = state.paused ? 'Lecture' : 'Pause';
      pause.setAttribute('aria-label', state.paused ? 'Relancer les animations' : 'Mettre les animations en pause');
      wake(); bubbles.sync();
    });
    pause.setAttribute('aria-label', 'Mettre les animations en pause');
  }
  new IntersectionObserver(([e]) => { state.visible = e.isIntersecting; wake(); bubbles.sync(); }).observe(hero);
  document.addEventListener('visibilitychange', () => { state.hidden = document.hidden; wake(); bubbles.sync(); });

  parallax();
}

// ─── 1. Entrée ───
function intro(late) {
  const title = hero.querySelector('.lp-hero__title');
  const swoosh = hero.querySelector('.lp-hero__swoosh path');
  const photo = hero.querySelector('.lp-hero__photo');
  const img = photo?.querySelector('img');
  const queue = hero.querySelector('.lp-queue');
  const booking = hero.querySelector('.lp-booking');
  const horizon = hero.querySelector('.lp-hero__horizon');
  const items = hero.querySelectorAll('[data-intro]');
  const count = hero.querySelector('[data-count]');
  const shine = hero.querySelector('.lp-btn--shine');

  const split = splitText(title, { words: true, chars: true });
  const drawn = swoosh ? createDrawable(swoosh) : [];

  if (late) {
    root.classList.remove('hero-intro');
    utils.set(drawn, { draw: '0 1' });
    return Promise.resolve();
  }

  // États de départ posés en ligne, puis la classe de masquage s'en va.
  utils.set(split.chars, { opacity: 0, translateY: '0.45em', filter: 'blur(12px)' });
  utils.set(items, { opacity: 0, translateY: 14 });
  utils.set(drawn, { draw: '0 0' });
  utils.set(horizon, { opacity: 0, translateY: '18%' });
  if (photo) utils.set(photo, { clipPath: 'inset(8% 8% 8% 8% round 22px)' });
  // la transition CSS du zoom au survol freinerait l'entrée : coupée le temps de l'entrée
  if (img) { img.style.transition = 'none'; utils.set(img, { scale: 1.14 }); }
  utils.set([queue, booking], { opacity: 0, translateY: 18, scale: 0.94 });
  title.style.opacity = '1';
  root.classList.remove('hero-intro');

  const ease = 'out(4)';
  const tl = createTimeline({ defaults: { ease } })
    .add(horizon, { opacity: [0, 1], translateY: ['18%', '0%'], duration: 1600, ease: 'out(3)' }, 0)
    .add(items[0], { opacity: 1, translateY: 0, duration: 600 }, 60)
    .add(split.chars, { opacity: 1, translateY: '0em', filter: 'blur(0px)', duration: 750, delay: stagger(17) }, 120)
    .add(drawn, { draw: ['0 0', '0 1'], duration: 750, ease: 'inOut(3)' }, 820)
    .add([...items].slice(1), { opacity: 1, translateY: 0, duration: 650, delay: stagger(90) }, 560)
    .add(photo, { clipPath: 'inset(0% 0% 0% 0% round 22px)', duration: 1300, ease: 'inOut(4)' }, 150)
    .add(img, { scale: 1, duration: 1700 }, 150)
    .add(queue, { opacity: 1, translateY: 0, scale: 1, duration: 700, ease: 'out(3)' }, 900)
    .add(booking, { opacity: 1, translateY: 0, scale: 1, duration: 700, ease: 'out(3)' }, 1250);

  if (count) {
    const n = { v: 0 }; const to = Number(count.dataset.count) || 0;
    tl.add(n, { v: to, duration: 1100, ease: 'out(3)', onUpdate: () => { count.textContent = fmt(n.v); } }, 950);
  }
  if (shine) setTimeout(() => shine.classList.add('is-shining'), 1700);
  return new Promise((resolve) => tl.then(() => {
    // Plus de styles en ligne inutiles (filtre = coût de rendu) ; la photo
    // retrouve son zoom au survol (landing.css).
    utils.set(split.chars, { filter: 'none' });
    if (photo) photo.style.clipPath = '';
    if (img) { img.style.transform = ''; img.style.transition = ''; }
    resolve();
  }));
}

// ─── 2a. Mot qui tourne (RotatingText) ───
async function rotateWords(whenRunning) {
  const el = hero.querySelector('.lp-rotate');
  if (!el) return;
  const words = (el.dataset.words || '').split('|').filter(Boolean);
  if (words.length < 2) return;
  let i = 0;
  const paint = (word) => {
    el.textContent = '';
    for (const c of word) {
      const s = document.createElement('span');
      s.className = 'lp-rotate__c';
      s.textContent = c;
      el.appendChild(s);
    }
    return el.querySelectorAll('.lp-rotate__c');
  };
  paint(words[0]);
  for (;;) {
    await wait(2600);
    await whenRunning();
    const out = el.querySelectorAll('.lp-rotate__c');
    await animate(out, { opacity: 0, translateY: '-0.6em', duration: 260, delay: stagger(14), ease: 'in(3)' });
    i = (i + 1) % words.length;
    const chars = paint(words[i]);
    utils.set(chars, { opacity: 0, translateY: '0.6em' });
    await animate(chars, { opacity: 1, translateY: '0em', duration: 420, delay: stagger(18), ease: 'out(4)' });
  }
}

// ─── 2b. File d'attente vivante ───
const CARS = [
  { plate: 'DK-3310-AF', meta: 'SUV · Lavage complet · Modou', price: 7000, method: 'Orange Money' },
  { plate: 'TH-0942-C', meta: 'Moto · Express · Ibou', price: 1500, method: 'Espèces' },
  { plate: 'DK-7781-AC', meta: 'Berline · Lavage complet · Fallou', price: 5000, method: 'Wave' },
  { plate: 'AA-4410-DK', meta: 'Pick-up · Extérieur · Modou', price: 3500, method: 'Wave' },
  { plate: 'DK-1205-BD', meta: 'Citadine · Intérieur · Ibou', price: 3000, method: 'Orange Money' },
];

async function liveQueue(whenRunning) {
  const card = hero.querySelector('.lp-queue');
  const list = card?.querySelector('.lp-queue__list');
  const totalEl = card?.querySelector('[data-total]');
  const paid = card?.querySelector('.lp-queue__paid');
  if (!list || !totalEl || !paid) return;
  const paidText = paid.querySelector('span');
  let total = Number(totalEl.dataset.total) || 0;
  let next = 0;
  // Ce qui est déjà en tête de file (le reste vient de CARS).
  const queue = [
    { price: 5000, method: 'Wave' },
    { price: 2500, method: 'Wave' },
    { price: 3000, method: 'Orange Money' },
  ];
  utils.set(paid, { opacity: 0, translateY: 6, scale: 0.9 });

  const times = ['8 min', '~20 min', '~35 min'];
  const bar = (row) => row.querySelector('.lp-ui__bar i');
  const makeRow = (car) => {
    const row = document.createElement('div');
    row.className = 'lp-queue__row';
    row.innerHTML = '<span class="lp-ui__rank"></span><div><div class="lp-ui__plate"></div><div class="lp-ui__meta"></div></div><span class="lp-ui__time"></span>';
    row.querySelector('.lp-ui__plate').textContent = car.plate;
    row.querySelector('.lp-ui__meta').textContent = car.meta;
    return row;
  };
  const renumber = () => list.querySelectorAll('.lp-queue__row').forEach((r, k) => {
    r.querySelector('.lp-ui__rank').textContent = String(k + 1);
    if (!r.classList.contains('is-done')) r.querySelector('.lp-ui__time').textContent = times[k] || '~45 min';
  });

  for (;;) {
    await wait(900);
    await whenRunning();
    const first = list.querySelector('.lp-queue__row');
    const fill = bar(first);
    const current = queue.shift();
    // a. le lavage se termine
    if (fill) await animate(fill, { width: '100%', duration: 1300, ease: 'inOut(2)' });
    first.classList.add('is-done');
    first.querySelector('.lp-ui__time').textContent = 'Terminé';
    // b. paiement reçu, total du jour qui monte
    paidText.textContent = `${fmt(current.price)} F reçus par ${current.method}`;
    animate(paid, { opacity: [0, 1], translateY: [6, 0], scale: [0.9, 1], duration: 450, ease: 'out(3)' });
    const n = { v: total };
    total += current.price;
    await animate(n, { v: total, duration: 800, ease: 'out(3)', onUpdate: () => { totalEl.textContent = `${fmt(n.v)} F`; } });
    await wait(900);
    await whenRunning();
    // c. la voiture sort, la suivante entre en fin de file
    animate(paid, { opacity: 0, translateY: -4, duration: 350, ease: 'in(2)' });
    const h = first.offsetHeight;
    await animate(first, { height: [h, 0], paddingTop: 0, paddingBottom: 0, opacity: 0, duration: 450, ease: 'inOut(3)' });
    first.remove();
    const car = CARS[next++ % CARS.length];
    queue.push({ price: car.price, method: car.method });
    const row = makeRow(car);
    list.appendChild(row);
    renumber();
    utils.set(row, { opacity: 0, translateY: 10 });
    animate(row, { opacity: 1, translateY: 0, duration: 450, ease: 'out(3)' });
    // d. la nouvelle tête de file démarre son lavage
    const head = list.querySelector('.lp-queue__row');
    const meta = head.querySelector('.lp-ui__meta');
    if (!head.querySelector('.lp-ui__bar')) meta.insertAdjacentHTML('afterend', '<div class="lp-ui__bar"><i style="width:0%"></i></div>');
    await animate(bar(head), { width: ['0%', '34%'], duration: 900, ease: 'out(3)' });
  }
}

// ─── 2c. Bulles de mousse (fond interactif) ───
function bubbleField(running) {
  const canvas = hero.querySelector('.lp-hero__bubbles');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return { sync() {} };
  const coarse = matchMedia('(pointer: coarse)').matches;
  let w = 0; let h = 0; let dpr = 1; let raf = 0; let last = 0;
  const pointer = { x: -9999, y: -9999 };
  const bubbles = [];
  const resize = () => {
    const r = hero.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const want = Math.round(Math.min(26, Math.max(10, w / 55)));
    while (bubbles.length < want) bubbles.push(spawn(true));
    bubbles.length = want;
  };
  function spawn(anywhere) {
    const r = 3 + Math.random() ** 2 * 20;
    return {
      x: Math.random() * w, y: anywhere ? Math.random() * h : h + r + Math.random() * 60,
      r, vy: 12 + Math.random() * 26 + r * 0.6, phase: Math.random() * Math.PI * 2,
      sway: 6 + Math.random() * 14, dx: 0, dy: 0, a: 0.35 + Math.random() * 0.4,
    };
  }
  const draw = (b) => {
    const x = b.x + Math.sin(b.phase) * b.sway + b.dx; const y = b.y + b.dy;
    // fondu en haut de l'écran : la mousse s'évapore avant le texte
    const fade = Math.min(1, Math.max(0, (y - h * 0.08) / (h * 0.35)));
    if (fade <= 0) return;
    ctx.globalAlpha = b.a * fade;
    const g = ctx.createRadialGradient(x - b.r * 0.35, y - b.r * 0.4, b.r * 0.1, x, y, b.r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.55, 'rgba(219,238,255,0.25)');
    g.addColorStop(1, 'rgba(56,189,248,0.18)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(11,99,229,0.28)'; ctx.stroke();
  };
  const frame = (t) => {
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    ctx.clearRect(0, 0, w, h);
    for (let k = 0; k < bubbles.length; k++) {
      const b = bubbles[k];
      b.y -= b.vy * dt; b.phase += dt * 0.9;
      // le curseur écarte les bulles, elles reviennent doucement
      const px = b.x + Math.sin(b.phase) * b.sway + b.dx - pointer.x; const py = b.y + b.dy - pointer.y;
      const d2 = px * px + py * py; const R = 130;
      if (d2 < R * R) { const d = Math.sqrt(d2) || 1; const f = (1 - d / R) * 140 * dt * 8; b.dx += (px / d) * f; b.dy += (py / d) * f; }
      b.dx *= 0.94; b.dy *= 0.94;
      if (b.y + b.r < -20) bubbles[k] = spawn(false);
      else draw(b);
    }
    ctx.globalAlpha = 1;
    raf = running() ? requestAnimationFrame(frame) : 0;
  };
  const sync = () => { if (running() && !raf) { last = 0; raf = requestAnimationFrame(frame); } };
  if (!coarse) {
    hero.addEventListener('pointermove', (e) => { const r = hero.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; });
    hero.addEventListener('pointerleave', () => { pointer.x = pointer.y = -9999; });
  }
  new ResizeObserver(resize).observe(hero);
  resize();
  utils.set(canvas, { opacity: 0 });
  animate(canvas, { opacity: 1, duration: 1400, delay: 400 });
  sync();
  return { sync };
}

// ─── 3. Profondeur au curseur (translation douce, sans inclinaison) ───
function parallax() {
  if (matchMedia('(pointer: coarse)').matches) return;
  const layers = [
    [hero.querySelector('.lp-queue'), 10],
    [hero.querySelector('.lp-booking'), -8],
    [hero.querySelector('.lp-hero__horizon'), 6],
  ].filter(([el]) => el);
  const target = { x: 0, y: 0 }; const cur = { x: 0, y: 0 }; let raf = 0;
  const tick = () => {
    cur.x += (target.x - cur.x) * 0.08; cur.y += (target.y - cur.y) * 0.08;
    for (const [el, k] of layers) el.style.translate = `${(cur.x * k).toFixed(2)}px ${(cur.y * k).toFixed(2)}px`;
    raf = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) > 0.001 ? requestAnimationFrame(tick) : 0;
  };
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    target.x = (e.clientX - r.left) / r.width - 0.5; target.y = (e.clientY - r.top) / r.height - 0.5;
    if (!raf) raf = requestAnimationFrame(tick);
  });
  hero.addEventListener('pointerleave', () => { target.x = target.y = 0; if (!raf) raf = requestAnimationFrame(tick); });
}
