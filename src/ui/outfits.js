// Outfits: the ones you've saved, and a builder for your own.

import { h, sheet, toast, confirmSheet } from './dom.js';
import { board, miniBoard, itemPic, displayName } from './board.js';
import * as store from '../data/store.js';
import { state } from '../data/store.js';
import { assemble } from '../core/generate.js';
import { evaluate, MODES } from '../core/rules.js';
import { CATEGORIES, stats } from '../core/catalog.js';
import { isoDate } from '../core/week.js';

export function renderOutfits(root) {
  root.append(h('div', { class: 'page-head' },
    h('h1', null, 'Outfits'),
    state.outfits.length ? h('a', { class: 'btn small', href: '#build' }, 'New') : null));

  if (!state.outfits.length) {
    root.append(h('div', { class: 'empty' },
      h('p', null, 'Nothing saved yet. Tap Save on a suggestion, or build your own.'),
      h('a', { class: 'btn', href: '#build' }, 'Build an outfit')));
    return;
  }

  root.append(h('ul', { class: 'list' }, state.outfits.map((o) => {
    const pieces = o.itemIds.map(store.itemById).filter(Boolean);
    const ev = evaluate(assemble(pieces), { mode: o.mode || 'casual', prefs: state.prefs });
    const warns = ev.notes.filter((n) => n.tone !== 'good').length;
    const out = pieces.filter((p) => p.inLaundry).length;
    return h('li', { style: { display: 'block', cursor: 'pointer' }, onclick: () => outfitSheet(o) },
      miniBoard(pieces),
      h('div', { class: 'row between', style: { marginTop: '8px' } },
        h('span', { class: 'small' }, o.name || describe(pieces)),
        h('span', { class: 'tiny faint' }, [o.mode && MODES[o.mode]?.label, out ? `${out} in laundry` : null, warns ? `${warns} warning${warns > 1 ? 's' : ''}` : null].filter(Boolean).join(' · '))));
  })));
}

const describe = (pieces) => pieces.filter((p) => ['top', 'bottom', 'onepiece'].includes(stats(p).cat)).map(displayName).join(', ');

function outfitSheet(o) {
  const pieces = o.itemIds.map(store.itemById).filter(Boolean);
  const fit = assemble(pieces);
  const mode = o.mode || 'casual';
  const ev = evaluate(fit, { mode, prefs: state.prefs });
  sheet(o.name || 'Outfit', (close) => h('div', null,
    board(fit),
    h('ul', { class: 'why' }, ev.notes.map((n) => h('li', { class: n.tone === 'good' ? '' : 'warn' }, n.text))),
    h('div', { class: 'row wrap', style: { marginTop: '18px' } },
      h('button', { class: 'btn', disabled: pieces.some((p) => p.inLaundry), onclick: async () => {
        close();
        const w = await store.logWear(o.itemIds, mode, { date: isoDate() });
        toast('Logged as worn today', { label: 'Undo', run: () => store.undoWear(w.id) });
      } }, 'Wear today'),
      h('a', { class: 'btn ghost', href: `#build/${o.id}`, onclick: close }, 'Edit'),
      h('button', { class: 'link danger', onclick: () => { close(); confirmSheet('Delete outfit?', 'The pieces stay in your closet.', 'Delete', () => store.deleteOutfit(o.id), { danger: true }); } }, 'Delete')),
    pieces.some((p) => p.inLaundry) ? h('p', { class: 'tiny warn' }, 'Something in this outfit is in the laundry.') : null,
  ));
}

// ── builder ────────────────────────────────────────────────

let B = null;

export function renderBuilder(root, rerender, editId = null) {
  if (!B || B.editingId !== editId) {
    const o = editId && state.outfits.find((x) => x.id === editId);
    B = { editingId: editId, ids: o ? [...o.itemIds] : [], name: o?.name || '', mode: o?.mode || 'casual' };
  }
  const pieces = B.ids.map(store.itemById).filter(Boolean);
  const fit = assemble(pieces);
  const ev = pieces.length ? evaluate(fit, { mode: B.mode, prefs: state.prefs }) : null;

  root.append(
    h('div', { class: 'row between', style: { marginBottom: '14px' } },
      h('a', { class: 'link small', href: '#outfits', onclick: () => { B = null; } }, '← Outfits')),
    h('h1', { style: { marginBottom: '16px' } }, editId ? 'Edit outfit' : 'Build an outfit'),
    h('div', { class: 'seg quiet', style: { marginBottom: '16px' } },
      Object.values(MODES).map((m) => h('button', { 'aria-pressed': String(B.mode === m.key), onclick: () => { B.mode = m.key; rerender(); } }, m.label))),
  );

  if (pieces.length) {
    root.append(board(fit, {
      onTap: (slot, item) => { B.ids = B.ids.filter((x) => x !== item.id); rerender(); },
    }));
    root.append(h('div', { class: 'tiny faint', style: { marginTop: '6px' } }, 'Tap a piece to take it out.'));
  }

  root.append(h('button', { class: 'btn ghost block', style: { marginTop: '14px' }, onclick: () => pickerSheet(rerender) }, pieces.length ? 'Add or change pieces' : 'Choose pieces'));

  if (ev) {
    const bad = ev.notes.filter((n) => n.tone !== 'good');
    const good = ev.notes.filter((n) => n.tone === 'good');
    root.append(h('ul', { class: 'why' },
      good.map((n) => h('li', null, n.text)),
      bad.map((n) => h('li', { class: 'warn' }, n.text))));
  }

  root.append(
    h('label', { class: 'field', style: { marginTop: '20px' } }, h('span', { class: 'label' }, 'Name (optional)'),
      h('input', { class: 'input', value: B.name, placeholder: 'e.g. Friday meetings', oninput: (e) => { B.name = e.target.value; } })),
    h('button', { class: 'btn block', style: { marginTop: '18px' }, disabled: pieces.length < 2, onclick: async () => {
      if (editId) await store.updateOutfit(editId, { itemIds: B.ids, name: B.name.trim(), mode: B.mode });
      else await store.saveOutfit(B.ids, { name: B.name.trim(), mode: B.mode });
      B = null;
      location.hash = '#outfits';
      toast('Outfit saved');
    } }, 'Save outfit'),
  );
}

function pickerSheet(rerender) {
  let cat = 'top';
  sheet('Pieces', (close, redraw) => {
    const list = state.items.filter((i) => stats(i).cat === cat);
    return h('div', null,
      h('div', { class: 'filter-row', style: { marginBottom: '12px' } }, h('div', { class: 'chips' },
        CATEGORIES.map((c) => h('button', { class: 'chip', 'aria-pressed': String(cat === c.key), onclick: () => { cat = c.key; redraw(); } }, c.label)))),
      list.length ? h('div', { class: 'grid' }, list.map((i) => {
        const on = B.ids.includes(i.id);
        return h('button', { class: `card${i.inLaundry ? ' out' : ''}`, onclick: () => {
          if (on) B.ids = B.ids.filter((x) => x !== i.id);
          else {
            // One per slot, except accessories: picking a new base swaps the old one.
            const s = stats(i);
            if (s.cat !== 'accessory') {
              B.ids = B.ids.filter((x) => {
                const o = stats(store.itemById(x));
                if (s.cat === 'top') return !(o.cat === 'top' && o.layer === s.layer);
                if (s.cat === 'onepiece') return !['onepiece', 'bottom'].includes(o.cat);
                if (s.cat === 'bottom') return !['onepiece', 'bottom'].includes(o.cat);
                return o.cat !== s.cat;
              });
            }
            B.ids.push(i.id);
          }
          redraw();
          rerender();
        } },
        h('div', { class: 'pic', style: on ? { outline: '2px solid var(--ink)', outlineOffset: '-2px' } : null }, itemPic(i), on ? h('span', { class: 'badge' }, 'in') : null),
        h('div', { class: 't' }, displayName(i)));
      })) : h('p', { class: 'muted' }, 'Nothing in this category yet.'),
      h('button', { class: 'btn block', style: { marginTop: '18px' }, onclick: close }, 'Done'),
    );
  });
}
