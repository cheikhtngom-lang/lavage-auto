import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, SwitchCamera, ImagePlus, Loader2 } from 'lucide-react';

// Appareil photo intégré (caméra arrière par défaut sur téléphone) : cadre de
// visée carré — c'est le format des photos studio de la boutique —, bouton de
// capture, changement de caméra. Si la caméra est refusée ou absente, on
// propose l'appareil photo du téléphone (input capture) et la galerie.
// `onCapture(blob)` reçoit la photo en JPEG pleine résolution.

const ERRORS = {
  NotAllowedError: "L'accès à la caméra est refusé. Autorisez-la dans les réglages du navigateur (cadenas de la barre d'adresse), ou prenez la photo avec l'appareil du téléphone.",
  PermissionDeniedError: "L'accès à la caméra est refusé. Autorisez-la dans les réglages du navigateur, ou prenez la photo avec l'appareil du téléphone.",
  NotFoundError: "Aucune caméra détectée sur cet appareil.",
  NotReadableError: "La caméra est déjà utilisée par une autre application.",
};

export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState('environment');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [canSwitch, setCanSwitch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("La caméra n'est pas disponible dans ce navigateur (ou la page n'est pas en HTTPS). Utilisez l'appareil photo du téléphone ci-dessous.");
      return undefined;
    }
    (async () => {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) { video.srcObject = stream; await video.play().catch(() => {}); }
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) {
          setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1);
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) setError(ERRORS[err?.name] || "Impossible de démarrer la caméra.");
      }
    })();
    return () => { cancelled = true; };
  }, [facing]);

  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => { if (blob) onCapture(blob); }, 'image/jpeg', 0.92);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onCapture(file);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <p className="font-bold flex items-center gap-2"><Camera className="w-5 h-5 text-blue-400" /> Photo du produit</p>
        <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20" aria-label="Fermer">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        {!error && (
          <>
            <video ref={videoRef} playsInline muted autoPlay className="max-h-full max-w-full object-contain" />
            {!ready && <Loader2 className="absolute w-8 h-8 text-white/70 animate-spin" />}
            {ready && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="aspect-square h-[78%] max-w-[92%] rounded-3xl border-2 border-dashed border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            )}
          </>
        )}
        {error && (
          <div className="max-w-sm px-6 text-center">
            <p className="text-white mb-4">{error}</p>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-neutral-300 px-6 py-2">
        Centrez le produit dans le cadre, bien éclairé, sur un fond simple (mur, sol propre). L'appli le détourera pour un rendu studio.
      </p>

      <div className="flex items-center justify-between gap-4 px-6 pb-6 pt-2">
        <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm cursor-pointer">
          <ImagePlus className="w-4 h-4" /> Galerie
          <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </label>
        <button type="button" onClick={capture} disabled={!ready}
          className="w-[72px] h-[72px] rounded-full bg-white border-4 border-white/40 disabled:opacity-40 active:scale-95 transition-transform" aria-label="Prendre la photo" />
        {canSwitch ? (
          <button type="button" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white" aria-label="Changer de caméra">
            <SwitchCamera className="w-5 h-5" />
          </button>
        ) : (
          <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm cursor-pointer">
            <Camera className="w-4 h-4" /> Appareil
            <input type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
          </label>
        )}
      </div>
    </div>
  );
}
