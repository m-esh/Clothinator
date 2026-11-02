// One-file backups: everything, photos included, as JSON. Save it to iCloud
// Drive (or anywhere) through the share sheet; restore it from Settings.

import * as db from './db.js';
import { state, load, updatePrefs } from './store.js';

// Internal format id kept from the app's first name so older backups still restore.
export const FORMAT = 'clothinator-backup';
export const VERSION = 1;

const toDataURL = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

export async function buildBackup() {
  const photos = {};
  for (const key of await db.keys('photos')) {
    const blob = await db.get('photos', key);
    if (blob) photos[key] = await toDataURL(blob);
  }
  const kv = {};
  for (const k of ['prefs', 'model']) {
    const v = await db.get('kv', k);
    if (v !== undefined) kv[k] = v;
  }
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    items: await db.all('items'),
    outfits: await db.all('outfits'),
    wears: await db.all('wears'),
    kv,
    photos,
  };
}

// Validate a parsed backup before anything is touched. Throws with a
// readable message; returns the data with photos still as data URLs.
export function checkBackup(data) {
  if (!data || typeof data !== 'object') throw new Error('Not a backup file.');
  if (data.format !== FORMAT) throw new Error('This isn\'t a Clad backup.');
  if (data.version > VERSION) throw new Error('This backup is from a newer version of the app.');
  for (const k of ['items', 'outfits', 'wears']) {
    if (!Array.isArray(data[k])) throw new Error(`Backup is damaged (${k} missing).`);
  }
  for (const i of data.items) {
    if (!i || typeof i.id !== 'string' || typeof i.type !== 'string') throw new Error('Backup is damaged (bad item).');
  }
  const ids = new Set(data.items.map((i) => i.id));
  for (const o of data.outfits) {
    if (!Array.isArray(o.itemIds)) throw new Error('Backup is damaged (bad outfit).');
    o.itemIds = o.itemIds.filter((id) => ids.has(id));
  }
  for (const w of data.wears) {
    if (typeof w.date !== 'string' || !Array.isArray(w.itemIds)) throw new Error('Backup is damaged (bad wear log).');
  }
  if (typeof data.photos !== 'object' || data.photos === null) throw new Error('Backup is damaged (photos missing).');
  for (const [k, v] of Object.entries(data.photos)) {
    if (typeof v !== 'string' || !v.startsWith('data:image/')) throw new Error(`Backup is damaged (photo ${k}).`);
  }
  return data;
}

export async function exportBackup() {
  const data = await buildBackup();
  const name = `clad-backup-${data.exportedAt.slice(0, 10)}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  let shared = false;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Clad backup' });
      shared = true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  if (!shared) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  await updatePrefs({ lastBackupAt: Date.now() });
  return true;
}

export async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('That file isn\'t readable as a backup.');
  }
  checkBackup(data);
  const photos = {};
  for (const [k, url] of Object.entries(data.photos)) photos[k] = await (await fetch(url)).blob();
  await db.replaceAll({ items: data.items, outfits: data.outfits, wears: data.wears, kv: data.kv || {}, photos });
  await load();
  return { items: state.items.length };
}

// Should Today show the monthly reminder?
export function backupDue(prefs, itemCount, now = Date.now()) {
  if (!itemCount) return false;
  const DAY = 86400000;
  if (prefs.backupSnoozedAt && now - prefs.backupSnoozedAt < 7 * DAY) return false;
  if (prefs.lastBackupAt) return now - prefs.lastBackupAt > 30 * DAY;
  return now - (prefs.createdAt || now) > 3 * DAY;
}
