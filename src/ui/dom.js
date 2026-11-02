// Tiny DOM helpers. No framework: screens build a fresh tree with `h` on
// every change, and `morph` patches it into the live page so unchanged
// elements stay put (no image flashes, CSS transitions keep running, only
// genuinely new pieces animate in).

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') listen(el, k.slice(2).toLowerCase(), v);
      else if (k === 'key') el.dataset.key = v;
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sv == null) continue;
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      }
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

// Handlers live in a per-element table behind one shared listener, so
// `morph` can swap in the new render's closures without re-binding.
function dispatch(e) {
  const fn = this.__on?.[e.type];
  if (fn) return fn.call(this, e);
}
function listen(el, type, fn) {
  (el.__on ||= {})[type] = fn;
  el.addEventListener(type, dispatch);
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

// ── morph: patch `to`'s children into `from` ───────────────

const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-key') : null);
const same = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && keyOf(a) === keyOf(b);

export function morph(from, to) {
  const next = [...to.childNodes];
  let i = 0;
  for (const nb of next) {
    const na = from.childNodes[i];
    if (!na) { from.appendChild(nb); i++; continue; }
    if (same(na, nb)) { patch(na, nb); i++; continue; }
    // A keyed node that moved: find it further along and bring it here.
    const k = keyOf(nb);
    let found = null;
    if (k) {
      for (let j = i + 1; j < from.childNodes.length; j++) {
        const c = from.childNodes[j];
        if (keyOf(c) === k && c.nodeName === nb.nodeName) { found = c; break; }
      }
    }
    if (found) { from.insertBefore(found, na); patch(found, nb); }
    else from.insertBefore(nb, na);
    i++;
  }
  while (from.childNodes.length > i) from.lastChild.remove();
}

function patch(a, b) {
  if (a.nodeType === 3 || a.nodeType === 8) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  // attributes
  // A photo still loading in the new tree must not blank the one on screen.
  const keepSrc = a.nodeName === 'IMG' && !b.hasAttribute('src') && a.getAttribute('data-photo') === b.getAttribute('data-photo');
  for (const { name } of [...a.attributes]) {
    if (b.hasAttribute(name)) continue;
    if (a.nodeName === 'DETAILS' && name === 'open') continue;
    if (keepSrc && name === 'src') continue;
    a.removeAttribute(name);
  }
  for (const { name, value } of [...b.attributes]) {
    if (a.nodeName === 'DETAILS' && name === 'open') continue; // user's choice wins
    if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  }
  // handlers
  if (b.__on) {
    for (const type of Object.keys(b.__on)) if (!a.__on?.[type]) a.addEventListener(type, dispatch);
    a.__on = b.__on;
  } else if (a.__on) a.__on = null;
  // live form state: never fight the field you're typing in
  const tag = a.nodeName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    if (a !== document.activeElement && a.type !== 'file' && a.value !== b.value) a.value = b.value;
    if (a.checked !== b.checked) a.checked = b.checked;
    if (a.disabled !== b.disabled) a.disabled = b.disabled;
    if (tag === 'TEXTAREA') return;
  }
  if (tag === 'OPTION' && a.selected !== b.selected) a.selected = b.selected;
  if (tag === 'BUTTON' && a.disabled !== b.disabled) a.disabled = b.disabled;
  morph(a, b);
  if (tag === 'SELECT' && a !== document.activeElement) a.value = b.value;
}

// Bottom sheet. `build(close, redraw)` returns the content. Opens and closes
// with motion; drag it down by its top to dismiss.
export function sheet(title, build, { onClose } = {}) {
  const scrim = h('div', { class: 'scrim' });
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    scrim.classList.add('out');
    panel.classList.add('out'); // slides out from wherever a drag left it
    const done = () => { scrim.remove(); panel.remove(); };
    panel.addEventListener('animationend', done, { once: true });
    setTimeout(done, 400); // in case animations are off
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  const grab = h('div', { class: 'grab-zone' }, h('div', { class: 'grab' }));
  const inner = h('div', { class: 'sheet-inner' },
    grab,
    h('div', { class: 'sheet-head' }, h('span'), h('h2', null, title), h('button', { class: 'done', onclick: close }, 'Done')),
  );
  panel.append(inner);
  const body = h('div');
  inner.append(body);
  const render = () => {
    const fresh = h('div');
    append(fresh, [build(close, render)]);
    morph(body, fresh);
  };
  render();

  // drag to dismiss, from the handle or the title row
  let drag = null;
  const startDrag = (e) => {
    if (e.target.closest('button, a, input')) return;
    drag = { y: e.clientY, dy: 0, t: performance.now() };
    panel.classList.add('dragging');
    panel.setPointerCapture(e.pointerId);
  };
  grab.addEventListener('pointerdown', startDrag);
  inner.querySelector('.sheet-head').addEventListener('pointerdown', startDrag);
  panel.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.dy = e.clientY - drag.y;
    const dy = drag.dy > 0 ? drag.dy : drag.dy * 0.15; // resist upwards
    panel.style.transform = `translateY(${dy}px)`;
    scrim.style.opacity = String(Math.max(0.2, 1 - Math.max(0, dy) / 400));
  });
  const endDrag = () => {
    if (!drag) return;
    const v = drag.dy / Math.max(1, performance.now() - drag.t);
    panel.classList.remove('dragging');
    scrim.style.opacity = '';
    if (drag.dy > 110 || v > 0.6) close();
    else panel.style.transform = '';
    drag = null;
  };
  panel.addEventListener('pointerup', endDrag);
  panel.addEventListener('pointercancel', endDrag);

  document.body.append(scrim, panel);
  return { close, render };
}

let toastTimer = null;
const dismiss = (el) => {
  if (!el || el.classList.contains('out')) return;
  el.classList.add('out');
  el.addEventListener('animationend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 400);
};

export function toast(text, action) {
  dismiss(document.querySelector('.toast:not(.out)'));
  clearTimeout(toastTimer);
  const el = h('div', { class: 'toast', role: 'status' }, h('span', null, text));
  if (action) {
    el.append(h('button', { onclick: () => { dismiss(el); action.run(); } }, action.label));
  }
  document.body.append(el);
  toastTimer = setTimeout(() => dismiss(el), action ? 6000 : 2600);
}

export function confirmSheet(title, text, yes, onYes, { danger = false } = {}) {
  sheet(title, (close) => h('div', null,
    h('p', { class: 'muted', style: { marginTop: 0 } }, text),
    h('div', { class: 'row', style: { marginTop: '18px' } },
      h('button', { class: 'btn' + (danger ? '' : ''), style: danger ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : null, onclick: () => { close(); onYes(); } }, yes),
      h('button', { class: 'btn ghost', onclick: close }, 'Cancel'),
    ),
  ));
}

// iOS-style switch.
export function toggle(on, onChange, label) {
  return h('button', {
    class: 'switch',
    role: 'switch',
    'aria-checked': String(!!on),
    'aria-label': label,
    onclick: () => onChange(!on),
  }, h('span', { class: 'knob' }));
}

export function stepper(value, { min = 0, max = 5, step = 0.5, onChange, format = (v) => v }) {
  const val = h('span', { class: 'val' }, format(value));
  const set = (v) => {
    v = Math.min(max, Math.max(min, Math.round(v / step) * step));
    val.textContent = format(v);
    onChange(v);
  };
  let cur = value;
  return h('div', { class: 'stepper' },
    h('button', { 'aria-label': 'less', onclick: () => set((cur = Math.max(min, cur - step))) }, '−'),
    val,
    h('button', { 'aria-label': 'more', onclick: () => set((cur = Math.min(max, cur + step))) }, '+'),
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

export function shortDate(iso, today) {
  if (!iso) return 'never';
  if (iso === today) return 'today';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = Math.round((Date.parse(today) - Date.parse(iso)) / 86400000);
  if (days === 1) return 'yesterday';
  if (days < 7) return DAYS[dt.getDay()].slice(0, 3);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}
