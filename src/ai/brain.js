// The valet's brain for chat. Two kinds:
//   - Claude, through your own API key (stored only on this phone). Smarter,
//     needs the internet, and each message costs a little.
//   - A small model that runs on the phone (Qwen2.5 0.5B, via transformers.js
//     and WebGPU). Free and private; downloaded once.
// Both stream their reply a few words at a time through onText.

// ── Claude ─────────────────────────────────────────────────

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Best answers, about a cent a message' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Quick and very cheap' },
];
export const DEFAULT_CLAUDE = CLAUDE_MODELS[0].id;

let sdkP = null;
const sdk = () => (sdkP ||= import('../../vendor/anthropic-sdk.js').then((m) => m.default).catch((e) => { sdkP = null; throw e; }));

export class BrainError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

// messages: [{ role: 'user'|'assistant', content: string }]
export async function askClaude({ key, model = DEFAULT_CLAUDE, system, messages, onText, signal }) {
  const Anthropic = await sdk();
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
  const params = {
    model,
    max_tokens: 2048,
    system,
    messages,
    output_config: { effort: 'low' }, // chat: short answers, little thinking
  };
  // Opus can re-run a declined request on another model; Haiku has no fallback.
  if (model.startsWith('claude-opus')) Object.assign(params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  let text = '';
  try {
    const stream = client.beta.messages.stream(params, { signal });
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        text += ev.delta.text;
        onText?.(text);
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw new BrainError('refusal', 'I’d rather not answer that one.');
    // Use the final text (a fallback model may have replaced a partial answer).
    const out = final.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    return out || text.trim();
  } catch (e) {
    if (e instanceof BrainError) throw e;
    if (e?.name === 'AbortError' || signal?.aborted) throw new BrainError('aborted', 'Stopped.');
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new BrainError('key', 'That API key was turned down. Check it in Settings.');
    if (e instanceof Anthropic.RateLimitError) throw new BrainError('busy', 'Too many questions at once. Give it a minute.');
    if (e instanceof Anthropic.BadRequestError) throw new BrainError('request', e.message?.includes('credit') ? 'Your Anthropic account is out of credit.' : 'Claude couldn’t take that request.');
    if (e instanceof Anthropic.APIConnectionError) throw new BrainError('offline', 'Can’t reach Claude. Are you online?');
    if (e instanceof Anthropic.APIError) throw new BrainError('server', 'Claude is having a moment. Try again shortly.');
    throw new BrainError('unknown', e?.message || 'Something went wrong.');
  }
}

// ── on the phone ───────────────────────────────────────────

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6';

// Phones give a web app only so much memory, and loading a model briefly
// needs a few times its file size. Qwen2.5 0.5B (an earlier choice) peaked
// near 3 GB and iOS closed the app, so these are smaller:
//   standard: SmolLM2 360M (peaks about 1.5 GB)
//   lite:     SmolLM2 135M (about 0.75 GB), used if standard crashes
export const SIZES = {
  standard: { id: 'HuggingFaceTB/SmolLM2-360M-Instruct', label: 'Standard', gpu: { dtype: 'q4f16', file: 'model_q4f16.onnx', mb: 273 }, cpu: { dtype: 'q8', file: 'model_quantized.onnx', mb: 365 } },
  lite: { id: 'HuggingFaceTB/SmolLM2-135M-Instruct', label: 'Lite', gpu: { dtype: 'q4f16', file: 'model_q4f16.onnx', mb: 118 }, cpu: { dtype: 'q8', file: 'model_quantized.onnx', mb: 137 } },
};
const OLD_MODELS = ['onnx-community/Qwen2.5-0.5B-Instruct'];

// Where it runs: the GPU (WebGPU) only with 16-bit support, else the CPU.
const DEVICES = { gpu: { device: 'webgpu', label: 'graphics chip' }, cpu: { device: 'wasm', label: 'processor' } };

const root = (size) => `https://huggingface.co/${SIZES[size].id}/resolve/main/`;
const weightsURL = (size, key) => `${root(size)}onnx/${SIZES[size][key].file}`;

// A step that might never answer on some phones gets a time limit.
const within = (ms, p, fallback) => Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((r) => setTimeout(() => r(fallback), ms))]);

let runtimeP = null;
export function pickRuntime() {
  return (runtimeP ||= (async () => {
    const adapter = await within(3000, navigator.gpu?.requestAdapter?.(), null);
    return adapter?.features?.has('shader-f16') ? 'gpu' : 'cpu';
  })());
}
export const runtimeInfo = (size, key) => ({ ...SIZES[size][key], label: DEVICES[key].label, size: SIZES[size].label });
export const localSupported = () => typeof WebAssembly !== 'undefined';

// ── crash guard ────────────────────────────────────────────
// If iOS runs out of memory it closes the app without any error we can
// catch. So a note is written before the heavy step and removed after; a
// note still there on the next start means the app was closed mid-load.
const GUARD = 'clad.modelLoading';
const mark = (size) => { try { localStorage.setItem(GUARD, size); } catch { /* private mode */ } };
const unmark = () => { try { localStorage.removeItem(GUARD); } catch { /* private mode */ } };
// Returns the size that was loading when the app was closed, once.
export function crashedWhileLoading() {
  try {
    const s = localStorage.getItem(GUARD);
    if (s) localStorage.removeItem(GUARD);
    return SIZES[s] ? s : null;
  } catch { return null; }
}

// Keep the screen on while downloading: iOS pauses a web app when the screen
// locks or you switch apps.
function stayAwake() {
  return within(1500, navigator.wakeLock?.request?.('screen'), null);
}

// Plain-language reasons, keeping the original message for Settings.
function explain(e, mb) {
  const raw = String(e?.message || e || '');
  if (/quota|storage|space|QuotaExceeded/i.test(raw)) return new BrainError('space', `Not enough free space on the phone. It needs about ${mb} MB.`);
  if (/fetch|network|load failed|aborted|offline|stalled|ended early|HTTP/i.test(raw)) return new BrainError('network', 'The download was interrupted. Stay on this screen with the phone unlocked, on Wi-Fi, and try again.');
  if (/memory|allocation|RangeError|out of bounds/i.test(raw)) return new BrainError('memory', 'The phone ran out of memory loading it.');
  return new BrainError('unknown', `The model couldn’t start (${raw.slice(0, 120) || 'unknown error'}).`);
}

let genP = null;
let genSize = null;
let libRef = null;

// Download only (no loading into memory, so no crash risk here).
async function fetchWeights(size, key, cb) {
  const rt = SIZES[size][key];
  const store = await import('./model-store.js');
  await store.download(weightsURL(size, key), {
    expectedBytes: rt.mb * 1e6,
    onStage: cb.onStage,
    onBytes: (done, total) => cb.onProgress?.(Math.min(0.999, done / total), done, total),
  });
}

async function storedKey(size) {
  const store = await import('./model-store.js');
  let key = await pickRuntime();
  // Already have the other version (an earlier fallback)? Use that.
  if (key === 'gpu' && !(await store.isStored(weightsURL(size, 'gpu'))) && (await store.isStored(weightsURL(size, 'cpu')))) key = 'cpu';
  return key;
}

// Settings' Download button: fetch the weights, but don't load them yet.
export async function downloadLocal(size, cb = {}) {
  cb.onStage?.('Getting ready…');
  const key = await storedKey(size);
  const rt = SIZES[size][key];
  const store = await import('./model-store.js');
  await within(2000, navigator.storage?.persist?.(), false);
  const est = await within(2000, navigator.storage?.estimate?.(), null);
  if (est?.quota && est.quota - (est.usage || 0) < rt.mb * 1.1e6 && !(await store.isStored(weightsURL(size, key)))) {
    throw new BrainError('space', `Not enough free space on the phone. It needs about ${rt.mb} MB.`);
  }
  const lock = await stayAwake();
  try {
    for (let attempt = 0; ; attempt++) {
      try { return await fetchWeights(size, key, cb); } catch (e) {
        const err = explain(e, rt.mb);
        if (err.kind === 'network' && attempt === 0) continue;
        err.raw = String(e?.message || e);
        throw err;
      }
    }
  } finally {
    lock?.release?.().catch(() => {});
  }
}

// Load into memory (the heavy, crash-prone step), guarded.
export function loadLocal(size = 'standard', cb = {}) {
  if (genP && genSize !== size) genP = null;
  if (!genP) {
    genSize = size;
    genP = (async () => {
      let key = await storedKey(size);
      cb.onStage?.('Loading the AI library…');
      const m = libRef || await import(/* @vite-ignore */ LIB);
      libRef = m;
      m.env.allowLocalModels = false;
      const store = await import('./model-store.js');
      if (!(await store.isStored(weightsURL(size, key)))) await downloadLocal(size, cb);
      m.env.useBrowserCache = false;
      m.env.useCustomCache = true;
      m.env.customCache = store.cache;
      cb.onStage?.('Starting it up…');
      for (;;) {
        mark(size);
        try {
          const gen = await m.pipeline('text-generation', SIZES[size].id, { device: DEVICES[key].device, dtype: SIZES[size][key].dtype });
          unmark();
          return gen;
        } catch (e) {
          unmark();
          const err = explain(e, SIZES[size][key].mb);
          // The GPU path can fail to start on some phones: fall back to the CPU.
          if (key === 'gpu' && err.kind === 'unknown') { key = 'cpu'; runtimeP = Promise.resolve('cpu'); await downloadLocal(size, cb); continue; }
          err.raw = String(e?.message || e);
          throw err;
        }
      }
    })();
    genP.catch(() => { genP = null; });
  }
  return genP;
}

export async function askLocal({ size = 'standard', system, messages, onText, onStage }) {
  const gen = await loadLocal(size, { onStage });
  let text = '';
  const streamer = new libRef.TextStreamer(gen.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (t) => { text += t; onText?.(text); },
  });
  // A small model does best with a short history.
  const chat = [{ role: 'system', content: system }, ...messages.slice(-4)];
  mark(size); // answering uses memory too
  try {
    const out = await gen(chat, { max_new_tokens: 90, do_sample: false, repetition_penalty: 1.15, streamer });
    const last = out?.[0]?.generated_text;
    const reply = Array.isArray(last) ? last[last.length - 1]?.content : text;
    return (reply || text).trim();
  } finally {
    unmark();
  }
}

export async function localCached(size) {
  const store = await import('./model-store.js');
  return (await store.isStored(weightsURL(size, 'gpu'))) || (await store.isStored(weightsURL(size, 'cpu')));
}

export async function removeLocal(size) {
  if (!size || genSize === size) genP = null;
  const store = await import('./model-store.js');
  for (const s of size ? [size] : Object.keys(SIZES)) await store.removeAll(root(s)).catch(() => {});
}

// Free the space taken by models this app no longer uses.
export async function removeOldModels() {
  const store = await import('./model-store.js');
  for (const id of OLD_MODELS) await store.removeAll(`https://huggingface.co/${id}/`).catch(() => {});
  try {
    const cache = await caches.open('transformers-cache');
    for (const r of await cache.keys()) if (OLD_MODELS.some((id) => r.url.includes(id))) await cache.delete(r);
  } catch { /* nothing cached */ }
}
