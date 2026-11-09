// On-device AI, via transformers.js (ONNX Runtime in WebAssembly).
//
// Two models, both downloaded once on first use and then cached by the
// browser, so they work offline afterwards:
//   - RMBG-1.4      background removal        (~45 MB)
//   - CLIP ViT-B/32 "what is this garment"    (~90 MB)
// Nothing is uploaded: images never leave the phone.

import { TYPES, typesIn } from '../core/catalog.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6';
const BG_MODEL = 'briaai/RMBG-1.4';
const CLIP_MODEL = 'Xenova/clip-vit-base-patch32';

let libP = null;
function lib() {
  if (!libP) {
    libP = import(/* @vite-ignore */ LIB).then((m) => {
      m.env.allowLocalModels = false;
      m.env.useBrowserCache = true;
      return m;
    });
    libP.catch(() => { libP = null; });
  }
  return libP;
}

// Download progress across all files of a model, as one 0–1 number.
function progressTracker(onProgress) {
  const files = new Map();
  return (e) => {
    if (e.status === 'progress' && e.total) {
      files.set(e.file, [e.loaded, e.total]);
      let l = 0, t = 0;
      for (const [a, b] of files.values()) { l += a; t += b; }
      onProgress?.(t ? l / t : 0);
    }
  };
}

const pipes = new Map();
async function getPipe(task, model, opts, onProgress) {
  const key = `${task}:${model}`;
  if (!pipes.has(key)) {
    const p = lib().then((m) => m.pipeline(task, model, { device: 'wasm', ...opts, progress_callback: progressTracker(onProgress) }));
    pipes.set(key, p);
    p.catch(() => pipes.delete(key));
  }
  return pipes.get(key);
}

// canvas → RawImage
async function raw(canvas) {
  const m = await lib();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  return m.RawImage.fromBlob(blob);
}

// Returns an alpha mask the size of the canvas (Uint8ClampedArray), or
// throws if the model can't be loaded.
export async function aiMask(canvas, onProgress) {
  const seg = await getPipe('background-removal', BG_MODEL, { dtype: 'q8' }, onProgress);
  const [out] = await seg(await raw(canvas));
  // The pipeline returns the image with the mask as its alpha channel, at the
  // input size.
  const { width, height, channels, data } = out;
  const W = canvas.width, H = canvas.height;
  const mask = new Uint8ClampedArray(W * H);
  // Nearest-neighbour resample in case the model returned another size.
  for (let y = 0; y < H; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / H));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / W));
      mask[y * W + x] = data[(sy * width + sx) * channels + (channels - 1)];
    }
  }
  return mask;
}

// Plain-language prompts CLIP understands better than catalog labels.
const PHRASE = {
  tshirt: 'plain t-shirt', undershirt: 'thin white undershirt', 'graphic-tee': 't-shirt with a graphic print', longsleeve: 'long sleeve t-shirt',
  tank: 'tank top', oxford: 'casual button-down shirt', 'dress-shirt': 'formal dress shirt', flannel: 'plaid flannel shirt',
  'linen-shirt': 'linen shirt', sweater: 'knit sweater', sweatshirt: 'crewneck sweatshirt', 'quarter-zip': 'quarter-zip pullover',
  vest: 'sweater vest', 'denim-jacket': 'denim jacket', overshirt: 'overshirt jacket', 'chore-jacket': 'chore jacket',
  'suit-jacket': 'suit jacket', overcoat: 'long wool overcoat', trench: 'trench coat', 'rain-jacket': 'rain jacket',
  trousers: 'dress trousers', joggers: 'sweatpants', cargo: 'cargo pants', 'athletic-shorts': 'athletic shorts',
  'leather-sneakers': 'white leather sneakers', canvas: 'canvas sneakers', runners: 'running shoes',
  chelsea: 'chelsea boots', 'dress-shoes': 'leather dress shoes', 'suede-shoes': 'suede shoes', sandals: 'sandals',
  jumpsuit: 'jumpsuit', necklace: 'necklace', cap: 'baseball cap',
};
const phrase = (t) => PHRASE[t.key] || t.label.toLowerCase().split(' / ')[0];

const PATTERN_LABELS = {
  solid: 'a plain solid-colour garment',
  stripes: 'a striped garment',
  check: 'a plaid or checked garment',
  print: 'a garment with a floral or all-over print',
  graphic: 'a garment with a logo or graphic',
  texture: 'a textured knit garment',
};

const FABRIC_LABELS = {
  cotton: 'cotton', denim: 'denim', wool: 'wool knit', linen: 'linen', leather: 'leather', suede: 'suede',
  fleece: 'fleece', nylon: 'nylon', corduroy: 'corduroy', canvas: 'canvas', silk: 'silk',
};

// Guess type, pattern and fabric from a cut-out on white.
export async function classify(canvas, onProgress) {
  const clip = await getPipe('zero-shot-image-classification', CLIP_MODEL, { dtype: 'q8' }, onProgress);
  const img = await raw(canvas);
  const ask = async (labels, template) => {
    const out = await clip(img, labels, { hypothesis_template: template });
    return out.sort((a, b) => b.score - a.score);
  };

  const typeLabels = TYPES.map(phrase);
  const typeOut = await ask(typeLabels, 'a photo of a {}');
  const best = TYPES[typeLabels.indexOf(typeOut[0].label)];
  // Runner-up types in other categories help the form offer alternatives.
  const options = typeOut.slice(0, 4).map((o) => TYPES[typeLabels.indexOf(o.label)].key);

  let pattern = 'solid';
  if (best.cat !== 'accessory') {
    const keys = Object.keys(PATTERN_LABELS);
    const out = await ask(keys.map((k) => PATTERN_LABELS[k]), 'a photo of {}');
    pattern = keys[Object.values(PATTERN_LABELS).indexOf(out[0].label)];
  }

  const fabricKeys = Object.keys(FABRIC_LABELS);
  const fabOut = await ask(fabricKeys.map((k) => FABRIC_LABELS[k]), `a photo of a ${phrase(best)} made of {}`);
  const fabric = fabricKeys[Object.values(FABRIC_LABELS).indexOf(fabOut[0].label)];

  return { type: best.key, confidence: typeOut[0].score, options, pattern, fabric };
}

// Are the model files already on the phone? (Checks the browser cache
// transformers.js writes to.)
export async function modelStatus() {
  try {
    const cache = await caches.open('transformers-cache');
    const keys = (await cache.keys()).map((r) => r.url);
    return {
      background: keys.some((u) => u.includes(BG_MODEL) && u.endsWith('.onnx')),
      classify: keys.some((u) => u.includes(CLIP_MODEL) && u.endsWith('.onnx')),
    };
  } catch {
    return { background: false, classify: false };
  }
}

export async function preload(onProgress) {
  let a = 0, b = 0;
  const report = () => onProgress?.((a + b) / 2);
  await getPipe('background-removal', BG_MODEL, { dtype: 'q8' }, (p) => { a = p; report(); });
  await getPipe('zero-shot-image-classification', CLIP_MODEL, { dtype: 'q8' }, (p) => { b = p; report(); });
}

export async function clearModels() {
  pipes.clear();
  // Only these two models: the valet's chat model shares the cache.
  try {
    const cache = await caches.open('transformers-cache');
    for (const r of await cache.keys()) if (r.url.includes(BG_MODEL) || r.url.includes(CLIP_MODEL)) await cache.delete(r);
  } catch { /* nothing cached */ }
}

export { typesIn };
