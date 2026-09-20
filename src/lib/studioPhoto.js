// « Photo studio » des produits de la boutique : la station prend son produit
// en photo (n'importe où : atelier, comptoir, sol…), et l'appli le détoure puis
// le repose sur un fond propre, avec ombre de contact et léger reflet, comme le
// font PhotoRoom & co.
//
//   1. cutOutProduct()      détourage (réseau IS-Net dans un Web Worker, voir
//                           studioWorker.js) + nettoyage du masque + retouche
//                           lumière/couleur/netteté du produit seul
//   2. renderStudioPhoto()  mise en scène sur le fond choisi (instantané, on
//                           peut changer de fond sans refaire le détourage)
//   3. canvasToJpegDataUrl() export JPEG sous la limite serveur (~2,2 M car.)
//
// Tout se passe dans le navigateur (canvas) : rien n'est envoyé à un serveur.

export const STUDIO_SIZE = 1000;      // côté de l'image finale (carrée)
const WORK_MAX_SIDE = 1280;           // taille de travail du détourage
const SEG_SIZE = 512;                 // résolution du réseau (qualité ≈ 1024 px, ~4× plus rapide)
export const MAX_IMAGE_CHARS = 2000000; // < 2,2 M (contrainte add_station_shop.sql)

export const STUDIO_PRESETS = [
  { id: 'blanc', label: 'Blanc studio', swatch: '#ffffff', inner: '#ffffff', outer: '#e6e9ee', shadow: 0.30, reflection: 0.10 },
  { id: 'gris', label: 'Gris doux', swatch: '#cdd2d9', inner: '#f2f3f5', outer: '#bfc6cf', shadow: 0.34, reflection: 0.12 },
  { id: 'noir', label: 'Noir premium', swatch: '#1c1f26', inner: '#4a5162', outer: '#111318', shadow: 0.60, reflection: 0.24 },
  { id: 'bleu', label: 'Bleu Clean Car', swatch: '#2563eb', inner: '#5b9bf8', outer: '#1b3a8f', shadow: 0.42, reflection: 0.16 },
];

// ─── Worker ─────────────────────────────────────────────────────────────
let worker = null;
let nextJobId = 1;
const jobs = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./studioWorker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const job = jobs.get(data.id);
    if (!job) return;
    if (data.type === 'progress') { job.onProgress?.(data); return; }
    jobs.delete(data.id);
    if (data.type === 'result') job.resolve(data.mask);
    else job.reject(new Error(data.message || 'Détourage impossible.'));
  };
  worker.onerror = (event) => {
    const err = new Error(event.message || 'Le module de détourage n’a pas pu démarrer.');
    for (const job of jobs.values()) job.reject(err);
    jobs.clear();
    worker.terminate();
    worker = null;
  };
  return worker;
}

function segmentInWorker(pixels, size, onProgress) {
  return new Promise((resolve, reject) => {
    const id = nextJobId++;
    jobs.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ id, pixels, size }, [pixels.buffer]);
  });
}

// ─── Images ─────────────────────────────────────────────────────────────
function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
}

// Blob/File/data URL -> ImageBitmap, en respectant l'orientation EXIF (photos de téléphone).
export async function loadImage(source) {
  const blob = source instanceof Blob ? source : await (await fetch(source)).blob();
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

function fitToMaxSide(bitmap, maxSide) {
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = makeCanvas(bitmap.width * ratio, bitmap.height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Photo d'origine compressée (sans détourage), sous la limite serveur.
export async function compressOriginal(source, maxSide = 1400) {
  const bitmap = await loadImage(source);
  const canvas = fitToMaxSide(bitmap, maxSide);
  bitmap.close?.();
  return canvasToJpegDataUrl(canvas);
}

// JPEG (fond blanc sous les zones transparentes) sous MAX_IMAGE_CHARS.
export function canvasToJpegDataUrl(canvas) {
  const flat = makeCanvas(canvas.width, canvas.height);
  const ctx = flat.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  let quality = 0.9;
  let url = flat.toDataURL('image/jpeg', quality);
  while (url.length > MAX_IMAGE_CHARS && quality > 0.4) {
    quality -= 0.1;
    url = flat.toDataURL('image/jpeg', quality);
  }
  return url;
}

// ─── Masque ─────────────────────────────────────────────────────────────
// Garde le produit (et ses parties séparées importantes), efface les petits
// îlots parasites que le réseau laisse parfois dans le décor. Composantes
// connexes sur le masque basse résolution.
function keepMainComponents(mask, size) {
  const n = size * size;
  const THRESHOLD = 40;
  const label = new Int32Array(n);
  const queue = new Int32Array(n);
  const areas = [0];
  let count = 0;
  for (let start = 0; start < n; start++) {
    if (mask[start] < THRESHOLD || label[start]) continue;
    count += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = count;
    let area = 0;
    while (head < tail) {
      const p = queue[head++];
      area += 1;
      const x = p % size;
      const y = (p - x) / size;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const q = ny * size + nx;
          if (!label[q] && mask[q] >= THRESHOLD) { label[q] = count; queue[tail++] = q; }
        }
      }
    }
    areas.push(area);
  }
  if (!count) return mask;
  const largest = Math.max(...areas);
  const keep = areas.map((a) => a >= largest * 0.08);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = label[i] ? (keep[label[i]] ? mask[i] : 0) : (mask[i] < THRESHOLD ? 0 : mask[i]);
  return out;
}

// alpha 0..255 -> courbe qui durcit la frontière produit/fond sans crénelage.
function sharpenAlpha(alpha) {
  const lo = 0.42;
  const hi = 0.92;
  for (let i = 0; i < alpha.length; i++) {
    const t = Math.min(1, Math.max(0, (alpha[i] / 255 - lo) / (hi - lo)));
    alpha[i] = Math.round(t * t * (3 - 2 * t) * 255);
  }
}

// Érosion 3×3 (retire le liseré de fond restant sur le bord) puis flou 3×3
// (bord doux, sans marche d'escalier).
function refineEdges(alpha, w, h) {
  const eroded = new Uint8Array(alpha.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const v = alpha[yy * w + Math.min(w - 1, Math.max(0, x + dx))];
          if (v < m) m = v;
        }
      }
      eroded[y * w + x] = m;
    }
  }
  const out = new Uint8Array(alpha.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) sum += eroded[yy * w + Math.min(w - 1, Math.max(0, x + dx))];
      }
      out[y * w + x] = Math.round(sum / 9);
    }
  }
  return out;
}

// ─── Retouche du produit ────────────────────────────────────────────────
// Étire la plage de lumière (photos ternes/sous-exposées), redonne un peu de
// couleur et de netteté — uniquement sur les pixels du produit.
function enhanceProduct(imageData) {
  const { data, width, height } = imageData;
  const hist = new Uint32Array(256);
  let samples = 0;
  let lumaSum = 0;
  for (let i = 0; i < data.length; i += 16) { // 1 pixel sur 4
    if (data[i + 3] < 230) continue;
    const l = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[l] += 1;
    samples += 1;
    lumaSum += l;
  }
  if (samples < 50) return;
  const percentile = (p) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= samples * p) return v; } return 255; };
  const p2 = percentile(0.02);
  const p98 = percentile(0.98);
  // Gain borné : on améliore sans dénaturer un produit volontairement sombre ou clair.
  const gain = Math.min(1.4, Math.max(0.95, 235 / Math.max(40, p98 - Math.min(p2, 30))));
  const lift = Math.min(p2, 30);
  const mean = lumaSum / samples;
  const gamma = mean < 105 ? 0.88 : mean > 190 ? 1.06 : 1;
  const saturation = 1.1;

  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    let r = Math.min(255, Math.max(0, (data[i] - lift) * gain));
    let g = Math.min(255, Math.max(0, (data[i + 1] - lift) * gain));
    let b = Math.min(255, Math.max(0, (data[i + 2] - lift) * gain));
    if (gamma !== 1) { r = 255 * (r / 255) ** gamma; g = 255 * (g / 255) ** gamma; b = 255 * (b / 255) ** gamma; }
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = Math.min(255, Math.max(0, luma + (r - luma) * saturation));
    data[i + 1] = Math.min(255, Math.max(0, luma + (g - luma) * saturation));
    data[i + 2] = Math.min(255, Math.max(0, luma + (b - luma) * saturation));
  }

  // Netteté légère (masque flou 3×3), 45 % — l'alpha n'est pas touché.
  const src = new Uint8ClampedArray(data);
  const amount = 0.45;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      if (!src[i + 3]) continue;
      for (let c = 0; c < 3; c++) {
        const blur = (src[i + c - 4] + src[i + c + 4] + src[i + c - width * 4] + src[i + c + width * 4] + src[i + c]) / 5;
        data[i + c] = Math.min(255, Math.max(0, src[i + c] + (src[i + c] - blur) * amount * 2));
      }
    }
  }
}

// ─── 1. Détourage ───────────────────────────────────────────────────────
// `onProgress({ phase: 'download'|'init'|'segment'|'finish', loaded?, total? })`.
// Retourne { canvas, width, height } : le produit seul (fond transparent),
// rogné au plus juste, prêt pour renderStudioPhoto().
export async function cutOutProduct(source, { onProgress } = {}) {
  const bitmap = await loadImage(source);
  const work = fitToMaxSide(bitmap, WORK_MAX_SIDE);
  bitmap.close?.();
  const w = work.width;
  const h = work.height;

  // Image d'entrée du réseau : carré SEG_SIZE (étirée — le réseau y est insensible).
  const small = makeCanvas(SEG_SIZE, SEG_SIZE);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(work, 0, 0, SEG_SIZE, SEG_SIZE);
  const pixels = new Uint8ClampedArray(sctx.getImageData(0, 0, SEG_SIZE, SEG_SIZE).data);

  const rawMask = await segmentInWorker(pixels, SEG_SIZE, onProgress);
  onProgress?.({ phase: 'finish' });
  const mask = keepMainComponents(rawMask, SEG_SIZE);

  // Masque -> taille de travail (interpolation bilinéaire du canvas).
  const maskSmall = makeCanvas(SEG_SIZE, SEG_SIZE);
  const mctx = maskSmall.getContext('2d');
  const maskImage = mctx.createImageData(SEG_SIZE, SEG_SIZE);
  for (let i = 0; i < mask.length; i++) {
    maskImage.data[i * 4] = mask[i];
    maskImage.data[i * 4 + 3] = 255;
  }
  mctx.putImageData(maskImage, 0, 0);
  const maskWork = makeCanvas(w, h);
  const mwctx = maskWork.getContext('2d', { willReadFrequently: true });
  mwctx.imageSmoothingQuality = 'high';
  mwctx.drawImage(maskSmall, 0, 0, w, h);
  const maskPixels = mwctx.getImageData(0, 0, w, h).data;

  let alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = maskPixels[i * 4];
  sharpenAlpha(alpha);
  alpha = refineEdges(alpha, w, h);

  // Boîte englobante du produit.
  let minX = w; let minY = h; let maxX = -1; let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || (maxX - minX) < w * 0.04 || (maxY - minY) < h * 0.04) {
    throw new Error("Aucun produit n'a été détecté sur la photo. Rapprochez-vous et centrez le produit.");
  }

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  const colors = wctx.getImageData(minX, minY, cw, ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) colors.data[(y * cw + x) * 4 + 3] = alpha[(y + minY) * w + (x + minX)];
  }
  enhanceProduct(colors);

  const canvas = makeCanvas(cw, ch);
  canvas.getContext('2d').putImageData(colors, 0, 0);
  return { canvas, width: cw, height: ch };
}

// ─── 2. Mise en scène ───────────────────────────────────────────────────
function paintBackground(ctx, preset, size) {
  const gradient = ctx.createRadialGradient(size * 0.5, size * 0.42, size * 0.05, size * 0.5, size * 0.5, size * 0.78);
  gradient.addColorStop(0, preset.inner);
  gradient.addColorStop(1, preset.outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
}

// Ellipse floutée (dégradé radial aplati) : ombre portée au sol, sans dépendre de
// ctx.filter (absent de Safari < 18).
function paintFloorShadow(ctx, cx, cy, rx, ry, alpha) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
  gradient.addColorStop(0.55, `rgba(0,0,0,${alpha * 0.45})`);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function renderStudioPhoto(cutout, presetId = 'blanc') {
  const preset = STUDIO_PRESETS.find((p) => p.id === presetId) || STUDIO_PRESETS[0];
  const size = STUDIO_SIZE;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  paintBackground(ctx, preset, size);

  const scale = Math.min((size * 0.78) / cutout.width, (size * 0.70) / cutout.height);
  const w = cutout.width * scale;
  const h = cutout.height * scale;
  const x = (size - w) / 2;
  const y = size * 0.5 - h / 2 - size * 0.035; // un peu au-dessus du centre : de la place pour l'ombre
  const footY = y + h;

  // Ombre au sol : une large et douce, une serrée sous le produit.
  paintFloorShadow(ctx, size / 2, footY + size * 0.004, w * 0.56, Math.max(size * 0.03, h * 0.07), preset.shadow * 0.7);
  paintFloorShadow(ctx, size / 2, footY, w * 0.40, Math.max(size * 0.014, h * 0.03), preset.shadow);

  // Léger reflet sur le sol (produit retourné, fondu vers le bas).
  if (preset.reflection > 0) {
    const mirror = makeCanvas(w, h);
    const mctx = mirror.getContext('2d');
    mctx.translate(0, mirror.height);
    mctx.scale(1, -1);
    mctx.drawImage(cutout.canvas, 0, 0, mirror.width, mirror.height);
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.globalCompositeOperation = 'destination-in';
    const fade = mctx.createLinearGradient(0, 0, 0, mirror.height * 0.4);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    mctx.fillStyle = fade;
    mctx.fillRect(0, 0, mirror.width, mirror.height);
    ctx.globalAlpha = preset.reflection;
    ctx.drawImage(mirror, x, footY + size * 0.004);
    ctx.globalAlpha = 1;
  }

  ctx.drawImage(cutout.canvas, x, y, w, h);
  return canvas;
}
