// Settings: weather, preferences, the on-phone models, backups.

import { h, sheet, toast, confirmSheet } from './dom.js';
import { itemPic, displayName } from './board.js';
import * as store from '../data/store.js';
import { state } from '../data/store.js';
import { geocode } from '../core/weather.js';
import { exportBackup, importBackup } from '../data/backup.js';
import { invalidateWeather } from './today.js';

let models = null; // { background, classify } once checked
let downloading = null;

const hours = Array.from({ length: 24 }, (_, i) => i);
const hourLabel = (x) => (x === 0 ? '12am' : x === 12 ? '12pm' : x > 12 ? `${x - 12}pm` : `${x}am`);

export function renderSettings(root, rerender) {
  const p = state.prefs;
  if (!models) {
    models = { checking: true };
    import('../vision/ai.js').then((m) => m.modelStatus()).then((s) => { models = s; rerender(); }).catch(() => { models = { background: false, classify: false }; rerender(); });
  }

  root.append(h('div', { class: 'page-head' }, h('h1', null, 'Settings')));

  // ── weather ──
  root.append(h('section', null,
    h('div', { class: 'label', style: { marginBottom: '8px' } }, 'Weather'),
    h('ul', { class: 'list' },
      h('li', null,
        h('div', { class: 'main' }, h('div', null, 'Location'), h('div', { class: 'tiny faint' }, p.location ? p.location.name : 'This phone\'s location')),
        p.location
          ? h('button', { class: 'btn ghost small', onclick: async () => { await store.updatePrefs({ location: null }); invalidateWeather(); } }, 'Use my location')
          : h('button', { class: 'btn ghost small', onclick: () => citySheet() }, 'Pick a city')),
      h('li', null,
        h('div', { class: 'main' }, h('div', null, 'Your day'), h('div', { class: 'tiny faint' }, 'Outfits are planned for these hours')),
        h('div', { class: 'row' },
          hourSelect(p.from, (v) => { store.updatePrefs({ from: v, to: Math.max(v + 1, p.to) }); invalidateWeather(); }),
          h('span', { class: 'faint' }, 'to'),
          hourSelect(p.to, (v) => { store.updatePrefs({ to: v, from: Math.min(v - 1, p.from) }); invalidateWeather(); }))),
      h('li', null,
        h('div', { class: 'main' }, 'Units'),
        h('div', { class: 'seg quiet', style: { width: '120px' } },
          ['C', 'F'].map((u) => h('button', { 'aria-pressed': String(p.unit === u), onclick: () => store.updatePrefs({ unit: u }) }, `°${u}`)))),
    )));

  // ── preferences ──
  const pairs = p.neverPairs.map(([a, b]) => [store.itemById(a), store.itemById(b)]).filter(([a, b]) => a && b);
  const blocked = state.items.filter((i) => i.blocked);
  const favs = state.items.filter((i) => i.favorite);
  root.append(h('section', null,
    h('div', { class: 'label', style: { marginBottom: '8px' } }, 'Preferences'),
    h('p', { class: 'tiny faint', style: { marginTop: 0 } }, 'The app also learns from what you wear, skip, swap and save. These are the hard rules on top.'),
    h('div', { class: 'row between', style: { marginTop: '14px' } }, h('h3', null, 'Never together'), h('button', { class: 'link small', onclick: () => pairSheet() }, 'Add a pair')),
    pairs.length ? h('ul', { class: 'list', style: { marginTop: '8px' } }, pairs.map(([a, b], idx) => h('li', null,
      h('div', { class: 'thumb' }, itemPic(a)), h('div', { class: 'thumb' }, itemPic(b)),
      h('div', { class: 'main small' }, `${displayName(a)} + ${displayName(b)}`),
      h('button', { class: 'link small', onclick: () => store.updatePrefs({ neverPairs: p.neverPairs.filter((_, j) => j !== idx) }) }, 'Remove'))))
      : h('p', { class: 'small muted' }, 'None yet.'),
    listOf('Favourites', favs, 'Mark favourites on an item\'s page.'),
    listOf('Never suggested', blocked, 'Hide items from outfits on their page.'),
    h('div', { class: 'row between', style: { marginTop: '18px' } },
      h('div', null, h('h3', null, 'Learned taste'), h('div', { class: 'tiny faint num' }, `From ${state.model.n} choice${state.model.n === 1 ? '' : 's'} so far`)),
      state.model.n ? h('button', { class: 'link small', onclick: () => confirmSheet('Forget learned taste?', 'Suggestions go back to rules only. Your closet, outfits and wear counts stay.', 'Forget', () => store.resetTaste(), { danger: true }) }, 'Reset') : null),
  ));

  // ── models ──
  const both = models.background && models.classify;
  root.append(h('section', null,
    h('div', { class: 'label', style: { marginBottom: '8px' } }, 'On-phone AI'),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Background removal and recognising clothes run on this phone, free, and nothing is uploaded. The models download once (about 135 MB).'),
    models.checking ? h('p', { class: 'small faint' }, 'Checking…') : h('ul', { class: 'list' },
      h('li', null, h('div', { class: 'main' }, 'Background removal'), h('span', { class: 'small faint' }, models.background ? 'Downloaded' : 'Not yet')),
      h('li', null, h('div', { class: 'main' }, 'Clothing recognition'), h('span', { class: 'small faint' }, models.classify ? 'Downloaded' : 'Not yet'))),
    downloading ? h('div', null, h('div', { class: 'small muted', style: { marginTop: '12px' } }, `Downloading ${Math.round(downloading.p * 100)}%`), h('div', { class: 'progress' }, h('div', { style: { width: `${Math.round(downloading.p * 100)}%` } })))
      : h('div', { class: 'row', style: { marginTop: '12px' } },
        !both && !models.checking ? h('button', { class: 'btn ghost small', onclick: () => download(rerender) }, 'Download now (use Wi-Fi)') : null,
        (models.background || models.classify) ? h('button', { class: 'link small', onclick: async () => {
          const m = await import('../vision/ai.js');
          await m.clearModels();
          models = null;
          rerender();
          toast('Models removed');
        } }, 'Remove models') : null),
  ));

  // ── backup ──
  root.append(h('section', null,
    h('div', { class: 'label', style: { marginBottom: '8px' } }, 'Backup'),
    h('p', { class: 'small muted', style: { marginTop: 0 } },
      p.lastBackupAt ? `Last backup ${new Date(p.lastBackupAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'No backup yet.',
      ' Everything, photos included, in one file. Save it to iCloud Drive.'),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn small', onclick: async () => { if (await exportBackup()) toast('Backup saved'); } }, 'Save a backup'),
      h('label', { class: 'btn ghost small file-btn' }, 'Restore',
        h('input', { type: 'file', accept: 'application/json,.json', onchange: (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          confirmSheet('Restore this backup?', 'Everything currently in the app is replaced by the backup.', 'Restore', async () => {
            try {
              const r = await importBackup(file);
              invalidateWeather();
              toast(`Restored ${r.items} pieces`);
            } catch (err) {
              toast(err.message);
            }
          }, { danger: true });
        } }))),
  ));

  root.append(h('p', { class: 'tiny faint', style: { marginTop: '36px' } },
    'Clothinator 1.0 · weather by Open-Meteo · everything stays on this phone'));
}

function hourSelect(value, onChange) {
  return h('select', { class: 'input', style: { width: '86px', height: '34px' }, onchange: (e) => onChange(Number(e.target.value)) },
    hours.map((x) => h('option', { value: x, selected: x === value }, hourLabel(x))));
}

function listOf(title, items, empty) {
  return h('div', { style: { marginTop: '18px' } },
    h('h3', null, title),
    items.length ? h('div', { class: 'chips', style: { marginTop: '8px' } }, items.map((i) => h('a', { class: 'chip', href: `#item/${i.id}` }, displayName(i))))
      : h('p', { class: 'small muted' }, empty));
}

async function download(rerender) {
  downloading = { p: 0 };
  rerender();
  try {
    const m = await import('../vision/ai.js');
    let last = 0;
    await m.preload((p) => {
      downloading.p = p;
      if (p - last > 0.02) { last = p; rerender(); }
    });
    toast('Models ready, they work offline now');
  } catch (e) {
    console.error(e);
    toast('Download failed. Check the connection and try again.');
  }
  downloading = null;
  models = null;
  rerender();
}

function citySheet() {
  let results = [];
  let q = '';
  sheet('Pick a city', (close, redraw) => {
    const input = h('input', { class: 'input', placeholder: 'City name', value: q, autocapitalize: 'words', oninput: (e) => { q = e.target.value; } });
    const search = async () => {
      if (!q.trim()) return;
      try { results = await geocode(q.trim()); } catch { results = []; toast('Search failed'); }
      redraw();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
    queueMicrotask(() => input.focus());
    return h('div', null,
      h('div', { class: 'row' }, input, h('button', { class: 'btn small', onclick: search }, 'Search')),
      h('ul', { class: 'list', style: { marginTop: '12px' } }, results.map((r) => h('li', { style: { cursor: 'pointer' }, onclick: async () => {
        await store.updatePrefs({ location: r });
        invalidateWeather();
        close();
        toast(`Weather for ${r.name}`);
      } }, h('div', { class: 'main' }, r.name)))));
  });
}

function pairSheet() {
  let first = null;
  sheet('Never together', (close, redraw) => h('div', null,
    h('p', { class: 'small muted', style: { marginTop: 0 } }, first ? `Now pick what ${displayName(first)} should never be paired with.` : 'Pick the first piece.'),
    h('div', { class: 'grid' }, state.items.filter((i) => i !== first).map((i) => h('button', { class: 'card', onclick: async () => {
      if (!first) { first = i; redraw(); return; }
      const pair = [first.id, i.id];
      const exists = state.prefs.neverPairs.some(([a, b]) => (a === pair[0] && b === pair[1]) || (a === pair[1] && b === pair[0]));
      if (!exists) await store.updatePrefs({ neverPairs: [...state.prefs.neverPairs, pair] });
      close();
      toast('Got it, never together');
    } }, h('div', { class: 'pic' }, itemPic(i)), h('div', { class: 't' }, displayName(i))))),
  ));
}
