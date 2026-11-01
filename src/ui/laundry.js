// Laundry: what's in the wash, and what's been worn since its last one.
// Nothing moves here on its own; you decide.

import { h, toast, shortDate } from './dom.js';
import { itemPic, displayName } from './board.js';
import * as store from '../data/store.js';
import { state } from '../data/store.js';
import { isoDate } from '../core/week.js';

export function renderLaundry(root) {
  const today = isoDate();
  const inWash = state.items.filter((i) => i.inLaundry);
  const worn = state.items
    .filter((i) => !i.inLaundry && (i.wearsSinceWash || 0) > 0)
    .sort((a, b) => (b.wearsSinceWash - a.wearsSinceWash) || ((b.lastWorn || '') > (a.lastWorn || '') ? 1 : -1));

  root.append(h('div', { class: 'page-head' },
    h('div', null, h('h1', null, 'Laundry'), h('div', { class: 'sub faint small num' }, `${inWash.length} in the wash`)),
    inWash.length ? h('button', { class: 'btn small', onclick: async () => {
      const ids = inWash.map((i) => i.id);
      await store.setLaundry(ids, false);
      toast(`${ids.length} piece${ids.length === 1 ? '' : 's'} back in the closet`, { label: 'Undo', run: () => store.setLaundry(ids, true) });
    } }, 'Laundry done') : null));

  root.append(h('section', null,
    h('div', { class: 'label', style: { marginBottom: '10px' } }, 'In the wash'),
    inWash.length
      ? h('ul', { class: 'list' }, inWash.map((i) => row(i, today,
        `${i.wearsSinceWash || 0} wear${i.wearsSinceWash === 1 ? '' : 's'} before washing${i.laundrySince ? ` · in since ${shortDate(i.laundrySince, today)}` : ''}`,
        h('button', { class: 'btn ghost small', onclick: () => store.setLaundry([i.id], false) }, 'Clean'))))
      : h('p', { class: 'muted small' }, 'Nothing in the wash. Everything is available for outfits.')));

  root.append(h('section', null,
    h('div', { class: 'label', style: { marginBottom: '10px' } }, 'Worn since last wash'),
    worn.length
      ? h('ul', { class: 'list' }, worn.map((i) => row(i, today,
        `${i.wearsSinceWash} wear${i.wearsSinceWash === 1 ? '' : 's'} since washed · last ${shortDate(i.lastWorn, today)}`,
        h('button', { class: 'btn ghost small', onclick: () => store.setLaundry([i.id], true) }, 'Wash'))))
      : h('p', { class: 'muted small' }, 'Nothing worn since its last wash.')));
}

function row(i, today, sub, action) {
  return h('li', null,
    h('a', { class: 'thumb', href: `#item/${i.id}` }, itemPic(i)),
    h('div', { class: 'main' }, h('div', { class: 't' }, displayName(i)), h('div', { class: 'tiny faint num' }, sub)),
    action);
}
