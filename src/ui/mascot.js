// The valet: a character who speaks for the app in a line or two.
// Portraits live in src/mascot-art.js (loaded before the app, for the intro).

import { h } from './dom.js';
import { state } from '../data/store.js';

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

export function avatar(key, size = 40) {
  const a = art(key);
  if (!a) return null;
  return h('span', { class: 'valet-avatar', style: { width: `${size}px`, height: `${size}px` }, html: a.svg });
}

// A speech bubble from the current valet, or nothing when it's switched off.
export function says(lines, { key } = {}) {
  const m = key ? { key, ...art(key) } : current();
  const text = lines.filter(Boolean);
  if (!m || !text.length) return null;
  return h('div', { class: 'valet', role: 'note', 'aria-label': `${m.name} says` },
    avatar(m.key, 40),
    h('div', { class: 'valet-bubble' },
      h('span', { class: 'valet-name' }, m.name),
      h('p', null, text.join(' '))));
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
