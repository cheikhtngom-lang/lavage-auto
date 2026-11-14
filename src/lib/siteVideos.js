// Vidéos de la page de connexion / inscription (add_site_videos.sql) —
// partagé par login.html (src/auth-videos.js, affichage) et
// Super Admin > Vidéos de connexion (SiteVideos.jsx, envoi et réglages).
// Fichiers dans le bucket public « site-videos » ; la table site_videos garde
// le titre, les chemins, l'ordre et l'état affiché / masqué.
export const SITE_VIDEOS_BUCKET = 'site-videos';
export const SITE_VIDEO_MAX_MB = 30;
export const SITE_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

// Film Galsen servi par le site : montré tant que le Super Admin n'a rien mis.
export const DEFAULT_SITE_VIDEO = {
  id: 'galsen',
  title: 'Galsen Auto Cleaner en 1 minute',
  src: '/videos/motion-design.mp4',
  poster: '/images/motion-design-poster.jpg',
};

export function siteVideoUrl(supabase, path) {
  if (!path) return null;
  return supabase.storage.from(SITE_VIDEOS_BUCKET).getPublicUrl(path).data?.publicUrl || null;
}

// Vidéos actives d'un emplacement, dans l'ordre choisi. `all` (Super Admin)
// lit aussi les vidéos masquées : la RLS ne les donne qu'à lui.
export async function loadSiteVideos(supabase, { placement = 'connexion', all = false } = {}) {
  let query = supabase.from('site_videos')
    .select('id, title, video_path, poster_path, active, sort_order, created_at')
    .eq('placement', placement)
    .order('sort_order')
    .order('created_at');
  if (!all) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((v) => ({
    ...v,
    src: siteVideoUrl(supabase, v.video_path),
    poster: siteVideoUrl(supabase, v.poster_path),
  }));
}

// Nom de fichier sûr dans le bucket : connexion/<uuid>.<ext>
export function siteVideoPath(file, placement = 'connexion') {
  const ext = (/\.([a-z0-9]{2,5})$/i.exec(file.name || '')?.[1] || (file.type.split('/')[1] || 'mp4')).toLowerCase().replace('quicktime', 'mov');
  return `${placement}/${crypto.randomUUID()}.${ext}`;
}

// Image de départ prise dans la vidéo (à `at` secondes, 1 s par défaut),
// en JPEG de 1280 px de large au plus. null si le navigateur ne sait pas lire
// la vidéo (un MOV sous Windows, par exemple) : la page affichera la vidéo
// sans image de départ.
export function posterFromVideo(file, at = 1) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let done = false;
    const finish = (blob) => { if (done) return; done = true; URL.revokeObjectURL(url); video.removeAttribute('src'); resolve(blob); };
    const timer = setTimeout(() => finish(null), 8000);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('error', () => { clearTimeout(timer); finish(null); });
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(at, Math.max(0, (video.duration || 0) - 0.1));
    });
    video.addEventListener('seeked', () => {
      const w = video.videoWidth; const h = video.videoHeight;
      if (!w || !h) { clearTimeout(timer); finish(null); return; }
      const ratio = Math.min(1, 1280 / w);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      try {
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => { clearTimeout(timer); finish(blob); }, 'image/jpeg', 0.82);
      } catch { clearTimeout(timer); finish(null); }
    }, { once: true });
    video.src = url;
  });
}
