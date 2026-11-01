// The flat-lay: an outfit laid out like clothes on the floor.

import { h } from './dom.js';
import { photoURL } from '../data/store.js';
import { stats } from '../core/catalog.js';
import { COLOR } from '../core/color.js';

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

export function itemPic(item, kind = 'thumb') {
  if (!item.hasPhoto) {
    const hex = COLOR[item.colors?.[0]?.name]?.hex;
    return h('div', { class: 'nophoto', style: { background: hex || 'var(--paper-3)', color: hex && luminance(hex) < 0.4 ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.55)' } }, stats(item).label);
  }
  const img = h('img', { alt: item.name || '', decoding: 'async' });
  photoURL(item.id, kind).then((u) => { if (u) img.src = u; });
  return img;
}

export const displayName = (item) => item.name || stats(item).label;

const ORDER = ['outer', 'mid', 'base', 'onepiece', 'bottom', 'shoes'];

/**
 * @param outfit   slots → items
 * @param o.onTap  (slot, item) → void
 * @param o.onAdd  (what: 'layer' | 'accessory') → void
 * @param o.flagged Set of item ids to mark
 */
export function board(outfit, o = {}) {
  const tiles = [];
  for (const slot of ORDER) {
    const item = outfit[slot];
    if (!item) continue;
    tiles.push(tile(item, slot === 'shoes' ? 'shoes' : 'big', slot, o));
  }
  for (const a of outfit.accessories || []) tiles.push(tile(a, 'acc', 'accessory', o));
  if (o.onAdd) {
    if (!outfit.outer || !outfit.mid) {
      tiles.push(h('button', { class: 'tile add acc', onclick: () => o.onAdd('layer') }, '+ layer'));
    }
    tiles.push(h('button', { class: 'tile add acc', onclick: () => o.onAdd('accessory') }, '+ accessory'));
  }
  return h('div', { class: 'board' }, tiles);
}

function tile(item, size, slot, o) {
  const flagged = o.flagged?.has(item.id);
  return h(o.onTap ? 'button' : 'div', {
    class: `tile ${size}${flagged ? ' flagged' : ''}`,
    onclick: o.onTap ? () => o.onTap(slot, item) : null,
    'aria-label': o.onTap ? `Swap ${displayName(item)}` : null,
  },
  h('div', { class: 'pic' }, itemPic(item)),
  h('div', { class: 'name' }, displayName(item)));
}

export function miniBoard(items) {
  const ordered = [...items].sort((a, b) => rank(a) - rank(b)).slice(0, 6);
  return h('div', { class: 'mini-board' }, ordered.map((i) => h('div', { class: 'm' }, itemPic(i))));
}

const CAT_RANK = { outer: 0, top: 1, onepiece: 2, bottom: 3, shoes: 4, accessory: 5 };
const rank = (i) => {
  const s = stats(i);
  return CAT_RANK[s.cat] + (s.layer === 'base' ? 0.5 : 0);
};
