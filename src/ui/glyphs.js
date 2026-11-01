// Garment-care symbols, drawn the way they appear on care labels.

const NS = 'http://www.w3.org/2000/svg';

function svg(paths, label) {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 20 15');
  el.setAttribute('class', 'glyph');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  for (const d of paths) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    el.append(p);
  }
  return el;
}

// The wash tub: in the laundry.
export const washTub = () => svg([
  'M1.5 3.5 L4 13.5 H16 L18.5 3.5',
  'M2.4 6.5 C4 5 5.5 5 7 6.5 S10 8 11.5 6.5 S15 5 17.6 6.5',
], 'In the laundry');
