// Stores the chat model on the phone in 16 MB pieces.
//
// Why not the browser's download cache? It refuses a single 500 MB file
// ("Failed to execute 'put' on 'Cache'"), so the model downloaded but was
// never kept. Pieces also make the download resumable: if iOS pauses the app
// or the connection drops, the next try starts where the last one stopped.
//
// Pieces are Blobs in IndexedDB (kept on disk, not in memory). When the
// model loads, they're joined back into one Blob for transformers.js through
// its custom-cache hook.

const DB = 'clad-models';
const CHUNK = 16 * 1024 * 1024;

let dbP = null;
function db() {
  return (dbP ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('files');  // url -> { size, pieces, done, type }
      r.result.createObjectStore('pieces'); // `${url}#${i}` -> Blob
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
  });
}
const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
const put = (store, key, value) => tx(store, 'readwrite', (s) => s.put(value, key));

export async function isStored(url) {
  try { return !!(await get('files', url))?.done; } catch { return false; }
}

// Download one file into pieces, skipping pieces already stored.
// onBytes(bytesDone, totalBytes) reports progress.
export async function download(url, onBytes, { signal } = {}) {
  let meta = await get('files', url);
  if (meta?.done) { onBytes?.(meta.size, meta.size); return meta; }
  if (!meta) {
    // The size, from a one-byte ranged request (works across the redirect).
    const r = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal });
    if (!r.ok) throw new Error(`Download failed (${r.status})`);
    const size = Number((r.headers.get('content-range') || '').split('/')[1]) || Number(r.headers.get('content-length'));
    await r.arrayBuffer();
    if (!size) throw new Error('Download failed (unknown size)');
    meta = { size, pieces: Math.ceil(size / CHUNK), done: false, type: 'application/octet-stream' };
    await put('files', url, meta);
  }
  let have = 0;
  for (let i = 0; i < meta.pieces; i++) {
    const len = Math.min(CHUNK, meta.size - i * CHUNK);
    if (await tx('pieces', 'readonly', (s) => s.count(`${url}#${i}`))) { have += len; onBytes?.(have, meta.size); continue; }
    let blob = null;
    for (let attempt = 0; attempt < 4 && !blob; attempt++) {
      try {
        const r = await fetch(url, { headers: { Range: `bytes=${i * CHUNK}-${i * CHUNK + len - 1}` }, signal });
        if (r.status !== 206 && !(r.status === 200 && meta.pieces === 1)) throw new Error(`Download failed (${r.status})`);
        const b = await r.blob();
        if (b.size !== len) throw new Error('Download failed (short piece)');
        blob = b;
      } catch (e) {
        if (signal?.aborted || attempt === 3) throw e;
        await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
      }
    }
    await put('pieces', `${url}#${i}`, blob);
    have += len;
    onBytes?.(have, meta.size);
  }
  meta.done = true;
  await put('files', url, meta);
  return meta;
}

// The whole file as one Blob (pieces stay on disk until read).
export async function read(url) {
  const meta = await get('files', url);
  if (!meta?.done) return null;
  const parts = [];
  for (let i = 0; i < meta.pieces; i++) parts.push(await get('pieces', `${url}#${i}`));
  if (parts.some((p) => !p)) return null;
  return new Blob(parts, { type: meta.type });
}

// Small files transformers.js fetches itself (config, tokenizer): keep whole.
export async function keep(url, response) {
  const blob = await response.blob();
  await put('pieces', `${url}#0`, blob);
  await put('files', url, { size: blob.size, pieces: 1, done: true, type: response.headers.get('content-type') || 'application/octet-stream' });
}

export async function removeAll(prefix) {
  const d = await db();
  for (const store of ['files', 'pieces']) {
    await new Promise((resolve, reject) => {
      const t = d.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      const req = s.openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        if (String(c.key).startsWith(prefix)) c.delete();
        c.continue();
      };
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }
}

// transformers.js custom cache: serve stored files, store small new ones.
export const cache = {
  async match(key) {
    const url = typeof key === 'string' ? key : key.url;
    const blob = await read(url).catch(() => null);
    return blob ? new Response(blob, { headers: { 'content-length': String(blob.size), 'content-type': blob.type } }) : undefined;
  },
  async put(key, response) {
    const url = typeof key === 'string' ? key : key.url;
    try { await keep(url, response); } catch { /* not kept; fetched again next time */ }
  },
};
