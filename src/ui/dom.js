// Tiny DOM helpers. No framework: screens build elements with `h` and
// re-render whole when state changes.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

// Bottom sheet. `build(close)` returns the content. Resolves when closed.
export function sheet(title, build, { onClose } = {}) {
  const scrim = h('div', { class: 'scrim' });
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    scrim.remove();
    panel.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  const inner = h('div', { class: 'sheet-inner' },
    h('div', { class: 'grab' }),
    h('div', { class: 'sheet-head' }, h('h2', null, title), h('button', { class: 'link', onclick: close }, 'Close')),
  );
  panel.append(inner);
  const body = h('div');
  inner.append(body);
  const render = () => { clear(body); append(body, [build(close, render)]); };
  render();
  document.body.append(scrim, panel);
  return { close, render };
}

let toastTimer = null;
export function toast(text, action) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = h('div', { class: 'toast', role: 'status' }, h('span', null, text));
  if (action) {
    el.append(h('button', { onclick: () => { el.remove(); action.run(); } }, action.label));
  }
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), action ? 6000 : 2600);
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
