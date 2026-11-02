// Boot, routing and the tab bar.

import { h, clear, morph } from './ui/dom.js';
import * as store from './data/store.js';
import { state } from './data/store.js';
import { renderToday } from './ui/today.js';
import { renderCloset, renderItem, clearHero } from './ui/closet.js';
import { renderAdd } from './ui/add.js';
import { renderOutfits, renderBuilder } from './ui/outfits.js';
import { renderLaundry } from './ui/laundry.js';
import { renderSettings } from './ui/settings.js';
import { mountTabs, updateTabs } from './ui/tabbar.js';
import { applyPalette } from './ui/palette.js';

const view = document.getElementById('view');
const tabs = document.getElementById('tabs');

const TABS = [
  ['today', 'Today', ['today']],
  ['closet', 'Closet', ['closet', 'item', 'add', 'edit']],
  ['outfits', 'Outfits', ['outfits', 'build']],
  ['laundry', 'Laundry', ['laundry']],
  ['settings', 'Settings', ['settings']],
];

const route = () => {
  const [name = 'today', arg = null] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'today', arg };
};

mountTabs(tabs, TABS);

let token = 0;
let lastRoute = null;

async function render() {
  if (!state.ready) return;
  const my = ++token;
  const r = route();
  const key = `${r.name}/${r.arg}`;
  const frag = h('div');
  applyPalette(state.prefs.palette);
  if (r.name !== 'today') delete document.documentElement.dataset.mode;
  const rerender = () => schedule();
  switch (r.name) {
    case 'closet': renderCloset(frag, rerender); break;
    case 'item': renderItem(frag, r.arg, rerender); break;
    case 'add': await renderAdd(frag, rerender); break;
    case 'edit': await renderAdd(frag, rerender, r.arg); break;
    case 'outfits': renderOutfits(frag, rerender); break;
    case 'build': renderBuilder(frag, rerender, r.arg); break;
    case 'laundry': renderLaundry(frag, rerender); break;
    case 'settings': renderSettings(frag, rerender); break;
    default: await renderToday(frag, rerender);
  }
  if (my !== token) return; // a newer render started meanwhile

  const counts = { laundry: state.items.filter((i) => i.inLaundry).length };

  // Same screen: patch in place. Unchanged elements stay put, so nothing
  // flickers and CSS transitions run.
  if (key === lastRoute) {
    morph(view, frag);
    updateTabs(r.name, counts);
    return;
  }

  // New screen: a page transition in the direction of travel.
  const kind = navKind(lastRoute, r);
  lastRoute = key;
  const swap = () => {
    clear(view).append(...frag.childNodes);
    updateTabs(r.name, counts);
    window.scrollTo(0, 0);
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !reduce && kind !== 'none') {
    document.documentElement.dataset.nav = kind;
    const t = document.startViewTransition(swap);
    t.finished.finally(() => {
      delete document.documentElement.dataset.nav;
      if (r.name !== 'item') clearHero();
    });
  } else {
    swap();
    if (kind === 'forward' || kind === 'back') {
      view.classList.remove('slide-l', 'slide-r');
      void view.offsetWidth;
      view.classList.add(kind === 'forward' ? 'slide-r' : 'slide-l');
    }
  }
}

const DEPTH = { item: 1, add: 1, build: 1, edit: 2 };
const tabOf = (name) => TABS.findIndex(([, , owns]) => owns.includes(name));

// 'forward' (deeper or a tab to the right), 'back', 'fade' or 'none'.
function navKind(prevKey, r) {
  if (!prevKey) return 'none';
  const prev = prevKey.split('/')[0];
  const dt = tabOf(r.name) - tabOf(prev);
  if (dt) return dt > 0 ? 'forward' : 'back';
  const dd = (DEPTH[r.name] || 0) - (DEPTH[prev] || 0);
  if (dd) return dd > 0 ? 'forward' : 'back';
  return 'fade';
}

let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; render(); });
}

window.addEventListener('hashchange', schedule);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(); });
store.subscribe(schedule);

store.load().catch((e) => {
  console.error(e);
  view.textContent = 'Couldn\'t open storage on this device. Private browsing blocks it. Open the app normally.';
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // When a new version takes over, reload once so you're not left running
  // the old code until the app is fully closed.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    // Check for a new version whenever the app comes back to the front.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
}
