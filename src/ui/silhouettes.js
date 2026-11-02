// Flat garment drawings for items without a photo, filled with the item's
// own colour. viewBox 0 0 100 100.

import { TYPE } from '../core/catalog.js';

const SHAPES = {
  tee: { body: 'M31 14 L42 9 Q50 16 58 9 L69 14 L88 31 L78 42 L70 36 L70 90 L30 90 L30 36 L22 42 L12 31 Z', detail: 'M42 9 Q50 16 58 9' },
  tank: { body: 'M36 8 L42 8 Q50 22 58 8 L64 8 Q66 26 72 34 L72 90 L28 90 L28 34 Q34 26 36 8 Z', detail: '' },
  shirt: { body: 'M33 11 L44 7 L50 15 L56 7 L67 11 L84 28 L90 72 L81 74 L74 40 L72 92 L28 92 L26 40 L19 74 L10 72 L16 28 Z', detail: 'M44 7 L50 15 L56 7 M50 15 L50 92 M47 30 h0 M47 46 h0 M47 62 h0 M47 78 h0' },
  knit: { body: 'M33 12 L43 9 Q50 14 57 9 L67 12 L84 29 L89 74 L80 76 L74 42 L72 86 L28 86 L26 42 L20 76 L11 74 L16 29 Z', detail: 'M28 80 L72 80 M12 70 L20 72 M80 72 L88 70 M43 9 Q50 14 57 9' },
  hoodie: { body: 'M36 14 Q36 2 50 2 Q64 2 64 14 L67 13 L84 30 L89 74 L80 76 L74 43 L72 87 L28 87 L26 43 L20 76 L11 74 L16 30 L33 13 Z', detail: 'M40 14 Q50 26 60 14 M36 56 L64 56 L60 72 L40 72 Z M28 81 L72 81' },
  jacket: { body: 'M32 10 L44 6 L50 18 L56 6 L68 10 L86 28 L91 80 L81 82 L75 44 L74 94 L26 94 L25 44 L19 82 L9 80 L14 28 Z', detail: 'M44 6 L50 18 L56 6 M50 18 L50 94 M32 64 L42 64 M58 64 L68 64' },
  coat: { body: 'M33 8 L44 5 L50 16 L56 5 L67 8 L84 26 L90 82 L80 84 L75 42 L77 98 L23 98 L25 42 L20 84 L10 82 L16 26 Z', detail: 'M44 5 L50 16 L56 5 M50 16 L50 98 M44 36 h0 M44 52 h0 M44 68 h0' },
  trousers: { body: 'M30 6 L70 6 L75 96 L57 96 L50 34 L43 96 L25 96 Z', detail: 'M30 13 L70 13 M50 13 L50 30' },
  shorts: { body: 'M28 18 L72 18 L78 70 L56 72 L50 44 L44 72 L22 70 Z', detail: 'M28 25 L72 25 M50 25 L50 40' },
  joggers: { body: 'M30 6 L70 6 L74 88 Q66 94 57 90 L50 34 L43 90 Q34 94 26 88 Z', detail: 'M30 13 L70 13 M27 84 L42 84 M58 84 L73 84' },
  skirt: { body: 'M34 14 L66 14 L82 86 L18 86 Z', detail: 'M34 21 L66 21' },
  dress: { body: 'M38 6 L44 6 Q50 14 56 6 L62 6 L64 30 L70 40 L84 94 L16 94 L30 40 L36 30 Z', detail: 'M35 38 L65 38' },
  sneaker: { body: 'M8 64 Q9 46 24 44 L40 48 Q50 52 62 56 Q86 58 92 66 L92 74 L8 74 Z', detail: 'M8 68 L92 68 M30 48 L36 56 M38 50 L44 58' },
  boot: { body: 'M22 18 L46 18 L48 52 Q70 54 86 60 Q92 64 92 74 L18 74 L20 50 Z', detail: 'M18 69 L92 69 M46 24 L46 50' },
  dressShoe: { body: 'M8 66 Q10 52 26 50 Q46 50 62 56 Q84 58 92 66 L92 72 L8 72 Z', detail: 'M8 69 L92 69 M28 52 Q36 60 46 54' },
  sandal: { body: 'M10 70 Q12 62 30 62 L84 62 Q92 64 92 70 L92 74 L10 74 Z', detail: 'M40 62 Q50 46 60 62' },
  watch: { body: 'M42 6 L58 6 L60 32 Q72 38 72 50 Q72 62 60 68 L58 94 L42 94 L40 68 Q28 62 28 50 Q28 38 40 32 Z', detail: 'M50 50 L50 42 M50 50 L56 54' },
  belt: { body: 'M4 42 L96 42 L96 58 L4 58 Z', detail: 'M64 38 L78 38 L78 62 L64 62 Z M70 50 L84 50' },
  cap: { body: 'M20 60 Q20 26 50 26 Q80 26 80 60 Q90 62 96 70 L20 70 Z', detail: 'M50 26 L50 60' },
  beanie: { body: 'M22 68 Q20 22 50 20 Q80 22 78 68 Z M20 66 L80 66 L80 82 L20 82 Z', detail: 'M30 70 L30 80 M40 70 L40 80 M50 70 L50 80 M60 70 L60 80 M70 70 L70 80' },
  scarf: { body: 'M30 10 L70 10 L70 30 L60 30 L64 92 L48 92 L46 30 L30 30 Z', detail: 'M48 86 L64 86' },
  gloves: { body: 'M30 92 L30 50 L24 38 L30 34 L36 44 L36 14 L42 14 L44 38 L46 10 L52 10 L52 38 L56 14 L62 14 L60 40 L66 22 L72 24 L68 60 L66 92 Z', detail: 'M30 82 L66 82' },
  glasses: { body: 'M8 44 L46 44 L44 62 Q40 68 28 68 Q12 68 10 58 Z M54 44 L92 44 L90 58 Q88 68 72 68 Q60 68 56 62 Z', detail: 'M46 48 Q50 44 54 48' },
  tie: { body: 'M44 8 L56 8 L58 18 L54 22 L64 80 L50 94 L36 80 L46 22 L42 18 Z', detail: 'M44 18 L56 18' },
  bag: { body: 'M18 36 L82 36 L86 90 L14 90 Z', detail: 'M36 36 Q36 14 50 14 Q64 14 64 36' },
  backpack: { body: 'M26 24 Q26 12 50 12 Q74 12 74 24 L76 90 L24 90 Z', detail: 'M34 56 L66 56 L66 78 L34 78 Z M44 12 Q50 4 56 12' },
  jewelry: { body: 'M50 18 A32 32 0 1 1 49.9 18 Z M50 30 A20 20 0 1 0 50.1 30 Z', detail: '' },
};

const BY_TYPE = {
  tshirt: 'tee', undershirt: 'tee', 'graphic-tee': 'tee', polo: 'tee', tank: 'tank',
  longsleeve: 'knit', henley: 'knit', turtleneck: 'knit',
  oxford: 'shirt', 'dress-shirt': 'shirt', flannel: 'shirt', 'linen-shirt': 'shirt', blouse: 'shirt',
  sweater: 'knit', sweatshirt: 'knit', 'quarter-zip': 'knit', cardigan: 'knit', vest: 'tank', fleece: 'knit', hoodie: 'hoodie',
  'denim-jacket': 'jacket', bomber: 'jacket', 'leather-jacket': 'jacket', overshirt: 'jacket', 'chore-jacket': 'jacket',
  blazer: 'jacket', 'suit-jacket': 'jacket', 'rain-jacket': 'jacket', windbreaker: 'jacket', puffer: 'jacket',
  overcoat: 'coat', trench: 'coat', parka: 'coat',
  jeans: 'trousers', chinos: 'trousers', trousers: 'trousers', corduroys: 'trousers', cargo: 'trousers', leggings: 'trousers',
  joggers: 'joggers', shorts: 'shorts', 'athletic-shorts': 'shorts', skirt: 'skirt',
  dress: 'dress', jumpsuit: 'dress',
  sneakers: 'sneaker', 'leather-sneakers': 'sneaker', canvas: 'sneaker', runners: 'sneaker',
  boots: 'boot', chelsea: 'boot', loafers: 'dressShoe', 'dress-shoes': 'dressShoe', 'suede-shoes': 'dressShoe', heels: 'dressShoe',
  sandals: 'sandal',
  watch: 'watch', belt: 'belt', cap: 'cap', beanie: 'beanie', scarf: 'scarf', gloves: 'gloves', sunglasses: 'glasses',
  tie: 'tie', necklace: 'jewelry', bracelet: 'jewelry', ring: 'jewelry', earrings: 'jewelry', bag: 'bag', backpack: 'backpack',
};

const NS = 'http://www.w3.org/2000/svg';

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

let uid = 0;

export function silhouette(typeKey, hex = '#8a8c8f', pattern = 'solid') {
  const shape = SHAPES[BY_TYPE[typeKey]] || SHAPES.tee;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'silhouette');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', TYPE[typeKey]?.label || 'Garment');
  const body = document.createElementNS(NS, 'path');
  body.setAttribute('d', shape.body);
  body.setAttribute('fill', hex);
  body.setAttribute('fill-rule', 'evenodd');
  // A light outline lets black garments read on a dark tile.
  body.setAttribute('stroke', luminance(hex) < 0.25 ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.25)');
  body.setAttribute('stroke-width', '1.2');
  body.setAttribute('stroke-linejoin', 'round');
  svg.append(body);
  // Stripes and checks drawn inside the garment outline.
  if (pattern === 'stripes' || pattern === 'check') {
    const id = `sil${++uid}`;
    const clip = document.createElementNS(NS, 'clipPath');
    clip.setAttribute('id', id);
    const cp = document.createElementNS(NS, 'path');
    cp.setAttribute('d', shape.body);
    clip.append(cp);
    svg.append(clip);
    const g = document.createElementNS(NS, 'path');
    let d = '';
    for (let y = 4; y < 100; y += 7) d += `M0 ${y} H100 `;
    if (pattern === 'check') for (let x = 4; x < 100; x += 7) d += `M${x} 0 V100 `;
    g.setAttribute('d', d);
    g.setAttribute('stroke', luminance(hex) < 0.45 ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.22)');
    g.setAttribute('stroke-width', pattern === 'check' ? '2.4' : '2');
    g.setAttribute('clip-path', `url(#${id})`);
    svg.append(g);
  }
  if (shape.detail) {
    const d = document.createElementNS(NS, 'path');
    d.setAttribute('d', shape.detail);
    d.setAttribute('fill', 'none');
    d.setAttribute('stroke', luminance(hex) < 0.45 ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.28)');
    d.setAttribute('stroke-width', '1.6');
    d.setAttribute('stroke-linecap', 'round');
    d.setAttribute('stroke-linejoin', 'round');
    svg.append(d);
  }
  return svg;
}
