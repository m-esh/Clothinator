// Stores the chat model on the phone in 16 MB pieces.
//
// Why not the browser's download cache? It refuses a single 500 MB file
// ("Failed to execute 'put' on 'Cache'"), so the model downloaded but was
// never kept. Pieces also make the download resumable: if iOS pauses the app
// or the connection drops, the next try carries on from the last saved piece.
//
// The file is fetched with one ordinary request and streamed: every 16 MB
// that arrives is saved as a Blob in IndexedDB (on disk, not in memory).
// A resumed download asks for the rest with a Range header; if the server
// ignores that, it starts again from the beginning.
//
// When the model loads, the pieces are joined back into one Blob for
// transformers.js through its custom-cache hook.

const DB = 'clad-models';
const CHUNK = 16 * 1024 * 1024;
const STALL_MS = 30000; // no data for this long: give up on the connection

let dbP = null;
function db() {
  return (dbP ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('files');  // url -> { size, pieces, done, type }
      r.result.createObjectStore('pieces'); // `${url}#${i}` -> Blob
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { dbP = null; reject(r.error); };
    r.onblocked = () => { dbP = null; reject(new Error('Storage is busy. Close other copies of the app and try again.')); };
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
const has = (key) => tx('pieces', 'readonly', (s) => s.count(key)).then((n) => n > 0);

export async function isStored(url) {
  try { return !!(await get('files', url))?.done; } catch { return false; }
}

// Download one file into pieces, carrying on from pieces already saved.
// onBytes(bytesDone, totalBytes) reports progress as data arrives;
// onStage(text) says what it's doing. expectedBytes is used when the server
// doesn't say how big the file is.
export async function download(url, { onBytes, onStage, expectedBytes = 0 } = {}) {
  const meta = await get('files', url);
  if (meta?.done) { onBytes?.(meta.size, meta.size); return meta; }

  // How many whole pieces are already saved, in order from the start?
  let piece = 0;
  while (await has(`${url}#${piece}`)) piece++;
  let offset = piece * CHUNK;

  for (let attempt = 0; ; attempt++) {
    try {
      return await stream(url, piece, offset, { onBytes, onStage, expectedBytes });
    } catch (e) {
      if (e?.restart) { piece = 0; offset = 0; continue; }
      if (attempt >= 3) throw e;
      onStage?.('Connection dropped, retrying…');
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      piece = 0;
      while (await has(`${url}#${piece}`)) piece++;
      offset = piece * CHUNK;
    }
  }
}

async function stream(url, piece, offset, { onBytes, onStage, expectedBytes }) {
  onStage?.(offset ? 'Resuming…' : 'Connecting…');
  const ctl = new AbortController();
  let timer = setTimeout(() => ctl.abort(), STALL_MS);
  const kick = () => { clearTimeout(timer); timer = setTimeout(() => ctl.abort(), STALL_MS); };
  try {
    const res = await fetch(url, { signal: ctl.signal, ...(offset ? { headers: { Range: `bytes=${offset}-` } } : {}) });
    if (offset && res.status === 200) { // the server sent the whole file instead
      res.body?.cancel?.();
      throw Object.assign(new Error('restart'), { restart: true });
    }
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
    const total = Number((res.headers.get('content-range') || '').split('/')[1])
      || (Number(res.headers.get('content-length')) + offset)
      || expectedBytes;
    const type = 'application/octet-stream';
    await put('files', url, { size: total, pieces: Math.ceil(total / CHUNK), done: false, type });
    onStage?.('Downloading');
    onBytes?.(offset, total);

    const reader = res.body.getReader();
    let parts = [], buffered = 0, done = offset;
    const save = async (bytes) => {
      // Join exactly `bytes` from the buffer into one piece.
      const out = [];
      let need = bytes;
      while (need > 0) {
        const p = parts[0];
        if (p.byteLength <= need) { out.push(p); parts.shift(); need -= p.byteLength; }
        else { out.push(p.subarray(0, need)); parts[0] = p.subarray(need); need = 0; }
      }
      buffered -= bytes;
      await put('pieces', `${url}#${piece}`, new Blob(out, { type }));
      piece++;
    };
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      kick();
      parts.push(value);
      buffered += value.byteLength;
      done += value.byteLength;
      onBytes?.(done, total || done);
      while (buffered >= CHUNK) await save(CHUNK);
    }
    if (buffered > 0) await save(buffered);
    const size = done;
    if (total && size !== total) throw new Error('Download ended early');
    const meta = { size, pieces: piece, done: true, type };
    await put('files', url, meta);
    return meta;
  } catch (e) {
    if (ctl.signal.aborted && !e?.restart) throw new Error('Download stalled (no data for 30 seconds)');
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
      const req = t.objectStore(store).openCursor();
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
