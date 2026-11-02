// Swipe between sections, iOS style.
//
// On a main section, a horizontal swipe moves to the neighbouring tab: the
// page follows your finger, the tab highlight follows the page, and letting
// go past a third of the screen (or with a quick flick) commits. On a
// deeper page (an item, the builder, adding a piece), swiping right goes
// back. Vertical scrolling, horizontal strips and open sheets are left
// alone.

import { previewTabs, endPreview, tabKeys } from './tabbar.js';

const PARENT = { item: '#closet', add: '#closet', build: '#outfits' };
const routeName = () => location.hash.replace(/^#\/?/, '').split('/')[0] || 'today';
// Read from the address, which changes the moment you navigate, rather than
// from what's drawn (one frame behind).
const tabIndex = () => tabKeys().indexOf(routeName());

function parentOf(name) {
  if (name === 'edit') return `#item/${location.hash.split('/')[1] || ''}`;
  return PARENT[name] || null;
}

// Does the touch start inside something that scrolls sideways itself?
function scrollsSideways(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.matches?.('input, textarea, select, .tabs, .sheet, .scrim, #intro')) return true;
    if (n.scrollWidth > n.clientWidth + 2) {
      const o = getComputedStyle(n).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
  }
  return false;
}

export function enableSwipes(view, { go }) {
  let s = null;

  const reset = (animate) => {
    view.style.transition = animate ? 'transform 0.38s cubic-bezier(0.3, 1.3, 0.45, 1), opacity 0.3s' : 'none';
    view.style.transform = '';
    view.style.opacity = '';
    endPreview();
  };

  // Move/end listeners go on the touched element itself: if a re-render
  // replaces it mid-gesture, the browser keeps sending the gesture to that
  // (now detached) element, and a listener on the page would never hear it.
  let target = null;
  const detach = () => {
    if (!target) return;
    target.removeEventListener('touchmove', move);
    target.removeEventListener('touchend', end);
    target.removeEventListener('touchcancel', cancel);
    target = null;
  };

  view.addEventListener('touchstart', (e) => {
    detach();
    if (e.touches.length !== 1 || document.querySelector('.sheet:not(.out)') || scrollsSideways(e.target)) { s = null; return; }
    const t = e.touches[0];
    s = { x: t.clientX, y: t.clientY, t: performance.now(), dx: 0, lock: null };
    target = e.target;
    target.addEventListener('touchmove', move, { passive: false });
    target.addEventListener('touchend', end);
    target.addEventListener('touchcancel', cancel);
  }, { passive: true });

  function move(e) {
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.lock) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      s.lock = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'x' : 'y';
      if (s.lock === 'y') { s = null; detach(); return; }
      const name = routeName();
      const keys = tabKeys();
      s.tab = keys.indexOf(name) >= 0;
      s.back = !s.tab ? parentOf(name) : null;
      view.style.transition = 'none';
    }
    e.preventDefault(); // we own this gesture now; don't scroll
    const W = window.innerWidth;
    let x = dx;
    if (s.tab) {
      const i = tabIndex();
      const blocked = (dx > 0 && i <= 0) || (dx < 0 && i >= tabKeys().length - 1);
      if (blocked) x = dx * 0.18; // rubber-band at the ends
      else previewTabs(-dx / W);
    } else if (!s.back || dx < 0) {
      x = dx * 0.18;
    }
    s.dx = dx;
    view.style.transform = `translateX(${x}px)`;
    view.style.opacity = String(1 - Math.min(0.5, Math.abs(x) / W) * 0.6);
  }

  function end() {
    detach();
    if (!s || s.lock !== 'x') { s = null; return; }
    const W = window.innerWidth;
    const v = s.dx / Math.max(1, performance.now() - s.t); // px per ms
    const far = Math.abs(s.dx) > W * 0.33 || (Math.abs(v) > 0.45 && Math.abs(s.dx) > 40);
    let to = null, dir = 0;
    if (far && s.tab) {
      const i = tabIndex() + (s.dx < 0 ? 1 : -1);
      const keys = tabKeys();
      if (i >= 0 && i < keys.length) { to = `#${keys[i]}`; dir = s.dx < 0 ? 1 : -1; }
    } else if (far && s.back && s.dx > 0) {
      to = s.back;
      dir = -1;
    }
    s = null;
    if (!to) { reset(true); return; }
    // Finish the swipe off-screen, then show the new section sliding in.
    view.style.transition = 'transform 0.16s ease-in, opacity 0.16s ease-in';
    view.style.transform = `translateX(${dir > 0 ? -W * 0.35 : W * 0.35}px)`;
    view.style.opacity = '0';
    setTimeout(() => { reset(false); go(to, dir); }, 150);
  }

  function cancel() {
    detach();
    s = null;
    reset(true);
  }
}
