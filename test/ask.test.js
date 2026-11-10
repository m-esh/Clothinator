import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closet, cold, mild } from './fixtures.js';
import { ask, mentions } from '../src/core/ask.js';
import { assemble } from '../src/core/generate.js';

const v = { hello: 'At your service.', chat: { yes: 'Yes.', no: 'No.', maybe: 'Mostly.', offTopic: 'OFF' }, tips: ['If in doubt, navy.'] };
function setup(weather = mild, mode = 'fancy') {
  const items = closet();
  const by = (t, c) => items.find((i) => i.type === t && (!c || i.colors[0].name === c));
  const outfit = assemble([by('sweater', 'navy'), by('dress-shirt'), by('chinos', 'navy'), by('boots')]);
  return { items, by, ctx: { today: '2026-11-10', unit: 'C', weather, mode, outfit, items, wears: [], prefs: { neverPairs: [] }, model: null, saved: [] } };
}

test('mentions: colour + type, and "bomber jacket" is one piece', () => {
  assert.deepEqual(mentions('Does a black bomber jacket go with this?').map((m) => [m.type, m.color]), [['bomber', 'black']]);
  assert.deepEqual(mentions('my white trainers and navy chinos').map((m) => [m.type, m.color]), [['sneakers', 'white'], ['chinos', 'navy']]);
});

test('goes with: imagined piece, closet piece, family match', () => {
  const { ctx } = setup();
  assert.match(ask('Does a black bomber jacket go with this outfit?', ctx, v), /You don't have one, but a black bomber/);
  assert.match(ask('Would the grey hoodie work?', ctx, v), /^No\. .*grey hoodie/);
  // "white sneakers" finds the white leather sneakers
  assert.match(ask('Can I wear my white sneakers with this?', ctx, v), /leather-sneakers/);
});

test('"a black one" refers back to the last thing mentioned', () => {
  const { ctx } = setup();
  const a = ask('Does a black one look good?', { ...ctx, history: ['Does a navy bomber jacket go with this?'] }, v);
  assert.match(a, /black bomber/);
});

test('what goes with a piece fills the outfit from the closet', () => {
  const { ctx } = setup(cold);
  assert.match(ask('What shoes go with my navy chinos?', ctx, v), /^With the navy chinos: the /);
  assert.match(ask('What goes with the black jeans?', ctx, v), /^The black jeans with the /);
});

test('occasions: checks the outfit or suggests one', () => {
  const { ctx, by } = setup();
  assert.match(ask('What should I wear to the gym?', ctx, v), /^For the gym: /);
  assert.match(ask('Is this ok for a job interview?', ctx, v), /an interview/);
  const lazy = { ...ctx, outfit: assemble([by('hoodie'), by('joggers'), by('runners')]) };
  assert.match(ask('Is this ok for a wedding?', lazy, v), /^No\. Too casual for a wedding/);
});

test('weather questions still get the forecast answers; chit-chat and off-topic', () => {
  const { ctx } = setup(cold);
  assert.match(ask('Do I need a jacket?', ctx, v), /^Yes\./);
  assert.match(ask('Hello!', ctx, v), /At your service/);
  assert.equal(ask('What is the capital of France?', ctx, v), 'OFF');
});
