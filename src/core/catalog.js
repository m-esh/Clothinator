// The garment knowledge base. Every item in the closet points at one of these
// types; the numbers are starting points the item editor lets you override.
//
//   f  formality 0 (gym) … 5 (black tie)
//   w  warmth    0 (none) … 5 (parka)
//   c  comfort   1 (endure it) … 5 (pyjamas)
//
// Tops come in two layers: `base` (worn against the skin) and `mid` (worn over
// a base). A mid marked `alone` can also be worn on its own.
//
// What shows of a base under a mid: `collar` bases show at the neck under a
// closed mid; collarless ones are hidden. `open` mids (cardigan, vest) show
// the whole base. An `under` base is only ever worn beneath something.

export const CATEGORIES = [
  { key: 'top', label: 'Tops' },
  { key: 'bottom', label: 'Bottoms' },
  { key: 'onepiece', label: 'One-pieces' },
  { key: 'outer', label: 'Outer layers' },
  { key: 'shoes', label: 'Shoes' },
  { key: 'accessory', label: 'Accessories' },
];

const T = (key, label, cat, f, w, c, extra = {}) => ({ key, label, cat, f, w, c, ...extra });

export const TYPES = [
  // tops — base
  T('tshirt', 'T-shirt', 'top', 1.5, 1, 5, { layer: 'base' }),
  T('undershirt', 'Undershirt', 'top', 1, 0.7, 5, { layer: 'base', under: true }),
  T('graphic-tee', 'Graphic tee', 'top', 1, 1, 5, { layer: 'base', pattern: 'graphic' }),
  T('longsleeve', 'Long-sleeve tee', 'top', 1.5, 1.5, 5, { layer: 'base' }),
  T('tank', 'Tank top', 'top', 0.5, 0.5, 5, { layer: 'base', summer: true }),
  T('polo', 'Polo', 'top', 2.5, 1, 4, { layer: 'base', collar: true, polo: true }),
  T('henley', 'Henley', 'top', 2, 1.5, 5, { layer: 'base' }),
  T('oxford', 'Oxford / button-down', 'top', 3.5, 1.5, 4, { layer: 'base', collar: true }),
  T('dress-shirt', 'Dress shirt', 'top', 4.5, 1.5, 3, { layer: 'base', tuck: true, collar: true }),
  T('flannel', 'Flannel shirt', 'top', 2, 2.5, 4, { layer: 'base', pattern: 'check', collar: true }),
  T('linen-shirt', 'Linen shirt', 'top', 3, 1, 4, { layer: 'base', summer: true, collar: true }),
  T('blouse', 'Blouse', 'top', 3.5, 1, 4, { layer: 'base', collar: true }),
  T('turtleneck', 'Turtleneck', 'top', 3.5, 2.5, 4, { layer: 'base', collar: true }),
  // tops — mid
  T('sweater', 'Sweater / knit', 'top', 3, 3, 4, { layer: 'mid', alone: true, knit: true }),
  T('sweatshirt', 'Sweatshirt', 'top', 1.5, 3, 5, { layer: 'mid', alone: true, knit: true }),
  T('hoodie', 'Hoodie', 'top', 1, 3, 5, { layer: 'mid', alone: true, knit: true }),
  T('quarter-zip', 'Quarter-zip', 'top', 2.5, 2.5, 4, { layer: 'mid', alone: true, knit: true }),
  T('cardigan', 'Cardigan', 'top', 3, 2.5, 5, { layer: 'mid', knit: true, open: true }),
  T('vest', 'Sweater vest', 'top', 3, 1.5, 4, { layer: 'mid', knit: true, open: true }),
  T('fleece', 'Fleece', 'top', 1, 3, 5, { layer: 'mid', alone: true, knit: true }),
  // outer
  T('denim-jacket', 'Denim jacket', 'outer', 2, 2, 4),
  T('bomber', 'Bomber', 'outer', 2, 2.5, 4),
  T('leather-jacket', 'Leather jacket', 'outer', 2.5, 2.5, 3, { wind: true }),
  T('overshirt', 'Overshirt / shacket', 'outer', 2, 2, 5),
  T('chore-jacket', 'Chore / field jacket', 'outer', 2.5, 2.5, 4),
  T('blazer', 'Blazer', 'outer', 4, 2, 3),
  T('suit-jacket', 'Suit jacket', 'outer', 5, 2, 2),
  T('overcoat', 'Wool overcoat', 'outer', 4, 4, 3, { wind: true }),
  T('trench', 'Trench coat', 'outer', 3.5, 2.5, 3, { rain: 'ok', wind: true }),
  T('rain-jacket', 'Rain jacket / shell', 'outer', 1.5, 1.5, 4, { rain: 'ok', wind: true }),
  T('windbreaker', 'Windbreaker', 'outer', 1, 1.5, 4, { rain: 'ok', wind: true }),
  T('puffer', 'Puffer', 'outer', 1.5, 5, 5, { rain: 'ok', wind: true }),
  T('parka', 'Parka', 'outer', 2, 5, 4, { rain: 'ok', wind: true }),
  // bottoms
  T('jeans', 'Jeans', 'bottom', 2, 2, 3, { loops: true, denim: true }),
  T('chinos', 'Chinos', 'bottom', 3, 2, 4, { loops: true }),
  T('trousers', 'Dress trousers', 'bottom', 4.5, 2, 3, { loops: true }),
  T('corduroys', 'Corduroys', 'bottom', 2.5, 3, 4, { loops: true }),
  T('cargo', 'Cargo pants', 'bottom', 1.5, 2, 4, { loops: true }),
  T('joggers', 'Joggers / sweatpants', 'bottom', 1, 2.5, 5, { lounge: true }),
  T('leggings', 'Leggings', 'bottom', 1, 1.5, 5, { lounge: true }),
  T('shorts', 'Shorts', 'bottom', 1.5, 0, 5, { shorts: true, loops: true }),
  T('athletic-shorts', 'Athletic shorts', 'bottom', 0.5, 0, 5, { shorts: true, lounge: true }),
  T('skirt', 'Skirt', 'bottom', 3, 0.5, 4, { skirt: true }),
  // one-piece
  T('dress', 'Dress', 'onepiece', 3.5, 1, 4),
  T('jumpsuit', 'Jumpsuit / overalls', 'onepiece', 2, 2, 4),
  // shoes
  T('sneakers', 'Sneakers', 'shoes', 1.5, 1, 5),
  T('leather-sneakers', 'Leather sneakers', 'shoes', 2.5, 1, 5),
  T('canvas', 'Canvas shoes', 'shoes', 1.5, 0.5, 5, { rain: 'bad' }),
  T('runners', 'Running shoes', 'shoes', 0.5, 1, 5),
  T('boots', 'Boots', 'shoes', 2.5, 2.5, 4, { rain: 'ok' }),
  T('chelsea', 'Chelsea boots', 'shoes', 3.5, 2, 4, { rain: 'ok' }),
  T('loafers', 'Loafers', 'shoes', 4, 0.5, 4),
  T('dress-shoes', 'Dress shoes', 'shoes', 5, 0.5, 2),
  T('suede-shoes', 'Suede shoes', 'shoes', 3, 0.5, 4, { rain: 'bad' }),
  T('sandals', 'Sandals / slides', 'shoes', 0.5, 0, 5, { rain: 'bad', summer: true }),
  T('heels', 'Heels', 'shoes', 4.5, 0.5, 2),
  // accessories — `kind` drives when they are added
  T('watch', 'Watch', 'accessory', 3, 0, 5, { kind: 'wrist' }),
  T('belt', 'Belt', 'accessory', 3, 0, 4, { kind: 'belt' }),
  T('cap', 'Cap', 'accessory', 1, 0.5, 5, { kind: 'head', casualOnly: true }),
  T('beanie', 'Beanie', 'accessory', 1.5, 1, 5, { kind: 'head', cold: true }),
  T('scarf', 'Scarf', 'accessory', 3, 1, 5, { kind: 'neck', cold: true }),
  T('gloves', 'Gloves', 'accessory', 2.5, 0.5, 5, { kind: 'hands', cold: true }),
  T('sunglasses', 'Sunglasses', 'accessory', 2.5, 0, 5, { kind: 'eyes', sunny: true }),
  T('tie', 'Tie', 'accessory', 5, 0, 3, { kind: 'neckwear', fancyOnly: true }),
  T('necklace', 'Necklace / chain', 'accessory', 2.5, 0, 5, { kind: 'jewelry' }),
  T('bracelet', 'Bracelet', 'accessory', 2.5, 0, 5, { kind: 'jewelry' }),
  T('ring', 'Ring', 'accessory', 3, 0, 5, { kind: 'jewelry' }),
  T('earrings', 'Earrings', 'accessory', 3, 0, 5, { kind: 'jewelry' }),
  T('bag', 'Bag', 'accessory', 2.5, 0, 5, { kind: 'bag' }),
  T('backpack', 'Backpack', 'accessory', 1.5, 0, 5, { kind: 'bag', casualOnly: true }),
];

export const TYPE = Object.fromEntries(TYPES.map((t) => [t.key, t]));

export const typesIn = (cat) => TYPES.filter((t) => t.cat === cat);

export const PATTERNS = [
  { key: 'solid', label: 'Solid' },
  { key: 'texture', label: 'Subtle texture' },
  { key: 'stripes', label: 'Stripes' },
  { key: 'check', label: 'Check / plaid' },
  { key: 'print', label: 'Print / floral' },
  { key: 'graphic', label: 'Graphic / logo' },
];

// Fabric nudges the catalog numbers a little; the type already assumes the
// usual fabric, so these stay small.
export const FABRICS = [
  { key: 'cotton', label: 'Cotton', w: 0, f: 0 },
  { key: 'denim', label: 'Denim', w: 0.3, f: -0.2 },
  { key: 'wool', label: 'Wool', w: 0.6, f: 0.3 },
  { key: 'cashmere', label: 'Cashmere', w: 0.6, f: 0.5 },
  { key: 'linen', label: 'Linen', w: -0.5, f: 0 },
  { key: 'silk', label: 'Silk', w: -0.2, f: 0.5 },
  { key: 'leather', label: 'Leather', w: 0.3, f: 0.3, rain: 'ok' },
  { key: 'suede', label: 'Suede', w: 0.2, f: 0.2, rain: 'bad' },
  { key: 'fleece', label: 'Fleece', w: 0.6, f: -0.5 },
  { key: 'nylon', label: 'Nylon / technical', w: 0, f: -0.3, rain: 'ok' },
  { key: 'corduroy', label: 'Corduroy', w: 0.4, f: 0 },
  { key: 'synthetic', label: 'Polyester / blend', w: 0, f: 0 },
  { key: 'canvas', label: 'Canvas', w: 0, f: -0.2 },
];

export const FABRIC = Object.fromEntries(FABRICS.map((f) => [f.key, f]));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

// Starting numbers for a new item of a given type and fabric.
export function defaultsFor(typeKey, fabricKey) {
  const t = TYPE[typeKey];
  if (!t) throw new Error(`unknown type ${typeKey}`);
  const fab = FABRIC[fabricKey] || { w: 0, f: 0 };
  return {
    formality: round1(clamp(t.f + fab.f, 0, 5)),
    warmth: round1(clamp(t.w + (t.cat === 'accessory' ? 0 : fab.w), 0, 5)),
    comfort: t.c,
    rain: fab.rain === 'bad' ? 'bad' : (t.rain || fab.rain || 'neutral'),
  };
}

// The effective numbers for an item: whatever the user set, else the
// catalog default. Kept as a function so old items pick up catalog fixes.
// Memoised per item object; the signature catches in-place edits.
const memo = new WeakMap();

export function stats(item) {
  const sig = `${item.type}|${item.fabric}|${item.formality}|${item.warmth}|${item.comfort}|${item.rain}|${item.pattern}`;
  const hit = memo.get(item);
  if (hit && hit.sig === sig) return hit.value;
  const value = computeStats(item);
  memo.set(item, { sig, value });
  return value;
}

function computeStats(item) {
  const d = defaultsFor(item.type, item.fabric);
  const t = TYPE[item.type];
  return {
    ...t,
    formality: item.formality ?? d.formality,
    warmth: item.warmth ?? d.warmth,
    comfort: item.comfort ?? d.comfort,
    rain: item.rain ?? d.rain,
    pattern: item.pattern || t.pattern || 'solid',
  };
}
