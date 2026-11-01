// The floating tab bar, Instagram/iOS 26 style: one glass highlight that
// springs between tabs, and that you can press and drag along the bar like a
// lens. Built once; route changes only move the highlight.

import { h } from './dom.js';

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
  links = defs.map(([key, label]) => h('a', { href: `#${key}`, draggable: 'false' },
    h('span', { class: 'tab-label' }, label), h('span', { class: 'count' })));
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
