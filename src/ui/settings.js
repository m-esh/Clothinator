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
let chatInfo = null; // { key, local, supported } once checked
let chatDownloading = null;

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
  root.append(h('section', null,
    h('div', { class: 'label', style: { marginBottom: '10px' } }, 'Colour scheme'),
    h('div', { class: 'palettes', role: 'group', 'aria-label': 'Colour scheme' },
      PALETTES.map((pal) => h('button', {
        key: pal.key,
        class: 'palette',
        style: { background: pal.bg },
        'aria-pressed': String((p.palette || 'graphite') === pal.key),
        onclick: () => store.updatePrefs({ palette: pal.key }),
      },
      h('span', { class: 'dots' }, pal.dots.map((c) => h('i', { style: { background: c } }))),
      h('b', { style: { color: '#f0f0f2' } }, pal.label)))),
  ));

  // ── valet ──
  const chosen = p.mascot ?? 'fox';
  root.append(h('section', null,
    h('div', { class: 'label' }, 'Your valet'),
    h('div', { class: 'valets', role: 'group', 'aria-label': 'Your valet' },
      valet.MASCOT_KEYS.map((k) => h('button', {
        key: k, class: 'valet-pick', 'aria-pressed': String(chosen === k),
        onclick: () => store.updatePrefs({ mascot: k }),
      }, valet.avatar(k, 56), h('b', null, valet.art(k).name), h('span', null, valet.art(k).kind))),
      h('button', { key: 'none', class: 'valet-pick none', 'aria-pressed': String(chosen === 'none'), onclick: () => store.updatePrefs({ mascot: 'none' }) },
        h('span', { class: 'valet-avatar off', style: { width: '56px', height: '56px' } }, 'Off'), h('b', null, 'No valet'), h('span', null, 'Just the app'))),
    chosen !== 'none' && valet.art(chosen) ? h('div', { style: { marginTop: '12px' } },
      valet.says([valet.voice(chosen).hello, valet.art(chosen).blurb], { key: chosen })) : null,
  ));

  // ── chat ──
  if (chosen !== 'none') renderChat(root, rerender);

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
        h('div', { class: 'main' }, 'Your day'),
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
  const names = (list) => (list.length ? list.map(displayName).join(', ') : 'None');
  root.append(h('section', null,
    h('div', { class: 'label' }, 'Preferences'),
    h('ul', { class: 'list' },
      h('li', null,
        h('div', { class: 'main' }, h('div', null, 'Never together'), h('div', { class: 'tiny' }, pairs.length ? `${pairs.length} pair${pairs.length === 1 ? '' : 's'}` : 'None')),
        h('button', { class: 'link', onclick: () => pairSheet() }, 'Add')),
      pairs.map(([a, b], idx) => h('li', { key: `${a.id}|${b.id}` },
        h('div', { class: 'thumb' }, itemPic(a)), h('div', { class: 'thumb' }, itemPic(b)),
        h('div', { class: 'main small' }, `${displayName(a)} + ${displayName(b)}`),
        h('button', { class: 'link small danger', onclick: () => store.updatePrefs({ neverPairs: p.neverPairs.filter((_, j) => j !== idx) }) }, 'Remove'))),
      h('li', null, h('div', { class: 'main' }, h('div', null, 'Favourites'), h('div', { class: 'tiny' }, names(favs)))),
      h('li', null, h('div', { class: 'main' }, h('div', null, 'Never suggested'), h('div', { class: 'tiny' }, names(blocked)))),
      h('li', null,
        h('div', { class: 'main' }, h('div', null, 'Learned taste'), h('div', { class: 'tiny num' }, `From ${state.model.n} choice${state.model.n === 1 ? '' : 's'}`)),
        state.model.n ? h('button', { class: 'link danger', onclick: () => confirmSheet('Forget learned taste?', 'Suggestions go back to rules only. Your closet, outfits and wear counts stay.', 'Forget', () => store.resetTaste(), { danger: true }) }, 'Reset') : null),
    ),
    h('p', { class: 'tiny faint', style: { padding: '0 16px', marginTop: '7px' } }, 'Set favourites and hidden items on each item\'s page.'),
  ));

  // ── hair ──
  const hair = p.hair || { on: false, styles: null };
  const styles = hair.styles || DEFAULT_STYLES;
  const setHair = (patch) => store.updatePrefs({ hair: { ...hair, styles, ...patch } });
  root.append(h('section', null,
    h('div', { class: 'label' }, 'Hair'),
    h('ul', { class: 'list' },
      h('li', null,
        h('div', { class: 'main' }, h('div', null, 'Include a hairstyle'), h('div', { class: 'tiny' }, 'Suggested with each outfit')),
        toggle(hair.on, (v) => setHair({ on: v }), 'Include a hairstyle')),
      hair.on ? styles.map((st) => h('li', { key: st.id },
        h('div', { class: 'main' },
          h('div', null, st.name),
          h('div', { class: 'tiny' }, [st.modes.map((m) => m[0].toUpperCase() + m.slice(1)).join(', '), st.weatherProof ? 'holds up in wind and rain' : null].filter(Boolean).join(' · '))),
        h('button', { class: 'link small danger', onclick: () => setHair({ styles: styles.filter((x) => x.id !== st.id) }) }, 'Remove'))) : null,
      hair.on ? h('li', null, h('button', { class: 'link', onclick: () => hairSheet(styles, setHair) }, 'Add a hairstyle')) : null,
    ),
  ));

  // ── models ──
  const both = models.background && models.classify;
  root.append(h('section', null,
    h('div', { class: 'label', style: { marginBottom: '8px' } }, 'On-phone AI'),
    h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Runs on this phone, free. One-time download, about 135 MB.'),
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
      ' Save it to iCloud Drive.'),
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
    `Clad 1.0 · weather by Open-Meteo · ${chatInfo?.key ? 'chat goes to Anthropic, everything else stays on this phone' : 'everything stays on this phone'}`));
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

// ── valet chat ─────────────────────────────────────────────

function renderChat(root, rerender) {
  const c = state.prefs.chat || {};
  const setChat = (patch) => store.updatePrefs({ chat: { ...c, ...patch } });
  if (!chatInfo) {
    chatInfo = { checking: true };
    Promise.all([claudeKey(), import('../ai/brain.js')]).then(async ([key, b]) => {
      const local = await b.localCached();
      chatInfo = { key, local, supported: b.localSupported(), b };
      if (!!c.localReady !== local) await setChat({ localReady: local });
      rerender();
    });
  }
  if (chatInfo.checking) return;
  const { key, local, supported, b } = chatInfo;
  const brain = c.brain || 'auto';
  const model = c.model || b.DEFAULT_CLAUDE;
  const name = valet.current()?.name || 'your valet';
  const who = brain === 'local' ? (local ? 'the on-phone model' : null)
    : key && brain !== 'local' ? 'Claude' : local && brain !== 'claude' ? 'the on-phone model' : null;

  root.append(h('section', null,
    h('div', { class: 'label', style: { marginBottom: '8px' } }, 'Chat'),
    h('p', { class: 'small muted', style: { marginTop: 0 } },
      `Tap ${name} to chat. `, who ? `Answered by ${who}.` : 'Right now only weather and wardrobe questions get answers. Add a brain below.'),
    h('ul', { class: 'list' },
      h('li', null,
        h('div', { class: 'main' }, 'Who answers'),
        h('div', { class: 'seg quiet', style: { width: '210px' } },
          [['auto', 'Auto'], ['local', 'Phone'], ['claude', 'Claude']].map(([k, l]) => h('button', { 'aria-pressed': String(brain === k), onclick: () => setChat({ brain: k }) }, l)))),
      h('li', null,
        h('div', { class: 'main' },
          h('div', null, 'On-phone model'),
          h('div', { class: 'tiny' }, !supported ? 'Needs WebGPU (iOS 26 or later)' : local ? 'Downloaded · free and private' : `Free and private · ${b.LOCAL_SIZE}, once`)),
        chatDownloading ? h('span', { class: 'small faint num' }, `${Math.round(chatDownloading.p * 100)}%`)
          : local ? h('button', { class: 'link small danger', onclick: async () => { await b.removeLocal(); await setChat({ localReady: false }); chatInfo = null; rerender(); toast('Chat model removed'); } }, 'Remove')
          : supported ? h('button', { class: 'btn ghost small', onclick: () => downloadChat(b, setChat, rerender) }, 'Download') : null),
      chatDownloading ? h('li', null, h('div', { class: 'progress', style: { flex: 1 } }, h('div', { style: { width: `${Math.round(chatDownloading.p * 100)}%` } }))) : null,
      h('li', null,
        h('div', { class: 'main' },
          h('div', null, 'Claude API key'),
          h('div', { class: 'tiny' }, key ? `Saved on this phone · …${key.slice(-4)}` : 'Smarter answers. Costs a little per message.')),
        key ? h('button', { class: 'link small danger', onclick: async () => { await setClaudeKey(''); chatInfo = null; rerender(); toast('Key removed'); } }, 'Remove')
          : h('button', { class: 'btn ghost small', onclick: () => keySheet(() => { chatInfo = null; rerender(); }) }, 'Add')),
      key ? h('li', null,
        h('div', { class: 'main' }, h('div', null, 'Claude model'), h('div', { class: 'tiny' }, b.CLAUDE_MODELS.find((x) => x.id === model)?.note || '')),
        h('div', { class: 'seg quiet', style: { width: '150px' } },
          b.CLAUDE_MODELS.map((x) => h('button', { 'aria-pressed': String(model === x.id), onclick: () => setChat({ model: x.id }) }, x.label.replace('Claude ', '').replace(/ 5\.5$/, ''))))) : null,
    ),
    key ? h('p', { class: 'tiny faint', style: { padding: '0 16px', marginTop: '7px' } }, 'With Claude, your question, today\'s weather and your closet list are sent to Anthropic to answer it. Photos are never sent.') : null,
  ));
}

async function downloadChat(b, setChat, rerender) {
  chatDownloading = { p: 0 };
  rerender();
  try {
    let last = 0;
    await b.loadLocal((p) => { chatDownloading.p = p; if (p - last > 0.01) { last = p; rerender(); } });
    await setChat({ localReady: true });
    toast('Chat model ready');
  } catch (e) {
    console.error(e);
    toast(e.message?.includes('WebGPU') ? e.message : 'Download failed. Check the connection and try again.');
  }
  chatDownloading = null;
  chatInfo = null;
  rerender();
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
