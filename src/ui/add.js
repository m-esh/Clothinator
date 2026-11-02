// Adding and editing an item: photo → cut-out → AI guess → short form.

import { h, sheet, toast, stepper, clear } from './dom.js';
import * as store from '../data/store.js';
import { CATEGORIES, TYPES, TYPE, PATTERNS, FABRICS, defaultsFor } from '../core/catalog.js';
import { COLORS, COLOR } from '../core/color.js';

let D = null; // the draft

const blank = () => ({
  stage: 'pick',
  editingId: null,
  status: null,
  result: null, // { cutout, thumb, original, colors, method, canvas }
  previewURL: null,
  guess: null,
  guessing: false,
  touched: { name: false, type: false, pattern: false, fabric: false, colors: false },
  f: { name: '', type: null, fabric: null, pattern: null, colors: [], formality: undefined, warmth: undefined, comfort: undefined, rain: undefined, notes: '' },
  photosChanged: false,
});

const short = (typeKey) => TYPE[typeKey]?.label.split(' / ')[0].toLowerCase() || '';
const autoName = () => [D.f.colors[0]?.name, short(D.f.type)].filter(Boolean).join(' ');

export function resetAdd() {
  if (D?.previewURL) URL.revokeObjectURL(D.previewURL);
  D = null;
}

export async function renderAdd(root, rerender, editId = null) {
  if (!D || D.editingId !== editId) {
    resetAdd();
    D = blank();
    if (editId) {
      const i = store.itemById(editId);
      if (!i) { root.append(h('p', null, 'Item not found.')); return; }
      D.editingId = editId;
      D.stage = 'form';
      D.f = { name: i.name || '', type: i.type, fabric: i.fabric || null, pattern: i.pattern || null, colors: [...(i.colors || [])], formality: i.formality, warmth: i.warmth, comfort: i.comfort, rain: i.rain, notes: i.notes || '' };
      D.touched = { name: true, type: true, pattern: true, fabric: true, colors: true };
      if (i.hasPhoto) {
        const b = await store.photoBlob(editId, 'cutout');
        if (b) D.previewURL = URL.createObjectURL(b);
      }
    }
  }

  root.append(h('div', { class: 'row between', style: { marginBottom: '14px' } },
    h('a', { class: 'link small', href: D.editingId ? `#item/${D.editingId}` : '#closet', onclick: () => resetAdd() }, D.editingId ? '← Back' : '← Closet')));
  root.append(h('h1', { style: { marginBottom: '18px' } }, D.editingId ? 'Edit' : 'Add a piece'));

  if (D.stage === 'pick') root.append(pickStage(rerender));
  else if (D.stage === 'processing') root.append(processingStage());
  else root.append(formStage(rerender));
}

// ── 1. photo ────────────────────────────────────────────────

function fileInput(label, capture, rerender, primary) {
  return h('label', { class: `btn ${primary ? '' : 'ghost'} file-btn` }, label,
    h('input', { type: 'file', accept: 'image/*', capture: capture ? 'environment' : null, onchange: (e) => {
      const file = e.target.files?.[0];
      if (file) runPhoto(file, 'auto', rerender);
    } }));
}

function pickStage(rerender) {
  return h('div', null,
    h('div', { class: 'drop' },
      h('h3', null, 'One piece, flat on the floor'),
      h('p', { class: 'muted small', style: { marginBottom: 0 } }, 'Fill most of the frame. A plain floor and daylight give the cleanest cut-out. Everything is processed on this phone.'),
      h('div', { class: 'row wrap' }, fileInput('Take photo', true, rerender, true), fileInput('From library', false, rerender, false))),
    h('button', { class: 'link small', style: { marginTop: '16px' }, onclick: () => { D.stage = 'form'; rerender(); } }, 'Add without a photo'));
}

async function runPhoto(source, method, rerender) {
  D.stage = 'processing';
  D.status = { text: 'Reading photo' };
  rerender();
  const { processPhoto, guess } = await import('../vision/photo.js');
  try {
    const r = await processPhoto(source, {
      method,
      onStatus: (s) => { D.status = s; updateProgress(); },
    });
    D.result = r;
    D.photosChanged = true;
    if (D.previewURL) URL.revokeObjectURL(D.previewURL);
    D.previewURL = URL.createObjectURL(r.cutout);
    if (!D.touched.colors) D.f.colors = r.colors.slice(0, 3).map(({ name, share }) => ({ name, share }));
    if (!D.touched.name) D.f.name = autoName();
    D.stage = 'form';
    rerender();

    if (D.guess || D.editingId) return;
    D.guessing = true;
    rerender();
    try {
      D.guess = await guess(r.canvas, (s) => { D.status = s; updateProgress(); });
      if (!D.touched.type) D.f.type = D.guess.type;
      if (!D.touched.pattern) D.f.pattern = TYPE[D.guess.type]?.cat === 'accessory' ? 'solid' : D.guess.pattern;
      if (!D.touched.fabric) D.f.fabric = D.guess.fabric;
      if (!D.touched.name) D.f.name = autoName();
    } catch (e) {
      console.warn('recognition unavailable', e);
      D.guess = { failed: true };
    }
    D.guessing = false;
    rerender();
  } catch (e) {
    console.error(e);
    D.stage = D.editingId ? 'form' : 'pick';
    toast('Couldn\'t read that photo');
    rerender();
  }
}

// Progress is written straight into whatever is on screen, so it keeps
// working when the page is patched in place.
function updateProgress() {
  if (!D?.status) return;
  const text = document.querySelector('.js-progress-text');
  const bar = document.querySelector('.js-progress-bar');
  if (text) text.textContent = D.status.text;
  if (bar) {
    const p = D.status.progress;
    bar.classList.toggle('indet', p == null);
    bar.firstChild.style.width = p == null ? '' : `${Math.round(p * 100)}%`;
  }
}

function processingStage() {
  const text = h('div', { class: 'muted js-progress-text' }, D.status?.text || 'Working');
  const bar = h('div', { class: 'progress indet js-progress-bar' }, h('div'));
  requestAnimationFrame(updateProgress);
  return h('div', { class: 'drop' }, text, bar,
    h('p', { class: 'tiny faint', style: { marginBottom: 0 } }, 'The first photo downloads the on-phone models (about 135 MB, once). After that it takes a few seconds and works offline.'));
}

// ── 2. form ─────────────────────────────────────────────────

function formStage(rerender) {
  const f = D.f;
  const wrap = h('div');

  // preview + background choice
  if (D.previewURL) {
    wrap.append(h('div', { class: 'hero' }, h('img', { src: D.previewURL, alt: '' })));
    if (D.result || D.editingId) {
      const method = D.result?.method;
      wrap.append(h('div', { class: 'row between', style: { marginTop: '8px' } },
        h('span', { class: 'tiny faint' }, method === 'ai' ? 'Background removed by on-phone AI' : method === 'classic' ? 'Background removed (simple mode)' : method === 'none' ? 'Original background kept' : ''),
        h('button', { class: 'link small', onclick: () => backgroundSheet(rerender) }, 'Redo background')));
    }
  } else if (!D.editingId) {
    wrap.append(h('div', { class: 'row wrap' }, fileInput('Take photo', true, rerender, false), fileInput('From library', false, rerender, false)));
  }

  if (D.guessing) {
    const text = h('span', { class: 'js-progress-text' }, D.status?.text || 'Working out what it is');
    const bar = h('div', { class: 'progress indet js-progress-bar' }, h('div'));
    wrap.append(h('div', { class: 'ai-note', style: { marginTop: '14px' } }, text, bar));
  }

  const form = h('div', { style: { marginTop: '22px' } });
  wrap.append(form);

  // what is it
  const typeSelect = h('select', { class: 'input', onchange: (e) => {
    f.type = e.target.value || null;
    D.touched.type = true;
    if (!D.touched.name) f.name = autoName();
    if (f.type && TYPE[f.type].cat === 'accessory') f.pattern = f.pattern || 'solid';
    rerender();
  } },
  h('option', { value: '' }, D.guessing ? 'Working it out…' : 'Choose…'),
  CATEGORIES.map((c) => h('optgroup', { label: c.label },
    TYPES.filter((t) => t.cat === c.key).map((t) => h('option', { value: t.key, selected: f.type === t.key }, t.label)))));
  form.append(h('label', { class: 'field' }, h('span', { class: 'label' }, 'What is it'), typeSelect));
  if (D.guess?.options && !D.touched.type) {
    form.append(h('div', { class: 'ai-note' }, 'Best guesses: ',
      h('span', { class: 'chips', style: { display: 'inline-flex', marginTop: '6px' } },
        D.guess.options.map((k) => h('button', { class: 'chip', 'aria-pressed': String(f.type === k), onclick: () => {
          f.type = k; D.touched.type = true; if (!D.touched.name) f.name = autoName(); rerender();
        } }, TYPE[k].label)))));
  } else if (D.guess?.failed) {
    form.append(h('div', { class: 'ai-note' }, 'Couldn\'t load the recognition model, so pick the type yourself.'));
  }

  // name
  form.append(h('label', { class: 'field' }, h('span', { class: 'label' }, 'Name'),
    h('input', { class: 'input', value: f.name, placeholder: 'e.g. navy oxford', autocapitalize: 'none', oninput: (e) => { f.name = e.target.value; D.touched.name = true; } })));

  // colours
  form.append(h('div', { class: 'field' }, h('span', { class: 'label' }, 'Colours'),
    h('div', { class: 'chips' },
      f.colors.map((c, idx) => h('button', { class: 'chip', title: 'Remove', onclick: () => {
        f.colors.splice(idx, 1); D.touched.colors = true; if (!D.touched.name) f.name = autoName(); rerender();
      } }, h('span', { class: 'swatch', style: { background: COLOR[c.name]?.hex } }), c.name, h('span', { class: 'faint' }, '×'))),
      h('button', { class: 'chip', onclick: () => colourSheet(rerender) }, '+ colour')),
    f.colors.length > 1 ? h('div', { class: 'tiny faint', style: { marginTop: '6px' } }, 'The first colour is treated as the main one.') : null));

  // pattern
  if (!f.type || TYPE[f.type].cat !== 'accessory') {
    form.append(h('div', { class: 'field' }, h('span', { class: 'label' }, 'Pattern'),
      h('div', { class: 'chips' }, PATTERNS.map((p) => h('button', {
        class: 'chip', 'aria-pressed': String((f.pattern || TYPE[f.type]?.pattern || 'solid') === p.key),
        onclick: () => { f.pattern = p.key; D.touched.pattern = true; rerender(); },
      }, p.label)))));
  }

  // fabric
  form.append(h('label', { class: 'field' }, h('span', { class: 'label' }, 'Fabric'),
    h('select', { class: 'input', onchange: (e) => { f.fabric = e.target.value || null; D.touched.fabric = true; rerender(); } },
      h('option', { value: '' }, 'Not sure'),
      FABRICS.map((x) => h('option', { value: x.key, selected: f.fabric === x.key }, x.label)))));

  // fine-tune
  if (f.type) {
    const d = defaultsFor(f.type, f.fabric);
    const num = (key, label, hint) => h('div', { class: 'scale-row' },
      h('div', null, h('div', null, label), h('div', { class: 'tiny faint' }, f[key] === undefined ? `auto · ${hint}` : hint)),
      h('div', { class: 'row' },
        f[key] !== undefined ? h('button', { class: 'link tiny', onclick: () => { f[key] = undefined; rerender(); } }, 'reset') : null,
        stepper(f[key] ?? d[key], { min: key === 'comfort' ? 1 : 0, max: 5, step: 0.5, onChange: (v) => { f[key] = v; } })));
    form.append(h('details', { class: 'more' },
      h('summary', null, 'Fine-tune'),
      h('p', { class: 'tiny faint' }, 'Starting values come from the type and fabric. Only change them if this piece is unusual, like a jacket that\'s warmer than it looks.'),
      num('formality', 'Dressiness', '0 gym · 5 black tie'),
      num('warmth', 'Warmth', '0 none · 5 parka'),
      num('comfort', 'Comfort', '1 endure · 5 pyjamas'),
      h('div', { class: 'scale-row' },
        h('div', null, h('div', null, 'Rain'), h('div', { class: 'tiny faint' }, f.rain === undefined ? `auto · ${rainLabel(d.rain)}` : '')),
        h('div', { class: 'seg quiet', style: { width: '210px' } },
          [['ok', 'Fine'], ['neutral', 'Meh'], ['bad', 'Avoid']].map(([k, l]) => h('button', {
            'aria-pressed': String((f.rain ?? d.rain) === k), onclick: () => { f.rain = k; rerender(); },
          }, l)))),
    ));
  }

  form.append(h('label', { class: 'field', style: { marginTop: '22px' } }, h('span', { class: 'label' }, 'Notes'),
    h('textarea', { class: 'input', rows: 2, placeholder: 'Optional', oninput: (e) => { f.notes = e.target.value; } }, f.notes)));

  form.append(h('button', { class: 'btn block', style: { marginTop: '24px' }, disabled: !f.type, onclick: () => save() }, D.editingId ? 'Save changes' : 'Add to closet'));
  if (!f.type) form.append(h('div', { class: 'tiny faint', style: { marginTop: '6px' } }, 'Choose what it is first.'));
  return wrap;
}

const rainLabel = (r) => (r === 'ok' ? 'fine in rain' : r === 'bad' ? 'avoid rain' : 'not great in rain');

function colourSheet(rerender) {
  sheet('Add a colour', (close) => h('div', { class: 'palette-pick' },
    COLORS.map((c) => h('button', { class: 'chip', onclick: () => {
      D.f.colors = D.f.colors.filter((x) => x.name !== c.name);
      D.f.colors.push({ name: c.name, share: D.f.colors.length ? 0.3 : 0.9 });
      D.touched.colors = true;
      if (!D.touched.name) D.f.name = autoName();
      close();
      rerender();
    } }, h('span', { class: 'swatch', style: { background: c.hex } }), c.name))));
}

function backgroundSheet(rerender) {
  sheet('Redo background', (close) => {
    const go = async (method) => {
      close();
      const src = D.result?.original || (D.editingId && await store.photoBlob(D.editingId, 'original'));
      if (!src) { toast('The original photo isn\'t stored for this item'); return; }
      runPhoto(src, method, rerender);
    };
    return h('div', null,
      h('button', { class: 'alt', onclick: () => go('ai') }, h('div', { class: 'grow' }, h('div', null, 'On-phone AI'), h('div', { class: 'why-short' }, 'Best on busy floors. Downloads a model once.'))),
      h('button', { class: 'alt', onclick: () => go('classic') }, h('div', { class: 'grow' }, h('div', null, 'Simple'), h('div', { class: 'why-short' }, 'Fast, works offline, needs a plain floor.'))),
      h('button', { class: 'alt', onclick: () => go('none') }, h('div', { class: 'grow' }, h('div', null, 'Keep the original'), h('div', { class: 'why-short' }, 'No cut-out.'))),
      h('div', { style: { marginTop: '14px' } }, h('label', { class: 'btn ghost small file-btn' }, 'Use a different photo',
        h('input', { type: 'file', accept: 'image/*', onchange: (e) => { const file = e.target.files?.[0]; if (file) { close(); runPhoto(file, 'auto', rerender); } } }))),
    );
  });
}

async function save() {
  const f = D.f;
  const fields = {
    name: f.name.trim() || autoName(),
    type: f.type,
    fabric: f.fabric || undefined,
    pattern: f.pattern || undefined,
    colors: f.colors,
    formality: f.formality,
    warmth: f.warmth,
    comfort: f.comfort,
    rain: f.rain,
    notes: f.notes.trim() || undefined,
  };
  const photos = D.photosChanged && D.result ? { cutout: D.result.cutout, thumb: D.result.thumb, original: D.result.original } : null;
  if (D.editingId) {
    const id = D.editingId;
    if (photos) await store.savePhotos(id, photos);
    await store.updateItem(id, { ...fields, ...(photos ? { hasPhoto: true, photoV: Date.now() } : {}) });
    resetAdd();
    location.hash = `#item/${id}`;
    toast('Saved');
  } else {
    await store.addItem(fields, photos);
    resetAdd();
    toast(`Added ${fields.name}`, { label: 'Add another', run: () => { location.hash = '#add'; } });
    location.hash = '#closet';
  }
}

export { clear };
