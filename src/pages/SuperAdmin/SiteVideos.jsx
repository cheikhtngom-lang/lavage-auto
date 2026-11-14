import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clapperboard, Upload, Eye, EyeOff, Trash2, ArrowUp, ArrowDown, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import {
  SITE_VIDEOS_BUCKET, SITE_VIDEO_MAX_MB, SITE_VIDEO_TYPES, DEFAULT_SITE_VIDEO,
  loadSiteVideos, siteVideoPath, posterFromVideo,
} from '../../lib/siteVideos';

// Super Admin > Vidéos de connexion : les vidéos (pubs, présentation…) que la
// page de connexion / inscription enchaîne à côté du formulaire
// (add_site_videos.sql, src/auth-videos.js). Sans vidéo affichée, la page
// montre le film Galsen du site.
const input = 'w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-sky-500';

export default function SiteVideos() {
  useDocumentTitle('Vidéos de connexion');
  const [videos, setVideos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try { setVideos(await loadSiteVideos(supabase, { all: true })); setError(''); } catch (err) { setError(err.message); }
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  const pick = (e) => {
    const f = e.target.files?.[0] || null;
    setError('');
    if (!f) { setFile(null); return; }
    if (!SITE_VIDEO_TYPES.includes(f.type)) { setError('Choisissez une vidéo MP4, WebM ou MOV.'); e.target.value = ''; setFile(null); return; }
    if (f.size > SITE_VIDEO_MAX_MB * 1024 * 1024) {
      setError(`Vidéo trop lourde (${(f.size / 1048576).toFixed(1).replace('.', ',')} Mo) : ${SITE_VIDEO_MAX_MB} Mo au plus. Exportez-la en 720p (une vidéo de 30 s fait alors 5 à 10 Mo).`);
      e.target.value = ''; setFile(null); return;
    }
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 80));
  };

  const upload = async (e) => {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setError('');
    const videoPath = siteVideoPath(file);
    let posterPath = null;
    try {
      setStep("Préparation de l'image de départ…");
      const poster = await posterFromVideo(file);
      setStep('Envoi de la vidéo…');
      const { error: upErr } = await supabase.storage.from(SITE_VIDEOS_BUCKET).upload(videoPath, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
      if (upErr) throw upErr;
      if (poster) {
        posterPath = videoPath.replace(/\.[^.]+$/, '.jpg');
        const { error: posterErr } = await supabase.storage.from(SITE_VIDEOS_BUCKET).upload(posterPath, poster, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
        if (posterErr) posterPath = null; // la vidéo s'affichera sans image de départ
      }
      setStep('Enregistrement…');
      const { data: { user } } = await supabase.auth.getUser();
      const nextOrder = videos.reduce((m, v) => Math.max(m, v.sort_order ?? 0), 0) + 1;
      const { error: insErr } = await supabase.from('site_videos').insert({
        title: title.trim(), video_path: videoPath, poster_path: posterPath, placement: 'connexion', active: true, sort_order: nextOrder, created_by: user?.id || null,
      });
      if (insErr) throw insErr;
      setTitle(''); setFile(null); if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      // Rien ne doit rester à moitié envoyé.
      await supabase.storage.from(SITE_VIDEOS_BUCKET).remove([videoPath, posterPath].filter(Boolean));
      setError(/maximum allowed size|too large|413/i.test(err.message || '') ? `Vidéo trop lourde : ${SITE_VIDEO_MAX_MB} Mo au plus.` : (err.message || "L'envoi n'a pas abouti. Réessayez."));
    } finally { setStep(''); }
  };

  const run = async (id, fn) => { setBusyId(id); try { await fn(); await load(); } catch (err) { setError(err.message); } finally { setBusyId(null); } };
  const toggle = (v) => run(v.id, async () => { const { error: err } = await supabase.from('site_videos').update({ active: !v.active }).eq('id', v.id); if (err) throw err; });
  const move = (v, dir) => run(v.id, async () => {
    const i = videos.findIndex((x) => x.id === v.id);
    const other = videos[i + dir];
    if (!other) return;
    // Ordre réécrit 1, 2, 3… : deux vidéos au même rang ne se bloquent pas.
    const order = videos.map((x) => x.id);
    [order[i], order[i + dir]] = [order[i + dir], order[i]];
    for (const [k, id] of order.entries()) {
      const { error: err } = await supabase.from('site_videos').update({ sort_order: k + 1 }).eq('id', id);
      if (err) throw err;
    }
  });
  const remove = (v) => {
    if (!window.confirm(`Supprimer la vidéo « ${v.title} » ? Elle disparaît de la page de connexion et le fichier est effacé.`)) return;
    run(v.id, async () => {
      const { error: err } = await supabase.from('site_videos').delete().eq('id', v.id);
      if (err) throw err;
      await supabase.storage.from(SITE_VIDEOS_BUCKET).remove([v.video_path, v.poster_path].filter(Boolean));
    });
  };

  const shown = videos.filter((v) => v.active);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight">Vidéos de <span className="text-sky-400">connexion</span></h1>
          <p className="text-neutral-400 text-lg max-w-2xl">Pubs et présentations qui passent à côté du formulaire de connexion et d'inscription, l'une après l'autre, dans l'ordre ci-dessous.</p>
        </div>
        <a href="/login.html" target="_blank" rel="noopener" className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-3 rounded-xl font-medium transition-colors shrink-0">
          <ExternalLink className="w-4 h-4" /> Voir la page
        </a>
      </div>

      <div className="glass-card rounded-2xl border border-white/5 bg-white/[0.02] p-5 mb-8">
        <p className="text-sm font-semibold text-neutral-400 mb-1">Sur la page en ce moment</p>
        <p className="text-white">
          {shown.length === 0
            ? <>Aucune vidéo affichée : la page montre le film Galsen (« {DEFAULT_SITE_VIDEO.title} »).</>
            : <>{shown.length} vidéo{shown.length > 1 ? 's' : ''} : {shown.map((v) => v.title).join(' → ')}</>}
        </p>
        <p className="text-xs text-neutral-500 mt-2">Sur ordinateur, elles démarrent seules, sans le son. Sur téléphone, le visiteur appuie pour lancer (son forfait internet est épargné).</p>
      </div>

      <form onSubmit={upload} className="glass-card rounded-2xl border border-white/5 bg-white/[0.02] p-5 mb-8 space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Upload className="w-5 h-5 text-sky-400" /> Ajouter une vidéo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sv-file" className="block text-xs text-neutral-400 mb-1.5">Vidéo (MP4, WebM ou MOV, {SITE_VIDEO_MAX_MB} Mo au plus)</label>
            <input id="sv-file" ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={pick}
              className="block w-full text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-500" />
            {file && <p className="text-xs text-neutral-500 mt-1.5">{file.name} · {(file.size / 1048576).toFixed(1).replace('.', ',')} Mo</p>}
          </div>
          <div>
            <label htmlFor="sv-title" className="block text-xs text-neutral-400 mb-1.5">Titre (pour vous retrouver, lu aussi par les lecteurs d'écran)</label>
            <input id="sv-title" type="text" maxLength={80} placeholder="Ex : Pub Galsen novembre" value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
          </div>
        </div>
        <p className="text-xs text-neutral-500">Conseil : 720p, 15 à 60 s. Le début de la vidéo sert d'image d'attente sur téléphone.</p>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <button type="submit" disabled={!!step || !file || !title.trim()}
          className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl transition-colors">
          {step ? <><Loader2 className="w-4 h-4 animate-spin" /> {step}</> : <><Upload className="w-4 h-4" /> Envoyer la vidéo</>}
        </button>
      </form>

      {!loaded ? (
        <div className="glass-card rounded-2xl h-40 border border-white/5 bg-white/[0.02] animate-pulse" />
      ) : videos.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <Clapperboard className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <p className="text-neutral-400">Aucune vidéo pour l'instant. La page de connexion montre le film Galsen.</p>
        </div>
      ) : (
        <ol className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] divide-y divide-white/5">
          {videos.map((v, i) => (
            <li key={v.id} className={`p-4 sm:p-5 flex flex-wrap items-center gap-4 ${busyId === v.id ? 'opacity-60' : ''}`}>
              <span className="w-7 text-center text-neutral-500 font-bold tabular-nums">{i + 1}</span>
              <video src={v.src} poster={v.poster || undefined} muted playsInline preload="metadata" controls
                className="w-48 aspect-video rounded-lg bg-black object-contain border border-white/10" aria-label={v.title} />
              <div className="min-w-0 flex-1">
                <p className={`font-medium break-words ${v.active ? 'text-white' : 'text-neutral-500 line-through'}`}>{v.title}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  {v.active ? 'Affichée' : 'Masquée'} · ajoutée le {new Date(v.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {!v.poster && ' · sans image de départ'}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => move(v, -1)} disabled={i === 0 || !!busyId} title="Monter" aria-label={`Monter « ${v.title} »`}
                  className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 text-neutral-300 rounded-lg transition-colors"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" onClick={() => move(v, 1)} disabled={i === videos.length - 1 || !!busyId} title="Descendre" aria-label={`Descendre « ${v.title} »`}
                  className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 text-neutral-300 rounded-lg transition-colors"><ArrowDown className="w-4 h-4" /></button>
                <button type="button" onClick={() => toggle(v)} disabled={!!busyId} title={v.active ? 'Masquer' : 'Afficher'} aria-label={`${v.active ? 'Masquer' : 'Afficher'} « ${v.title} »`}
                  className="p-2 bg-white/5 hover:bg-white/10 text-neutral-300 rounded-lg transition-colors">{v.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                <button type="button" onClick={() => remove(v)} disabled={!!busyId} title="Supprimer" aria-label={`Supprimer « ${v.title} »`}
                  className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
