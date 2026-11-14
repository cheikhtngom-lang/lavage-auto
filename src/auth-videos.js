// Vidéos de la page de connexion / inscription (login.html, bloc #auth-media) :
// celles que le Super Admin a mises dans Super Admin > Vidéos de connexion
// (add_site_videos.sql), l'une après l'autre, sinon le film Galsen du site.
//  - Ordinateur : lecture seule, sans le son (bouton « Son »), pause quand le
//    bloc sort de l'écran ou que l'onglet est caché.
//  - Téléphone, tablette, économiseur de données, « réduire les animations » :
//    rien ne se télécharge avant que le visiteur appuie sur Lecture.
import { supabase } from './lib/supabaseClient.js';
import { loadSiteVideos, DEFAULT_SITE_VIDEO } from './lib/siteVideos.js';

const root = document.getElementById('auth-media');
const frame = root?.querySelector('.auth-media__frame');
const video = root?.querySelector('video');
const playBtn = root?.querySelector('.auth-media__play');
const titleEl = root?.querySelector('.auth-media__title');
const dotsEl = root?.querySelector('.auth-media__dots');
const soundBtn = root?.querySelector('[data-sound]');
const pauseBtn = root?.querySelector('[data-pause]');
const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>';

const SOUND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
const SOUND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';

if (root && video && frame) start();

async function start() {
  const conn = navigator.connection;
  const autoplay = matchMedia('(min-width: 1024px) and (pointer: fine)').matches
    && !matchMedia('(prefers-reduced-motion: reduce)').matches
    && !(conn && conn.saveData);

  let list = [];
  try {
    // 2,5 s au plus : au-delà, le film Galsen (la page ne doit pas attendre).
    list = await Promise.race([loadSiteVideos(supabase), new Promise((r) => setTimeout(() => r(null), 2500))]) || [];
  } catch { list = []; }
  list = list.filter((v) => v.src);
  if (!list.length) list = [DEFAULT_SITE_VIDEO];

  let index = 0;
  let engaged = autoplay; // lecture en cours voulue (auto ou après appui)
  let visible = true;

  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');

  const setAspect = () => {
    if (video.videoWidth && video.videoHeight) frame.style.setProperty('--ar', (video.videoWidth / video.videoHeight).toFixed(4));
    root.style.setProperty('--ar', frame.style.getPropertyValue('--ar'));
  };
  video.addEventListener('loadedmetadata', setAspect);

  const renderDots = () => {
    if (!dotsEl) return;
    dotsEl.textContent = '';
    if (list.length < 2) return;
    list.forEach((v, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'auth-media__dot';
      b.setAttribute('aria-label', `Vidéo ${i + 1} sur ${list.length} : ${v.title}`);
      if (i === index) b.setAttribute('aria-current', 'true');
      b.appendChild(document.createElement('i'));
      b.addEventListener('click', () => { engaged = true; show(i, true); });
      dotsEl.appendChild(b);
    });
  };

  const play = () => { const p = video.play(); if (p) p.catch(() => { engaged = false; playBtn.hidden = false; }); };

  function show(i, andPlay) {
    index = (i + list.length) % list.length;
    const v = list[index];
    video.poster = v.poster || '';
    video.preload = andPlay ? 'auto' : (v.poster ? 'none' : 'metadata');
    // Sans image de départ : la première image de la vidéo en tient lieu.
    video.src = andPlay || v.poster ? v.src : `${v.src}#t=0.1`;
    video.setAttribute('aria-label', v.title);
    if (titleEl) titleEl.textContent = v.title;
    renderDots();
    if (andPlay) { playBtn.hidden = true; play(); } else playBtn.hidden = false;
  }

  video.addEventListener('ended', () => {
    if (list.length === 1) { video.currentTime = 0; play(); return; }
    show(index + 1, engaged);
  });

  playBtn.addEventListener('click', () => {
    engaged = true;
    // Appui du visiteur : le son peut être mis tout de suite.
    if (!autoplay) setMuted(false);
    video.controls = !autoplay;
    if (video.currentSrc && !video.currentSrc.includes('#t=')) { playBtn.hidden = true; play(); } else show(index, true);
  });
  // Bouton Pause / Lecture sous la vidéo (une vidéo qui démarre seule doit pouvoir s'arrêter).
  const renderPause = () => {
    if (!pauseBtn) return;
    const playing = !video.paused && !video.ended;
    pauseBtn.innerHTML = `${playing ? PAUSE : PLAY}<span>${playing ? 'Pause' : 'Lecture'}</span>`;
    pauseBtn.setAttribute('aria-label', playing ? 'Mettre la vidéo en pause' : 'Lire la vidéo');
  };
  if (pauseBtn) {
    pauseBtn.hidden = false;
    pauseBtn.addEventListener('click', () => {
      if (!video.paused && !video.ended) { engaged = false; video.pause(); return; }
      playBtn.click();
    });
  }
  video.addEventListener('pause', () => {
    renderPause();
    if (!video.ended && !video.controls && document.visibilityState === 'visible' && visible) playBtn.hidden = false;
  });
  video.addEventListener('play', () => { playBtn.hidden = true; renderPause(); });

  function setMuted(muted) {
    video.muted = muted;
    if (!soundBtn) return;
    soundBtn.innerHTML = `${muted ? SOUND_OFF : SOUND_ON}<span>${muted ? 'Son coupé' : 'Son'}</span>`;
    soundBtn.setAttribute('aria-pressed', String(!muted));
    soundBtn.setAttribute('aria-label', muted ? 'Mettre le son' : 'Couper le son');
  }
  if (soundBtn) {
    setMuted(true);
    soundBtn.hidden = false;
    soundBtn.addEventListener('click', () => {
      setMuted(!video.muted);
      if (!video.muted && video.paused) { engaged = true; playBtn.hidden = true; if (!video.currentSrc || video.currentSrc.includes('#t=')) show(index, true); else play(); }
    });
  }

  // Lecture automatique seulement à l'écran et onglet visible.
  const sync = () => {
    if (!engaged) return;
    if (visible && document.visibilityState === 'visible') { if (video.paused && !video.ended && video.currentSrc && !video.currentSrc.includes('#t=')) play(); } else video.pause();
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }, { threshold: 0.25 }).observe(frame);
  document.addEventListener('visibilitychange', sync);

  renderPause();
  show(0, autoplay);
}
