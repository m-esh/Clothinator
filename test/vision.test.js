import { test } from 'node:test';
import assert from 'node:assert/strict';
import { palette, floorMask, contentBox, coverage } from '../src/vision/pixels.js';

// A noisy wooden-ish floor with a navy "shirt" rectangle and a red stripe.
function scene(w = 120, h = 100) {
  const data = new Uint8ClampedArray(w * h * 4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inItem = x >= 30 && x < 90 && y >= 20 && y < 85;
      const stripe = inItem && y >= 50 && y < 56;
      const grain = (y % 9 < 2 ? -18 : 0) + rnd() * 14;
      const [r, g, b] = stripe ? [190, 40, 40] : inItem ? [32, 42, 70] : [176 + grain, 140 + grain, 100 + grain];
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

test('floor mask isolates the item', () => {
  const img = scene();
  const mask = floorMask(img);
  const at = (x, y) => mask[y * img.width + x];
  assert.ok(at(60, 40) > 200, 'item kept');
  assert.ok(at(60, 52) > 200, 'stripe inside item kept');
  assert.ok(at(5, 5) < 50, 'floor removed');
  assert.ok(at(110, 95) < 50, 'floor removed');
  const c = coverage(mask);
  const truth = (60 * 65) / (120 * 100);
  assert.ok(Math.abs(c - truth) < 0.05, `coverage ${c} vs ${truth}`);
});

test('palette names the dominant colours of the cut-out', () => {
  const img = scene();
  const mask = floorMask(img);
  for (let p = 0; p < mask.length; p++) img.data[p * 4 + 3] = mask[p];
  const cols = palette(img);
  assert.equal(cols[0].name, 'navy');
  assert.ok(cols.some((c) => c.name === 'red'), JSON.stringify(cols));
  assert.ok(!cols.some((c) => ['tan', 'camel', 'khaki'].includes(c.name)), 'floor colour leaked in');
});

test('content box trims to the item', () => {
  const img = scene();
  const mask = floorMask(img);
  for (let p = 0; p < mask.length; p++) img.data[p * 4 + 3] = mask[p];
  const b = contentBox(img, 24, 0);
  assert.ok(Math.abs(b.x - 30) <= 2 && Math.abs(b.y - 20) <= 2, JSON.stringify(b));
  assert.ok(Math.abs(b.w - 60) <= 3 && Math.abs(b.h - 65) <= 3, JSON.stringify(b));
});
