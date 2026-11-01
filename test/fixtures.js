// A believable ~30-piece closet for tests.
let n = 0;
const item = (type, color, extra = {}) => ({
  id: `${type}-${color.replace(' ', '_')}-${n++}`,
  type,
  name: `${color} ${type}`,
  colors: [{ name: color, share: 0.9 }],
  wears: 0,
  wearsSinceWash: 0,
  inLaundry: false,
  ...extra,
});

export function closet() {
  n = 0;
  return [
    item('tshirt', 'white'), item('tshirt', 'black'), item('tshirt', 'grey'),
    item('graphic-tee', 'black'), item('longsleeve', 'navy'),
    item('oxford', 'light blue'), item('oxford', 'white'), item('dress-shirt', 'white'),
    item('polo', 'forest'), item('flannel', 'red'),
    item('sweater', 'navy'), item('sweater', 'cream'), item('hoodie', 'grey'), item('cardigan', 'charcoal'),
    item('jeans', 'denim'), item('jeans', 'black'), item('chinos', 'khaki'), item('chinos', 'navy'),
    item('trousers', 'charcoal'), item('joggers', 'grey'), item('shorts', 'khaki'),
    item('leather-sneakers', 'white'), item('runners', 'grey'), item('chelsea', 'brown', { fabric: 'suede', rain: 'bad' }),
    item('dress-shoes', 'black'), item('boots', 'brown'),
    item('blazer', 'navy'), item('rain-jacket', 'olive'), item('overcoat', 'camel'), item('puffer', 'black'),
    item('watch', 'grey'), item('belt', 'brown'), item('belt', 'black'), item('beanie', 'charcoal'), item('cap', 'navy'),
  ];
}

export const mild = { date: '2026-11-03', from: 9, to: 17, min: 12, max: 17, feelsMin: 11, feelsMax: 16, rainChance: 10, rainMm: 0, wet: false, snow: false, wetFrom: null, wind: 10, gusts: 20, windy: false, sunny: true };
export const hot = { ...mild, min: 26, max: 31, feelsMin: 27, feelsMax: 33 };
export const cold = { ...mild, min: -6, max: 0, feelsMin: -10, feelsMax: -4, sunny: false };
export const rainy = { ...mild, rainChance: 90, rainMm: 6, wet: true, wetFrom: 9, sunny: false };

export const byType = (items, type, color) => items.find((i) => i.type === type && (!color || i.colors[0].name === color));
