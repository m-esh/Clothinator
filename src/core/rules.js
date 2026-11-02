// The "no screw-ups" layer. Pure: give it an outfit and a context, get back
// a verdict. Used both to rank generated outfits and to warn about ones you
// build yourself.

import { stats } from './catalog.js';
import { harmony, leatherFamily, COLOR } from './color.js';
import { requiredWarmth } from './weather.js';

export const MODES = {
  fancy: { key: 'fancy', label: 'Fancy', target: 3.9, tol: 0.9 },
  casual: { key: 'casual', label: 'Casual', target: 2.0, tol: 1.0 },
  comfy: { key: 'comfy', label: 'Comfy', target: 1.4, tol: 1.2 },
};

export const SLOTS = ['outer', 'mid', 'base', 'onepiece', 'bottom', 'shoes'];

// Note tones: 'good' (a reason it works), 'tip' (advice), 'warn' and 'bad'
// (problems; 'bad' rules the outfit out).
export const isProblem = (n) => n.tone === 'warn' || n.tone === 'bad';

// Every item in an outfit, in a stable order.
export function piecesOf(outfit) {
  return [...SLOTS.map((s) => outfit[s]).filter(Boolean), ...(outfit.accessories || [])];
}

export const itemIds = (outfit) => piecesOf(outfit).map((i) => i.id);

const name = (i) => (i.name || i.type).toLowerCase();

// How much of the base layer shows:
//   'full'   — no mid, or an open one (cardigan, vest)
//   'collar' — under a closed mid, with a collar or high neck that shows
//   'hidden' — under a closed mid, collarless: only the neckline shows
export function baseShows(outfit) {
  if (!outfit.base || !outfit.mid) return 'full';
  const mid = stats(outfit.mid);
  if (mid.open) return 'full';
  return stats(outfit.base).collar ? 'collar' : 'hidden';
}

// A sweater or hoodie on its own: you'd wear something thin under it.
export const impliedUnder = (outfit) => !!outfit.mid && !outfit.base && !stats(outfit.mid).open;

// Weighted formality of what can be seen.
export function formalityOf(outfit) {
  const parts = [];
  const add = (item, w) => item && parts.push([stats(item).formality, w]);
  const shows = baseShows(outfit);
  add(outfit.outer, 1.2);
  add(outfit.mid, 1);
  add(outfit.base, !outfit.mid ? 1 : shows === 'full' ? 0.8 : shows === 'collar' ? 0.6 : 0);
  add(outfit.onepiece, 2);
  add(outfit.bottom, 1.2);
  add(outfit.shoes, 0.9);
  const tw = parts.reduce((a, [, w]) => a + w, 0);
  return tw ? parts.reduce((a, [f, w]) => a + f * w, 0) / tw : 0;
}

export function warmthOf(outfit) {
  const w = (i, k = 1) => (i ? stats(i).warmth * k : 0);
  const extras = (outfit.accessories || []).reduce((a, i) => a + (stats(i).cold ? stats(i).warmth : 0), 0);
  const implied = impliedUnder(outfit) ? 0.7 : 0; // the thin layer under a lone sweater
  const core = w(outfit.base) + implied + w(outfit.mid, 0.9) + w(outfit.onepiece) + w(outfit.bottom, 0.6) + w(outfit.shoes, 0.2) + extras;
  return { core, total: core + w(outfit.outer) };
}

/**
 * @param outfit  { base?, mid?, outer?, bottom?, onepiece?, shoes?, accessories? } — item objects
 * @param ctx     { mode, weather?, prefs? }
 * @returns { veto: string|null, score, notes: [{tone,text}], formality, warmth }
 */
export function evaluate(outfit, ctx = {}) {
  const mode = MODES[ctx.mode] || MODES.casual;
  const w = ctx.weather;
  const notes = [];
  let score = 0;
  let veto = null;
  const good = (text) => notes.push({ tone: 'good', text });
  const warn = (text) => notes.push({ tone: 'warn', text });
  const hard = (text) => { if (!veto) veto = text; notes.push({ tone: 'bad', text }); };

  const S = {};
  for (const slot of SLOTS) if (outfit[slot]) S[slot] = stats(outfit[slot]);
  const acc = (outfit.accessories || []).map((i) => ({ item: i, s: stats(i) }));
  const core = SLOTS.filter((s) => outfit[s]);

  // ── structure ─────────────────────────────────────────────
  if (!outfit.onepiece && !outfit.bottom) hard('missing a bottom');
  if (!outfit.onepiece && !outfit.base && !outfit.mid) hard('missing a top');
  if (outfit.mid && !outfit.base && !S.mid.alone) hard(`${name(outfit.mid)} needs something under it`);
  if (outfit.onepiece && outfit.bottom) hard('one-piece plus a bottom');
  const kinds = {};
  for (const { s } of acc) {
    if (s.kind === 'jewelry') continue;
    kinds[s.kind] = (kinds[s.kind] || 0) + 1;
    if (kinds[s.kind] === 2) hard(`two ${s.kind === 'wrist' ? 'watches' : s.label.toLowerCase() + 's'}`);
  }

  // ── never-pairs you set yourself ──────────────────────────
  const ids = new Set(piecesOf(outfit).map((i) => i.id));
  for (const [a, b] of ctx.prefs?.neverPairs || []) {
    if (ids.has(a) && ids.has(b)) hard('a pairing you said never to suggest');
  }

  // ── what's under a sweater ────────────────────────────────
  // Only what shows is judged on looks; a hidden base still counts for
  // warmth and comfort.
  const shows = baseShows(outfit);
  const seen = core.filter((s) => !(s === 'base' && shows === 'hidden'));
  if (S.base?.polo && S.mid) hard(`polos don't go under a ${S.mid.label.toLowerCase()}`);
  if (S.base?.under) {
    if (!S.mid) hard('an undershirt on its own');
    else if (shows === 'full') hard(`the undershirt would show under the ${S.mid.label.toLowerCase()}`);
  }
  if (impliedUnder(outfit)) notes.push({ tone: 'tip', text: `wear a T-shirt or undershirt under the ${S.mid.label.toLowerCase()}` });

  // ── formality ─────────────────────────────────────────────
  const fs = seen.map((s) => S[s].formality);
  if (fs.length >= 2) {
    const hi = seen.reduce((a, s) => (S[s].formality > S[a].formality ? s : a));
    const lo = seen.reduce((a, s) => (S[s].formality < S[a].formality ? s : a));
    const spread = S[hi].formality - S[lo].formality;
    if (spread >= 3.5) hard(`${name(outfit[hi])} is far too dressy for ${name(outfit[lo])}`);
    else if (spread > 2.5) {
      score -= (spread - 2.5) * 1.2;
      warn(`${name(outfit[hi])} is a lot dressier than ${name(outfit[lo])}`);
    }
  }
  // How well it fits the mood. Skipped with `ignoreMode` (the Outfits page,
  // where an outfit's section already says how dressy it is).
  const F = formalityOf(outfit);
  const off = ctx.ignoreMode ? 0 : (F - mode.target) / mode.tol;
  score -= Math.min(3, off * off * 0.8);
  if (!ctx.ignoreMode) {
    if (Math.abs(off) < 0.5) good(mode.key === 'fancy' ? 'properly sharp' : mode.key === 'comfy' ? 'relaxed all the way' : 'easy, not sloppy');
    else if (Math.abs(off) > 1.5) warn(off > 0 ? `dressier than ${mode.label.toLowerCase()}` : `too casual for ${mode.label.toLowerCase()}`);
  }

  // One clearly casual piece drags a fancy outfit down, however sharp the rest.
  if (mode.key === 'fancy' && !ctx.ignoreMode) {
    for (const sl of seen) {
      if (S[sl].formality < 2.25 && !(sl === 'outer' && (w?.wet || w?.windy || (w && w.feelsMin < 5)))) {
        score -= 0.7;
        warn(`${name(outfit[sl])} is too casual for fancy`);
      }
    }
  }

  // ── classic mistakes ──────────────────────────────────────
  if (S.mid && S.base && ['hoodie', 'sweatshirt', 'fleece'].includes(S.mid.key) && ['dress-shirt', 'blouse'].includes(S.base.key)) {
    score -= 0.9;
    warn(`${name(outfit.base)} under a ${S.mid.label.toLowerCase()} looks off`);
  }
  if (S.bottom?.shorts) {
    if (S.mid?.knit) hard(`shorts with a ${S.mid.label.toLowerCase()}`);
    if (S.outer && S.outer.warmth >= 4) hard(`shorts with a ${S.outer.label.toLowerCase()}`);
  }
  if (S.bottom?.denim && S.outer?.key === 'denim-jacket') {
    const a = outfit.bottom.colors?.[0]?.name, b = outfit.outer.colors?.[0]?.name;
    if (a && a === b) { score -= 0.8; warn('double denim in the same wash'); }
    else score -= 0.2;
  }

  // ── pattern ───────────────────────────────────────────────
  const loudPatterns = seen.map((s) => S[s].pattern).filter((p) => p && p !== 'solid' && p !== 'texture');
  if (loudPatterns.length >= 3) hard('three patterns at once');
  else if (loudPatterns.length === 2) {
    const busy = loudPatterns.filter((p) => p === 'graphic' || p === 'print').length;
    if (busy >= 2) hard('two busy prints together');
    else {
      score -= loudPatterns.includes('stripes') && loudPatterns.includes('check') ? 1.0 : 0.6;
      warn('two patterns competing');
    }
  }

  // ── colour ────────────────────────────────────────────────
  // A hidden base adds no colour; a collar adds a little.
  const h = harmony(piecesOf(outfit)
    .filter((i) => !(i === outfit.base && shows === 'hidden'))
    .map((i) => ({ cat: i === outfit.base && shows === 'collar' ? 'collar' : stats(i).cat, colors: i.colors || [] })));
  score += h.score;
  notes.push(...h.notes);

  // ── weather ───────────────────────────────────────────────
  if (w) {
    // Specific verdicts first, so the reason shown is the useful one.
    if (S.bottom?.shorts && (w.feelsMax < 18 || w.feelsMin < 13)) hard('too cold for shorts');
    if (S.shoes?.key === 'sandals' && (w.feelsMin < 15 || w.wet)) hard('not sandal weather');
    const { core: coreW, total } = warmthOf(outfit);
    const needCold = requiredWarmth(w.feelsMin);
    const needWarm = requiredWarmth(w.feelsMax);
    const deficit = needCold - total;
    if (deficit > 4.5) hard('nowhere near warm enough');
    else if (deficit > 1) { score -= (deficit - 1) * 0.9; warn('might be cold this morning'); }
    const excess = coreW - needWarm;
    if (excess > 3.5) hard('far too warm');
    if (S.outer && S.outer.warmth >= 4 && needCold <= 2.5) hard(`no ${S.outer.label.toLowerCase()} weather`);
    else if (excess > 1.5) { score -= (excess - 1.5) * 0.7; warn('could get hot by the afternoon'); }
    if (outfit.outer && deficit <= 1 && excess <= 1.5 && needCold - needWarm >= 1.5 && coreW < needCold - 0.5) {
      good('jacket for the morning, fine without it later');
    } else if (deficit <= 1 && excess <= 1.5) {
      good('right for the temperature');
    }
    // A coat you'll carry all day without needing.
    if (outfit.outer && coreW >= needCold - 0.3 && !(w.wet && S.outer.rain === 'ok') && !(w.windy && S.outer.wind)) {
      score -= 0.6;
    }

    if (w.wet) {
      if (S.shoes?.rain === 'bad') { score -= 1.5; warn(`${name(outfit.shoes)} in the rain`); }
      else if (S.shoes?.rain === 'ok') score += 0.2;
      if (S.outer?.rain === 'ok') { score += 0.5; good('rain-ready'); }
      else { score -= 0.4; warn('no rain layer, take an umbrella'); }
    }
    if (w.snow && S.shoes && !['boots', 'chelsea'].includes(S.shoes.key)) { score -= 0.8; warn('not snow shoes'); }
    if (w.windy) {
      if (S.outer?.wind) { score += 0.3; good('blocks the wind'); }
      else if (!outfit.outer && w.feelsMin < 15) score -= 0.4;
    }
  }

  // ── comfort ───────────────────────────────────────────────
  if (mode.key === 'comfy') {
    const cs = core.map((s) => S[s].comfort);
    const avg = cs.reduce((a, b) => a + b, 0) / (cs.length || 1);
    score += (avg - 3.5) * 0.8;
    for (const s of core) if (S[s].comfort <= 2) { score -= 1; warn(`${name(outfit[s])} isn't comfy`); }
  }

  // ── accessories ───────────────────────────────────────────
  for (const { item, s } of acc) {
    if (s.casualOnly && mode.key === 'fancy') { score -= 0.8; warn(`${name(item)} undercuts fancy`); }
    if (s.fancyOnly && mode.key !== 'fancy') { score -= 1; warn(`${name(item)} is too formal for today`); }
    if (s.cold && w && w.feelsMin > 14) { score -= 0.8; warn(`${name(item)} in this warmth`); }
    if (s.kind === 'belt' && !outfit.bottom) score -= 0.5;
    if (s.kind === 'belt' && S.bottom && !S.bottom.loops) { score -= 1; warn('belt with no belt loops'); }
    if (s.sunny && w && !w.sunny) score -= 0.2;
  }
  const belt = acc.find(({ s }) => s.kind === 'belt');
  if (belt && outfit.shoes && mode.key === 'fancy') {
    const bf = leatherFamily(belt.item.colors), sf = leatherFamily(outfit.shoes.colors);
    if (bf && sf && bf !== sf) { score -= 0.6; warn('belt and shoes don\'t match'); }
  }

  return { veto, score, notes, formality: F };
}

// Colour names that dominate an outfit, for display.
export function paletteOf(outfit) {
  const seen = new Set();
  for (const i of piecesOf(outfit)) {
    const c = i.colors?.[0]?.name;
    if (c && COLOR[c]) seen.add(c);
  }
  return [...seen];
}
