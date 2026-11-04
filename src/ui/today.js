// Today: pick how you feel, get one outfit.

import { h, sheet, toast, longDate } from './dom.js';
import { board, itemPic, displayName } from './board.js';
import * as store from '../data/store.js';
import { state } from '../data/store.js';
import { getWeather } from '../data/weather-service.js';
import { backupDue, exportBackup } from '../data/backup.js';
import { suggest, alternatives, assemble, comboKey, visibleTops } from '../core/generate.js';
import { evaluate, MODES, itemIds, piecesOf, isProblem } from '../core/rules.js';
import { describe, labelParts, toUnit } from '../core/weather.js';
import { isoDate, isWeekend, weekModes, fancyNudge } from '../core/week.js';
import { stats } from '../core/catalog.js';
import { openWeather } from './weather-sheet.js';
import * as valet from './mascot.js';
import { pickHair, DEFAULT_STYLES } from '../core/hair.js';

// Morning session: survives closing the app, resets the next day.
let S = null;
const fresh = (date) => ({ date, mode: null, skip: [], skipTops: [], custom: null, weekend: false, changing: false, hairOffset: 0 });

let W = { status: 'idle', summary: null, place: null, error: null, date: null };

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
    .then((r) => { W = { status: 'ok', summary: r.summary, day: r.day || [], place: r.place, stale: r.stale, date, error: null }; })
    .catch((e) => { W = { status: 'error', summary: null, place: null, error: e.message, date }; })
    .finally(rerender);
}

export function invalidateWeather() {
  W = { status: 'idle', summary: null, place: null, error: null, date: null };
}

function ctxFor() {
  return { mode: S.mode, weather: W.summary, prefs: state.prefs, model: state.model };
}

// Suggestions are computed off the tap: the screen updates first (mode tile
// lit, placeholder board), the engine runs a frame later, and the other
// modes are prepared quietly afterwards so switching is instant.
// Skips are applied on read, so "Another" never recomputes.
const results = new Map(); // sig → result
const lastByMode = new Map(); // mode → last result, shown while refreshing
let computing = null;
let rerenderToday = () => {};

const sigFor = (mode) => [mode, W.summary ? `${W.summary.feelsMin}|${W.summary.feelsMax}|${W.summary.wet}` : '-', state.version].join('#');

function compute(mode, today) {
  const result = suggest({
    items: state.items,
    saved: state.outfits,
    wears: state.wears.filter((w) => w.date !== today),
    mode,
    weather: W.summary,
    prefs: state.prefs,
    model: state.model,
    today,
    seed: `${today}:${mode}`,
  });
  results.set(sigFor(mode), result);
  lastByMode.set(mode, result);
  if (results.size > 12) results.delete(results.keys().next().value);
  return result;
}

// Heavy work waits for the launch intro so its animation stays smooth.
const introDone = window.__introDone || Promise.resolve();

function schedule(mode, today) {
  if (computing === sigFor(mode)) return;
  computing = sigFor(mode);
  introDone.then(() => setTimeout(() => {
    computing = null;
    if (!results.has(sigFor(mode))) compute(mode, today);
    rerenderToday();
    warmOthers(mode, today);
  }, 16));
}

function warmOthers(mode, today) {
  const others = Object.keys(MODES).filter((m) => m !== mode && !results.has(sigFor(m)));
  if (!others.length) return;
  const idle = globalThis.requestIdleCallback || ((fn) => setTimeout(fn, 250));
  idle(() => { if (!results.has(sigFor(others[0]))) compute(others[0], today); warmOthers(mode, today); });
}

// → { picks, pool, stale } or null when nothing is ready yet
function picks(today) {
  let result = results.get(sigFor(S.mode));
  let stale = false;
  if (!result) {
    schedule(S.mode, today);
    result = lastByMode.get(S.mode);
    if (!result) return null;
    stale = true;
  }
  const skip = new Set(S.skip);
  const list = result.picks.filter((p) => !skip.has(p.combo));
  // After "Another", lead with a different top: a new pair of trousers under
  // the same sweater isn't a different outfit. Same-top variations follow.
  const seenTops = new Set(S.skipTops || []);
  const fresh = list.filter((p) => !visibleTops(p.outfit).some((i) => seenTops.has(i.id)));
  const rest = list.filter((p) => !fresh.includes(p));
  return { picks: [...fresh, ...rest], pool: result.pool, stale };
}

export async function renderToday(root, rerender) {
  rerenderToday = rerender;
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
    const m = valet.current();
    root.append(h('div', { class: 'empty' },
      h('h2', null, items.length ? 'Almost there' : 'Start with your closet'),
      !items.length && m ? valet.says([m.voice.emptyCloset]) : h('p', null, items.length
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
      valet.current() ? valet.says([valet.current().voice.weekend]) : h('p', null, 'Nothing to plan unless you want to.'),
      h('button', { class: 'btn ghost', onclick: () => { S.weekend = true; saveSession(); rerender(); } }, 'Plan today'),
    ));
    return;
  }

  // ── the valet's line or two ──
  root.append(valetLine(today));

  // ── mode ──
  const nudge = fancyNudge(state.wears, today, S.mode);
  root.append(h('section', null,
    h('div', { class: 'modes', role: 'group', 'aria-label': 'Mode' },
      Object.values(MODES).map((m) => h('button', {
        class: `mode-tile mode-${m.key}`,
        'aria-pressed': String(S.mode === m.key),
        onclick: () => { if (S.mode !== m.key) { S.mode = m.key; S.custom = null; S.skip = []; S.skipTops = []; S.hairOffset = 0; saveSession(); rerender(); } },
      }, h('span', { class: 'mode-dot' }), h('b', null, m.label)))),
    nudge && h('div', { class: 'nudge' }, nudge),
  ));

  if (!S.mode) {
    if (!valet.current()) root.append(h('p', { class: 'muted', style: { marginTop: '22px' } }, 'Pick how today feels and I\'ll pick the clothes.'));
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
      [hours, W.place, ...labelParts(W.summary, state.prefs.unit).map((p) => p.text), W.stale ? 'last known' : null]
        .filter(Boolean).map((t, i, all) => h('span', { class: labelParts(W.summary, state.prefs.unit).some((p) => p.hot && p.text === t) ? 'hot' : null }, t, i < all.length - 1 ? ' · ' : '')));
  } else if (W.status === 'error') {
    weather = h('div', { class: 'weather-error' }, h('span', { class: 'warn' }, W.error), ' · ',
      h('button', { class: 'link small', onclick: () => fetchWeather(today, rerender, true) }, 'Try again'), ' · ',
      h('a', { class: 'link small', href: '#settings' }, 'Set a city'));
  } else {
    weather = h('div', { class: 'wx-wrap', 'aria-busy': 'true' },
      h('div', { class: 'wx-skel' }),
      h('div', { class: 'care' }, h('span', null, 'Checking the weather')));
  }

  const week = weekModes(state.wears, today);
  return h('header', { class: 'today-head' },
    h('h1', null, longDate(today)),
    W.status === 'ok' && W.summary ? h('div', {
      class: 'wx-wrap tappable',
      role: 'button',
      tabindex: '0',
      'aria-label': 'Open the full forecast',
      onclick: showWeather,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showWeather(); } },
    }, h('span', { class: 'wx-more', 'aria-hidden': 'true' }, '›'), wxChart(W.summary, state.prefs.unit), weather) : weather,
    isWeekend(today) ? null : h('div', { class: 'week', 'aria-label': 'This week' },
      week.map((d, i) => h('div', {
        class: [d.mode, d.date === today ? 'today' : ''].filter(Boolean).join(' '),
        title: d.mode ? MODES[d.mode].label : '',
      }, h('b', null, ['M', 'T', 'W', 'T', 'F'][i]), h('i', { class: 'dot' })))),
  );
}


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
  svg.append(el('path', { d: line, class: 'wx-line', pathLength: '1' }));
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

function showWeather() {
  if (!W.day?.length) return;
  openWeather({ day: W.day, summary: W.summary, place: W.place, unit: state.prefs.unit, from: state.prefs.from, to: state.prefs.to });
}

const hourLabel = (x) => (x === 12 ? '12pm' : x > 12 ? `${x - 12}pm` : `${x}am`);

function backupBanner() {
  const never = !state.prefs.lastBackupAt;
  return h('div', { class: 'banner' },
    never ? 'No backup yet. Your closet only lives on this phone.' : 'Last backup was over a month ago.',
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
  const ready = picks(today);
  if (!ready) return { loading: true };
  const { picks: list, pool } = ready;
  return list.length ? { outfit: list[0].outfit, notes: list[0].notes, pool, savedId: list[0].savedId } : { outfit: null, pool };
}

function pickView(today, rerender, worn) {
  const wrap = h('section');
  const cur = currentOutfit(today);

  if (cur.loading) {
    // Same shape as a real outfit, so the swap-in doesn't jump.
    wrap.append(h('div', { class: 'board loading', 'aria-busy': 'true', 'aria-label': 'Picking an outfit' },
      ['big', 'big', 'big', 'big', 'shoes', 'acc'].map((size, i) => h('div', { key: `ph${i}`, class: `tile ${size} placeholder` }))));
    return wrap;
  }

  if (!cur.outfit) {
    const inLaundry = state.items.filter((i) => i.inLaundry).length;
    wrap.append(h('div', { class: 'empty' },
      h('h2', null, S.skip.length ? 'That\'s everything' : 'Nothing works today'),
      h('p', null, S.skip.length
        ? 'You\'ve skipped every look I can make for this. Start over, or try another mode.'
        : inLaundry
          ? `${inLaundry} piece${inLaundry === 1 ? ' is' : 's are'} in the laundry, which leaves nothing that suits ${MODES[S.mode].label.toLowerCase()} and this weather.`
          : `Nothing in the closet suits ${MODES[S.mode].label.toLowerCase()} in this weather yet.`),
      S.skip.length ? h('button', { class: 'btn ghost', onclick: () => { S.skip = []; S.skipTops = []; saveSession(); rerender(); } }, 'Start over') : null,
    ));
    return wrap;
  }

  const outfit = cur.outfit;
  const ev = evaluate(outfit, ctxFor());

  // When even the best option has real problems, say so, and say what
  // would fix it, instead of presenting it as a good outfit.
  const problems = ev.notes.filter(isProblem).length;
  const gaps = cur.custom ? [] : closetGaps(state.items, W.summary, S.mode);
  if (!cur.custom && (problems >= 2 || (gaps.length && (problems || !outfit.shoes)))) {
    wrap.append(h('div', { class: 'banner struggle' },
      problems >= 2 && !valet.current() ? h('b', null, 'Best I can do with your closet right now.') : null,
      gaps.length ? h('div', { class: problems >= 2 ? 'muted' : '' }, `Adding ${listJoin(gaps)} would give better picks.`) : null));
  }
  const notes = cur.custom ? ev.notes : cur.notes;
  const flagged = new Set();
  if (ev.veto || ev.notes.some(isProblem)) {
    // Mark the pieces named in a warning, where we can tell.
    for (const i of piecesOf(outfit)) {
      const n = displayName(i).toLowerCase();
      if (ev.notes.some((x) => isProblem(x) && x.text.includes(n))) flagged.add(i.id);
    }
  }

  wrap.append(board(outfit, {
    flagged,
    onTap: (slot, item) => swapSheet(outfit, slot, item, rerender),
    onAdd: () => addSheet(outfit, rerender),
  }));

  const hair = todaysHair(today);
  if (hair) {
    wrap.append(h('ul', { class: 'list hair-row' }, h('li', null,
      h('div', { class: 'main' }, h('div', { class: 'tiny' }, 'Hair'), h('div', null, hair.name)),
      h('button', { class: 'link', onclick: () => { S.hairOffset = (S.hairOffset || 0) + 1; saveSession(); rerender(); } }, 'Change'))));
  }

  const good = notes.filter((n) => n.tone === 'good').slice(0, 3);
  const tips = notes.filter((n) => n.tone === 'tip');
  const bad = notes.filter(isProblem);
  wrap.append(h('ul', { class: 'why' },
    good.map((n) => h('li', null, n.text)),
    tips.map((n) => h('li', { class: 'tip' }, n.text)),
    bad.map((n) => h('li', { class: 'warn' }, n.text))));

  if (cur.pool != null && cur.pool < 5 && !cur.custom) {
    const out = state.items.filter((i) => i.inLaundry).length;
    wrap.append(h('p', { class: 'tiny faint' },
      `Only ${cur.pool} ${MODES[S.mode].label.toLowerCase()} look${cur.pool === 1 ? '' : 's'} possible${out ? ` (${out} in laundry)` : ''}.`));
  }

  const ids = itemIds(outfit);
  const saved = store.findSaved(ids);
  wrap.append(h('div', { class: 'actions' },
    h('button', { class: 'btn', onclick: async () => {
      const w = await store.logWear(ids, S.mode, { date: today, weather: W.summary, hair: todaysHair(today)?.id });
      S.changing = false;
      S.custom = null;
      saveSession();
      toast('Logged as worn', { label: 'Undo', run: () => store.undoWear(w.id) });
    } }, 'Wear this'),
    h('button', { class: 'btn ghost', onclick: async () => {
      if (!cur.custom) await store.learn(outfit, S.mode, 'skipped');
      S.skip.push(comboKey(outfit));
      S.skipTops = [...new Set([...(S.skipTops || []), ...visibleTops(outfit).map((i) => i.id)])];
      S.custom = null;
      saveSession();
      rerender();
    } }, 'Another'),
    h('button', { class: 'btn ghost', 'aria-pressed': String(!!saved), onclick: async () => {
      if (saved) { await store.deleteOutfit(saved.id); toast('Removed from saved'); }
      else {
        const r = await store.saveOutfit(ids, { mode: S.mode });
        toast(r.duplicate ? 'Already in your outfits' : 'Saved to outfits');
      }
    } }, saved ? 'Saved' : 'Save'),
  ));
  // One way back, never two.
  if (worn) {
    wrap.append(h('button', { class: 'link small', style: { marginTop: '8px' }, onclick: () => { S.changing = false; S.custom = null; saveSession(); rerender(); } }, 'Keep what I logged'));
  } else if (S.custom) {
    wrap.append(h('button', { class: 'link small', style: { marginTop: '8px' }, onclick: () => { S.custom = null; saveSession(); rerender(); } }, 'Back to my pick'));
  }
  return wrap;
}

// What's missing from the closet that would most improve today's picks.
function closetGaps(items, w, mode) {
  const clean = items.filter((i) => !i.inLaundry && !i.blocked).map((i) => ({ i, s: stats(i) }));
  const has = (fn) => clean.some(({ s }) => fn(s));
  const gaps = [];
  if (!has((s) => s.cat === 'shoes')) gaps.push('a pair of shoes');
  if (w && !has((s) => s.cat === 'outer') && (w.feelsMin < 12 || w.feelsMax - w.feelsMin >= 6 || w.wet)) gaps.push(w.wet ? 'a rain jacket' : 'a light jacket');
  if (has((s) => s.layer === 'mid') && !has((s) => s.layer === 'base' && !s.collar)) gaps.push('a plain T-shirt or undershirt');
  if (mode === 'fancy' && !has((s) => s.layer === 'base' && s.collar && !s.polo && s.formality >= 3.5)) gaps.push('a button-down shirt');
  if (mode === 'fancy' && !has((s) => s.cat === 'bottom' && s.formality >= 3)) gaps.push('chinos or dress trousers');
  if (!has((s) => s.cat === 'bottom' || s.cat === 'onepiece')) gaps.push('some trousers');
  return gaps.slice(0, 3);
}

const listJoin = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);

const hairName = (id) => (state.prefs.hair?.styles || DEFAULT_STYLES).find((s) => s.id === id)?.name || 'Hairstyle';

// What the valet says above the mood tiles: a greeting with the weather,
// then whatever fits the moment (ask, explain the pick, or sign off).
function valetLine(today) {
  const m = valet.current();
  if (!m) return null;
  const v = m.voice;
  const first = valet.greeting(v, W.summary);
  if (!S.mode) return valet.says([first, v.ask]);
  const worn = store.wearsOn(today).at(-1);
  if (worn && !S.changing) return valet.says([first, v.worn]);
  const cur = currentOutfit(today);
  if (cur.loading || !cur.outfit) return valet.says([first]);
  const ev = evaluate(cur.outfit, ctxFor());
  if (!cur.custom && ev.notes.filter(isProblem).length >= 2) return valet.says([first, v.struggle]);
  return valet.says([first, valet.reasonLine(v, cur.custom ? ev.notes : (cur.notes || ev.notes), S.mode)]);
}

// Today's hairstyle, when hair is switched on in Settings.
function todaysHair(today) {
  const hair = state.prefs.hair;
  if (!hair?.on) return null;
  return pickHair(hair.styles || DEFAULT_STYLES, { mode: S.mode, weather: W.summary, today, wears: state.wears, offset: S.hairOffset || 0 });
}

function wornView(worn, rerender) {
  const pieces = worn.itemIds.map(store.itemById).filter(Boolean);
  return h('section', null,
    h('div', { class: 'worn-tag' }, 'Wearing today'),
    board(assemble(pieces)),
    worn.hair && state.prefs.hair?.on ? h('ul', { class: 'list hair-row' }, h('li', null,
      h('div', { class: 'main' }, h('div', { class: 'tiny' }, 'Hair'), h('div', null, hairName(worn.hair))))) : null,
    h('div', { class: 'row', style: { marginTop: '16px' } },
      h('button', { class: 'btn ghost', onclick: () => { S.changing = true; saveSession(); rerender(); } }, 'Change'),
      h('button', { class: 'link', onclick: () => store.undoWear(worn.id) }, 'Undo'),
    ),
  );
}

// ── swapping ───────────────────────────────────────────────

function altRow(alt, onPick) {
  const vetoed = alt.ev.veto;
  const warn = alt.ev.notes.find(isProblem);
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

// One "Add" for both layers and accessories.
function addSheet(outfit, rerender) {
  const ctx = ctxFor();
  sheet('Add', (close) => {
    const layers = [];
    if (!outfit.outer) layers.push(...alternatives(outfit, 'outer', state.items, ctx));
    if (!outfit.mid && (outfit.base || outfit.onepiece)) layers.push(...alternatives(outfit, 'mid', state.items, ctx));
    layers.sort((a, b) => b.score - a.score);
    const have = new Set((outfit.accessories || []).map((a) => a.id));
    const accs = alternatives(outfit, 'accessory', state.items, ctx).filter((a) => !have.has(a.item.id));
    const pick = (a) => altRow(a, () => { close(); applySwap(outfit, a.outfit, rerender); });
    if (!layers.length && !accs.length) return h('p', { class: 'muted' }, 'Nothing clean to add.');
    return h('div', null,
      layers.length ? [h('div', { class: 'label', style: { margin: '4px 0 2px' } }, 'Layers'), layers.map(pick)] : null,
      accs.length ? [h('div', { class: 'label', style: { margin: '16px 0 2px' } }, 'Accessories'), accs.map(pick)] : null);
  });
}
