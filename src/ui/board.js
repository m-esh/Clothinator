// The flat-lay: an outfit laid out like clothes on the floor.

import { h } from './dom.js';
import { photoURL, cachedPhotoURL } from '../data/store.js';
import { stats } from '../core/catalog.js';
import { COLOR } from '../core/color.js';
import { silhouette } from './silhouettes.js';

export function itemPic(item, kind = 'thumb') {
  if (!item.hasPhoto) {
    const hex = COLOR[item.colors?.[0]?.name]?.hex || item.colors?.[0]?.hex;
    return silhouette(item.type, hex, item.pattern || stats(item).pattern);
  }
  // Known photo: set it now so a re-render never shows a blank frame.
  const cached = cachedPhotoURL(item.id, kind);
  const tag = `${item.id}:${kind}`;
  const img = h('img', { alt: item.name || '', decoding: 'async', src: cached || null, 'data-photo': tag });
  if (!cached) {
    photoURL(item.id, kind).then((u) => {
      if (!u) return;
      img.src = u;
      // The page may have kept an older <img> for this photo; fill that too.
      for (const live of document.querySelectorAll(`img[data-photo="${tag}"]`)) if (!live.src) live.src = u;
    });
  }
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
  let n = 0;
  o = { ...o, index: () => n++ };
  for (const slot of ORDER) {
    const item = outfit[slot];
    if (!item) continue;
    tiles.push(tile(item, slot === 'shoes' ? 'shoes' : 'big', slot, o));
  }
  for (const a of outfit.accessories || []) tiles.push(tile(a, 'acc', 'accessory', o));
  if (o.onAdd) {
    if (!outfit.outer || !outfit.mid) {
      tiles.push(h('button', { key: 'add-layer', class: 'tile add acc', onclick: () => o.onAdd('layer') }, '+ layer'));
    }
    tiles.push(h('button', { key: 'add-acc', class: 'tile add acc', onclick: () => o.onAdd('accessory') }, '+ accessory'));
  }
  return h('div', { class: 'board' }, tiles);
}

function tile(item, size, slot, o) {
  const flagged = o.flagged?.has(item.id);
  return h(o.onTap ? 'button' : 'div', {
    key: `${slot}:${item.id}`,
    style: { '--i': String(o.index?.() ?? 0) },
    class: `tile ${size}${flagged ? ' flagged' : ''}`,
    onclick: o.onTap ? () => o.onTap(slot, item) : null,
    'aria-label': o.onTap ? `Swap ${displayName(item)}` : null,
  },
  h('div', { class: 'pic' }, itemPic(item)),
  h('div', { class: 'name' }, displayName(item)));
}

export function miniBoard(items) {
  const ordered = [...items].sort((a, b) => rank(a) - rank(b)).slice(0, 6);
  return h('div', { class: 'mini-board' }, ordered.map((i) => h('div', { class: 'm', key: i.id }, itemPic(i))));
}

const CAT_RANK = { outer: 0, top: 1, onepiece: 2, bottom: 3, shoes: 4, accessory: 5 };
const rank = (i) => {
  const s = stats(i);
  return CAT_RANK[s.cat] + (s.layer === 'base' ? 0.5 : 0);
};
