// Pixel work that doesn't need a browser: dominant colours, and a classical
// "item on the floor" background remover used when the AI model isn't
// available (first launch offline, or the download failed).
//
// Images are { data: Uint8ClampedArray RGBA, width, height }.

import { rgbToLab, labDist, nearestColor, rgbToHex, COLOR } from '../core/color.js';

function kmeans(points, k, iters = 12) {
  if (points.length <= k) return points.map((p) => ({ c: p, n: 1 }));
  // k-means++ style seeding, deterministic: farthest-point from the mean.
  const centers = [points[Math.floor(points.length / 2)]];
  while (centers.length < k) {
    let far = null, farD = -1;
    for (let i = 0; i < points.length; i += 7) {
      const d = Math.min(...centers.map((c) => labDist(c, points[i])));
      if (d > farD) { farD = d; far = points[i]; }
    }
    centers.push(far);
  }
  let assign = new Array(points.length).fill(0);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < points.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = labDist(points[i], centers[c]);
        if (d < bd) { bd = d; best = c; }
      }
      assign[i] = best;
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const s = sums[assign[i]];
      s[0] += points[i][0]; s[1] += points[i][1]; s[2] += points[i][2]; s[3]++;
    }
    for (let c = 0; c < centers.length; c++) {
      if (sums[c][3]) centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    }
  }
  const counts = centers.map(() => 0);
  for (const a of assign) counts[a]++;
  return centers.map((c, i) => ({ c, n: counts[i], assign }));
}

// Dominant named colours of the visible (opaque) pixels.
export function palette(img, { k = 5, maxSamples = 5000 } = {}) {
  const { data, width, height } = img;
  const total = width * height;
  const step = Math.max(1, Math.floor(total / maxSamples));
  const rgbs = [];
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    if (data[i + 3] < 200) continue;
    rgbs.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (!rgbs.length) return [];
  const labs = rgbs.map(rgbToLab);
  const clusters = kmeans(labs, Math.min(k, labs.length));
  const assign = clusters[0].assign || labs.map((_, i) => i);

  // Average RGB per cluster (nicer than converting Lab back).
  const acc = clusters.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < rgbs.length; i++) {
    const a = acc[assign[i]];
    a[0] += rgbs[i][0]; a[1] += rgbs[i][1]; a[2] += rgbs[i][2]; a[3]++;
  }
  const byName = new Map();
  for (const a of acc) {
    if (!a[3]) continue;
    const rgb = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
    const name = nearestColor(rgb);
    const share = a[3] / rgbs.length;
    const prev = byName.get(name);
    if (prev) prev.share += share;
    else byName.set(name, { name, hex: rgbToHex(rgb), share });
  }
  return [...byName.values()]
    .filter((c) => c.share >= 0.07)
    .sort((a, b) => b.share - a.share)
    .map((c) => ({ ...c, share: Math.round(c.share * 100) / 100 }));
}

// ── classical background removal ────────────────────────────

// Returns an alpha mask (Uint8ClampedArray, 0 = background, 255 = item).
export function floorMask(img) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const lab = new Array(n);
  for (let p = 0; p < n; p++) lab[p] = rgbToLab([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]);

  // Model the floor from a border strip; a few clusters so wood grain or a
  // patterned rug still counts as one background.
  const bw = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  const border = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < bw || y < bw || x >= w - bw || y >= h - bw) border.push(lab[y * w + x]);
    }
  }
  const sample = border.filter((_, i) => i % Math.max(1, Math.floor(border.length / 3000)) === 0);
  const bg = kmeans(sample, 3).filter((c) => c.n > sample.length * 0.08).map((c) => c.c);
  const dist = (p) => Math.min(...bg.map((c) => labDist(c, lab[p])));

  // Threshold from how much the floor itself varies.
  const ds = sample.map((s) => Math.min(...bg.map((c) => labDist(c, s)))).sort((a, b) => a - b);
  const spread = ds[Math.floor(ds.length * 0.9)] || 0;
  const t = Math.min(32, Math.max(10, spread * 1.6 + 6));

  // Flood from the edges through floor-coloured pixels.
  const isBg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  const seed = (p) => { if (!isBg[p] && dist(p) < t) { isBg[p] = 1; queue[qt++] = p; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (qh < qt) {
    const p = queue[qh++];
    const x = p % w, y = (p / w) | 0;
    const nb = [];
    if (x > 0) nb.push(p - 1);
    if (x < w - 1) nb.push(p + 1);
    if (y > 0) nb.push(p - w);
    if (y < h - 1) nb.push(p + w);
    for (const q of nb) {
      if (isBg[q]) continue;
      // Either close to the floor model, or a smooth continuation of a
      // floor pixel (shadows, gradual lighting falloff).
      if (dist(q) < t || (labDist(lab[q], lab[p]) < t * 0.25 && dist(q) < t * 1.8)) {
        isBg[q] = 1;
        queue[qt++] = q;
      }
    }
  }

  // Largest foreground component only — drops specks of dust and lint.
  const comp = new Int32Array(n).fill(-1);
  let bestId = -1, bestSize = 0, id = 0;
  for (let s = 0; s < n; s++) {
    if (isBg[s] || comp[s] !== -1) continue;
    let size = 0;
    qh = qt = 0;
    queue[qt++] = s;
    comp[s] = id;
    while (qh < qt) {
      const p = queue[qh++];
      size++;
      const x = p % w, y = (p / w) | 0;
      const nb = [];
      if (x > 0) nb.push(p - 1);
      if (x < w - 1) nb.push(p + 1);
      if (y > 0) nb.push(p - w);
      if (y < h - 1) nb.push(p + w);
      for (const q of nb) if (!isBg[q] && comp[q] === -1) { comp[q] = id; queue[qt++] = q; }
    }
    if (size > bestSize) { bestSize = size; bestId = id; }
    id++;
  }

  const mask = new Uint8ClampedArray(n);
  for (let p = 0; p < n; p++) mask[p] = comp[p] === bestId ? 255 : 0;
  return feather(erode(mask, w, h), w, h);
}

// Shave one pixel off the edge: the outermost ring usually blends floor
// colour into the cut-out.
function erode(mask, w, h) {
  const out = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      out[p] = mask[p] && x > 0 && y > 0 && x < w - 1 && y < h - 1
        && mask[p - 1] && mask[p + 1] && mask[p - w] && mask[p + w] ? 255 : 0;
    }
  }
  return out;
}

// A 1-pixel box blur on the mask edge so cut-outs don't look jagged.
function feather(mask, w, h) {
  const out = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          s += mask[yy * w + xx];
          c++;
        }
      }
      out[y * w + x] = s / c;
    }
  }
  return out;
}

// Bounding box of pixels with alpha above `min`, padded.
export function contentBox(img, min = 24, pad = 0.04) {
  const { data, width: w, height: h } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > min) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };
  const px = Math.round((x1 - x0) * pad), py = Math.round((y1 - y0) * pad);
  const x = Math.max(0, x0 - px), y = Math.max(0, y0 - py);
  return { x, y, w: Math.min(w, x1 + px + 1) - x, h: Math.min(h, y1 + py + 1) - y };
}

// Share of the frame the mask kept: a sanity check on any removal result.
export function coverage(mask) {
  let s = 0;
  for (let i = 0; i < mask.length; i++) s += mask[i] > 127 ? 1 : 0;
  return s / mask.length;
}

export const isNeutralName = (n) => !!COLOR[n]?.neutral;
