import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closet, mild, hot, cold, rainy } from './fixtures.js';
import { quickAnswer, intentOf, facts, persona } from '../src/core/advisor.js';

const v = { chat: { yes: 'Yes.', no: 'No.' } };
const ctx = (weather, extra = {}) => ({ today: '2026-11-03', unit: 'C', weather, items: closet(), wears: [], ...extra });

test('intents: the common questions are recognised', () => {
  assert.equal(intentOf('Should I wear a jacket today?'), 'jacket');
  assert.equal(intentOf('do i need an umbrella'), 'rain');
  assert.equal(intentOf("What's the weather like?"), 'weather');
  assert.equal(intentOf('Is it windy?'), 'wind');
  assert.equal(intentOf('What should I wash?'), 'wash');
  assert.equal(intentOf('Tell me a joke'), null);
});

test('jacket: yes in the cold and rain, no when hot and dry', () => {
  assert.match(quickAnswer('Do I need a jacket?', ctx(cold), v), /^Yes\./);
  assert.match(quickAnswer('Do I need a coat?', ctx(rainy), v), /^Yes\. .*rain/i);
  assert.match(quickAnswer('Do I need a jacket?', ctx(hot), v), /^No\./);
});

test('jacket: names a piece from the closet that is not in the wash', () => {
  const items = closet();
  const a = quickAnswer('jacket?', ctx(cold, { items }), v);
  const outer = items.filter((i) => ['parka', 'puffer', 'overcoat', 'rain-jacket', 'denim-jacket', 'bomber', 'blazer', 'trench'].includes(i.type));
  assert.ok(outer.some((i) => a.toLowerCase().includes((i.name || '').toLowerCase()) || a.includes('would do')), a);
  for (const i of items) i.inLaundry = true;
  assert.match(quickAnswer('jacket?', ctx(cold, { items }), v), /Nothing in the closet/);
});

test('rain and weather answers use the forecast numbers', () => {
  assert.match(quickAnswer('Will it rain?', ctx(rainy), v), /^Yes\..*6 mm/);
  assert.match(quickAnswer('Will it rain?', ctx(mild), v), /^No\. Dry/);
  assert.match(quickAnswer("What's the weather?", ctx(mild), v), /11° to 16°/);
  assert.match(quickAnswer("What's the weather?", ctx(mild, { unit: 'F' }), v), /52° to 61°/);
});

test('no weather loaded: says so instead of guessing', () => {
  assert.match(quickAnswer('Do I need a jacket?', ctx(null), v), /weather/);
});

test('laundry: counts the wash and the most-worn pieces', () => {
  const items = closet();
  items[0].inLaundry = true;
  items[1].wearsSinceWash = 5;
  const a = quickAnswer('What should I wash?', ctx(mild, { items }), v);
  assert.match(a, /1 piece is in the wash/);
  assert.match(a, /\(5\)/);
});

test('facts and persona carry what the model needs', () => {
  const f = facts(ctx(rainy, { mode: 'fancy' }));
  assert.match(f, /rain/i);
  assert.match(f, /fancy/);
  assert.match(f, /closet \(\d+ pieces\)/);
  assert.match(facts(ctx(null)), /not loaded/);
  const p = persona({ name: 'Barnaby', blurb: 'A fox.' }, 'F');
  assert.match(p, /Barnaby/);
  assert.match(p, /°F/);
});
