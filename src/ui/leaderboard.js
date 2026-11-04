// Leaderboard: just for fun. What you actually wear, ranked.

import { h, shortDate } from './dom.js';
import { itemPic, displayName, miniBoard } from './board.js';
import * as store from '../data/store.js';
import { state } from '../data/store.js';
import { stats } from '../core/catalog.js';
import { COLOR } from '../core/color.js';
import { MODES } from '../core/rules.js';
import { isoDate, isWeekend } from '../core/week.js';
import { DEFAULT_STYLES } from '../core/hair.js';
import * as valet from './mascot.js';

const DAY = 86400000;

export function renderLeaderboard(root) {
  root.append(h('div', { class: 'page-head' }, h('h1', null, 'Leaderboard')));
  const m = valet.current();
  if (m) root.append(valet.says([valet.leaderLine(m.voice)]));
  const today = isoDate();
  const wears = state.wears;
  const worn = state.items.filter((i) => (i.wears || 0) > 0).sort((a, b) => b.wears - a.wears || (b.lastWorn || '').localeCompare(a.lastWorn || ''));

  if (!wears.length && !worn.length) {
    root.append(h('div', { class: 'empty' },
      h('p', null, 'Nothing to rank yet. Wear an outfit from Today and the rankings start here.'),
      h('a', { class: 'btn', href: '#today' }, 'Go to Today')));
    return;
  }

  // ── headline numbers ──
  const days = new Set(wears.map((w) => w.date)).size;
  root.append(h('div', { class: 'lb-stats' },
    stat(String(days), days === 1 ? 'day dressed' : 'days dressed'),
    stat(String(streak(wears, today)), 'weekday streak'),
    stat(String(worn.length), `of ${state.items.length} pieces worn`)));

  // ── most worn clothes ──
  if (worn.length) {
    const top = worn.slice(0, 10);
    const max = top[0].wears;
    root.append(h('section', null,
      h('div', { class: 'label' }, 'Most worn clothes'),
      h('ul', { class: 'list' }, top.map((i, n) => h('li', { key: i.id, onclick: () => { location.hash = `#item/${i.id}`; }, style: { cursor: 'pointer' } },
        rank(n),
        h('div', { class: 'thumb' }, itemPic(i)),
        h('div', { class: 'main' },
          h('div', { class: 't' }, displayName(i)),
          h('span', { class: 'meter lb-bar' }, h('span', { style: { width: `${(i.wears / max) * 100}%` } }))),
        h('b', { class: 'lb-count' }, String(i.wears)))))));
  }

  // ── most worn outfits ──
  const looks = topLooks(wears);
  if (looks.length) {
    root.append(h('section', null,
      h('div', { class: 'label' }, 'Most worn outfits'),
      h('ul', { class: 'list' }, looks.slice(0, 5).map((l, n) => h('li', { key: l.combo, style: { display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '12px', alignItems: 'center' } },
        rank(n),
        h('div', null, miniBoard(l.pieces), h('div', { class: 'tiny', style: { marginTop: '6px' } }, `last ${shortDate(l.last, today)}`)),
        h('b', { class: 'lb-count' }, `${l.count}×`))))));
  }

  // ── moods ──
  const moods = Object.keys(MODES).map((k) => ({ k, n: wears.filter((w) => w.mode === k).length }));
  const total = moods.reduce((a, m) => a + m.n, 0);
  if (total) {
    root.append(h('section', null,
      h('div', { class: 'label' }, 'Moods'),
      h('div', { class: 'lb-moods' }, moods.filter((m) => m.n).map((m) => h('span', { class: `mode-${m.k}`, style: { flexGrow: String(m.n) } }))),
      h('ul', { class: 'list' }, moods.map((m) => h('li', { key: m.k },
        h('i', { class: `band-dot mode-${m.k}` }),
        h('div', { class: 'main' }, MODES[m.k].label),
        h('span', { class: 'muted num' }, `${m.n} · ${Math.round((m.n / total) * 100)}%`))))));
  }

  // ── fun facts ──
  const facts = [];
  const colour = topColour();
  if (colour) facts.push(['Most worn colour', colour]);
  const cat = topCategory(worn);
  if (cat) facts.push(['Most worn shoes', cat]);
  const loyal = worn.find((i) => stats(i).cat !== 'accessory');
  if (loyal && loyal.wears >= 3) facts.push(['Most loyal piece', `${displayName(loyal)}, ${loyal.wears} times`]);
  const hair = topHair(wears);
  if (hair) facts.push(['Most worn hairstyle', hair]);
  if (facts.length) {
    root.append(h('section', null,
      h('div', { class: 'label' }, 'Fun facts'),
      h('ul', { class: 'list' }, facts.map(([k, v]) => h('li', { key: k }, h('div', { class: 'main' }, k), h('span', { class: 'muted' }, v))))));
  }

  // ── gathering dust ──
  const now = Date.parse(today);
  const dusty = state.items
    .filter((i) => stats(i).cat !== 'accessory' && !i.blocked)
    .map((i) => ({ i, idle: i.lastWorn ? Math.round((now - Date.parse(i.lastWorn)) / DAY) : null }))
    .filter(({ idle }) => idle == null || idle >= 30)
    .sort((a, b) => (a.idle == null ? -1 : b.idle == null ? 1 : b.idle - a.idle))
    .slice(0, 5);
  if (dusty.length) {
    root.append(h('section', null,
      h('div', { class: 'label' }, 'Gathering dust'),
      h('ul', { class: 'list' }, dusty.map(({ i, idle }) => h('li', { key: i.id, onclick: () => { location.hash = `#item/${i.id}`; }, style: { cursor: 'pointer' } },
        h('div', { class: 'thumb' }, itemPic(i)),
        h('div', { class: 'main' }, h('div', { class: 't' }, displayName(i))),
        h('span', { class: 'muted small' }, idle == null ? 'never worn' : `${idle} days`))))));
  }
}

const stat = (n, label) => h('div', null, h('b', null, n), h('span', null, label));

function rank(n) {
  return h('span', { class: `lb-rank${n < 3 ? ` medal-${n + 1}` : ''}` }, String(n + 1));
}

// Consecutive weekdays, ending today or yesterday, with an outfit logged.
function streak(wears, today) {
  const days = new Set(wears.map((w) => w.date));
  const d = new Date(Date.parse(`${today}T12:00:00`));
  if (!days.has(today)) d.setDate(d.getDate() - 1);
  let n = 0;
  for (let guard = 0; guard < 400; guard++) {
    const iso = isoDate(d);
    if (!isWeekend(iso)) {
      if (!days.has(iso)) break;
      n++;
    }
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// Group the wear log by visible look (top + bottom), most worn first.
function topLooks(wears) {
  const by = new Map();
  for (const w of wears) {
    if (!w.combo) continue;
    const e = by.get(w.combo) || { combo: w.combo, count: 0, last: w.date, itemIds: w.itemIds };
    e.count++;
    if (w.date >= e.last) { e.last = w.date; e.itemIds = w.itemIds; }
    by.set(w.combo, e);
  }
  return [...by.values()]
    .map((e) => ({ ...e, pieces: e.itemIds.map(store.itemById).filter((i) => i && stats(i).cat !== 'accessory') }))
    .filter((e) => e.pieces.length && e.count > 0)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
}

function topColour() {
  const by = new Map();
  for (const i of state.items) {
    const c = i.colors?.[0]?.name;
    if (c && i.wears) by.set(c, (by.get(c) || 0) + i.wears);
  }
  const best = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && COLOR[best[0]] ? best[0] : null;
}

function topHair(wears) {
  const by = new Map();
  for (const w of wears) if (w.hair) by.set(w.hair, (by.get(w.hair) || 0) + 1);
  const best = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const name = (state.prefs.hair?.styles || DEFAULT_STYLES).find((s) => s.id === best[0])?.name;
  return name ? `${name}, ${best[1]} times` : null;
}

function topCategory(worn) {
  const shoes = worn.find((i) => stats(i).cat === 'shoes');
  return shoes ? `${displayName(shoes)}, ${shoes.wears} times` : null;
}
