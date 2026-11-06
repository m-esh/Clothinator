// What you wore on a past day, from the wear log. Opened by tapping a day in
// Today's week strip; ‹ and › step through every day you've logged.

import { h, sheet, longDate } from './dom.js';
import { board } from './board.js';
import * as store from '../data/store.js';
import { state } from '../data/store.js';
import { assemble } from '../core/generate.js';
import { MODES } from '../core/rules.js';
import { labelParts } from '../core/weather.js';
import { isoDate } from '../core/week.js';
import { DEFAULT_STYLES } from '../core/hair.js';

// Every date with an outfit logged, oldest first.
export const loggedDates = (wears = state.wears) => [...new Set(wears.map((w) => w.date))].sort();

function ago(date, today) {
  const n = Math.round((Date.parse(today) - Date.parse(date)) / 86400000);
  return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 14 ? `${n} days ago` : n < 60 ? `${Math.round(n / 7)} weeks ago` : `${Math.round(n / 30)} months ago`;
}

const hairName = (id) => (state.prefs.hair?.styles || DEFAULT_STYLES).find((s) => s.id === id)?.name || null;

function day(date) {
  const logs = store.wearsOn(date);
  const w = logs[logs.length - 1];
  if (!w) return h('p', { class: 'faint' }, 'Nothing logged that day.');
  const pieces = w.itemIds.map(store.itemById).filter(Boolean);
  const gone = w.itemIds.length - pieces.length;
  const unit = state.prefs.unit;
  return h('div', { class: 'hist-day', key: date },
    h('div', { class: 'hist-meta' },
      w.mode && MODES[w.mode] ? h('span', { class: `chip-mode ${w.mode}` }, MODES[w.mode].label) : null,
      w.weather ? h('span', { class: 'tiny faint' }, labelParts(w.weather, unit).map((p) => p.text).join(' · ')) : null),
    pieces.length ? board(assemble(pieces)) : null,
    gone ? h('p', { class: 'tiny faint' }, `${gone} piece${gone === 1 ? ' has' : 's have'} since been removed from the closet.`) : null,
    w.hair && hairName(w.hair) ? h('ul', { class: 'list hair-row' }, h('li', null,
      h('div', { class: 'main' }, h('div', { class: 'tiny' }, 'Hair'), h('div', null, hairName(w.hair))))) : null,
  );
}

export function openDay(date) {
  let cur = date;
  const today = isoDate();
  sheet('History', (close, render) => {
    const dates = loggedDates();
    if (!dates.includes(cur)) cur = dates[dates.length - 1] || cur;
    const i = dates.indexOf(cur);
    const go = (d) => { cur = d; render(); };
    return h('div', { class: 'hist' },
      h('div', { class: 'hist-nav' },
        h('button', { class: 'btn ghost nav-btn', 'aria-label': 'Earlier day', disabled: i <= 0, onclick: () => go(dates[i - 1]) }, h('span', { class: 'chev left' })),
        h('div', { class: 'hist-date' },
          h('b', null, longDate(cur)),
          h('span', { class: 'tiny faint' }, ago(cur, today))),
        h('button', { class: 'btn ghost nav-btn', 'aria-label': 'Later day', disabled: i < 0 || i >= dates.length - 1, onclick: () => go(dates[i + 1]) }, h('span', { class: 'chev right' }))),
      day(cur),
      dates.length > 1 ? h('p', { class: 'tiny faint hist-count' }, `${i + 1} of ${dates.length} days logged`) : null,
    );
  });
}
