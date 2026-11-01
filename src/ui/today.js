// Today: pick how you feel, get one outfit.

import { h, sheet, toast, longDate } from './dom.js';
import { board, itemPic, displayName } from './board.js';
import * as store from '../data/store.js';
import { state } from '../data/store.js';
import { getWeather } from '../data/weather-service.js';
import { backupDue, exportBackup } from '../data/backup.js';
import { suggest, alternatives, assemble, comboKey } from '../core/generate.js';
import { evaluate, MODES, itemIds, piecesOf } from '../core/rules.js';
import { describe, labelParts, toUnit } from '../core/weather.js';
import { isoDate, isWeekend, weekModes, fancyNudge } from '../core/week.js';
import { stats } from '../core/catalog.js';

// Morning session: survives closing the app, resets the next day.
let S = null;
const fresh = (date) => ({ date, mode: null, skip: [], custom: null, weekend: false, changing: false });

let W = { status: 'idle', summary: null, place: null, error: null, date: null };
let cache = { sig: null, result: null };

async function loadSession(date) {
  if (S?.date === date) return;
  const saved = await store.getKV('session');
  S = saved?.date === date ? { ...fresh(date), ...saved } : fresh(date);
}
const saveSession = () => store.setKV('session', S);

function fetchWeather(date, rerender, force = false) {
  if (!force && (W.status === 'loading' || (W.date === date && W.status === 'ok'))) return;
  W = { ...W, status: 'loading', date };
  getWeather(state.prefs, date, { force })
    .then((r) => { W = { status: 'ok', summary: r.summary, place: r.place, stale: r.stale, date, error: null }; })
    .catch((e) => { W = { status: 'error', summary: null, place: null, error: e.message, date }; })
    .finally(rerender);
}

export function invalidateWeather() {
  W = { status: 'idle', summary: null, place: null, error: null, date: null };
}

function ctxFor() {
  return { mode: S.mode, weather: W.summary, prefs: state.prefs, model: state.model };
}

function picks(today) {
  const sig = [S.mode, S.skip.join(','), W.summary ? `${W.summary.feelsMin}|${W.summary.feelsMax}|${W.summary.wet}` : '-', state.version].join('#');
  if (cache.sig !== sig) {
    cache = {
      sig,
      result: suggest({
        items: state.items,
        saved: state.outfits,
        wears: state.wears.filter((w) => w.date !== today),
        mode: S.mode,
        weather: W.summary,
        prefs: state.prefs,
        model: state.model,
        today,
        skip: S.skip,
        seed: `${today}:${S.mode}`,
      }),
    };
  }
  return cache.result;
}

export async function renderToday(root, rerender) {
  const today = isoDate();
  await loadSession(today);
  fetchWeather(today, rerender);
  // The chosen mode colours the screen (see [data-mode] in the CSS).
  document.documentElement.dataset.mode = S.mode || '';

  const items = state.items;
  const tops = items.some((i) => stats(i).cat === 'top' || stats(i).cat === 'onepiece');
  const bottoms = items.some((i) => stats(i).cat === 'bottom' || stats(i).cat === 'onepiece');

  root.append(header(today, rerender));

  if (!tops || !bottoms) {
    root.append(h('div', { class: 'empty' },
      h('h2', null, items.length ? 'Almost there' : 'Start with your closet'),
      h('p', null, items.length
        ? `Add at least one ${tops ? 'bottom' : 'top'} and I can start putting outfits together.`
        : 'Photograph your clothes one at a time, laid flat on the floor. Around 30 pieces is plenty.'),
      h('a', { class: 'btn', href: '#add' }, 'Add clothes'),
    ));
    return;
  }

  if (backupDue(state.prefs, items.length)) root.append(backupBanner());

  if (isWeekend(today) && !S.weekend) {
    root.append(h('div', { class: 'empty' },
      h('h2', null, 'It\'s the weekend'),
      h('p', null, 'Nothing to plan unless you want to.'),
      h('button', { class: 'btn ghost', onclick: () => { S.weekend = true; saveSession(); rerender(); } }, 'Plan today'),
    ));
    return;
  }

  // ── mode ──
  const nudge = fancyNudge(state.wears, today, S.mode);
  root.append(h('section', null,
    h('div', { class: 'modes', role: 'group', 'aria-label': 'Mode' },
      Object.values(MODES).map((m) => h('button', {
        class: `mode-tile mode-${m.key}`,
        'aria-pressed': String(S.mode === m.key),
        onclick: () => { if (S.mode !== m.key) { S.mode = m.key; S.custom = null; S.skip = []; saveSession(); rerender(); } },
      }, h('span', { class: 'mode-dot' }), h('b', null, m.label), h('small', null, MODE_HINT[m.key])))),
    nudge && h('div', { class: 'nudge' }, nudge),
  ));

  if (!S.mode) {
    root.append(h('p', { class: 'muted', style: { marginTop: '22px' } }, 'Pick how today feels and I\'ll pick the clothes.'));
    return;
  }

  const worn = store.wearsOn(today).at(-1);
  if (worn && !S.changing) {
    root.append(wornView(worn, rerender));
    return;
  }

  root.append(pickView(today, rerender, worn));
}

function header(today, rerender) {
  let weather;
  if (W.status === 'ok' && W.summary) {
    const hours = `${hourLabel(state.prefs.from)}–${hourLabel(state.prefs.to)}`;
    weather = h('div', { class: 'care', 'aria-label': `Weather ${hours}: ${describe(W.summary, state.prefs.unit)}` },
      h('span', null, hours),
      labelParts(W.summary, state.prefs.unit).map((p) => h('span', { class: p.hot ? 'hot' : null }, p.text)),
      W.stale ? h('span', null, 'last known') : null);
  } else if (W.status === 'error') {
    weather = h('div', { class: 'weather-error' }, h('span', { class: 'warn' }, W.error), ' · ',
      h('button', { class: 'link small', onclick: () => fetchWeather(today, rerender, true) }, 'Try again'), ' · ',
      h('a', { class: 'link small', href: '#settings' }, 'Set a city'));
  } else {
    weather = h('div', { class: 'care' }, h('span', null, 'Checking the weather'));
  }

  const week = weekModes(state.wears, today);
  return h('header', { class: 'today-head' },
    h('div', { class: 'eyebrow' }, W.place ? `Today · ${W.place}` : 'Today'),
    h('h1', null, longDate(today)),
    W.status === 'ok' && W.summary ? h('div', { class: 'wx-wrap' }, wxChart(W.summary, state.prefs.unit), weather) : weather,
    isWeekend(today) ? null : h('div', { class: 'week', 'aria-label': 'This week' },
      week.map((d, i) => h('div', {
        class: [d.mode, d.date === today ? 'today' : ''].filter(Boolean).join(' '),
      }, h('b', null, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i]), h('small', null, d.mode ? MODES[d.mode].label : '—')))),
  );
}

const MODE_HINT = { fancy: 'Sharp, put together', casual: 'Easy, still right', comfy: 'Soft and relaxed' };

// Feels-like temperature across your hours, rainy hours hatched.
function wxChart(w, unit) {
  const pts = w.hours || [];
  if (pts.length < 2) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const W = 320, H = 96, L = 6, R = 6, T = 22, B = 22;
  const vals = pts.map((p) => toUnit(p.feels, unit));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 4) { const m = (hi + lo) / 2; lo = m - 2; hi = m + 2; }
  const x = (i) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'wx', role: 'img', 'aria-label': `Feels like ${vals[0]}° at ${hourLabel(pts[0].h)}, ${vals[vals.length - 1]}° at ${hourLabel(pts[pts.length - 1].h)}` });
  const defs = el('defs', {});
  const pat = el('pattern', { id: 'wxrain', width: '6', height: '6', patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  pat.append(el('rect', { width: '2', height: '6', class: 'wx-hatch' }));
  const grad = el('linearGradient', { id: 'wxfill', x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.append(el('stop', { offset: '0', class: 'wx-fill-top' }), el('stop', { offset: '1', class: 'wx-fill-bottom' }));
  defs.append(pat, grad);
  svg.append(defs);
  const step = (W - L - R) / (pts.length - 1);
  pts.forEach((p, i) => {
    if (!p.wet) return;
    const x0 = Math.max(0, x(i) - step / 2), x1 = Math.min(W, x(i) + step / 2);
    svg.append(el('rect', { x: x0, y: T - 6, width: x1 - x0, height: H - B - T + 6, fill: 'url(#wxrain)' }));
  });
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  svg.append(el('path', { d: `${line} L${x(pts.length - 1)} ${H - B} L${x(0)} ${H - B} Z`, fill: 'url(#wxfill)' }));
  svg.append(el('path', { d: line, class: 'wx-line' }));
  svg.append(el('line', { x1: 0, x2: W, y1: H - B, y2: H - B, class: 'wx-base' }));
  const label = (txt, px, py, anchor, cls = 'wx-t') => { const t = el('text', { x: px, y: py, 'text-anchor': anchor, class: cls }); t.textContent = txt; svg.append(t); };
  const first = 0, last = pts.length - 1;
  const peak = vals.indexOf(Math.max(...vals));
  for (const i of new Set([first, peak, last])) {
    svg.append(el('circle', { cx: x(i), cy: y(vals[i]), r: 3.2, class: 'wx-dot' }));
    label(`${vals[i]}°`, x(i), y(vals[i]) - 8, i === first ? 'start' : i === last ? 'end' : 'middle', 'wx-v');
  }
  const mid = Math.round(last / 2);
  [[first, 'start'], [mid, 'middle'], [last, 'end']].forEach(([i, a]) => label(hourLabel(pts[i].h), x(i), H - 6, a));
  return svg;
}

const hourLabel = (x) => (x === 12 ? '12pm' : x > 12 ? `${x - 12}pm` : `${x}am`);

function backupBanner() {
  const never = !state.prefs.lastBackupAt;
  return h('div', { class: 'banner' },
    never ? 'Your closet only lives on this phone. Save a backup to iCloud Drive in case anything happens to it.'
      : 'It\'s been a month since your last backup.',
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: async () => { if (await exportBackup()) toast('Backup saved'); } }, 'Save backup'),
      h('button', { class: 'link small', onclick: () => store.updatePrefs({ backupSnoozedAt: Date.now() }) }, 'Later'),
    ));
}

// ── the suggestion ─────────────────────────────────────────

function currentOutfit(today) {
  if (S.custom) {
    const pieces = S.custom.map(store.itemById).filter((i) => i && !i.inLaundry);
    if (pieces.length) return { outfit: assemble(pieces), custom: true };
    S.custom = null;
  }
  const { picks: list, pool } = picks(today);
  return list.length ? { outfit: list[0].outfit, notes: list[0].notes, pool, savedId: list[0].savedId } : { outfit: null, pool };
}

function pickView(today, rerender, worn) {
  const wrap = h('section');
  const cur = currentOutfit(today);

  if (!cur.outfit) {
    const inLaundry = state.items.filter((i) => i.inLaundry).length;
    wrap.append(h('div', { class: 'empty' },
      h('h2', null, S.skip.length ? 'That\'s everything' : 'Nothing works today'),
      h('p', null, S.skip.length
        ? 'You\'ve skipped every look I can make for this. Start over, or try another mode.'
        : inLaundry
          ? `${inLaundry} piece${inLaundry === 1 ? ' is' : 's are'} in the laundry, which leaves nothing that suits ${MODES[S.mode].label.toLowerCase()} and this weather.`
          : `Nothing in the closet suits ${MODES[S.mode].label.toLowerCase()} in this weather yet.`),
      S.skip.length ? h('button', { class: 'btn ghost', onclick: () => { S.skip = []; saveSession(); rerender(); } }, 'Start over') : null,
    ));
    return wrap;
  }

  const outfit = cur.outfit;
  const ev = evaluate(outfit, ctxFor());
  const notes = cur.custom ? ev.notes : cur.notes;
  const flagged = new Set();
  if (ev.veto || ev.notes.some((n) => n.tone !== 'good')) {
    // Mark the pieces named in a warning, where we can tell.
    for (const i of piecesOf(outfit)) {
      const n = displayName(i).toLowerCase();
      if (ev.notes.some((x) => x.tone !== 'good' && x.text.includes(n))) flagged.add(i.id);
    }
  }

  if (worn) wrap.append(h('div', { class: 'faint small', style: { marginBottom: '10px' } }, 'Picking something else. Wearing it replaces this morning\'s log.'));

  wrap.append(board(outfit, {
    flagged,
    onTap: (slot, item) => swapSheet(outfit, slot, item, rerender),
    onAdd: (what) => addSheet(outfit, what, rerender),
  }));

  const good = notes.filter((n) => n.tone === 'good').slice(0, 3);
  const bad = notes.filter((n) => n.tone !== 'good');
  wrap.append(h('ul', { class: 'why' },
    good.map((n) => h('li', null, n.text)),
    bad.map((n) => h('li', { class: 'warn' }, n.text))));

  if (cur.pool != null && cur.pool < 5 && !cur.custom) {
    const out = state.items.filter((i) => i.inLaundry).length;
    wrap.append(h('p', { class: 'tiny faint' },
      `Only ${cur.pool} ${MODES[S.mode].label.toLowerCase()} look${cur.pool === 1 ? '' : 's'} possible today${out ? `, with ${out} piece${out === 1 ? '' : 's'} in the laundry` : ''}.`));
  }

  const ids = itemIds(outfit);
  const saved = store.findSaved(ids);
  wrap.append(h('div', { class: 'actions' },
    h('button', { class: 'btn', onclick: async () => {
      const w = await store.logWear(ids, S.mode, { date: today, weather: W.summary });
      S.changing = false;
      S.custom = null;
      saveSession();
      toast('Logged as worn', { label: 'Undo', run: () => store.undoWear(w.id) });
    } }, 'Wear this'),
    h('button', { class: 'btn ghost', onclick: async () => {
      if (!cur.custom) await store.learn(outfit, S.mode, 'skipped');
      S.skip.push(comboKey(outfit));
      S.custom = null;
      saveSession();
      rerender();
    } }, 'Another'),
    h('button', { class: 'btn ghost', 'aria-pressed': String(!!saved), onclick: async () => {
      if (saved) { await store.deleteOutfit(saved.id); toast('Removed from saved'); }
      else { await store.saveOutfit(ids, { mode: S.mode }); toast('Saved to outfits'); }
    } }, saved ? 'Saved' : 'Save'),
  ));
  if (S.custom) {
    wrap.append(h('button', { class: 'link small', style: { marginTop: '8px' }, onclick: () => { S.custom = null; saveSession(); rerender(); } }, 'Back to my pick'));
  }
  if (worn) {
    wrap.append(h('button', { class: 'link small', style: { marginTop: '8px', display: 'block' }, onclick: () => { S.changing = false; saveSession(); rerender(); } }, 'Keep what I logged'));
  }
  return wrap;
}

function wornView(worn, rerender) {
  const pieces = worn.itemIds.map(store.itemById).filter(Boolean);
  return h('section', null,
    h('div', { class: 'worn-tag' }, 'Wearing today'),
    board(assemble(pieces)),
    h('div', { class: 'row', style: { marginTop: '16px' } },
      h('button', { class: 'btn ghost', onclick: () => { S.changing = true; saveSession(); rerender(); } }, 'Change'),
      h('button', { class: 'link', onclick: () => store.undoWear(worn.id) }, 'Undo'),
    ),
    h('p', { class: 'tiny faint', style: { marginTop: '18px' } },
      'Wear counts went up by one for each piece. Put anything that needs a wash in the laundry from the Laundry tab.'),
  );
}

// ── swapping ───────────────────────────────────────────────

function altRow(alt, onPick) {
  const vetoed = alt.ev.veto;
  const warn = alt.ev.notes.find((n) => n.tone !== 'good');
  const note = vetoed || warn?.text || alt.ev.notes.find((n) => n.tone === 'good')?.text || '';
  return h('button', { class: `alt${vetoed ? ' vetoed' : ''}`, onclick: onPick },
    h('div', { class: 'list' }, h('div', { class: 'thumb' }, itemPic(alt.item))),
    h('div', { class: 'grow' },
      h('div', null, displayName(alt.item)),
      h('div', { class: `why-short${vetoed || warn ? ' warn' : ''}` }, note)));
}

function applySwap(before, after, rerender) {
  store.learn(before, S.mode, 'swappedOut');
  store.learn(after, S.mode, 'swappedIn');
  S.custom = itemIds(after);
  saveSession();
  rerender();
}

function swapSheet(outfit, slot, item, rerender) {
  const ctx = ctxFor();
  const removable = slot === 'outer' || slot === 'accessory' || (slot === 'mid' && outfit.base) || (slot === 'base' && outfit.mid && stats(outfit.mid).alone);
  const label = slot === 'accessory' ? displayName(item).toLowerCase() : displayName(item).toLowerCase();
  sheet(`Swap the ${label}`, (close) => {
    const alts = slot === 'accessory'
      ? alternatives({ ...outfit, accessories: outfit.accessories.filter((a) => a.id !== item.id) }, 'accessory', state.items, ctx)
        .filter((a) => stats(a.item).kind === stats(item).kind || stats(item).kind === 'jewelry')
      : alternatives(outfit, slot, state.items, ctx);
    const rows = alts.filter((a) => a.item.id !== item.id);
    return h('div', null,
      removable ? h('button', { class: 'alt', onclick: () => {
        close();
        const next = { ...outfit, accessories: [...(outfit.accessories || [])] };
        if (slot === 'accessory') next.accessories = next.accessories.filter((a) => a.id !== item.id);
        else delete next[slot];
        applySwap(outfit, next, rerender);
      } }, h('div', { class: 'grow' }, h('div', null, 'Take it off'), h('div', { class: 'why-short' }, 'Go without'))) : null,
      rows.length ? rows.map((a) => altRow(a, () => { close(); applySwap(outfit, a.outfit, rerender); }))
        : h('p', { class: 'muted' }, 'Nothing else clean in this category.'),
    );
  });
}

function addSheet(outfit, what, rerender) {
  const ctx = ctxFor();
  sheet(what === 'layer' ? 'Add a layer' : 'Add an accessory', (close) => {
    let rows = [];
    if (what === 'layer') {
      if (!outfit.outer) rows.push(...alternatives(outfit, 'outer', state.items, ctx));
      if (!outfit.mid && (outfit.base || outfit.onepiece)) rows.push(...alternatives(outfit, 'mid', state.items, ctx));
      rows.sort((a, b) => b.score - a.score);
    } else {
      const have = new Set((outfit.accessories || []).map((a) => a.id));
      rows = alternatives(outfit, 'accessory', state.items, ctx).filter((a) => !have.has(a.item.id));
    }
    return h('div', null, rows.length
      ? rows.map((a) => altRow(a, () => { close(); applySwap(outfit, a.outfit, rerender); }))
      : h('p', { class: 'muted' }, what === 'layer' ? 'No clean layers to add.' : 'No accessories in the closet yet.'));
  });
}
