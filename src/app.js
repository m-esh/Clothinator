// Boot, routing and the tab bar.

import { h, clear } from './ui/dom.js';
import * as store from './data/store.js';
import { state } from './data/store.js';
import { renderToday } from './ui/today.js';
import { renderCloset, renderItem } from './ui/closet.js';
import { renderAdd } from './ui/add.js';
import { renderOutfits, renderBuilder } from './ui/outfits.js';
import { renderLaundry } from './ui/laundry.js';
import { renderSettings } from './ui/settings.js';
import { mountTabs, updateTabs } from './ui/tabbar.js';

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
  // Keep focus and scroll when re-rendering the same screen.
  const y = window.scrollY;
  clear(view).append(...frag.childNodes);
  const dir = updateTabs(r.name, { laundry: state.items.filter((i) => i.inLaundry).length });
  // Slide the new screen in from the side you moved towards.
  if (dir) {
    view.classList.remove('slide-l', 'slide-r');
    void view.offsetWidth;
    view.classList.add(dir > 0 ? 'slide-r' : 'slide-l');
  }
  if (key !== lastRoute) window.scrollTo(0, 0);
  else window.scrollTo(0, y);
  lastRoute = key;
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
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
