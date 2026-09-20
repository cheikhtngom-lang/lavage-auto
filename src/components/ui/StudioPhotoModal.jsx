import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Loader2, X, Check, ImageIcon, AlertTriangle } from 'lucide-react';
import {
  STUDIO_PRESETS, cutOutProduct, renderStudioPhoto, canvasToJpegDataUrl, compressOriginal,
} from '../../lib/studioPhoto';

// « Photo studio » d'un produit : détoure la photo (dans le navigateur) et la
// pose sur un fond propre avec ombre et reflet — voir lib/studioPhoto.js.
// `source` : Blob/File ou data URL de la photo à traiter.
// `onUse(dataUrl)` : photo à enregistrer (studio, ou d'origine compressée).
export default function StudioPhotoModal({ source, onUse, onClose }) {
  const [status, setStatus] = useState('processing'); // 'processing' | 'ready' | 'error'
  const [progress, setProgress] = useState({ phase: 'segment' });
  const [error, setError] = useState('');
  const [cutout, setCutout] = useState(null);
  const [presetId, setPresetId] = useState('blanc');
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const runRef = useRef(0);

  const originalUrl = useMemo(() => (source instanceof Blob ? URL.createObjectURL(source) : source), [source]);
  useEffect(() => () => { if (source instanceof Blob) URL.revokeObjectURL(originalUrl); }, [source, originalUrl]);

  const start = () => {
    const run = ++runRef.current;
    setStatus('processing');
    setProgress({ phase: 'segment' });
    setError('');
    cutOutProduct(source, { onProgress: (p) => { if (run === runRef.current) setProgress(p); } })
      .then((result) => { if (run === runRef.current) { setCutout(result); setStatus('ready'); } })
      .catch((err) => { if (run === runRef.current) { setError(err?.message || 'Le détourage a échoué.'); setStatus('error'); } });
  };

  useEffect(() => { start(); return () => { runRef.current += 1; }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [source]);

  // Aperçu : re-rendu instantané à chaque changement de fond.
  const previewUrl = useMemo(
    () => (cutout ? renderStudioPhoto(cutout, presetId).toDataURL('image/jpeg', 0.86) : null),
    [cutout, presetId],
  );

  const useStudio = () => {
    if (!cutout || busy) return;
    setBusy(true);
    // Laisse React afficher l'état « busy » avant l'export (synchrone, ~100 ms).
    setTimeout(() => {
      try { onUse(canvasToJpegDataUrl(renderStudioPhoto(cutout, presetId))); }
      finally { setBusy(false); }
    }, 30);
  };

  const useOriginal = async () => {
    if (busy) return;
    setBusy(true);
    try { onUse(await compressOriginal(source)); }
    catch { setError("Impossible de lire cette photo."); setStatus('error'); }
    finally { setBusy(false); }
  };

  const mb = (n) => (n / 1048576).toFixed(0);
  const message = progress.phase === 'download'
    ? `Téléchargement du module studio (une seule fois) : ${mb(progress.loaded)} / ${mb(progress.total)} Mo`
    : progress.phase === 'init' ? 'Préparation du module studio…'
    : progress.phase === 'finish' ? 'Finitions…'
    : 'Détourage du produit en cours…';
  const percent = progress.phase === 'download' && progress.total ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-white/10 rounded-2xl p-5 w-full max-w-lg shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-white" aria-label="Fermer">
          <X className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-400" /> Photo studio</h2>
        <p className="text-neutral-400 text-sm mb-4">Le produit est détouré et posé sur un fond professionnel. La photo reste sur votre appareil.</p>

        <div className="aspect-square w-full rounded-2xl overflow-hidden bg-neutral-950 border border-white/10 relative flex items-center justify-center">
          {status === 'ready' && previewUrl && (
            <img src={showOriginal ? originalUrl : previewUrl} alt="Aperçu" className={`w-full h-full ${showOriginal ? 'object-contain' : 'object-cover'}`} />
          )}
          {status === 'processing' && (
            <>
              <img src={originalUrl} alt="" className="absolute inset-0 w-full h-full object-contain opacity-30" />
              <div className="relative text-center px-6">
                <Loader2 className="w-9 h-9 text-blue-400 animate-spin mx-auto mb-3" />
                <p className="text-white font-medium text-sm">{message}</p>
                {percent != null && (
                  <div className="mt-3 h-1.5 w-56 max-w-full mx-auto rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${percent}%` }} />
                  </div>
                )}
                {progress.phase === 'segment' && <p className="text-neutral-500 text-xs mt-2">Quelques secondes à une trentaine de secondes selon l'appareil.</p>}
              </div>
            </>
          )}
          {status === 'error' && (
            <div className="text-center px-6">
              <AlertTriangle className="w-9 h-9 text-amber-400 mx-auto mb-3" />
              <p className="text-white text-sm">{error}</p>
            </div>
          )}
        </div>

        {status === 'ready' && (
          <>
            <div className="flex items-center justify-between gap-3 mt-4">
              <div className="flex gap-2">
                {STUDIO_PRESETS.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setPresetId(p.id); setShowOriginal(false); }} title={p.label} aria-label={p.label}
                    className={`w-9 h-9 rounded-full border-2 transition-all ${presetId === p.id && !showOriginal ? 'border-blue-400 scale-110' : 'border-white/20 hover:border-white/50'}`}
                    style={{ background: p.swatch }} />
                ))}
              </div>
              <button type="button" onMouseDown={() => setShowOriginal(true)} onMouseUp={() => setShowOriginal(false)} onMouseLeave={() => setShowOriginal(false)}
                onTouchStart={() => setShowOriginal(true)} onTouchEnd={() => setShowOriginal(false)}
                className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5 select-none">
                <ImageIcon className="w-4 h-4" /> Maintenir : voir l'original
              </button>
            </div>
            <p className="text-neutral-500 text-xs mt-2">{STUDIO_PRESETS.find((p) => p.id === presetId)?.label}</p>
          </>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mt-5">
          {status === 'ready' && (
            <button type="button" onClick={useStudio} disabled={busy}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Utiliser cette photo
            </button>
          )}
          {status === 'error' && (
            <button type="button" onClick={start}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors">Réessayer</button>
          )}
          <button type="button" onClick={useOriginal} disabled={busy}
            className="flex-1 bg-white/5 hover:bg-white/10 disabled:opacity-60 text-neutral-200 font-medium py-3 rounded-xl transition-colors">
            Garder la photo d'origine
          </button>
        </div>
      </div>
    </div>
  );
}
