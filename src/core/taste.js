// Your taste, learned on the phone.
//
// A small logistic regression over sparse features: which items you like,
// which pairs you like together, which colour pairings you like, and how all
// of that shifts by mode. It starts at zero (no opinion) and moves with every
// outfit you wear, skip, tweak or save. Simple on purpose: with a few dozen
// items and one person, a big model would just memorise noise.

import { SLOTS } from './rules.js';

export const emptyModel = () => ({ b: 0, w: {}, n: 0 });

export function features(outfit, mode) {
  const core = SLOTS.map((s) => outfit[s]).filter(Boolean);
  const all = [...core, ...(outfit.accessories || [])];
  const f = [];
  for (const i of all) {
    f.push(`i:${i.id}`);
    f.push(`mi:${mode}:${i.id}`);
  }
  for (let a = 0; a < all.length; a++) {
    for (let b = a + 1; b < all.length; b++) {
      const [x, y] = [all[a].id, all[b].id].sort();
      f.push(`p:${x}|${y}`);
    }
  }
  const cols = [...new Set(core.map((i) => i.colors?.[0]?.name).filter(Boolean))].sort();
  for (let a = 0; a < cols.length; a++) {
    f.push(`cm:${mode}:${cols[a]}`);
    for (let b = a + 1; b < cols.length; b++) f.push(`c:${cols[a]}|${cols[b]}`);
  }
  return f;
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

export function logit(model, feats) {
  const scale = 1 / Math.sqrt(feats.length || 1);
  let z = model.b;
  for (const k of feats) z += (model.w[k] || 0) * scale;
  return z;
}

export const predict = (model, feats) => sigmoid(logit(model, feats));

// One SGD step. `label` is 1 (liked) or 0 (not), `weight` how much to trust
// the signal: wearing something is strong, skipping it is weak (you might
// just have worn it yesterday).
export function learn(model, feats, label, weight = 1, lr = 0.3) {
  const scale = 1 / Math.sqrt(feats.length || 1);
  const g = (label - predict(model, feats)) * weight;
  model.b += lr * g * 0.1;
  for (const k of feats) {
    const w = model.w[k] || 0;
    const next = w + lr * (g * scale - 0.002 * w);
    if (Math.abs(next) < 1e-4) delete model.w[k];
    else model.w[k] = next;
  }
  model.n++;
  return model;
}

// Signal strengths for the things you do in the app.
export const SIGNALS = {
  wore: [1, 1],
  saved: [1, 1.5],
  skipped: [0, 0.35],
  swappedOut: [0, 0.6], // the outfit with the piece you replaced
  swappedIn: [1, 0.8], // the outfit with your replacement
};

export function record(model, outfit, mode, signal) {
  const [label, weight] = SIGNALS[signal];
  return learn(model, features(outfit, mode), label, weight);
}

// How much taste moves an outfit's score: bounded, so it can reorder close
// calls but never override a rule.
export function tasteScore(model, outfit, mode) {
  const z = logit(model, features(outfit, mode)) - model.b;
  return Math.max(-1.5, Math.min(1.5, z * 0.8));
}
