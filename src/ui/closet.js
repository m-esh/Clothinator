// Closet: everything you own, and each item's page.

import { h, toast, confirmSheet, shortDate, toggle } from './dom.js';
import { itemPic, displayName, miniBoard } from './board.js';
import * as store from '../data/store.js';
import { state } from '../data/store.js';
import { CATEGORIES, stats, PATTERNS, FABRIC } from '../core/catalog.js';
import { COLOR } from '../core/color.js';
import { isoDate } from '../core/week.js';
import { washTub } from './glyphs.js';

let filter = 'all';

// The item whose picture morphs between the grid and its own page.
let heroId = null;
export function clearHero() {
  heroId = null;
  for (const el of document.querySelectorAll('.card .pic')) el.style.viewTransitionName = '';
}

export function renderCloset(root, rerender) {
  const items = state.items;
  root.append(h('div', { class: 'page-head' },
    h('div', null, h('h1', null, 'Closet'), h('div', { class: 'sub faint small num' }, `${items.length} piece${items.length === 1 ? '' : 's'}`)),
    items.length ? h('a', { class: 'btn small', href: '#add' }, 'Add') : null, // empty state has its own
  ));

  if (!items.length) {
    root.append(h('div', { class: 'empty' },
      h('p', null, 'Nothing here yet.'),
      h('a', { class: 'btn', href: '#add' }, 'Add a piece')));
    return;
  }

  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.key, items.filter((i) => stats(i).cat === c.key).length]));
  root.append(h('div', { class: 'filter-row' }, h('div', { class: 'chips' },
    h('button', { class: 'chip', 'aria-pressed': String(filter === 'all'), onclick: () => { filter = 'all'; rerender(); } }, 'All'),
    CATEGORIES.filter((c) => counts[c.key]).map((c) => h('button', {
      class: 'chip', 'aria-pressed': String(filter === c.key), onclick: () => { filter = c.key; rerender(); },
    }, c.label, h('span', { class: 'faint num' }, counts[c.key]))),
  )));

  const today = isoDate();
  for (const c of CATEGORIES) {
    if (filter !== 'all' && filter !== c.key) continue;
    const list = items.filter((i) => stats(i).cat === c.key);
    if (!list.length) continue;
    root.append(h('div', { class: 'cat-title' }, h('span', { class: 'label' }, c.label)));
    root.append(h('div', { class: 'grid' }, list.map((i) => h('button', {
      key: i.id,
      class: `card${i.inLaundry ? ' out' : ''}`,
      onclick: (e) => {
        heroId = i.id;
        e.currentTarget.querySelector('.pic').style.viewTransitionName = 'hero';
        location.hash = `#item/${i.id}`;
      },
    },
    h('div', { class: 'pic', style: i.id === heroId ? { viewTransitionName: 'hero' } : null }, itemPic(i), i.inLaundry ? h('span', { class: 'badge' }, washTub(), 'wash') : null),
    h('div', { class: 't' }, displayName(i)),
    h('div', { class: 'm' }, `${i.wears || 0} wear${i.wears === 1 ? '' : 's'} · ${shortDate(i.lastWorn, today)}`)))));
  }
}

export function renderItem(root, id) {
  const i = store.itemById(id);
  heroId = id;
  if (!i) {
    root.append(h('p', null, 'That item doesn\'t exist any more. ', h('a', { href: '#closet' }, 'Back to closet')));
    return;
  }
  const s = stats(i);
  const today = isoDate();
  const saved = state.outfits.filter((o) => o.itemIds.includes(id));

  // Wrapped in h() so conditional sections that are null are skipped
  // (native append would print "null").
  root.append(h('div', null,
    h('div', { class: 'row between', style: { marginBottom: '14px' } },
      h('a', { class: 'link back', href: '#closet' }, 'Closet'),
      h('a', { class: 'link small', href: `#edit/${id}` }, 'Edit')),
    h('div', { class: 'hero', style: { viewTransitionName: 'hero' } }, itemPic(i, 'cutout')),
    h('div', { style: { marginTop: '16px' } },
      h('h1', null, displayName(i)),
      h('div', { class: 'muted small' }, [s.label, i.fabric && FABRIC[i.fabric]?.label, PATTERNS.find((p) => p.key === s.pattern)?.label].filter(Boolean).join(' · ')),
      h('div', { class: 'chips', style: { marginTop: '10px' } },
        (i.colors || []).map((c) => h('span', { class: 'chip', style: { pointerEvents: 'none' } }, h('span', { class: 'swatch', style: { background: COLOR[c.name]?.hex || c.hex } }), c.name)))),
    h('div', { class: 'list meters', 'aria-label': 'Measurements' },
      tape('Dressy', s.formality), tape('Warmth', s.warmth), tape('Comfort', s.comfort)),
    h('div', { class: 'stats' },
      h('div', null, h('span', { class: 'label' }, 'Worn'), h('b', null, i.wears || 0)),
      h('div', null, h('span', { class: 'label' }, 'Since wash'), h('b', null, i.wearsSinceWash || 0)),
      h('div', null, h('span', { class: 'label' }, 'Last worn'), h('b', { style: { fontSize: '18px', paddingTop: '4px' } }, shortDate(i.lastWorn, today)))),
    h('div', { class: 'stack' },
      h('button', { class: i.inLaundry ? 'btn block' : 'btn ghost block', onclick: async () => {
        await store.setLaundry([id], !i.inLaundry);
        toast(i.inLaundry ? 'In the laundry' : 'Back in the closet, wash count reset');
      } }, i.inLaundry ? 'Take out of laundry (clean)' : 'Put in laundry'),
    ),
    h('ul', { class: 'list', style: { marginTop: '22px' } },
      toggleRow('Favourite', 'Picked a bit more often', i.favorite, (v) => store.updateItem(id, { favorite: v })),
      toggleRow('Never suggest', 'Left out of outfits', i.blocked, (v) => store.updateItem(id, { blocked: v })),
    ),
    saved.length ? h('section', null,
      h('div', { class: 'label', style: { marginBottom: '10px' } }, `In ${saved.length} saved outfit${saved.length === 1 ? '' : 's'}`),
      saved.slice(0, 4).map((o) => h('a', { href: '#outfits', style: { display: 'block', marginBottom: '8px' } }, miniBoard(o.itemIds.map(store.itemById).filter(Boolean))))) : null,
    h('div', { style: { marginTop: '30px' } },
      h('button', { class: 'link danger', onclick: () => confirmSheet('Delete this?', `${displayName(i)} and its wear history will be removed. Saved outfits lose this piece.`, 'Delete', async () => {
        await store.deleteItem(id);
        location.hash = '#closet';
        toast('Deleted');
      }, { danger: true }) }, 'Delete item')),
  ));
}

// A tape measure from 0 to 5 with the value marked.
// A 0–5 meter, drawn as a filled capsule.
function tape(label, value) {
  return h('div', { class: 'meter-row' },
    h('span', null, label),
    h('div', { class: 'meter', role: 'img', 'aria-label': `${label} ${value} of 5` }, h('span', { style: { width: `${(value / 5) * 100}%` } })),
    h('span', { class: 'v' }, String(value)));
}

function toggleRow(title, sub, on, set) {
  return h('li', null,
    h('div', { class: 'main' }, h('div', null, title), h('div', { class: 'tiny faint' }, sub)),
    toggle(on, set, title));
}
