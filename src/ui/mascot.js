// The valet: a character who speaks for the app in a line or two.
// Portraits live in src/mascot-art.js (loaded before the app, for the intro).

import { h } from './dom.js';
import { state } from '../data/store.js';
import { stats } from '../core/catalog.js';
import { fmtHour } from '../core/weather.js';

// Each valet's voice. {color}, {a}, {b} are filled from the outfit.
const VOICES = {
  fox: {
    greet: { morning: 'Morning.', afternoon: 'Afternoon.', evening: 'Evening.' },
    temp: { freezing: 'Bitter out there.', cold: 'Brisk one today.', cool: 'A touch cool.', mild: 'Mild out.', warm: 'Warm today.', hot: 'Properly hot today.' },
    ask: 'What sort of day are we dressing for?',
    reason: {
      rain: 'Rain’s due, so I’ve kept you dry.',
      layer: 'Cold start, warmer later. The jacket comes off by lunch.',
      wind: 'Blustery out. This keeps the wind off.',
      saved: 'One of your own. I approve.',
      neutrals: 'All neutrals. Nothing fights.',
      accent: 'Just the {color} for a bit of colour. Tasteful.',
      analogous: 'The {a} and {b} sit nicely together.',
      complementary: '{A} against {b}. A confident pairing.',
      fancy: 'Smart, not stiff.',
      casual: 'Easy, but not sloppy.',
      comfy: 'Comfortable, all the way down.',
      fresh: 'Something new for you today.',
      revival: 'This one’s been resting. Time it came out.',
      taste: 'Your sort of thing, I’d say.',
      temp: 'Right for the weather.',
    },
    struggle: 'Best I can do with what’s here, I’m afraid.',
    worn: 'Excellent choice. Off you go.',
    weekend: 'Weekend. I’m off duty unless you need me.',
    emptyCloset: 'An empty wardrobe. Lay something on the floor and I’ll have a look.',
    skip: ['Fair enough. How about this?', 'Not feeling it? Try this.', 'Right. Something else, then.'],
    back: 'Changed your mind? Fair enough.',
    swap: 'Good eye.',
    saved: 'Noted. I\u2019ll keep that one handy.',
    nudge: { none: 'No fancy days yet this week. Today might be the day.', one: 'One fancy day so far. Another wouldn\u2019t hurt.', fourth: 'A fourth fancy day. Getting quite used to it.' },
    streak: '{n} weekdays running. Very consistent.',
    laundryPile: '{n} things in the wash. Might be laundry day.',
    washHint: 'Your {item} {has} been out {n} times since {its} last wash.',
    resting: 'Your {item} {hasnt} been out in {n} weeks. Just saying.',
    leaderTop: 'The {item} again. A favourite, clearly.',
    weather: { rainAt: 'Umbrella from {time}.', rain: 'Wet one. Umbrella.', windy: 'Windy. Hold onto your hat.', swing: 'Cold morning, warmer afternoon. Layers.', dry: 'Dry all day.' },
    tips: ['Match the belt to the shoes and nobody notices. Which is the point.', 'One loud piece at a time. Let it do the talking.', 'If in doubt, navy.', 'Roll the sleeves twice, not three times.'],
    hello: 'At your service.',
  },
  bulldog: {
    greet: { morning: 'Good morning.', afternoon: 'Good afternoon.', evening: 'Good evening.' },
    temp: { freezing: 'Freezing.', cold: 'Cold.', cool: 'Cool out.', mild: 'Mild.', warm: 'Warm.', hot: 'Hot. Very.' },
    ask: 'What’s the occasion?',
    reason: {
      rain: 'Rain expected. You’re covered.',
      layer: 'Chilly start. Jacket now, off by noon.',
      wind: 'Windy. This’ll hold.',
      saved: 'One of yours. Sound choice.',
      neutrals: 'Neutrals throughout. Can’t go wrong.',
      accent: 'The {color} does the talking. Just enough.',
      analogous: '{A} and {b}. Agreeable.',
      complementary: '{A} with {b}. Bold, but it works.',
      fancy: 'Properly turned out.',
      casual: 'Tidy enough.',
      comfy: 'Comfortable. As it should be.',
      fresh: 'Not worn this one before. Let’s see it.',
      revival: 'Been a while for this one.',
      taste: 'The sort you like.',
      temp: 'Suits the weather.',
    },
    struggle: 'Not my finest. We’re short of a few things.',
    worn: 'Very good.',
    weekend: 'Weekend. Rest.',
    emptyCloset: 'Empty wardrobe. Bring me something.',
    skip: ['Very well. This one.', 'No? Try this.', 'Hm. Another, then.'],
    back: 'Back to that one. Fine.',
    swap: 'Sensible.',
    saved: 'Filed.',
    nudge: { none: 'No fancy days this week. Fix that.', one: 'One fancy day so far. Another wouldn\u2019t hurt.', fourth: 'Fourth fancy day. Steady on.' },
    streak: '{n} weekdays straight. Good discipline.',
    laundryPile: '{n} items in the wash. Deal with it.',
    washHint: '{Item}: {n} wears since washing. Wash it.',
    resting: '{Item}: not worn in {n} weeks.',
    leaderTop: '{Item}. Most worn. No surprise.',
    weather: { rainAt: 'Rain from {time}. Umbrella.', rain: 'Rain. Umbrella.', windy: 'Windy. Button up.', swing: 'Cold start, warm finish. Layer.', dry: 'Dry.' },
    tips: ['Shoes polished. Always.', 'Fit first. Everything else second.', 'Belt matches shoes. Non-negotiable.', 'Sit down in it before you leave.'],
    hello: 'Reporting for duty.',
  },
  corgi: {
    greet: { morning: 'Morning!', afternoon: 'Afternoon!', evening: 'Evening!' },
    temp: { freezing: 'Absolutely freezing!', cold: 'Chilly one!', cool: 'Bit nippy.', mild: 'Lovely and mild.', warm: 'Nice and warm!', hot: 'Scorcher today!' },
    ask: 'Right then, what are we feeling?',
    reason: {
      rain: 'Bit of rain later, so you’re all set for it.',
      layer: 'Nippy start, lovely later, so the jacket’s optional by lunch.',
      wind: 'Breezy one! This’ll keep you snug.',
      saved: 'Ooh, one of your favourites.',
      neutrals: 'All neutrals, so it all just works.',
      accent: 'A splash of {color}. Lovely.',
      analogous: '{A} and {b}, very nice together.',
      complementary: '{A} and {b}? Brave, and it works!',
      fancy: 'Looking sharp!',
      casual: 'Easy and smart.',
      comfy: 'Cosy all the way down.',
      fresh: 'A brand new combo!',
      revival: 'Haven’t seen this in ages!',
      taste: 'Very you.',
      temp: 'Spot on for the weather.',
    },
    struggle: 'Did my best, but we could use a few more pieces!',
    worn: 'Brilliant! Have a lovely day.',
    weekend: 'It’s the weekend! Feet up, unless you fancy dressing.',
    emptyCloset: 'Nothing in here yet! Pop something on the floor and snap it.',
    skip: ['No problem! What about this?', 'Okay, okay. How\u2019s this one?', 'Ooh, try this instead!'],
    back: 'Ooh, going back? Good call!',
    swap: 'Ooh, nice swap!',
    saved: 'Saved! That one\u2019s a keeper.',
    nudge: { none: 'No fancy days yet this week. Fancy one today?', one: 'Just one fancy day so far. Go on, treat yourself!', fourth: 'A fourth fancy day? Very glam!' },
    streak: '{n} weekdays in a row! Brilliant!',
    laundryPile: '{n} things in the wash! Laundry party?',
    washHint: 'Your {item} {has} done {n} outings. Bath time?',
    resting: 'Your {item} {hasnt} been out for {n} weeks. {It} {misses} you!',
    leaderTop: 'The {item}! Your absolute favourite.',
    weather: { rainAt: 'Rain from {time}. Brolly!', rain: 'Rainy one. Brolly!', windy: 'Windy! Hold onto your cap!', swing: 'Chilly morning, lovely afternoon. Layers!', dry: 'Dry all day!' },
    tips: ['A bit of colour goes a long way!', 'White trainers go with nearly everything.', 'Comfy can still be smart!', 'Tuck the shirt in and you look sharper instantly.'],
    hello: 'Hello there!',
  },
  valet: {
    greet: { morning: 'Good morning.', afternoon: 'Good afternoon.', evening: 'Good evening.' },
    temp: { freezing: 'It is bitterly cold.', cold: 'It is rather cold.', cool: 'It is a touch cool.', mild: 'It is mild.', warm: 'It is pleasantly warm.', hot: 'It is uncommonly hot.' },
    ask: 'And what manner of day shall we be dressing for?',
    reason: {
      rain: 'Rain is expected, so I have chosen accordingly.',
      layer: 'A cool start and a milder afternoon; the jacket may be dispensed with by luncheon.',
      wind: 'It is rather blustery; this should keep the wind at bay.',
      saved: 'One of your own selections, if I may.',
      neutrals: 'Neutrals throughout. Quietly correct.',
      accent: 'The {color} provides a single, tasteful note.',
      analogous: 'The {a} and {b} sit well together.',
      complementary: '{A} with {b}: a bold contrast, judiciously restrained.',
      fancy: 'Suitably sharp.',
      casual: 'Relaxed, yet presentable.',
      comfy: 'Comfort, without apology.',
      fresh: 'A combination not yet attempted.',
      revival: 'This one has been resting for some weeks.',
      taste: 'Very much in your manner.',
      temp: 'Appropriate to the conditions.',
    },
    struggle: 'The best I can manage with the present wardrobe, I’m afraid.',
    worn: 'Very good. I shall see to the rest.',
    weekend: 'It is the weekend. I shall be on hand should you require me.',
    emptyCloset: 'The wardrobe is empty. Lay a garment on the floor and I shall attend to it.',
    skip: ['Very good. Perhaps this, instead.', 'Quite understood. Might I suggest this?', 'Of course. An alternative.'],
    back: 'Reconsidering? Entirely understandable.',
    swap: 'An astute substitution.',
    saved: 'I shall remember it.',
    nudge: { none: 'There has been no fancy day this week. Today would be an excellent opportunity.', one: 'But one fancy day thus far. A second would not go amiss.', fourth: 'A fourth fancy day. Most distinguished.' },
    streak: '{n} weekdays without a lapse. Commendable.',
    laundryPile: 'There are {n} items awaiting the laundry.',
    washHint: 'The {item} {has} been worn {n} times since {its} last wash. Might I suggest the laundry?',
    resting: 'The {item} {has} not been worn in {n} weeks.',
    leaderTop: 'The {item} remains your most faithful companion.',
    weather: { rainAt: 'Rain from {time}. An umbrella is advised.', rain: 'Rain is expected. An umbrella is advised.', windy: 'It will be blustery. A firm hat, or none at all.', swing: 'A cold start and a mild afternoon. Layers, I think.', dry: 'Dry throughout.' },
    tips: ['The belt should match the shoes.', 'A pocket square need not match the tie. It should merely get along with it.', 'Navy and grey are never wrong.', 'Trousers should just touch the shoe.'],
    hello: 'At your service.',
  },
};

export const MASCOT_KEYS = Object.keys(VOICES);

export function current() {
  const key = state.prefs?.mascot ?? 'fox';
  if (key === 'none' || !VOICES[key] || !window.CLAD_MASCOTS?.[key]) return null;
  return { key, ...window.CLAD_MASCOTS[key], voice: VOICES[key] };
}

export const art = (key) => window.CLAD_MASCOTS?.[key];
export const voice = (key) => VOICES[key];

export function avatar(key, size = 40, saying = '') {
  const a = art(key);
  if (!a) return null;
  // Blinks on its own clock, so two valets on screen never blink together.
  const delay = (hash(key + saying) % 4000) / 1000;
  return h('span', { key: `${key}:${saying}`, class: 'valet-avatar', style: { width: `${size}px`, height: `${size}px`, '--blink-delay': `${delay}s` }, html: a.svg });
}

function hash(t) {
  let x = 7;
  for (const c of t) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return x;
}

// A speech bubble from the current valet, or nothing when it's switched off.
// `more`: extra remarks shown one by one when the valet is tapped.
export function says(lines, { key, more = [] } = {}) {
  const m = key ? { key, ...art(key) } : current();
  const text = lines.filter(Boolean).join(' ');
  if (!m || !text) return null;
  const extra = more.filter(Boolean).filter((t) => t !== text);
  const p = h('p', { key: text }, text);
  // Keyed by what's said, so each new line arrives with a little hop.
  const face = avatar(m.key, 40, text);
  // Works on whatever is on screen (the page patches in place, so the
  // elements built here may not be the live ones).
  const next = (e) => {
    if (!extra.length) return;
    const root = e.currentTarget;
    const live = root.querySelector('.valet-bubble p');
    const liveFace = root.querySelector('.valet-avatar');
    const i = ((Number(root.dataset.i ?? -1) + 1) % (extra.length + 1));
    root.dataset.i = String(i);
    live.textContent = i === extra.length ? text : extra[i];
    liveFace.classList.remove('hop');
    void liveFace.offsetWidth;
    liveFace.classList.add('hop');
  };
  return h('div', {
    class: `valet${extra.length ? ' talks' : ''}`,
    role: extra.length ? 'button' : 'note',
    tabindex: extra.length ? '0' : null,
    'aria-label': extra.length ? `${m.name} says. Tap for more.` : `${m.name} says`,
    onclick: next,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } },
  },
  face,
  h('div', { class: 'valet-bubble' },
    h('span', { class: 'valet-name' }, m.name, extra.length ? h('span', { class: 'valet-more', 'aria-hidden': 'true' }, ' \u00b7 tap for more') : null),
    p));
}

// ── lines ───────────────────────────────────────────────────

const part = () => { const hr = new Date().getHours(); return hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening'; };

function tempWord(w) {
  if (!w) return null;
  const f = (w.feelsMin + w.feelsMax) / 2;
  return f < 0 ? 'freezing' : f < 6 ? 'cold' : f < 13 ? 'cool' : f < 20 ? 'mild' : f < 27 ? 'warm' : 'hot';
}

export function greeting(v, weather) {
  const t = tempWord(weather);
  return [v.greet[part()], t ? v.temp[t] : null].filter(Boolean).join(' ');
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fill = (tpl, vars) => tpl
  .replace('{color}', vars.color || '').replace('{A}', cap(vars.a || '')).replace('{a}', vars.a || '').replace('{b}', vars.b || '');

// Turn the outfit's reasons into one line in the valet's voice. Weather
// first (that's what changes day to day), then your own outfits, colour,
// then the general verdict.
export function reasonLine(v, notes, mode) {
  const good = notes.filter((n) => n.tone === 'good').map((n) => n.text);
  const find = (re) => good.map((t) => t.match(re)).find(Boolean);
  const tries = [
    ['rain', /^rain-ready$/],
    ['layer', /^jacket for the morning/],
    ['wind', /^blocks the wind$/],
    ['saved', /^one of your saved outfits$/],
    ['accent', /^(.+) as the one accent$/],
    ['analogous', /^(.+) and (.+) sit next to each other$/],
    ['complementary', /^(.+) and (.+) balance each other$/],
    ['neutrals', /^all neutrals/],
    ['taste', /^close to what you usually pick$/],
    ['revival', /^haven't worn this combo in/],
    ['fit', /^(properly sharp|easy, not sloppy|relaxed all the way)$/],
    ['fresh', /^a combination you haven't worn yet$/],
    ['temp', /^right for the temperature$/],
  ];
  for (const [key, re] of tries) {
    const m = find(re);
    if (!m) continue;
    if (key === 'fit') return v.reason[mode] || null;
    if (key === 'accent') return fill(v.reason.accent, { color: m[1] });
    if (key === 'analogous' || key === 'complementary') return fill(v.reason[key], { a: m[1], b: m[2] });
    return v.reason[key];
  }
  return null;
}

// ── remarks about your actual closet and day ────────────────

// Trousers, shoes and the like take "have", "they", "their".
const PLURAL = /(jeans|chinos|trousers|joggers|shorts|leggings|pants|cargos|corduroys|sneakers|trainers|boots|shoes|loafers|sandals|slides|heels|gloves|sunglasses|earrings|runners)$/i;
const isPlural = (item) => PLURAL.test((item || '').trim());
export const fillAll = (tpl, v) => {
  const pl = isPlural(v.item);
  return tpl
    .replace('{n}', v.n ?? '').replace('{time}', v.time ?? '')
    .replace('{Item}', cap(v.item || '')).replace('{item}', v.item || '')
    .replace('{hasnt}', pl ? 'haven\u2019t' : 'hasn\u2019t').replace('{has}', pl ? 'have' : 'has')
    .replace('{its}', pl ? 'their' : 'its').replace('{It}', pl ? 'They' : 'It').replace('{misses}', pl ? 'miss' : 'misses');
};

export function weatherLine(v, w) {
  if (!w) return null;
  const W = v.weather;
  if (w.wet) return w.wetFrom != null && w.wetFrom > w.from ? fillAll(W.rainAt, { time: fmtHour(w.wetFrom) }) : W.rain;
  if (w.windy) return W.windy;
  if (w.feelsMax - w.feelsMin >= 7) return W.swing;
  return W.dry;
}

export const reaction = (v, r) => (!r ? null : r.type === 'skip' ? v.skip[(Math.max(1, r.n) - 1) % v.skip.length] : v[r.type] || null);
export const nudgeLine = (v, kind) => (kind ? v.nudge[kind] : null);
export const streakLine = (v, n) => (n >= 5 && n % 5 === 0 ? fillAll(v.streak, { n }) : null);

const DAY = 86400000;
const clothes = () => state.items.filter((i) => stats(i).cat !== 'accessory' && !i.blocked);

export function laundryLine(v) {
  const inWash = state.items.filter((i) => i.inLaundry).length;
  if (inWash >= 5) return fillAll(v.laundryPile, { n: inWash });
  const worn = clothes().filter((i) => !i.inLaundry && !stats(i).under && (i.wearsSinceWash || 0) >= 4)
    .sort((a, b) => b.wearsSinceWash - a.wearsSinceWash)[0];
  return worn ? fillAll(v.washHint, { item: worn.name || stats(worn).label.toLowerCase(), n: worn.wearsSinceWash }) : null;
}

export function restingLine(v, today) {
  const now = Date.parse(today);
  const idle = clothes()
    .map((i) => ({ i, d: i.lastWorn ? (now - Date.parse(i.lastWorn)) / DAY : (i.createdAt ? (Date.now() - i.createdAt) / DAY : 0) }))
    .filter(({ d }) => d >= 28)
    .sort((a, b) => b.d - a.d)[0];
  return idle ? fillAll(v.resting, { item: idle.i.name || stats(idle.i).label.toLowerCase(), n: Math.floor(idle.d / 7) }) : null;
}

export function leaderLine(v) {
  const top = clothes().filter((i) => (i.wears || 0) >= 2).sort((a, b) => b.wears - a.wears)[0];
  return top ? fillAll(v.leaderTop, { item: top.name || stats(top).label.toLowerCase() }) : null;
}

// Everything worth saying today, most useful first, then a style tip or two.
export function remarks(v, { weather, today }) {
  const tips = [...v.tips];
  const k = hash(today || '') % tips.length;
  return [weatherLine(v, weather), laundryLine(v), restingLine(v, today), tips[k], tips[(k + 1) % tips.length]];
}
