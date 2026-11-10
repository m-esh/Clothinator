// Settings: weather, preferences, the on-phone models, backups.

import { h, sheet, toast, confirmSheet, toggle } from './dom.js';
import { itemPic, displayName } from './board.js';
import * as store from '../data/store.js';
import { state } from '../data/store.js';
import { geocode } from '../core/weather.js';
import { exportBackup, importBackup } from '../data/backup.js';
import { invalidateWeather } from './today.js';
import { PALETTES } from './palette.js';
import * as valet from './mascot.js';
import { DEFAULT_STYLES } from '../core/hair.js';
import { claudeKey, setClaudeKey } from './chat.js';

let models = null; // { background, classify } once checked
let downloading = null;
let chatInfo = null; // { key, b } once checked

const hours = Array.from({ length: 24 }, (_, i) => i);
const hourLabel = (x) => (x === 0 ? '12am' : x === 12 ? '12pm' : x > 12 ? `${x - 12}pm` : `${x}am`);

export function renderSettings(root, rerender) {
  const p = state.prefs;
  if (!models) {
    models = { checking: true };
    import('../vision/ai.js').then((m) => m.modelStatus()).then((s) => { models = s; rerender(); }).catch(() => { models = { background: false, classify: false }; rerender(); });
  }

  root.append(h('div', { class: 'page-head' }, h('h1', null, 'Settings')));

  // ── look ──
  const pal = PALETTES.find((x) => x.key === (p.palette || 'graphite')) || PALETTES[0];
  const chosen = p.mascot ?? 'fox';
  root.append(h('section', null,
    h('ul', { class: 'list' },
      h('li', null,
        h('div', { class: 'main' }, h('div', null, 'Colour'), h('div', { class: 'tiny' }, pal.label)),
        h('div', { class: 'swatches', role: 'group', 'aria-label': 'Colour scheme' },
          PALETTES.map((x) => h('button', {
            key: x.key, class: 'swatch', 'aria-label': x.label, 'aria-pressed': String(pal.key === x.key),
            style: { background: x.bg, '--dot': x.dots[0] },
            onclick: () => store.updatePrefs({ palette: x.key }),
          })))),
      h('li', null,
        h('div', { class: 'main' }, h('div', null, 'Valet'), h('div', { class: 'tiny' }, chosen === 'none' ? 'Off' : valet.art(chosen)?.name)),
        h('div', { class: 'swatches', role: 'group', 'aria-label': 'Your valet' },
          valet.MASCOT_KEYS.map((k) => h('button', {
            key: k, class: 'swatch face', 'aria-label': valet.art(k).name, 'aria-pressed': String(chosen === k),
            onclick: () => store.updatePrefs({ mascot: k }),
          }, valet.avatar(k, 34))),
          h('button', { key: 'none', class: 'swatch off', 'aria-label': 'No valet', 'aria-pressed': String(chosen === 'none'), onclick: () => store.updatePrefs({ mascot: 'none' }) }, 'Off'))),
      chosen !== 'none' ? chatRows(rerender) : null,
    )));

  // ── weather ──
  root.append(h('section', null,
    h('div', { class: 'label' }, 'Weather'),
    h('ul', { class: 'list' },
      h('li', null,
        h('div', { class: 'main' }, h('div', null, 'Location'), h('div', { class: 'tiny' }, p.location ? p.location.name : 'This phone\'s location')),
        p.location
          ? h('button', { class: 'link small', onclick: async () => { await store.updatePrefs({ location: null }); invalidateWeather(); } }, 'Use mine')
          : h('button', { class: 'link small', onclick: () => citySheet() }, 'Pick a city')),
      h('li', null,
        h('div', { class: 'main' }, 'Your day'),
        h('div', { class: 'row' },
          hourSelect(p.from, (v) => { store.updatePrefs({ from: v, to: Math.max(v + 1, p.to) }); invalidateWeather(); }),
          h('span', { class: 'faint' }, 'to'),
          hourSelect(p.to, (v) => { store.updatePrefs({ to: v, from: Math.min(v - 1, p.from) }); invalidateWeather(); }))),
      h('li', null,
        h('div', { class: 'main' }, 'Units'),
        h('div', { class: 'seg quiet', style: { width: '110px' } },
          ['C', 'F'].map((u) => h('button', { 'aria-pressed': String(p.unit === u), onclick: () => store.updatePrefs({ unit: u }) }, `°${u}`)))),
    )));

  // ── outfits ──
  const pairs = p.neverPairs.map(([a, b]) => [store.itemById(a), store.itemById(b)]).filter(([a, b]) => a && b);
  const blocked = state.items.filter((i) => i.blocked);
  const favs = state.items.filter((i) => i.favorite);
  const hair = p.hair || { on: false, styles: null };
  const styles = hair.styles || DEFAULT_STYLES;
  const setHair = (patch) => store.updatePrefs({ hair: { ...hair, styles, ...patch } });
  root.append(h('section', null,
    h('div', { class: 'label' }, 'Outfits'),
    h('ul', { class: 'list' },
      h('li', null,
        h('div', { class: 'main' }, h('div', null, 'Never together'), h('div', { class: 'tiny' }, pairs.length ? `${pairs.length} pair${pairs.length === 1 ? '' : 's'}` : 'None')),
        h('button', { class: 'link small', onclick: () => pairSheet() }, 'Add')),
      pairs.map(([a, b], idx) => h('li', { key: `${a.id}|${b.id}` },
        h('div', { class: 'thumb' }, itemPic(a)), h('div', { class: 'thumb' }, itemPic(b)),
        h('div', { class: 'main small' }, `${displayName(a)} + ${displayName(b)}`),
        h('button', { class: 'link small danger', onclick: () => store.updatePrefs({ neverPairs: p.neverPairs.filter((_, j) => j !== idx) }) }, 'Remove'))),
      favs.length ? h('li', null, h('div', { class: 'main' }, h('div', null, 'Favourites'), h('div', { class: 'tiny' }, favs.map(displayName).join(', ')))) : null,
      blocked.length ? h('li', null, h('div', { class: 'main' }, h('div', null, 'Never suggested'), h('div', { class: 'tiny' }, blocked.map(displayName).join(', ')))) : null,
      h('li', null,
        h('div', { class: 'main' }, h('div', null, 'Suggest a hairstyle')),
        toggle(hair.on, (v) => setHair({ on: v }), 'Suggest a hairstyle')),
      hair.on ? styles.map((st) => h('li', { key: st.id },
        h('div', { class: 'main' },
          h('div', null, st.name),
          h('div', { class: 'tiny' }, [st.modes.map((m) => m[0].toUpperCase() + m.slice(1)).join(', '), st.weatherProof ? 'holds up in wind and rain' : null].filter(Boolean).join(' · '))),
        h('button', { class: 'link small danger', onclick: () => setHair({ styles: styles.filter((x) => x.id !== st.id) }) }, 'Remove'))) : null,
      hair.on ? h('li', null, h('button', { class: 'link small', onclick: () => hairSheet(styles, setHair) }, 'Add a hairstyle')) : null,
      h('li', null,
        h('div', { class: 'main' }, h('div', null, 'Learned taste'), h('div', { class: 'tiny num' }, `From ${state.model.n} choice${state.model.n === 1 ? '' : 's'}`)),
        state.model.n ? h('button', { class: 'link small danger', onclick: () => confirmSheet('Forget learned taste?', 'Suggestions go back to rules only. Your closet, outfits and wear counts stay.', 'Forget', () => store.resetTaste(), { danger: true }) }, 'Reset') : null),
    )));

  // ── data ──
  const both = models.background && models.classify;
  const some = models.background || models.classify;
  root.append(h('section', null,
    h('div', { class: 'label' }, 'Data'),
    h('ul', { class: 'list' },
      h('li', null,
        h('div', { class: 'main' },
          h('div', null, 'Photo AI'),
          h('div', { class: 'tiny num' }, models.checking ? 'Checking…' : downloading ? `Downloading ${Math.round(downloading.p * 100)}%` : both ? 'Downloaded · works offline' : '135 MB, for reading photos')),
        downloading || models.checking ? null
          : both ? h('button', { class: 'link small danger', onclick: async () => {
            const m = await import('../vision/ai.js');
            await m.clearModels();
            models = null;
            rerender();
            toast('Photo AI removed');
          } }, 'Remove')
          : h('button', { class: 'link small', onclick: () => download(rerender) }, some ? 'Finish' : 'Download')),
      downloading ? h('li', null, h('div', { class: 'progress', style: { flex: 1 } }, h('div', { style: { width: `${Math.round(downloading.p * 100)}%` } }))) : null,
      h('li', null,
        h('div', { class: 'main' },
          h('div', null, 'Backup'),
          h('div', { class: 'tiny' }, p.lastBackupAt ? `Last ${new Date(p.lastBackupAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Never')),
        h('div', { class: 'row' },
          h('label', { class: 'link small file-btn' }, 'Restore',
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
            } })),
          h('button', { class: 'btn small', onclick: async () => { if (await exportBackup()) toast('Backup saved'); } }, 'Save'))),
    )));

  root.append(h('p', { class: 'tiny faint settings-foot' }, 'Clad 1.0 · weather by Open-Meteo'));
}

function hourSelect(value, onChange) {
  return h('select', { class: 'input', style: { width: '86px', height: '34px' }, onchange: (e) => onChange(Number(e.target.value)) },
    hours.map((x) => h('option', { value: x, selected: x === value }, hourLabel(x))));
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

function hairSheet(styles, setHair) {
  const d = { name: '', modes: ['casual'], weatherProof: false };
  sheet('New hairstyle', (close, redraw) => h('div', null,
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Name'),
      h('input', { class: 'input', placeholder: 'e.g. Curtain bangs', value: d.name, oninput: (e) => { d.name = e.target.value; } })),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Good for'),
      h('div', { class: 'chips' }, ['fancy', 'casual', 'comfy'].map((m) => h('button', {
        class: 'chip', 'aria-pressed': String(d.modes.includes(m)),
        onclick: () => { d.modes = d.modes.includes(m) ? d.modes.filter((x) => x !== m) : [...d.modes, m]; redraw(); },
      }, m[0].toUpperCase() + m.slice(1))))),
    h('ul', { class: 'list', style: { marginTop: '16px' } }, h('li', null,
      h('div', { class: 'main' }, 'Holds up in wind and rain'),
      toggle(d.weatherProof, (v) => { d.weatherProof = v; redraw(); }, 'Holds up in wind and rain'))),
    h('button', { class: 'btn block', style: { marginTop: '18px' }, onclick: () => {
      const name = d.name.trim();
      if (!name) { toast('Give it a name'); return; }
      if (!d.modes.length) { toast('Pick at least one mood'); return; }
      setHair({ styles: [...styles, { id: `h${Date.now().toString(36)}`, name, modes: d.modes, weatherProof: d.weatherProof }] });
      close();
    } }, 'Add'),
  ));
}

// ── valet chat: the optional Claude key, as rows in the Look list ──

function chatRows(rerender) {
  const c = state.prefs.chat || {};
  const setChat = (patch) => store.updatePrefs({ chat: { ...c, ...patch } });
  if (!chatInfo) {
    chatInfo = { checking: true };
    Promise.all([claudeKey(), import('../ai/brain.js')]).then(([key, b]) => { chatInfo = { key, b }; rerender(); });
  }
  if (chatInfo.checking) return null;
  const { key, b } = chatInfo;
  const useClaude = !!key && (c.brain || 'auto') !== 'valet';
  const model = c.model || b.DEFAULT_CLAUDE;
  return [
    h('li', { key: 'claude' },
      h('div', { class: 'main' },
        h('div', null, 'Chat with Claude'),
        h('div', { class: 'tiny' }, key ? (useClaude ? `Key …${key.slice(-4)} · sends your question to Anthropic` : `Key …${key.slice(-4)} · off`) : 'Optional, needs an API key')),
      key ? h('div', { class: 'row' },
        h('button', { class: 'link small danger', onclick: async () => { await setClaudeKey(''); chatInfo = null; rerender(); toast('Key removed'); } }, 'Remove'),
        toggle(useClaude, (v) => setChat({ brain: v ? 'auto' : 'valet' }), 'Chat with Claude'))
        : h('button', { class: 'link small', onclick: () => keySheet(() => { chatInfo = null; rerender(); }) }, 'Add key')),
    useClaude ? h('li', { key: 'claude-model' },
      h('div', { class: 'main' }, 'Model'),
      h('div', { class: 'seg quiet', style: { width: '140px' } },
        b.CLAUDE_MODELS.map((x) => h('button', { 'aria-pressed': String(model === x.id), onclick: () => setChat({ model: x.id }) }, x.label.replace('Claude ', '').replace(/ 5\.5$/, ''))))) : null,
  ];
}

function keySheet(done) {
  let k = '';
  sheet('Claude API key', (close) => {
    const save = async () => {
      const v = k.trim();
      if (!/^sk-ant-/.test(v)) { toast('That doesn\'t look like an Anthropic key (sk-ant-…)'); return; }
      await setClaudeKey(v);
      close();
      done();
      toast('Key saved');
    };
    const input = h('input', { class: 'input', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: k, oninput: (e) => { k = e.target.value; } });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    queueMicrotask(() => input.focus());
    return h('div', null,
      h('p', { class: 'small muted', style: { marginTop: 0 } },
        'Create a key at ', h('a', { class: 'link', href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener' }, 'console.anthropic.com'),
        ' and paste it here. It\'s kept only on this phone, isn\'t included in backups, and is used only to send your chat to Anthropic.'),
      h('div', { class: 'row' }, input, h('button', { class: 'btn small', onclick: save }, 'Save')),
      h('p', { class: 'tiny faint' }, 'Tip: set a monthly spend limit on the key in the console.'));
  });
}
