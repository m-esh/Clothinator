// Named colours and colour harmony.
//
// Photos are read as raw pixels, then snapped to a named colour. Harmony is
// judged on the names, not the pixels: a lighting change shouldn't flip a
// navy shirt into a clash. Each name knows whether it behaves as a neutral
// (goes with anything), its hue, and whether it is loud.

export const COLORS = [
  // neutrals
  { name: 'black', hex: '#1b1b1c', neutral: true },
  { name: 'charcoal', hex: '#3c3e42', neutral: true },
  { name: 'grey', hex: '#8a8c8f', neutral: true },
  { name: 'light grey', hex: '#c8c9ca', neutral: true },
  { name: 'white', hex: '#f3f3f1', neutral: true },
  { name: 'cream', hex: '#ece3cf', neutral: true },
  { name: 'beige', hex: '#d6c4a3', neutral: true },
  { name: 'khaki', hex: '#b5a47c', neutral: true },
  { name: 'camel', hex: '#bf9566', neutral: true },
  { name: 'tan', hex: '#a9845a', neutral: true },
  { name: 'brown', hex: '#674630', neutral: true },
  { name: 'navy', hex: '#1f2a44', neutral: true },
  { name: 'denim', hex: '#4a6488', neutral: true },
  { name: 'light denim', hex: '#8ea7c3', neutral: true },
  { name: 'olive', hex: '#5d603b', neutral: true },
  // colours
  { name: 'blue', hex: '#2f5fb3', hue: 220, loud: true },
  { name: 'light blue', hex: '#a8c3e3', hue: 212, muted: true },
  { name: 'teal', hex: '#1f6f6f', hue: 180 },
  { name: 'green', hex: '#2f7d45', hue: 138, loud: true },
  { name: 'forest', hex: '#2b4a36', hue: 140, muted: true },
  { name: 'sage', hex: '#a2b39a', hue: 100, muted: true },
  { name: 'yellow', hex: '#e9c84a', hue: 48, loud: true },
  { name: 'mustard', hex: '#c69a30', hue: 42, muted: true },
  { name: 'orange', hex: '#e07a2f', hue: 25, loud: true },
  { name: 'rust', hex: '#a3472c', hue: 15, muted: true },
  { name: 'red', hex: '#c1302b', hue: 2, loud: true },
  { name: 'burgundy', hex: '#6d1f2d', hue: 350, muted: true },
  { name: 'pink', hex: '#e8a7b8', hue: 345, muted: true },
  { name: 'hot pink', hex: '#d63a7e', hue: 335, loud: true },
  { name: 'purple', hex: '#5f3b8c', hue: 272, loud: true },
  { name: 'lavender', hex: '#b9a8d6', hue: 265, muted: true },
];

export const COLOR = Object.fromEntries(COLORS.map((c) => [c.name, c]));

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// sRGB → CIE Lab (D65). Distances in Lab track what the eye sees far better
// than RGB, which is what makes "nearest named colour" behave.
export function rgbToLab([r, g, b]) {
  const lin = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export const labDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const LABS = COLORS.map((c) => ({ c, lab: rgbToLab(hexToRgb(c.hex)) }));

export function nearestColor(rgb) {
  const lab = rgbToLab(rgb);
  let best = null, bestD = Infinity;
  for (const { c, lab: l } of LABS) {
    // Lightness differences matter a little less than hue/chroma for naming
    // fabric in uneven light.
    const d = Math.hypot((lab[0] - l[0]) * 0.75, lab[1] - l[1], lab[2] - l[2]);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best.name;
}

const hueDiff = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const isBlackish = (n) => n === 'black' || n === 'charcoal';
const BIG = new Set(['top', 'bottom', 'onepiece', 'outer']);

// pieces: [{ cat, colors: [{ name, share }] }]
// Returns { score, notes } — score is roughly -3 … +1.
export function harmony(pieces) {
  const notes = [];
  let score = 0;

  // Chromatic colour mass per hue cluster. Accessories only count when loud;
  // a small coloured watch strap doesn't make an outfit "two colours".
  const groups = [];
  let loudPieces = 0;
  for (const p of pieces) {
    const weight = p.cat === 'accessory' ? 0.3 : p.cat === 'collar' ? 0.35 : p.cat === 'shoes' ? 0.6 : 1;
    let pieceLoud = false;
    for (const { name, share } of p.colors || []) {
      const c = COLOR[name];
      if (!c || c.neutral || share < 0.15) continue;
      if (p.cat === 'accessory' && !c.loud) continue;
      if (c.loud && share >= 0.35) pieceLoud = true;
      const g = groups.find((g) => hueDiff(g.hue, c.hue) <= 30);
      if (g) {
        g.mass += share * weight;
        g.muted = g.muted && !!c.muted;
      } else {
        groups.push({ hue: c.hue, mass: share * weight, muted: !!c.muted, name });
      }
    }
    if (pieceLoud && p.cat !== 'accessory') loudPieces++;
  }

  const real = groups.filter((g) => g.mass >= 0.12);
  if (real.length === 0) {
    score += 0.6;
    notes.push({ tone: 'good', text: 'all neutrals, nothing to clash' });
  } else if (real.length === 1) {
    score += 0.8;
    notes.push({ tone: 'good', text: `${real[0].name} as the one accent` });
  } else if (real.length === 2) {
    const [a, b] = real;
    const d = hueDiff(a.hue, b.hue);
    if (d <= 60) {
      score += 0.5;
      notes.push({ tone: 'good', text: `${a.name} and ${b.name} sit next to each other` });
    } else if (d >= 150) {
      if (a.muted || b.muted) {
        score += 0.3;
        notes.push({ tone: 'good', text: `${a.name} and ${b.name} balance each other` });
      } else {
        score -= 0.7;
        notes.push({ tone: 'warn', text: `${a.name} and ${b.name} are both loud opposites` });
      }
    } else if (a.muted && b.muted) {
      score -= 0.2;
    } else {
      score -= 1.2;
      notes.push({ tone: 'warn', text: `${a.name} and ${b.name} fight each other` });
    }
  } else {
    score -= 1.5 * (real.length - 2);
    notes.push({ tone: 'warn', text: `${real.length} different colours is a lot` });
  }

  if (loudPieces > 1) {
    score -= 0.8 * (loudPieces - 1);
    notes.push({ tone: 'warn', text: 'more than one loud piece' });
  }

  // Black next to navy in the two biggest pieces reads as a mismatch rather
  // than a choice.
  const dominant = pieces
    .filter((p) => BIG.has(p.cat) && p.colors?.length)
    .map((p) => p.colors[0].name);
  if (dominant.includes('black') && dominant.includes('navy')) {
    score -= 0.3;
    notes.push({ tone: 'warn', text: 'black against navy can look like a mistake' });
  }

  return { score, notes };
}

// Leather family for belt/shoe matching: black, brown, or neither.
export function leatherFamily(colors) {
  const n = colors?.[0]?.name;
  if (!n) return null;
  if (isBlackish(n)) return 'black';
  if (['brown', 'tan', 'camel', 'rust', 'burgundy'].includes(n)) return 'brown';
  return null;
}
