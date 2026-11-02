// The floating tab bar, Instagram/iOS 26 style: one glass highlight that
// springs between tabs, and that you can press and drag along the bar like a
// lens. Built once; route changes only move the highlight.

import { h } from './dom.js';

// Line icons in the SF Symbols spirit: 24px grid, 1.8 stroke, round ends.
const ICONS = {
  today: ['M12 3v2 M12 19v2 M4.6 4.6l1.4 1.4 M18 18l1.4 1.4 M3 12h2 M19 12h2 M4.6 19.4L6 18 M18 6l1.4-1.4', 'C12 12 4.2'],
  closet: ['M12 7.2a2.2 2.2 0 1 1 2.2 2.2c-1.2.5-2.2 1.1-2.2 2.3 M12 11.7L3.6 17.4c-.8.5-.4 1.6.5 1.6h15.8c.9 0 1.3-1.1.5-1.6L12 11.7z'],
  outfits: ['M12 3.5l8.5 4.5-8.5 4.5L3.5 8z M3.5 12l8.5 4.5 8.5-4.5 M3.5 16l8.5 4.5 8.5-4.5'],
  laundry: ['M3 6.5L5.6 19h12.8L21 6.5 M4.1 11.2c1.8-1.4 3.6-1.4 5.3 0s3.6 1.4 5.3 0 3.6-1.4 5.2 0'],
  settings: ['M4 7h9 M17 7h3 M4 17h3 M11 17h9', 'C15 7 2', 'C9 17 2'],
  leaderboard: ['M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0z M7.5 6H5a2.5 2.5 0 0 0 2.7 3.6 M16.5 6H19a2.5 2.5 0 0 1-2.7 3.6 M12 13v3.5 M8.5 20h7 M9.5 16.5h5V20h-5z'],
};
function icon(key) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'tab-icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const part of ICONS[key] || []) {
    let e;
    if (part.startsWith('C')) {
      const [cx, cy, r] = part.slice(1).trim().split(/\s+/);
      e = document.createElementNS(NS, 'circle');
      e.setAttribute('cx', cx); e.setAttribute('cy', cy); e.setAttribute('r', r);
    } else {
      e = document.createElementNS(NS, 'path');
      e.setAttribute('d', part);
    }
    svg.append(e);
  }
  return svg;
}

let nav = null;
let pill = null;
let links = [];
let tabs = [];
let current = -1;
let drag = null;
let suppressClick = false;

export function mountTabs(el, defs) {
  nav = el;
  tabs = defs;
  nav.textContent = '';
  pill = h('span', { class: 'tab-pill', 'aria-hidden': 'true' });
  links = defs.map(([key, label]) => h('a', { href: `#${key}`, draggable: 'false', 'aria-label': label },
    icon(key), h('span', { class: 'tab-label' }, label), h('span', { class: 'count' })));
  nav.append(pill, ...links);

  for (const a of links) {
    a.addEventListener('click', (e) => {
      if (suppressClick) { e.preventDefault(); suppressClick = false; }
    });
  }
  nav.addEventListener('pointerdown', onDown);
  nav.addEventListener('pointermove', onMove);
  nav.addEventListener('pointerup', onUp);
  nav.addEventListener('pointercancel', onCancel);
  window.addEventListener('resize', () => place(current, false));
}

// Returns the direction of travel (-1, 0, 1) for the page transition.
export function updateTabs(routeName, counts = {}) {
  const idx = tabs.findIndex(([, , owns]) => owns.includes(routeName));
  links.forEach((a, i) => {
    if (i === idx) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
    const c = counts[tabs[i][0]];
    a.lastChild.textContent = c ? String(c) : '';
  });
  const dir = current < 0 || idx === current ? 0 : idx > current ? 1 : -1;
  const first = current < 0;
  current = idx;
  if (!drag) place(idx, !first);
  return dir;
}

// A swipe in progress: slide the highlight part-way toward a neighbour.
// `progress` is -1…1 (negative = towards the previous tab).
export function previewTabs(progress) {
  if (!pill || current < 0) return;
  const to = current + Math.sign(progress);
  if (to < 0 || to >= links.length) return;
  const a = geometry(current), b = geometry(to);
  const t = Math.min(1, Math.abs(progress));
  pill.classList.add('tracking');
  pill.style.transform = `translateX(${a.x + (b.x - a.x) * t}px)`;
}

export function endPreview() {
  if (!pill) return;
  pill.classList.remove('tracking');
  place(current, true);
}

export const tabIndex = () => current;
export const tabKeys = () => tabs.map(([key]) => key);

function geometry(i) {
  const a = links[i];
  return { x: a.offsetLeft, w: a.offsetWidth };
}

function place(i, animate) {
  if (!pill || i < 0) return;
  const { x, w } = geometry(i);
  pill.classList.toggle('no-anim', !animate);
  pill.style.width = `${w}px`;
  pill.style.transform = `translateX(${x}px)`;
  if (!animate) {
    void pill.offsetWidth; // apply instantly, then re-enable transitions
    pill.classList.remove('no-anim');
  }
}

const nearest = (x) => {
  let best = 0, bd = Infinity;
  links.forEach((a, i) => {
    const c = a.offsetLeft + a.offsetWidth / 2;
    if (Math.abs(c - x) < bd) { bd = Math.abs(c - x); best = i; }
  });
  return best;
};

function localX(e) {
  return e.clientX - nav.getBoundingClientRect().left;
}

function onDown(e) {
  if (e.button !== 0) return;
  drag = { id: e.pointerId, startX: e.clientX, moved: false, hover: current };
  nav.setPointerCapture(e.pointerId);
  pill.classList.add('lens');
  follow(localX(e), true);
}

function onMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (Math.abs(e.clientX - drag.startX) > 6) drag.moved = true;
  follow(localX(e), false);
}

// Highlight follows the finger; past either end it resists and the whole bar
// stretches a little, the way iOS rubber-bands.
function follow(x, initial) {
  const w = geometry(Math.max(0, current)).w;
  const min = links[0].offsetLeft;
  const max = links[links.length - 1].offsetLeft + links[links.length - 1].offsetWidth - w;
  let left = x - w / 2;
  let over = 0;
  // Resist past the ends, and never more than a few pixels.
  const give = (d) => Math.sign(d) * Math.min(10, Math.abs(d) * 0.2);
  if (left < min) { over = left - min; left = min + give(over); }
  if (left > max) { over = left - max; left = max + give(over); }
  pill.classList.toggle('tracking', !initial);
  pill.style.transform = `translateX(${left}px)`;
  nav.style.setProperty('--stretch', String(1 + Math.min(0.035, Math.abs(over) / 900)));
  nav.style.setProperty('--origin', over < 0 ? 'right' : 'left');
  const hover = nearest(x);
  if (hover !== drag.hover) {
    drag.hover = hover;
    links.forEach((a, i) => a.classList.toggle('hover', i === hover));
  }
}

function end() {
  pill.classList.remove('lens', 'tracking');
  nav.style.setProperty('--stretch', '1');
  links.forEach((a) => a.classList.remove('hover'));
  drag = null;
}

function onUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const target = nearest(localX(e));
  end();
  // Navigate here for taps and drags alike: with pointer capture some
  // browsers never deliver the click to the link. Keyboard still uses it.
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 400);
  const href = links[target].getAttribute('href');
  if (location.hash !== href) location.hash = href;
  else place(current, true);
}

function onCancel() {
  if (!drag) return;
  end();
  place(current, true);
}
