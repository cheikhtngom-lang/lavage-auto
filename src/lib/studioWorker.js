// Web Worker de détourage des photos produit (voir studioPhoto.js).
//
// Exécute le réseau de segmentation IS-Net (DIS, licence Apache-2.0 ; export
// ONNX quantifié « poids seulement » de 42 Mo, qualité identique au fp32) avec
// onnxruntime-web, ENTIÈREMENT dans le navigateur : la photo ne quitte jamais
// l'appareil, aucun service payant, aucune clé d'API. Dans un worker pour ne
// pas figer l'écran pendant les quelques secondes de calcul.
//
// Le modèle (42 Mo) est téléchargé UNE fois puis gardé dans le Cache Storage du
// navigateur. Il est chargé depuis Hugging Face à une révision figée : pour ne
// plus dépendre d'un tiers, l'héberger chez soi et changer MODEL_URL.
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

const MODEL_URL = 'https://huggingface.co/xrds/isnet-general-onnx-int8/resolve/71eff2372ec9c8edbc6ca637ded591423d23b65a/onnx/model_quantized.onnx';
const MODEL_CACHE = 'ccg-studio-model-v1';
const MODEL_BYTES_HINT = 44229662;

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
// Sans isolation cross-origin (COOP/COEP, incompatible avec Google Analytics/cartes),
// le multi-thread WASM n'est pas disponible : un seul thread.
ort.env.wasm.numThreads = 1;

let sessionPromise = null;

async function readModelBytes(onProgress) {
  let cache = null;
  try {
    cache = await caches.open(MODEL_CACHE);
    const hit = await cache.match(MODEL_URL);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch { /* Cache Storage indisponible (navigation privée…) : on télécharge à chaque fois */ }

  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`Téléchargement du modèle impossible (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || MODEL_BYTES_HINT;
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  let lastReport = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    const now = Date.now();
    if (now - lastReport > 150) { lastReport = now; onProgress({ phase: 'download', loaded, total }); }
  }
  onProgress({ phase: 'download', loaded, total });
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (cache) {
    try { await cache.put(MODEL_URL, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })); } catch { /* quota */ }
  }
  return bytes;
}

function getSession(onProgress) {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const bytes = await readModelBytes(onProgress);
      onProgress({ phase: 'init' });
      return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    })().catch((err) => { sessionPromise = null; throw err; });
  }
  return sessionPromise;
}

// `pixels` : RGBA (Uint8ClampedArray) d'une image size × size.
// Retourne le masque (Uint8Array size × size, 0 = fond, 255 = produit).
async function segment(session, pixels, size) {
  const n = size * size;
  const input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    input[i] = (pixels[i * 4] - 128) / 256;
    input[n + i] = (pixels[i * 4 + 1] - 128) / 256;
    input[2 * n + i] = (pixels[i * 4 + 2] - 128) / 256;
  }
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, size, size]) });
  const map = out[session.outputNames[0]].data;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) { const v = map[i]; if (v < min) min = v; if (v > max) max = v; }
  const span = max - min || 1;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = Math.round(((map[i] - min) / span) * 255);
  return mask;
}

self.onmessage = async ({ data }) => {
  const { id, pixels, size } = data;
  const report = (p) => self.postMessage({ id, type: 'progress', ...p });
  try {
    const session = await getSession(report);
    report({ phase: 'segment' });
    const mask = await segment(session, pixels, size);
    self.postMessage({ id, type: 'result', mask }, [mask.buffer]);
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err?.message || err) });
  }
};
