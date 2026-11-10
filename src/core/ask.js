// The valet's answers, worked out by the same rules that pick your outfits.
// No AI model: the question is matched against common phrasings and your
// clothes' names, and the answer comes from the outfit engine, so it's
// accurate about your actual closet, free, instant and works offline.
//
// ask(question, ctx, voice) -> string
// ctx = { today, unit, weather, mode, outfit, worn, items, wears, prefs, model, saved }

import { stats, TYPES } from './catalog.js';
import { COLORS } from './color.js';
import { evaluate, formalityOf, MODES, isProblem, piecesOf } from './rules.js';
import { assemble, alternatives, suggest } from './generate.js';
import { quickAnswer, intentOf } from './advisor.js';

const nameOf = (i) => (i.name || stats(i).label).toLowerCase();
const the = (i) => `the ${nameOf(i)}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pick = (list, seed) => list[Math.abs(hash(seed)) % list.length];
function hash(t) { let x = 7; for (const c of String(t)) x = (x * 31 + c.charCodeAt(0)) | 0; return x; }
function listJoin(a) { return a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`; }

// ── understanding which clothes are meant ──────────────────

// Words people use for each type (beyond the catalogue's own labels).
const SYNONYMS = {
  tshirt: ['tee', 't-shirt', 't shirt', 'tshirt'],
  'dress-shirt': ['dress shirt', 'formal shirt'],
  oxford: ['oxford', 'button-down', 'button down', 'button-up', 'button up'],
  sweater: ['sweater', 'jumper', 'knit', 'pullover', 'crewneck'],
  hoodie: ['hoodie', 'hoody'],
  sweatshirt: ['sweatshirt', 'crew'],
  jeans: ['jeans', 'denims'],
  chinos: ['chinos', 'chino'],
  trousers: ['trousers', 'slacks', 'dress pants', 'suit trousers'],
  joggers: ['joggers', 'sweatpants', 'trackies', 'track pants'],
  sneakers: ['sneakers', 'trainers'],
  'leather-sneakers': ['leather sneakers', 'leather trainers'],
  'dress-shoes': ['dress shoes', 'oxfords shoes', 'brogues', 'derbies'],
  boots: ['boots'],
  chelsea: ['chelsea boots', 'chelseas'],
  overcoat: ['overcoat', 'wool coat', 'topcoat'],
  'rain-jacket': ['rain jacket', 'raincoat', 'rain coat', 'shell'],
  puffer: ['puffer', 'puffa', 'down jacket'],
  'leather-jacket': ['leather jacket'],
  'denim-jacket': ['denim jacket', 'jean jacket'],
  'suit-jacket': ['suit jacket'],
  tie: ['tie', 'necktie'],
};
// Generic words that mean "any of this kind".
const GENERIC = {
  shirt: (s) => s.cat === 'top' && s.collar && !s.polo,
  top: (s) => s.cat === 'top',
  jacket: (s) => s.cat === 'outer',
  coat: (s) => s.cat === 'outer' && s.w >= 3,
  layer: (s) => s.cat === 'outer' || s.layer === 'mid',
  shoes: (s) => s.cat === 'shoes',
  trainers: (s) => s.cat === 'shoes' && /sneaker|canvas|runner/.test(s.key),
  pants: (s) => s.cat === 'bottom',
  bottoms: (s) => s.cat === 'bottom',
};

const PHRASES = (() => {
  const out = [];
  for (const t of TYPES) {
    const words = new Set([t.key.replace(/-/g, ' '), ...t.label.toLowerCase().split(/\s*\/\s*/), ...(SYNONYMS[t.key] || [])]);
    for (const w of words) out.push({ w, type: t.key });
  }
  for (const w of Object.keys(GENERIC)) out.push({ w, generic: w });
  // longest first, so "leather jacket" wins over "jacket"
  return out.sort((a, b) => b.w.length - a.w.length);
})();
const COLOR_NAMES = COLORS.map((c) => c.name).sort((a, b) => b.length - a.length);

const norm = (q) => ` ${q.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ')} `;
const has = (text, w) => new RegExp(`[^a-z]${w.replace(/[-]/g, '[- ]?')}s?[^a-z]`).test(text);

// Mentions of clothes in the text: [{ type?, generic?, color?, at }]
const TAIL = '(?: (?:jacket|coat|shoes|shirt|top|trousers|pants|boots))?';
export function mentions(q) {
  let text = norm(q);
  const found = [];
  for (const p of PHRASES) {
    const re = new RegExp(`[^a-z]((?:(${COLOR_NAMES.join('|')}) )?${p.w.replace(/[-]/g, '[- ]?')}s?${p.type ? TAIL : ''})(?=[^a-z])`);
    let m;
    while ((m = re.exec(text))) {
      found.push({ type: p.type, generic: p.generic, color: m[2] || null, at: m.index });
      text = text.slice(0, m.index + 1) + ' '.repeat(m[1].length) + text.slice(m.index + 1 + m[1].length);
    }
  }
  // "a black one", "the white ones": a colour for whatever was mentioned before.
  const one = new RegExp(`[^a-z](${COLOR_NAMES.join('|')}) ones?(?=[^a-z])`).exec(text);
  if (one) found.push({ color: one[1], ref: true, at: one.index });
  return found.sort((a, b) => a.at - b.at);
}

// Types that stand in for each other when matching your closet.
const FAMILIES = [
  ['sneakers', 'leather-sneakers', 'canvas', 'runners'],
  ['boots', 'chelsea'],
  ['oxford', 'dress-shirt', 'linen-shirt'],
  ['sweater', 'quarter-zip', 'sweatshirt'],
  ['blazer', 'suit-jacket'],
  ['overcoat', 'trench'],
];
const family = (t) => FAMILIES.find((f) => f.includes(t)) || [t];

// Which closet piece(s) a mention means, best first.
function matchCloset(mn, items) {
  const exact = matchWith(mn, items, (i) => i.type === mn.type);
  if (exact.length || !mn.type) return exact;
  return matchWith(mn, items, (i) => family(mn.type).includes(i.type));
}
function matchWith(mn, items, sameType) {
  return items.filter((i) => {
    const s = stats(i);
    const typeOk = mn.type ? sameType(i) : GENERIC[mn.generic]?.(s);
    if (!typeOk) return false;
    if (!mn.color) return true;
    const cols = (i.colors || []).map((c) => c.name);
    return cols[0] === mn.color || nameOf(i).includes(mn.color);
  }).sort((a, b) => (a.inLaundry ? 1 : 0) - (b.inLaundry ? 1 : 0));
}

// A piece you don't own, for "would a black bomber go with this?".
function imagine(mn) {
  if (!mn.type) return null;
  const color = mn.color || 'black';
  return { id: `imagined:${mn.type}:${color}`, type: mn.type, name: `${color} ${TYPES.find((t) => t.key === mn.type).label.toLowerCase().split(' / ')[0]}`, colors: [{ name: color, share: 0.9 }], imagined: true };
}

function resolve(mn, ctx, { preferOutfit = false } = {}) {
  const inFit = piecesOf(ctx.outfit || {});
  const pool = preferOutfit ? [...inFit, ...(ctx.items || []).filter((i) => !inFit.includes(i))] : (ctx.items || []);
  const hits = matchCloset(mn, pool);
  if (hits.length) return hits[0];
  return imagine(mn);
}

function slotFor(item) {
  const s = stats(item);
  if (s.cat === 'top') return s.layer === 'mid' ? 'mid' : 'base';
  return s.cat;
}

function withPiece(outfit, item) {
  const slot = slotFor(item);
  if (slot === 'accessory') return { ...outfit, accessories: [...(outfit.accessories || []).filter((a) => stats(a).kind !== stats(item).kind), item] };
  const next = { ...outfit, [slot]: item };
  if (slot === 'onepiece') delete next.bottom;
  if (slot === 'bottom') delete next.onepiece;
  return next;
}

const evalCtx = (ctx, mode = ctx.mode) => ({ mode: mode || 'casual', weather: ctx.weather, prefs: ctx.prefs || { neverPairs: [] } });

// Judge an outfit, optionally ignoring the weather and pieces not chosen yet.
const MISSING = /^missing a|needs something under it/;
function judge(outfit, ctx, { weather = true, mode = ctx.mode, ignoreMode = false } = {}) {
  const ev = evaluate(outfit, { mode: mode || 'casual', weather: weather ? ctx.weather : null, prefs: ctx.prefs || { neverPairs: [] }, ignoreMode });
  const notes = ev.notes.filter((n) => !MISSING.test(n.text));
  const veto = notes.find((n) => n.tone === 'bad')?.text || null;
  return { ...ev, notes, veto };
}

// The main pieces, for listing an outfit (no watches and belts).
const core = (o) => piecesOf(o).filter((i) => stats(i).cat !== 'accessory');

// Fill the given slots with the best pieces from the closet, one at a time.
function fill(outfit, slots, ctx, mode, exclude = new Set()) {
  let o = { ...outfit };
  const chosen = [];
  for (const slot of slots) {
    if (slot !== 'accessory' && o[slot]) continue;
    const pool = (ctx.items || []).filter((i) => !i.inLaundry && !i.blocked && !exclude.has(i.id) && slotFor(i) === slot && (slot !== 'mid' || stats(i).alone));
    let best = null;
    for (const i of pool) {
      const next = withPiece(o, i);
      if (judge(next, ctx, { mode, weather: false }).veto) continue; // style rules decide what's allowed
      const score = judge(next, ctx, { mode }).score; // the weather helps rank it
      if (!best || score > best.score) best = { item: i, outfit: next, score };
    }
    if (best) { o = best.outfit; chosen.push(best.item); }
  }
  return { outfit: o, chosen };
}
function ranked(outfit, slot, ctx, mode, exclude = new Set()) {
  const pool = (ctx.items || []).filter((i) => !i.inLaundry && !i.blocked && !exclude.has(i.id) && slotFor(i) === slot);
  return pool.map((i) => ({ item: i, style: judge(withPiece(outfit, i), ctx, { mode, weather: false }), ev: judge(withPiece(outfit, i), ctx, { mode }) }))
    .filter((r) => !r.style.veto).sort((a, b) => b.ev.score - a.ev.score);
}

const THE_PLACES = /^(gym|office|pub|cinema|movies|theatre|theater|opera|beach|park|airport|shops|bar|restaurant|cocktail)$/;
const NO_ARTICLE = /^(dinner|lunch|brunch|breakfast|work|school|class|uni|university|college|church|drinks|coffee|home|travel|training|sport|football|running|hiking)$/;
const occasionPhrase = (w) => (NO_ARTICLE.test(w) ? w : THE_PLACES.test(w) ? `the ${w}` : /^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`);

// ── occasions ──────────────────────────────────────────────

const OCCASIONS = [
  [/\b(wedding|funeral|black tie|gala|graduation|ceremony|court)\b/, 'fancy', 4.0, 'that'],
  [/\b(interview|presentation|client|pitch|meeting|office|work|business)\b/, 'fancy', 3.4, 'that'],
  [/\b(date|dinner|restaurant|theatre|theater|opera|cocktail|party|birthday|drinks)\b/, 'fancy', 3.0, 'that'],
  [/\b(brunch|lunch|pub|bar|shopping|school|class|uni|university|college|coffee|cinema|movies?|concert|picnic|walk)\b/, 'casual', 2.0, 'that'],
  [/\b(gym|workout|run|running|hike|hiking|sport|football|training)\b/, 'comfy', 1.0, 'that'],
  [/\b(home|sofa|couch|lounge|flight|plane|travel|road trip|sleepover|movie night)\b/, 'comfy', 1.4, 'that'],
];
function occasionOf(text) {
  for (const [re, mode, target] of OCCASIONS) {
    const m = text.match(re);
    if (m) return { mode, target, word: m[1] };
  }
  return null;
}

// ── answers ────────────────────────────────────────────────

function verdictGoes(ctx, item, v) {
  const c = v.chat || {};
  const base = ctx.outfit;
  if (!base || !core(base).length) return null;
  const slot = slotFor(item);
  const replaced = slot === 'accessory' ? null : base[slot];
  const own = item.imagined ? `You don't have one, but a ${nameOf(item)}` : cap(the(item));
  if (replaced && replaced.id === item.id) return `${c.yes || 'Yes.'} ${cap(the(item))} is already in it.`;
  const next = withPiece(base, item);
  // Style first (does it go?), then the weather as a footnote.
  const before = judge(base, ctx, { weather: false, ignoreMode: true });
  const after = judge(next, ctx, { weather: false, ignoreMode: true });
  const fresh = (list) => list.filter((n) => !before.notes.some((b) => b.text === n.text));
  const goods = fresh(after.notes).filter((n) => n.tone === 'good').map((n) => n.text);
  const bads = fresh(after.notes).filter(isProblem).map((n) => n.text);
  const swap = replaced ? ` instead of ${the(replaced)}` : '';
  const wBefore = judge(base, ctx), wAfter = judge(next, ctx);
  const weatherNote = ctx.weather && wAfter.veto && wAfter.veto !== wBefore.veto && !after.veto ? ` Mind you, ${wAfter.veto} today.` : '';
  if (after.veto) return `${c.no || 'No.'} ${own}${swap}: ${after.veto}.`;
  const f = formalityOf(next);
  const tooCasual = ctx.mode === 'fancy' && f < 3.0;
  const tooDressy = ctx.mode === 'comfy' && f > 2.6;
  const delta = after.score - before.score;
  if (!bads.length && !tooCasual && !tooDressy && delta > -0.35) {
    const verb = item.imagined ? 'would work' : 'works';
    return `${c.yes || 'Yes.'} ${own} ${verb}${swap}${goods.length ? `: ${goods[0]}.` : '.'}${weatherNote}`;
  }
  const why = tooCasual ? 'too casual for a fancy day' : tooDressy ? 'too dressy for a comfy day' : bads[0] || 'it fights with the rest';
  let better = '';
  if (slot !== 'accessory') {
    const alt = ranked(base, slot, ctx, ctx.mode, new Set([item.id]))[0];
    if (alt && alt.ev.score > judge(next, ctx, { mode: ctx.mode }).score + 0.2 && alt.item.id !== base[slot]?.id) better = ` ${cap(the(alt.item))} would be better.`;
  }
  return `${delta > -0.8 && !tooCasual && !tooDressy ? (c.maybe || 'It works, mostly.') : (c.no || 'Not really.')} ${own}${swap}: ${why}.${better}${weatherNote}`;
}

function pairVerdict(ctx, a, b, v) {
  const c = v.chat || {};
  const ev = judge(assemble([a, b]), ctx, { weather: false, ignoreMode: true });
  const nm = (i) => (i.imagined ? `a ${nameOf(i)}` : the(i));
  if (ev.veto) return `${c.no || 'No.'} ${cap(nm(a))} with ${nm(b)}: ${ev.veto}.`;
  const bad = ev.notes.filter(isProblem).map((n) => n.text)[0];
  const good = ev.notes.filter((n) => n.tone === 'good').map((n) => n.text)[0];
  if (bad) return `${c.maybe || 'It works, mostly.'} ${cap(nm(a))} with ${nm(b)}: ${bad}.`;
  return `${c.yes || 'Yes.'} ${cap(nm(a))} and ${nm(b)} go together${good ? `: ${good}` : ''}.`;
}

// Build a good outfit around a piece by filling the other slots with the
// engine's best choices. With onlySlot, the top choices for that slot.
function buildAround(ctx, item, mode, onlySlot) {
  const s = stats(item);
  const start = ctx.outfit && core(ctx.outfit).some((p) => p.id === item.id) ? { ...ctx.outfit } : assemble([item]);
  const order = ['base', 'bottom', 'shoes'].filter((sl) => !(s.cat === 'onepiece' && sl === 'bottom'));
  const { outfit, chosen } = fill(start, order, ctx, mode, new Set([item.id]));
  if (!onlySlot) return chosen;
  const without = { ...outfit };
  delete without[onlySlot];
  return ranked(without, onlySlot, ctx, mode, new Set([item.id])).slice(0, 2).map((r) => r.item);
}

const SLOT_WORDS = [[/\b(shoes?|trainers|sneakers|boots)\b/, 'shoes'], [/\b(trousers|pants|bottoms|jeans|chinos)\b/, 'bottom'], [/\b(jacket|coat|layer)\b/, 'outer'], [/\b(top|shirt|tee|sweater|jumper)\b/, 'base']];

function topPick(ctx, mode) {
  const r = suggest({ items: ctx.items || [], saved: ctx.saved || [], wears: (ctx.wears || []).filter((w) => w.date !== ctx.today), mode, weather: ctx.weather, prefs: ctx.prefs || { neverPairs: [] }, model: ctx.model, today: ctx.today, seed: `${ctx.today}:${mode}:chat` });
  return r.picks[0]?.outfit || null;
}

// ── small talk ─────────────────────────────────────────────

const JOKES = [
  'Why did the belt get arrested? It held up a pair of trousers.',
  'I told my socks a secret. They’ve been holding it in ever since.',
  'Corduroy pillows are making headlines.',
  'What do you call a sweater that’s afraid of commitment? A cardigan. It never quite closes.',
  'My tie and I have an understanding. It stays out of the soup; I stay out of its way.',
];

function smallTalk(text, v, m) {
  const c = v.chat || {};
  if (/^\s*(hi|hello|hey|hiya|yo|morning|good (morning|afternoon|evening)|evening|afternoon)\b/.test(text)) return c.hello || `${v.hello} What can I help with?`;
  if (/\b(thanks|thank you|cheers|ta|nice one|appreciate)\b/.test(text)) return c.thanks || 'Any time.';
  if (/\bhow are you|how('s| is) it going|you ok|how do you do\b/.test(text)) return c.howAreYou || 'Very well, thank you. Now, what are we wearing?';
  if (/\b(joke|make me laugh|something funny)\b/.test(text)) return pick(c.jokes?.length ? c.jokes : JOKES, text + Date.now());
  if (/\b(who are you|what are you|your name|what can you do|help)\b/.test(text)) return `${m?.name ? `${m.name}. ` : ''}${c.help || 'Ask me if something goes with your outfit, what to wear for an occasion, what goes with a piece, or about the weather and laundry.'}`;
  if (/\b(tip|advice|style tip)\b/.test(text) && !/interview|date|wedding/.test(text)) return pick(v.tips || ['If in doubt, navy.'], text + Date.now());
  if (/\b(love you|you're (great|the best)|good (job|boy|valet)|well done)\b/.test(text)) return c.praise || 'You’re too kind.';
  return null;
}

// ── the entry point ────────────────────────────────────────

export function ask(q, ctx, v = {}, m = null) {
  const text = norm(q);
  const c = v.chat || {};
  let ms = mentions(q);
  // "a black one": the type from the last thing you mentioned.
  if (ms.some((x) => x.ref)) {
    const prev = (ctx.history || []).slice().reverse().map((h) => mentions(h).filter((x) => x.type || x.generic).pop()).find(Boolean);
    ms = ms.map((x) => (x.ref ? (prev ? { ...prev, color: x.color, ref: false } : null) : x)).filter(Boolean);
  }

  // 1. "Does X go with this?" / "Can I wear X with Y?"
  const goesQ = /\b(go(es)?|work(s)?|match(es)?|look(s)?( (good|ok|okay|right|alright|fine|better))?|pair(s)?|suit(s)?) (well )?(with|together)\b|\blook(s)? (good|ok|okay|right|fine|better)\b|\bcan i (wear|add|throw on|put on|do)\b|\b(would|will|could|should) (a |an |the |my |i )?.*\b(work|look|go)\b|\bwhat about (a |an |the |my )?/.test(text);
  const whatGoesQ = /\bwhat (goes|works|would go|would work|matches|pairs|should i wear|to wear|can i wear|do i wear|shoes|trousers|pants|bottoms|jacket|top)\b.*\b(with|under|over)\b/.test(text);

  if (ms.length && whatGoesQ) {
    const target = resolve(ms[ms.length - 1], ctx);
    if (target && !target.imagined) {
      const slotHit = SLOT_WORDS.find(([re]) => re.test(text.split(/\b(with|under|over)\b/)[0]));
      const only = slotHit && slotHit[1] !== slotFor(target) ? slotHit[1] : null;
      const got = buildAround(ctx, target, ctx.mode || 'casual', only);
      if (!got.length) return `Nothing in the closet goes with ${the(target)} for this, I’m afraid.`;
      return only
        ? `With ${the(target)}: ${listJoin(got.map(the))}.`
        : `${cap(the(target))} with ${listJoin(got.map(the))}.`;
    }
  }

  if (ms.length && goesQ) {
    if (ms.length >= 2 && !/\b(this|outfit|today|my fit|the fit|look)\b/.test(text)) {
      const a = resolve(ms[0], ctx, { preferOutfit: true }), b = resolve(ms[1], ctx, { preferOutfit: true });
      if (a && b) return pairVerdict(ctx, a, b, v);
    }
    const item = resolve(ms[ms.length - 1], ctx);
    if (item) {
      const r = verdictGoes(ctx, item, v);
      if (r) return r;
      return ctx.mode ? `Pick an outfit first and I’ll tell you.` : `Choose Fancy, Casual or Comfy on Today, then ask me again and I’ll check it against the outfit.`;
    }
  }

  // 2. Occasions: "Is this OK for a wedding?", "What should I wear to the gym?"
  const occ = occasionOf(text);
  if (occ) {
    const isThis = /\b(is (this|it|my outfit|the outfit)|am i|will this|would this|too (casual|dressy|fancy|smart)|(smart|fancy|dressy|casual) enough|ok(ay)? for|good for|right for)\b/.test(text);
    if (isThis && ctx.outfit && core(ctx.outfit).length) {
      const f = formalityOf(ctx.outfit);
      if (f < occ.target - 0.6) {
        const best = topPick(ctx, occ.mode);
        return `${c.no || 'No.'} Too casual for ${occasionPhrase(occ.word)}.${best ? ` Try ${listJoin(core(best).map(the))}.` : ''}`;
      }
      if (f > occ.target + 1.6) return `${c.maybe || 'Hm.'} A bit much for ${occasionPhrase(occ.word)}. You could dress it down.`;
      return `${c.yes || 'Yes.'} That’s right for ${occasionPhrase(occ.word)}.`;
    }
    const best = topPick(ctx, occ.mode);
    if (!best) return `I can’t put anything together for ${occasionPhrase(occ.word)} from what’s clean, I’m afraid.`;
    return `For ${occasionPhrase(occ.word)}: ${listJoin(core(best).map(the))}.`;
  }

  // 3. "Make it fancier" / "something more casual"
  const up = /\b(fancier|dressier|smarter|more (formal|smart|dressy|fancy)|dress (it )?up)\b/.test(text);
  const down = /\b(more (casual|relaxed|comfy|comfortable)|comfier|dress (it )?down|less (formal|fancy|smart))\b/.test(text);
  if (up || down) {
    const order = ['comfy', 'casual', 'fancy'];
    const i = order.indexOf(ctx.mode || 'casual');
    const mode = order[Math.max(0, Math.min(2, i + (up ? 1 : -1)))];
    if (mode === (ctx.mode || 'casual')) return up ? 'That’s as smart as it gets today.' : 'That’s as relaxed as it gets.';
    const best = topPick(ctx, mode);
    return best ? `${cap(MODES[mode].label)} version: ${listJoin(core(best).map(the))}.` : 'Nothing clean fits that, I’m afraid.';
  }

  // 4. Weather, jackets, rain, laundry, today's outfit.
  const quick = quickAnswer(q, ctx, v);
  if (quick) return quick;

  // 5. A piece on its own: "my black jeans?" — say what goes with it.
  if (ms.length === 1 && text.trim().split(' ').length <= 5) {
    const target = resolve(ms[0], ctx);
    if (target && !target.imagined) {
      const got = buildAround(ctx, target, ctx.mode || 'casual');
      if (got.length) return `${cap(the(target))}? Wear it with ${listJoin(got.map(the))}.`;
    }
  }

  // 6. Pleasantries.
  const st = smallTalk(text, v, m);
  if (st) return st;

  return c.offTopic || 'I’m a valet, not an encyclopaedia. Ask me about your clothes, an occasion or the weather.';
}

export { intentOf };
