import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closet, mild, hot, cold, rainy, byType } from './fixtures.js';
import { defaultsFor, stats, TYPES } from '../src/core/catalog.js';
import { nearestColor, harmony } from '../src/core/color.js';
import { evaluate, formalityOf } from '../src/core/rules.js';
import { suggest, comboKey, alternatives, assemble } from '../src/core/generate.js';
import { emptyModel, record, predict, features } from '../src/core/taste.js';
import { summarize, requiredWarmth, describe } from '../src/core/weather.js';
import { fancyNudge, weekday } from '../src/core/week.js';

// ── catalog ─────────────────────────────────────────────────

test('catalog defaults are in range and fabric nudges them', () => {
  for (const t of TYPES) {
    const d = defaultsFor(t.key);
    assert.ok(d.formality >= 0 && d.formality <= 5, t.key);
    assert.ok(d.warmth >= 0 && d.warmth <= 5, t.key);
  }
  assert.ok(defaultsFor('sweater', 'wool').warmth > defaultsFor('sweater', 'cotton').warmth);
  assert.equal(defaultsFor('sneakers', 'suede').rain, 'bad');
});

test('user overrides beat catalog defaults', () => {
  assert.equal(stats({ type: 'jeans', formality: 3.2 }).formality, 3.2);
  assert.equal(stats({ type: 'jeans' }).formality, 2);
});

// ── colour ──────────────────────────────────────────────────

test('nearest colour names', () => {
  assert.equal(nearestColor([20, 20, 22]), 'black');
  assert.equal(nearestColor([245, 245, 243]), 'white');
  assert.equal(nearestColor([30, 42, 70]), 'navy');
  assert.equal(nearestColor([200, 40, 40]), 'red');
  assert.equal(nearestColor([140, 140, 142]), 'grey');
});

test('neutrals beat clashing colours', () => {
  const p = (c, cat = 'top') => ({ cat, colors: [{ name: c, share: 1 }] });
  const neutral = harmony([p('navy'), p('khaki', 'bottom'), p('white', 'shoes')]);
  const clash = harmony([p('red'), p('green', 'bottom'), p('purple', 'shoes')]);
  const accent = harmony([p('rust'), p('denim', 'bottom')]);
  assert.ok(neutral.score > clash.score);
  assert.ok(accent.score > clash.score);
  assert.ok(clash.notes.some((n) => n.tone === 'warn'));
});

// ── rules ───────────────────────────────────────────────────

test('the classic mistakes are vetoed', () => {
  const c = closet();
  const shortsSweater = { base: byType(c, 'tshirt', 'white'), mid: byType(c, 'sweater', 'navy'), bottom: byType(c, 'shorts'), shoes: byType(c, 'leather-sneakers') };
  assert.match(evaluate(shortsSweater, { mode: 'casual', weather: mild }).veto, /shorts/);

  const suitJoggers = { base: byType(c, 'tshirt', 'white'), outer: byType(c, 'blazer'), bottom: byType(c, 'joggers'), shoes: byType(c, 'dress-shoes') };
  assert.ok(evaluate(suitJoggers, { mode: 'casual' }).veto);

  const coldShorts = { base: byType(c, 'tshirt', 'white'), bottom: byType(c, 'shorts'), shoes: byType(c, 'leather-sneakers') };
  assert.match(evaluate(coldShorts, { mode: 'casual', weather: mild }).veto, /cold for shorts/);
  assert.equal(evaluate(coldShorts, { mode: 'casual', weather: hot }).veto, null);

  const cardiganAlone = { mid: byType(c, 'cardigan'), bottom: byType(c, 'jeans', 'denim') };
  assert.match(evaluate(cardiganAlone, { mode: 'casual' }).veto, /needs something under/);
});

test('never-pair rules veto', () => {
  const c = closet();
  const o = { base: byType(c, 'tshirt', 'white'), bottom: byType(c, 'jeans', 'denim'), shoes: byType(c, 'leather-sneakers') };
  const prefs = { neverPairs: [[o.base.id, o.bottom.id]] };
  assert.ok(evaluate(o, { mode: 'casual', prefs }).veto);
});

test('fancy outfits read dressier than casual ones', () => {
  const c = closet();
  const fancy = { base: byType(c, 'dress-shirt'), outer: byType(c, 'blazer'), bottom: byType(c, 'trousers'), shoes: byType(c, 'dress-shoes') };
  const casual = { base: byType(c, 'tshirt', 'grey'), bottom: byType(c, 'jeans', 'denim'), shoes: byType(c, 'leather-sneakers') };
  assert.ok(formalityOf(fancy) > 4);
  assert.ok(formalityOf(casual) < 2.5);
  assert.ok(evaluate(fancy, { mode: 'fancy', weather: mild }).score > evaluate(casual, { mode: 'fancy', weather: mild }).score);
  assert.ok(evaluate(casual, { mode: 'casual', weather: mild }).score > evaluate(fancy, { mode: 'casual', weather: mild }).score);
});

test('rain punishes suede and rewards a rain layer', () => {
  const c = closet();
  const base = { base: byType(c, 'oxford', 'white'), bottom: byType(c, 'chinos', 'navy') };
  const suede = evaluate({ ...base, shoes: byType(c, 'chelsea'), outer: byType(c, 'rain-jacket') }, { mode: 'casual', weather: rainy });
  const boots = evaluate({ ...base, shoes: byType(c, 'boots'), outer: byType(c, 'rain-jacket') }, { mode: 'casual', weather: rainy });
  assert.ok(boots.score > suede.score);
  const noShell = evaluate({ ...base, shoes: byType(c, 'boots') }, { mode: 'casual', weather: rainy });
  assert.ok(boots.score > noShell.score);
});

test('warmth tracks the weather', () => {
  const c = closet();
  const tee = { base: byType(c, 'tshirt', 'white'), bottom: byType(c, 'jeans', 'denim'), shoes: byType(c, 'leather-sneakers') };
  const winter = { ...tee, mid: byType(c, 'sweater', 'navy'), outer: byType(c, 'puffer'), shoes: byType(c, 'boots') };
  assert.ok(evaluate(tee, { mode: 'casual', weather: cold }).veto || evaluate(tee, { mode: 'casual', weather: cold }).score < evaluate(winter, { mode: 'casual', weather: cold }).score);
  assert.ok(evaluate(winter, { mode: 'casual', weather: hot }).veto, 'puffer and sweater in the heat');
  assert.ok(requiredWarmth(-10) > requiredWarmth(20));
});

// ── generation ──────────────────────────────────────────────

const run = (o) => suggest({ items: closet(), saved: [], wears: [], mode: 'casual', weather: mild, prefs: { neverPairs: [] }, model: emptyModel(), today: '2026-11-03', ...o });

test('suggestions are valid, complete and skip laundry', () => {
  const items = closet();
  byType(items, 'jeans', 'denim').inLaundry = true;
  const { picks, pool } = run({ items });
  assert.ok(picks.length > 5);
  assert.ok(pool > 5);
  for (const p of picks.slice(0, 10)) {
    assert.ok(p.outfit.bottom || p.outfit.onepiece);
    assert.ok(p.outfit.base || p.outfit.mid);
    assert.ok(p.outfit.shoes);
    assert.notEqual(p.outfit.bottom?.type === 'jeans' && p.outfit.bottom.colors[0].name === 'denim', true);
    assert.equal(evaluate(p.outfit, { mode: 'casual', weather: mild }).veto, null);
  }
});

test('modes produce different outfits', () => {
  const f = run({ mode: 'fancy' }).picks.slice(0, 5);
  const c = run({ mode: 'comfy' }).picks.slice(0, 5);
  const avg = (ps) => ps.reduce((a, p) => a + formalityOf(p.outfit), 0) / ps.length;
  assert.ok(avg(f) > avg(c) + 1.2, `fancy ${avg(f)} vs comfy ${avg(c)}`);
});

test('cold days get layers and a coat', () => {
  const top = run({ weather: cold }).picks[0].outfit;
  assert.ok(top.outer, 'has an outer layer');
  assert.ok(['puffer', 'overcoat'].includes(top.outer.type), top.outer.type);
});

test('same seed, same order; different seed can differ', () => {
  const a = run({ seed: 'x' }).picks.map((p) => p.key);
  const b = run({ seed: 'x' }).picks.map((p) => p.key);
  assert.deepEqual(a, b);
});

test('a combo worn recently drops down; skipping removes it', () => {
  const first = run({}).picks[0];
  const wears = [{ date: '2026-11-02', itemIds: first.outfit && Object.values(first.outfit).flat().filter(Boolean).map((i) => i.id), combo: first.combo }];
  const after = run({ wears }).picks;
  assert.notEqual(after[0].combo, first.combo);
  const skipped = run({ skip: [first.combo] }).picks;
  assert.ok(!skipped.some((p) => p.combo === first.combo));
});

test('saved outfits are offered when clean', () => {
  const items = closet();
  const ids = [byType(items, 'oxford', 'white').id, byType(items, 'sweater', 'cream').id, byType(items, 'chinos', 'navy').id, byType(items, 'leather-sneakers').id];
  const { picks } = run({ items, saved: [{ id: 's1', itemIds: ids }] });
  assert.ok(picks.slice(0, 10).some((p) => p.savedId === 's1'));
});

test('alternatives rank replacements for a slot', () => {
  const items = closet();
  const o = assemble([byType(items, 'oxford', 'white'), byType(items, 'chinos', 'navy'), byType(items, 'leather-sneakers')]);
  const alts = alternatives(o, 'shoes', items, { mode: 'casual', weather: mild, prefs: { neverPairs: [] } });
  assert.ok(alts.length >= 4);
  assert.ok(alts[0].score >= alts[alts.length - 1].score);
});

test('a lot of clothes stays fast', () => {
  const big = [];
  for (let k = 0; k < 6; k++) big.push(...closet().map((i) => ({ ...i, id: `${i.id}-${k}` })));
  const t = Date.now();
  const { picks } = run({ items: big });
  assert.ok(picks.length > 5);
  assert.ok(Date.now() - t < 8000, `took ${Date.now() - t}ms`);
});

// ── taste ───────────────────────────────────────────────────

test('taste learns from what you wear and skip', () => {
  const c = closet();
  const liked = assemble([byType(c, 'oxford', 'light blue'), byType(c, 'chinos', 'khaki'), byType(c, 'leather-sneakers')]);
  const meh = assemble([byType(c, 'polo'), byType(c, 'jeans', 'black'), byType(c, 'runners')]);
  const m = emptyModel();
  const before = predict(m, features(liked, 'casual'));
  for (let i = 0; i < 5; i++) {
    record(m, liked, 'casual', 'wore');
    record(m, meh, 'casual', 'skipped');
  }
  assert.ok(predict(m, features(liked, 'casual')) > before);
  assert.ok(predict(m, features(liked, 'casual')) > predict(m, features(meh, 'casual')));
});

// ── weather & week ──────────────────────────────────────────

test('weather summary only uses the 9–5 window', () => {
  const time = [], temp = [], prob = [];
  for (let h = 0; h < 24; h++) {
    time.push(`2026-11-03T${String(h).padStart(2, '0')}:00`);
    temp.push(h < 9 || h >= 17 ? -20 : 10 + (h - 9));
    prob.push(h === 15 ? 80 : 0);
  }
  const f = { hourly: { time, temperature_2m: temp, apparent_temperature: temp, precipitation_probability: prob, precipitation: prob.map(() => 0), wind_speed_10m: temp.map(() => 5), wind_gusts_10m: temp.map(() => 10), weather_code: temp.map(() => 1), cloud_cover: temp.map(() => 20) } };
  const s = summarize(f, '2026-11-03');
  assert.equal(s.min, 10);
  assert.equal(s.max, 17);
  assert.equal(s.wet, true);
  assert.equal(s.wetFrom, 15);
  assert.match(describe(s, 'C'), /rain from 3pm/);
});

test('fancy nudge', () => {
  assert.equal(weekday('2026-11-02'), 1); // Monday
  assert.equal(fancyNudge([], '2026-11-02'), null);
  assert.match(fancyNudge([], '2026-11-04'), /No fancy days/);
  const wears = [{ date: '2026-11-02', mode: 'fancy' }, { date: '2026-11-03', mode: 'fancy' }];
  assert.equal(fancyNudge(wears, '2026-11-05'), null);
  assert.equal(fancyNudge([], '2026-11-07'), null); // Saturday
  const three = [...wears, { date: '2026-11-04', mode: 'fancy' }];
  assert.match(fancyNudge(three, '2026-11-05', 'fancy'), /fourth/);
});

test('wearing the top pick every weekday rotates for about two weeks', () => {
  const items = closet();
  const wears = [];
  const modes = ['casual', 'fancy', 'casual', 'fancy', 'casual'];
  const dates = ['02', '03', '04', '05', '06', '09', '10', '11', '12', '13'].map((d) => `2026-11-${d}`);
  dates.forEach((date, k) => {
    const { picks } = suggest({ items, saved: [], wears, mode: modes[k % 5], weather: mild, prefs: { neverPairs: [] }, model: emptyModel(), today: date, seed: date });
    const p = picks[0];
    wears.push({ date, itemIds: [p.outfit.base, p.outfit.mid, p.outfit.bottom].filter(Boolean).map((i) => i.id), combo: p.combo, mode: modes[k % 5] });
  });
  assert.equal(new Set(wears.map((w) => w.combo)).size, wears.length, 'no look repeats within two working weeks');
});

test('no collared shirts under hoodies, no flannel on fancy days', () => {
  const c = closet();
  const polo = { base: byType(c, 'polo'), mid: byType(c, 'hoodie'), bottom: byType(c, 'jeans', 'denim'), shoes: byType(c, 'leather-sneakers') };
  const tee = { ...polo, base: byType(c, 'tshirt', 'white') };
  assert.match(evaluate(polo, { mode: 'casual' }).veto, /polos don't go under/);
  assert.equal(evaluate(tee, { mode: 'casual' }).veto, null);
  for (const p of run({ mode: 'fancy' }).picks.slice(0, 8)) {
    assert.notEqual(p.outfit.base?.type, 'flannel');
    assert.notEqual(p.outfit.mid?.type, 'hoodie');
  }
});

test('full-day hours, compass and unit conversions for the weather view', async () => {
  const { dayHours, compass, toWind, toRain, fmtHour } = await import('../src/core/weather.js');
  const time = [], t = [], dir = [];
  for (let i = 0; i < 24; i++) { time.push(`2026-11-03T${String(i).padStart(2, '0')}:00`); t.push(i); dir.push(270); }
  time.push('2026-11-04T00:00'); t.push(99); dir.push(0);
  const hours = dayHours({ hourly: { time, temperature_2m: t, wind_direction_10m: dir } }, '2026-11-03');
  assert.equal(hours.length, 24);
  assert.equal(hours[5].feels, 5, 'falls back to air temperature');
  assert.equal(compass(270), 'west');
  assert.equal(compass(-45), 'north-west');
  assert.equal(toWind(100, 'F'), 62);
  assert.equal(toRain(25.4, 'F'), 1);
  assert.equal(fmtHour(0), '12am');
});

test('polos never go under sweaters, hoodies or cardigans', () => {
  const c = closet();
  for (const mid of ['sweater', 'hoodie', 'cardigan']) {
    const o = { base: byType(c, 'polo'), mid: byType(c, mid), bottom: byType(c, 'chinos', 'navy'), shoes: byType(c, 'leather-sneakers') };
    assert.ok(evaluate(o, { mode: 'casual' }).veto, mid);
  }
  for (const p of run({ weather: cold }).picks.concat(run({ mode: 'fancy', weather: cold }).picks)) {
    assert.ok(!(p.outfit.base?.type === 'polo' && p.outfit.mid), 'no polo under a mid layer in any suggestion');
  }
});

test('under a closed sweater, a collarless shirt is hidden; a collar or open layer shows', async () => {
  const { baseShows } = await import('../src/core/rules.js');
  const c = closet();
  const sweater = byType(c, 'sweater', 'navy'), cardigan = byType(c, 'cardigan');
  const tee = byType(c, 'tshirt', 'white'), oxford = byType(c, 'oxford', 'white');
  const rest = { bottom: byType(c, 'trousers'), shoes: byType(c, 'dress-shoes') };
  assert.equal(baseShows({ base: tee, mid: sweater }), 'hidden');
  assert.equal(baseShows({ base: oxford, mid: sweater }), 'collar');
  assert.equal(baseShows({ base: tee, mid: cardigan }), 'full');
  assert.equal(baseShows({ base: tee }), 'full');
  // On a fancy day a hidden tee is not "too casual"…
  const hiddenTee = evaluate({ ...rest, base: tee, mid: sweater }, { mode: 'fancy' });
  assert.ok(!hiddenTee.notes.some((n) => /too casual for fancy/.test(n.text) && n.text.includes('tshirt')), JSON.stringify(hiddenTee.notes));
  assert.equal(formalityOf({ ...rest, base: tee, mid: sweater }), formalityOf({ ...rest, mid: sweater }), 'hidden tee adds no formality');
  // …but a tee under an open cardigan, or on its own, still is.
  assert.ok(evaluate({ ...rest, base: tee, mid: cardigan }, { mode: 'fancy' }).notes.some((n) => /too casual for fancy/.test(n.text)));
  assert.ok(evaluate({ ...rest, base: tee }, { mode: 'fancy' }).notes.some((n) => /too casual for fancy/.test(n.text)));
  // A collar does count: an oxford under a sweater changes how dressy it
  // reads (here, with jeans and sneakers, it lifts it).
  const casualRest = { bottom: byType(c, 'jeans', 'denim'), shoes: byType(c, 'leather-sneakers') };
  assert.ok(formalityOf({ ...casualRest, base: oxford, mid: sweater }) > formalityOf({ ...casualRest, base: tee, mid: sweater }));
});

test('undershirts only ever go under a closed layer; a lone sweater gets a tip', () => {
  const c = closet();
  const under = { id: 'u1', type: 'undershirt', name: 'white undershirt', colors: [{ name: 'white', share: 1 }] };
  const rest = { bottom: byType(c, 'jeans', 'denim'), shoes: byType(c, 'leather-sneakers') };
  assert.ok(evaluate({ ...rest, base: under }, { mode: 'casual' }).veto, 'undershirt alone');
  assert.ok(evaluate({ ...rest, base: under, mid: byType(c, 'cardigan') }, { mode: 'casual' }).veto, 'would show under a cardigan');
  assert.equal(evaluate({ ...rest, base: under, mid: byType(c, 'sweater', 'navy') }, { mode: 'casual' }).veto, null);
  const lone = evaluate({ ...rest, mid: byType(c, 'sweater', 'navy') }, { mode: 'casual' });
  assert.ok(lone.notes.some((n) => n.tone === 'tip' && /T-shirt or undershirt/.test(n.text)));
});

test('one top does not reappear day after day under different sweaters', () => {
  const items = closet();
  const wears = [];
  const dates = ['02', '03', '04', '05', '06'].map((d) => `2026-11-${d}`);
  const seen = new Map();
  for (const date of dates) {
    const p = suggest({ items, saved: [], wears, mode: 'fancy', weather: cold, prefs: { neverPairs: [] }, model: emptyModel(), today: date, seed: date }).picks[0];
    const visible = [p.outfit.base, p.outfit.mid, p.outfit.bottom].filter(Boolean);
    for (const i of visible) seen.set(i.id, (seen.get(i.id) || 0) + 1);
    wears.push({ date, itemIds: visible.map((i) => i.id), combo: p.combo, mode: 'fancy' });
  }
  const max = Math.max(...seen.values());
  assert.ok(max <= 3, `a piece appeared ${max} times in 5 fancy days`);
});

test('hairstyles: fit the mood, hold up in bad weather, rotate', async () => {
  const { pickHair, DEFAULT_STYLES } = await import('../src/core/hair.js');
  const fancy = pickHair(DEFAULT_STYLES, { mode: 'fancy', today: '2026-11-03' });
  assert.ok(fancy.modes.includes('fancy'));
  for (let k = 0; k < 6; k++) {
    const wet = pickHair(DEFAULT_STYLES, { mode: 'casual', weather: rainy, today: `2026-11-1${k}` });
    assert.ok(wet.weatherProof, `rain day ${k}: ${wet.name}`);
  }
  const a = pickHair(DEFAULT_STYLES, { mode: 'casual', today: '2026-11-03' });
  const b = pickHair(DEFAULT_STYLES, { mode: 'casual', today: '2026-11-03', offset: 1 });
  assert.notEqual(a.id, b.id, 'Change gives a different style');
  assert.equal(pickHair([], { mode: 'casual', today: '2026-11-03' }), null);
});
