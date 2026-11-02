// In-memory state, written through to IndexedDB. Screens read `state` and
// call the mutations below; `subscribe` re-renders after any change.

import * as db from './db.js';
import { emptyModel, record } from '../core/taste.js';
import { comboKey, assemble } from '../core/generate.js';
import { isoDate } from '../core/week.js';
import { stats } from '../core/catalog.js';

export const state = {
  items: [],
  outfits: [],
  wears: [],
  prefs: null,
  model: null,
  ready: false,
  version: 0,
};

const DEFAULT_PREFS = {
  unit: /^en-US|^en-LR|^my/.test(globalThis.navigator?.language || '') ? 'F' : 'C',
  from: 9,
  to: 17,
  neverPairs: [],
  location: null, // null = use the phone's location
  palette: 'graphite',
  lastBackupAt: null,
  backupSnoozedAt: null,
  createdAt: null,
};

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => {
  state.version = (state.version || 0) + 1;
  listeners.forEach((fn) => fn());
};
export const notify = emit;

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export async function load() {
  const [items, outfits, wears, prefs, model] = await Promise.all([
    db.all('items'), db.all('outfits'), db.all('wears'), db.get('kv', 'prefs'), db.get('kv', 'model'),
  ]);
  state.items = items.sort((a, b) => a.createdAt - b.createdAt);
  state.outfits = outfits.sort((a, b) => b.createdAt - a.createdAt);
  await dedupeOutfits(); // items are loaded above, which the check needs
  state.wears = wears.sort((a, b) => (a.date === b.date ? a.at - b.at : a.date < b.date ? -1 : 1));
  state.prefs = { ...DEFAULT_PREFS, ...(prefs || {}) };
  if (!state.prefs.createdAt) {
    state.prefs.createdAt = Date.now();
    await db.put('kv', state.prefs, 'prefs');
  }
  state.model = model || emptyModel();
  photoCache.clear();
  state.ready = true;
  // Ask iOS not to evict our storage. Granted more readily for installed apps.
  navigator.storage?.persist?.().catch(() => {});
  emit();
}

export const itemById = (id) => state.items.find((i) => i.id === id);

// ── items ───────────────────────────────────────────────────

export async function addItem(item, photos) {
  const now = Date.now();
  const full = {
    id: uid(),
    wears: 0,
    wearsSinceWash: 0,
    lastWorn: null,
    inLaundry: false,
    favorite: false,
    blocked: false,
    createdAt: now,
    ...item,
  };
  await savePhotos(full.id, photos);
  full.hasPhoto = !!photos?.cutout;
  full.photoV = now;
  await db.put('items', full);
  state.items.push(full);
  emit();
  return full;
}

export async function savePhotos(id, photos) {
  if (!photos) return;
  for (const [k, blob] of Object.entries(photos)) if (blob) await db.put('photos', blob, `${id}:${k}`);
  photoCache.delete(`${id}:thumb`);
  photoCache.delete(`${id}:cutout`);
}

export async function updateItem(id, patch) {
  const i = itemById(id);
  if (!i) return;
  Object.assign(i, patch);
  await db.put('items', i);
  emit();
}

export async function deleteItem(id) {
  state.items = state.items.filter((i) => i.id !== id);
  await db.del('items', id);
  for (const k of ['cutout', 'thumb', 'original']) await db.del('photos', `${id}:${k}`);
  for (const o of [...state.outfits]) {
    if (!o.itemIds.includes(id)) continue;
    o.itemIds = o.itemIds.filter((x) => x !== id);
    if (o.itemIds.length < 2) await deleteOutfit(o.id, false);
    else await db.put('outfits', o);
  }
  await dedupeOutfits();
  state.prefs.neverPairs = state.prefs.neverPairs.filter((p) => !p.includes(id));
  await db.put('kv', state.prefs, 'prefs');
  emit();
}

// ── laundry ─────────────────────────────────────────────────

export async function setLaundry(ids, inLaundry) {
  const today = isoDate();
  for (const id of ids) {
    const i = itemById(id);
    if (!i || i.inLaundry === inLaundry) continue;
    i.inLaundry = inLaundry;
    if (inLaundry) i.laundrySince = today;
    else {
      i.wearsSinceWash = 0;
      i.lastWashed = today;
      delete i.laundrySince;
    }
    await db.put('items', i);
  }
  emit();
}

// ── wearing ─────────────────────────────────────────────────

export const wearsOn = (date) => state.wears.filter((w) => w.date === date);

// Log an outfit as worn. A second log on the same day replaces the first
// (you changed your mind), so counts never double up.
export async function logWear(itemIds, mode, { date = isoDate(), weather = null, learnFrom = true } = {}) {
  for (const w of wearsOn(date)) await undoWear(w.id, false);
  const pieces = itemIds.map(itemById).filter(Boolean);
  const outfit = assemble(pieces);
  const wear = { id: uid(), date, at: Date.now(), itemIds: pieces.map((i) => i.id), combo: comboKey(outfit), mode, weather };
  for (const i of pieces) {
    i.wears = (i.wears || 0) + 1;
    i.wearsSinceWash = (i.wearsSinceWash || 0) + 1;
    i.prevLastWorn = i.lastWorn;
    i.lastWorn = date;
    await db.put('items', i);
  }
  state.wears.push(wear);
  await db.put('wears', wear);
  if (learnFrom) await learn(outfit, mode, 'wore');
  emit();
  return wear;
}

export async function undoWear(id, notify = true) {
  const w = state.wears.find((x) => x.id === id);
  if (!w) return;
  for (const iid of w.itemIds) {
    const i = itemById(iid);
    if (!i) continue;
    i.wears = Math.max(0, (i.wears || 0) - 1);
    i.wearsSinceWash = Math.max(0, (i.wearsSinceWash || 0) - 1);
    // Recover the previous last-worn date from the log.
    const earlier = state.wears.filter((x) => x.id !== id && x.itemIds.includes(iid)).map((x) => x.date).sort();
    i.lastWorn = earlier.length ? earlier[earlier.length - 1] : null;
    await db.put('items', i);
  }
  state.wears = state.wears.filter((x) => x.id !== id);
  await db.del('wears', id);
  if (notify) emit();
}

// ── saved outfits ───────────────────────────────────────────

// Two outfits are the same if they have the same clothes, in any order.
// Accessories don't count: the same outfit with a watch is still that outfit.
export function clothesKey(itemIds) {
  return itemIds
    .filter((id) => { const i = itemById(id); return !i || stats(i).cat !== 'accessory'; })
    .sort()
    .join('+');
}

// Saving an outfit you already have returns the existing one instead of
// making a copy (`duplicate: true` tells the caller).
export async function saveOutfit(itemIds, { name = '', mode = null, learnFrom = true } = {}) {
  const existing = findSaved(itemIds);
  if (existing) return { ...existing, duplicate: true };
  const o = { id: uid(), itemIds: [...itemIds], name, mode, createdAt: Date.now() };
  state.outfits.unshift(o);
  await db.put('outfits', o);
  if (learnFrom && mode) await learn(assemble(itemIds.map(itemById).filter(Boolean)), mode, 'saved');
  emit();
  return o;
}

// Refuses (returns the clashing outfit) if the edit would turn it into a copy
// of another saved outfit.
export async function updateOutfit(id, patch) {
  const o = state.outfits.find((x) => x.id === id);
  if (!o) return null;
  if (patch.itemIds) {
    const clash = findSaved(patch.itemIds, id);
    if (clash) return { ...clash, duplicate: true };
  }
  Object.assign(o, patch);
  await db.put('outfits', o);
  emit();
}

export async function deleteOutfit(id, notify = true) {
  state.outfits = state.outfits.filter((o) => o.id !== id);
  await db.del('outfits', id);
  if (notify) emit();
}

export const findSaved = (itemIds, exceptId = null) => {
  const key = clothesKey([...itemIds]);
  return state.outfits.find((o) => o.id !== exceptId && clothesKey([...o.itemIds]) === key);
};

// Merge outfits that have become copies of each other (older versions of
// the app, or deleting a piece that made two outfits identical). Keeps the
// oldest, and its name, or the first name any copy had.
async function dedupeOutfits() {
  const byKey = new Map();
  for (const o of [...state.outfits].sort((a, b) => a.createdAt - b.createdAt)) {
    const key = clothesKey([...o.itemIds]);
    const keep = byKey.get(key);
    if (!keep) { byKey.set(key, o); continue; }
    if (!keep.name && o.name) { keep.name = o.name; await db.put('outfits', keep); }
    state.outfits = state.outfits.filter((x) => x.id !== o.id);
    await db.del('outfits', o.id);
  }
}

// ── prefs, taste, session ───────────────────────────────────

export async function updatePrefs(patch) {
  Object.assign(state.prefs, patch);
  await db.put('kv', state.prefs, 'prefs');
  emit();
}

export async function learn(outfit, mode, signal) {
  record(state.model, outfit, mode, signal);
  await db.put('kv', state.model, 'model');
}

export async function resetTaste() {
  state.model = { b: 0, w: {}, n: 0 };
  await db.put('kv', state.model, 'model');
  emit();
}

export const getKV = (k) => db.get('kv', k);
export const setKV = (k, v) => db.put('kv', v, k);

// ── photos ──────────────────────────────────────────────────

const photoCache = new Map();

export const cachedPhotoURL = (id, kind = 'thumb') => photoCache.get(`${id}:${kind}`);

export async function photoURL(id, kind = 'thumb') {
  const key = `${id}:${kind}`;
  if (photoCache.has(key)) return photoCache.get(key);
  const blob = await db.get('photos', key);
  const url = blob ? URL.createObjectURL(blob) : null;
  photoCache.set(key, url);
  return url;
}

export const photoBlob = (id, kind) => db.get('photos', `${id}:${kind}`);
