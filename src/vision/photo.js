// Photo pipeline: phone photo → cut-out on transparent background, a
// thumbnail, the dominant colours, and (separately) an AI guess at what it is.

import { floorMask, contentBox, coverage, palette } from './pixels.js';
import { aiMask, classify } from './ai.js';

const MAX = 1024;

export async function toCanvas(blob, max = MAX) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode(); // honours EXIF orientation on iOS
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const blobOf = (canvas, type = 'image/png', q) => new Promise((r) => canvas.toBlob(r, type, q));

function scaled(canvas, max) {
  const s = Math.min(1, max / Math.max(canvas.width, canvas.height));
  if (s === 1) return canvas;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * s));
  c.height = Math.max(1, Math.round(canvas.height * s));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

const pixels = (c) => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);

// The classical remover runs on a small copy; its mask is scaled back up
// with smoothing, which also softens the edge.
function classicMask(canvas) {
  const small = scaled(canvas, 360);
  const m = floorMask(pixels(small));
  const mc = document.createElement('canvas');
  mc.width = small.width;
  mc.height = small.height;
  const id = new ImageData(small.width, small.height);
  for (let p = 0; p < m.length; p++) id.data[p * 4 + 3] = m[p];
  mc.getContext('2d').putImageData(id, 0, 0);
  const big = document.createElement('canvas');
  big.width = canvas.width;
  big.height = canvas.height;
  const g = big.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(mc, 0, 0, big.width, big.height);
  const d = g.getImageData(0, 0, big.width, big.height).data;
  const out = new Uint8ClampedArray(big.width * big.height);
  for (let p = 0; p < out.length; p++) out[p] = d[p * 4 + 3];
  return out;
}

const plausible = (mask) => {
  const c = coverage(mask);
  return c > 0.02 && c < 0.97;
};

/**
 * @param source   File/Blob from the camera or library
 * @param method   'auto' | 'ai' | 'classic' | 'none'
 * @param onStatus ({ text, progress }) → void
 */
export async function processPhoto(source, { method = 'auto', onStatus = () => {} } = {}) {
  onStatus({ text: 'Reading photo' });
  const canvas = await toCanvas(source);
  const original = await blobOf(canvas, 'image/jpeg', 0.86);

  let mask = null;
  let used = method;
  if (method === 'auto' || method === 'ai') {
    try {
      onStatus({ text: 'Removing background' });
      mask = await aiMask(canvas, (p) => onStatus({ text: 'Downloading background model (once)', progress: p }));
      if (!plausible(mask)) throw new Error('implausible mask');
      used = 'ai';
    } catch (e) {
      console.warn('AI background removal unavailable:', e);
      mask = null;
      if (method === 'ai') throw e;
    }
  }
  if (!mask && method !== 'none') {
    onStatus({ text: 'Removing background' });
    mask = classicMask(canvas);
    used = plausible(mask) ? 'classic' : 'none';
    if (used === 'none') mask = null;
  }
  if (method === 'none') used = 'none';

  const img = pixels(canvas);
  if (mask) for (let p = 0; p < mask.length; p++) img.data[p * 4 + 3] = mask[p];
  const box = mask ? contentBox(img) : { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const cut = document.createElement('canvas');
  cut.width = box.w;
  cut.height = box.h;
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width;
  tmp.height = canvas.height;
  tmp.getContext('2d').putImageData(img, 0, 0);
  cut.getContext('2d').drawImage(tmp, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);

  const cutoutCanvas = scaled(cut, 900);
  const thumbCanvas = scaled(cut, 360);
  const colors = palette(pixels(scaled(cut, 160)));

  return {
    cutout: await blobOf(cutoutCanvas),
    thumb: await blobOf(thumbCanvas),
    original,
    colors,
    method: used,
    canvas: cutoutCanvas,
  };
}

// AI guess at type / pattern / fabric. Composites the cut-out on white first,
// which is what CLIP sees most of in product photos.
export async function guess(cutoutCanvas, onStatus = () => {}) {
  const c = document.createElement('canvas');
  const s = scaled(cutoutCanvas, 336);
  c.width = s.width;
  c.height = s.height;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(s, 0, 0);
  onStatus({ text: 'Working out what it is' });
  return classify(c, (p) => onStatus({ text: 'Downloading recognition model (once)', progress: p }));
}
