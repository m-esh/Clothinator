// Builds outfits out of the closet and ranks them. Pure: everything it needs
// is passed in, so it runs the same in the app and in tests.

import { stats } from './catalog.js';
import { evaluate, MODES, piecesOf } from './rules.js';
import { tasteScore } from './taste.js';

// ── small utilities ─────────────────────────────────────────

export function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) {
    h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86400000;
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

// What counts as "the same outfit again": the same top(s) with the same
// bottom. Shoes, jackets and accessories are allowed to repeat — with ~30
// items they have to.
export function comboKey(outfit) {
  return [outfit.base, outfit.mid, outfit.onepiece, outfit.bottom]
    .filter(Boolean).map((i) => i.id).sort().join('+');
}

export function fullKey(outfit) {
  return piecesOf(outfit).map((i) => i.id).sort().join('+');
}

// ── history ─────────────────────────────────────────────────

// wears: [{ date: 'YYYY-MM-DD', itemIds: [...], combo }]
export function historyIndex(wears) {
  const combo = new Map();
  const item = new Map();
  for (const w of wears) {
    if (w.combo && (!combo.has(w.combo) || combo.get(w.combo) < w.date)) combo.set(w.combo, w.date);
    for (const id of w.itemIds) if (!item.has(id) || item.get(id) < w.date) item.set(id, w.date);
  }
  return { combo, item };
}

function varietyScore(outfit, hist, today) {
  let s = 0;
  let note = null;
  const last = hist.combo.get(comboKey(outfit));
  if (last) {
    const d = daysBetween(last, today);
    if (d < 14) s -= 3 * (1 - d / 14) + 0.5;
    else if (d >= 21) note = `haven't worn this combo in ${Math.round(d / 7)} weeks`;
  } else {
    note = 'a combination you haven\'t worn yet';
  }
  for (const i of piecesOf(outfit)) {
    const cat = stats(i).cat;
    if (cat === 'accessory') continue;
    const li = hist.item.get(i.id);
    const light = cat === 'shoes' || cat === 'outer';
    if (li) {
      const d = daysBetween(li, today);
      if (d <= 0) s -= light ? 0.3 : 1.2;
      else if (d <= 2) s -= light ? 0.1 : 0.35;
      else if (d >= 21) s += 0.1;
    } else s += 0.1;
  }
  return { s, note };
}

// ── accessories ─────────────────────────────────────────────

function accessoryBonus(item, outfit, ctx) {
  const s = stats(item);
  const w = ctx.weather;
  const mode = ctx.mode;
  switch (s.kind) {
    case 'wrist': return 0.25;
    case 'belt': {
      const b = outfit.bottom && stats(outfit.bottom);
      if (!b?.loops || mode === 'comfy') return -1;
      return mode === 'fancy' || (outfit.base && stats(outfit.base).tuck) ? 0.45 : 0.15;
    }
    case 'neckwear': {
      if (mode !== 'fancy') return -1;
      const shirt = outfit.base && ['dress-shirt', 'oxford'].includes(outfit.base.type);
      const jacket = outfit.outer && ['blazer', 'suit-jacket'].includes(outfit.outer.type);
      return shirt && jacket ? 0.3 : -1;
    }
    case 'head':
      if (s.cold) return w && w.feelsMin < 6 ? 0.5 : -1;
      return w?.sunny && mode !== 'fancy' ? 0.1 : -0.3;
    case 'neck': return w && w.feelsMin < 6 ? 0.5 : -1;
    case 'hands': return w && w.feelsMin < 2 ? 0.5 : -1;
    case 'eyes': return w?.sunny ? 0.3 : -1;
    case 'jewelry': return mode === 'comfy' ? 0.05 : 0.15;
    case 'bag': return s.casualOnly && mode === 'fancy' ? -1 : 0.1;
    default: return 0;
  }
}

function total(outfit, ctx, extra = 0) {
  const ev = evaluate(outfit, ctx);
  if (ev.veto) return { ev, score: -Infinity };
  const accBonus = (outfit.accessories || []).reduce((a, i) => a + accessoryBonus(i, outfit, ctx), 0);
  const taste = ctx.model ? tasteScore(ctx.model, outfit, ctx.mode) : 0;
  return { ev, taste, score: ev.score + accBonus + taste + extra };
}

export function accessorize(outfit, accessories, ctx) {
  let best = { ...outfit, accessories: [...(outfit.accessories || [])] };
  let bestScore = total(best, ctx).score;
  const byKind = new Map();
  for (const a of accessories) {
    const k = stats(a).kind;
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push(a);
  }
  for (const [kind, group] of byKind) {
    const room = kind === 'jewelry' ? 2 : 1;
    for (let n = 0; n < room; n++) {
      let pick = null, pickScore = bestScore + 0.12;
      for (const a of group) {
        if (best.accessories.includes(a)) continue;
        const trial = { ...best, accessories: [...best.accessories, a] };
        const sc = total(trial, ctx).score;
        if (sc > pickScore) { pick = trial; pickScore = sc; }
      }
      if (!pick) break;
      best = pick;
      bestScore = pickScore;
    }
  }
  return best;
}

// ── enumeration ─────────────────────────────────────────────

function bucket(items) {
  const by = { base: [], mid: [], outer: [], bottom: [], onepiece: [], shoes: [], accessory: [] };
  for (const i of items) {
    const s = stats(i);
    if (s.cat === 'top') by[s.layer].push(i);
    else by[s.cat].push(i);
  }
  return by;
}

function* bodies(by) {
  for (const b of by.base) {
    yield { base: b };
    for (const m of by.mid) yield { base: b, mid: m };
  }
  for (const m of by.mid) if (stats(m).alone) yield { mid: m };
}

function* candidates(by) {
  const shoes = by.shoes.length ? by.shoes : [null];
  const outers = [null, ...by.outer];
  const lowers = [];
  for (const body of bodies(by)) for (const bottom of by.bottom) lowers.push({ ...body, bottom });
  for (const op of by.onepiece) {
    lowers.push({ onepiece: op });
    for (const m of by.mid) lowers.push({ onepiece: op, mid: m });
  }
  for (const l of lowers) for (const sh of shoes) for (const o of outers) {
    const fit = { ...l, accessories: [] };
    if (sh) fit.shoes = sh;
    if (o) fit.outer = o;
    yield fit;
  }
}

// Keep the search bounded for big closets: per slot, keep the pieces closest
// to the mode's formality.
function prune(by, mode, limit) {
  const target = MODES[mode]?.target ?? 2;
  const out = {};
  for (const [k, list] of Object.entries(by)) {
    out[k] = list.length <= limit || k === 'accessory'
      ? list
      : [...list].sort((a, b) => Math.abs(stats(a).formality - target) - Math.abs(stats(b).formality - target)).slice(0, limit);
  }
  return out;
}

function estimate(by) {
  const tops = by.base.length * (1 + by.mid.length) + by.mid.length;
  return (tops * by.bottom.length + by.onepiece.length * (1 + by.mid.length))
    * Math.max(1, by.shoes.length) * (1 + by.outer.length);
}

/**
 * @param o.items    every item in the closet
 * @param o.saved    saved outfits: [{ id, itemIds }]
 * @param o.wears    wear log
 * @param o.mode     'fancy' | 'casual' | 'comfy'
 * @param o.weather  summary from weather.summarize, or null
 * @param o.prefs    { neverPairs }
 * @param o.model    taste model
 * @param o.today    'YYYY-MM-DD'
 * @param o.skip     combo keys to leave out (skipped this morning)
 * @param o.seed     anything; same seed → same order
 * @returns { picks: [{ outfit, score, notes, key, combo, savedId? }], pool }
 */
export function suggest(o) {
  const ctx = { mode: o.mode, weather: o.weather, prefs: o.prefs, model: o.model };
  const usable = o.items.filter((i) => !i.inLaundry && !i.blocked);
  const byId = new Map(o.items.map((i) => [i.id, i]));
  let by = bucket(usable);
  for (const limit of [12, 9, 7, 5, 4]) {
    if (estimate(by) <= 25000) break;
    by = prune(by, o.mode, limit);
  }
  const hist = historyIndex(o.wears || []);
  const skip = new Set(o.skip || []);
  const favs = new Set(usable.filter((i) => i.favorite).map((i) => i.id));

  const scored = [];
  const seen = new Set();
  const consider = (outfit, bonus = 0, savedId) => {
    const combo = comboKey(outfit);
    if (skip.has(combo)) return;
    const key = fullKey(outfit);
    if (seen.has(key)) return;
    seen.add(key);
    const v = varietyScore(outfit, hist, o.today);
    const fav = piecesOf(outfit).filter((i) => favs.has(i.id)).length * 0.25;
    const t = total(outfit, ctx, v.s + bonus + fav);
    if (t.score === -Infinity) return;
    scored.push({ outfit, score: t.score, rules: t.ev.score, taste: t.taste, variety: v, combo, key, savedId });
  };

  for (const s of o.saved || []) {
    const pieces = s.itemIds.map((id) => byId.get(id));
    if (pieces.some((p) => !p || p.inLaundry || p.blocked)) continue;
    const fit = assemble(pieces);
    consider(fit, 0.8, s.id);
    // Your outfit, plus whichever jacket today's weather wants.
    if (!fit.outer) for (const o of by.outer) consider({ ...fit, outer: o }, 0.8, s.id);
  }
  for (const c of candidates(by)) consider(c);

  scored.sort((a, b) => b.score - a.score);
  const pool = new Set(scored.filter((s) => s.rules > -1.5).map((s) => s.combo)).size;

  // Best version of each look first, so 40 slots aren't spent on one top +
  // bottom in six pairs of shoes. Then dress them with accessories.
  const bestPerCombo = [];
  const firstSeen = new Set();
  // Your saved version of a look beats a generated twin of it.
  const savedCombos = new Set(scored.filter((s) => s.savedId).map((s) => s.combo));
  for (const s of scored) {
    if (firstSeen.has(s.combo)) continue;
    if (savedCombos.has(s.combo) && !s.savedId) continue;
    firstSeen.add(s.combo);
    bestPerCombo.push(s);
  }
  const top = bestPerCombo.slice(0, 40).map((s) => {
    // Saved outfits keep the accessories you chose; bare ones get dressed.
    if (s.savedId && s.outfit.accessories?.length) return s;
    const outfit = accessorize(s.outfit, by.accessory, ctx);
    const t = total(outfit, ctx, s.score - total(s.outfit, ctx).score + 0);
    return { ...s, outfit, score: t.score, rules: t.ev.score, taste: t.taste, key: fullKey(outfit) };
  });
  top.sort((a, b) => b.score - a.score);

  // One per combo (Gumbel-top-k sampling over a softmax of the scores below).
  const unique = [];
  const combos = new Set();
  for (const s of top) {
    if (combos.has(s.combo)) continue;
    combos.add(s.combo);
    unique.push(s);
  }
  // Mix up the first few, weighted by score; the rest stay in order. Most
  // day-to-day variety comes from the repeat penalty, not from chance.
  const r = rng(o.seed ?? o.today);
  const T = 0.3;
  const head = unique.slice(0, 5);
  const best = head[0]?.score ?? 0;
  const keyed = head.map((s) => {
    const g = -Math.log(-Math.log(Math.max(1e-9, r())));
    // Outfits well below the best never get shuffled ahead of it.
    return { s, k: s.score >= best - 0.8 ? s.score / T + g : s.score / T - 50 };
  });
  keyed.sort((a, b) => b.k - a.k);
  keyed.push(...unique.slice(5).map((s) => ({ s })));

  const picks = keyed.map(({ s }) => {
    const ev = evaluate(s.outfit, ctx);
    const notes = ev.notes.filter((n) => n.tone !== 'bad');
    if (s.variety.note) notes.push({ tone: 'good', text: s.variety.note });
    if (s.taste > 0.4) notes.push({ tone: 'good', text: 'close to what you usually pick' });
    if (s.savedId) notes.unshift({ tone: 'good', text: 'one of your saved outfits' });
    return { outfit: s.outfit, score: s.score, notes, key: s.key, combo: s.combo, savedId: s.savedId };
  });
  return { picks, pool };
}

// Turn a flat list of items into slots.
export function assemble(items) {
  const fit = { accessories: [] };
  for (const i of items) {
    const s = stats(i);
    if (s.cat === 'top') {
      if (s.layer === 'base' && !fit.base) fit.base = i;
      else if (s.layer === 'mid' && !fit.mid) fit.mid = i;
      else if (!fit.base) fit.base = i;
      else fit.mid = fit.mid || i;
    } else if (s.cat === 'accessory') fit.accessories.push(i);
    else if (!fit[s.cat]) fit[s.cat] = i;
  }
  return fit;
}

// Alternatives for one slot, best first, each with its verdict.
export function alternatives(outfit, slot, items, o) {
  const ctx = { mode: o.mode, weather: o.weather, prefs: o.prefs, model: o.model };
  const pool = items.filter((i) => !i.inLaundry && !i.blocked);
  const fits = (i) => {
    const s = stats(i);
    if (slot === 'base') return s.cat === 'top' && s.layer === 'base';
    if (slot === 'mid') return s.cat === 'top' && s.layer === 'mid';
    if (slot === 'accessory') return s.cat === 'accessory';
    return s.cat === slot;
  };
  return pool.filter(fits).map((i) => {
    let next;
    if (slot === 'accessory') {
      const k = stats(i).kind;
      const rest = (outfit.accessories || []).filter((a) => a.id !== i.id && (k === 'jewelry' || stats(a).kind !== k));
      next = { ...outfit, accessories: [...rest, i] };
    } else {
      next = { ...outfit, [slot]: i };
      if (slot === 'onepiece') delete next.bottom;
      if (slot === 'bottom') delete next.onepiece;
    }
    const ev = evaluate(next, ctx);
    return { item: i, outfit: next, ev, score: ev.veto ? -Infinity : ev.score + (ctx.model ? tasteScore(ctx.model, next, ctx.mode) : 0) };
  }).sort((a, b) => b.score - a.score);
}
