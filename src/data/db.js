// Thin promise wrapper around IndexedDB. Everything lives on the phone.

// Kept from the app's first name: renaming it would orphan saved data.
const NAME = 'clothinator';
const VERSION = 1;
export const STORES = ['items', 'photos', 'outfits', 'wears', 'kv'];

let dbp = null;

export function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('items', { keyPath: 'id' });
      db.createObjectStore('photos');
      db.createObjectStore('outfits', { keyPath: 'id' });
      db.createObjectStore('wears', { keyPath: 'id' });
      db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function tx(store, mode, fn) {
  const db = await open();
  const t = db.transaction(store, mode);
  const result = fn(t.objectStore(store));
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
  });
  return result instanceof IDBRequest ? result.result : result;
}

export const all = (store) => tx(store, 'readonly', (s) => s.getAll());
export const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
export const put = (store, value, key) => tx(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)));
export const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
export const clear = (store) => tx(store, 'readwrite', (s) => s.clear());

export async function keys(store) {
  const db = await open();
  return done(db.transaction(store).objectStore(store).getAllKeys());
}

// Replace every store at once (restore from backup). One transaction, so a
// failure leaves the old data untouched.
export async function replaceAll(data) {
  const db = await open();
  const t = db.transaction(STORES, 'readwrite');
  for (const s of STORES) t.objectStore(s).clear();
  for (const i of data.items) t.objectStore('items').put(i);
  for (const o of data.outfits) t.objectStore('outfits').put(o);
  for (const w of data.wears) t.objectStore('wears').put(w);
  for (const [k, v] of Object.entries(data.kv)) t.objectStore('kv').put(v, k);
  for (const [k, blob] of Object.entries(data.photos)) t.objectStore('photos').put(blob, k);
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('restore aborted'));
  });
}
