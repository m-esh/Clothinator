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
export const LOCAL_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';

// Two ways to run it, picked for this phone:
//   - the GPU (WebGPU) with 16-bit maths: fastest, 483 MB
//   - the CPU (WebAssembly), 8-bit: works everywhere, slower, 512 MB
// Asking a GPU without 16-bit support for the 16-bit model fails, so check.
const RUNTIMES = {
  gpu: { device: 'webgpu', dtype: 'q4f16', mb: 483, label: 'graphics chip' },
  cpu: { device: 'wasm', dtype: 'q8', mb: 512, label: 'processor' },
};

let runtimeP = null;
export function pickRuntime() {
  return (runtimeP ||= (async () => {
    try {
      const adapter = await navigator.gpu?.requestAdapter();
      if (adapter?.features.has('shader-f16')) return 'gpu';
    } catch { /* no WebGPU */ }
    return 'cpu';
  })());
}
export const runtimeInfo = (k) => RUNTIMES[k];
export const localSupported = () => typeof WebAssembly !== 'undefined';

// Keep the screen on while downloading: iOS pauses a web app when the screen
// locks or you switch apps, and the big file then has to start again.
async function stayAwake() {
  try { return await navigator.wakeLock?.request('screen'); } catch { return null; }
}

// Plain-language reasons, keeping the original message for Settings.
function explain(e, mb) {
  const raw = String(e?.message || e || '');
  if (/quota|storage|space|QuotaExceeded/i.test(raw)) return new BrainError('space', `Not enough free space on the phone. It needs about ${mb} MB.`);
  if (/fetch|network|load failed|aborted|offline/i.test(raw)) return new BrainError('network', 'The download was interrupted. Stay on this screen with the phone unlocked, on Wi-Fi, and try again.');
  if (/memory|allocation|RangeError|out of bounds/i.test(raw)) return new BrainError('memory', 'The phone ran out of memory loading it. Close other apps and try again.');
  return new BrainError('unknown', `The model couldn’t start (${raw.slice(0, 120) || 'unknown error'}).`);
}

let genP = null;
let libRef = null;
async function build(m, key, onProgress) {
  const rt = RUNTIMES[key];
  const files = new Map();
  return m.pipeline('text-generation', LOCAL_MODEL, {
    device: rt.device,
    dtype: rt.dtype,
    progress_callback: (e) => {
      if (e.status === 'progress' && e.total) {
        files.set(e.file, [e.loaded, e.total]);
        let l = 0, t = 0;
        for (const [a, b] of files.values()) { l += a; t += b; }
        // The small files finish before the big one starts: measure against
        // the model's known size so the bar doesn't sit at 100% meanwhile.
        onProgress?.(Math.min(1, l / Math.max(t, rt.mb * 1e6)));
      }
    },
  });
}

export function loadLocal(onProgress) {
  if (!genP) {
    genP = (async () => {
      let key = await pickRuntime();
      const rt = RUNTIMES[key];
      // Room to store it? (Ask the phone to keep it, too.)
      try {
        await navigator.storage?.persist?.();
        const est = await navigator.storage?.estimate?.();
        if (est?.quota && est.quota - (est.usage || 0) < rt.mb * 1.1e6) throw new BrainError('space', `Not enough free space on the phone. It needs about ${rt.mb} MB.`);
      } catch (e) { if (e instanceof BrainError) throw e; }
      const lock = await stayAwake();
      try {
        const m = libRef || await import(/* @vite-ignore */ LIB);
        libRef = m;
        m.env.allowLocalModels = false;
        m.env.useBrowserCache = true;
        // One retry for a dropped connection; files already saved aren't fetched again.
        for (let attempt = 0; ; attempt++) {
          try {
            return await build(m, key, onProgress);
          } catch (e) {
            const err = explain(e, RUNTIMES[key].mb);
            if (err.kind === 'network' && attempt === 0) continue;
            // The GPU path can fail to start on some phones: fall back to the CPU.
            if (key === 'gpu' && err.kind === 'unknown') { key = 'cpu'; runtimeP = Promise.resolve('cpu'); continue; }
            err.raw = String(e?.message || e);
            throw err;
          }
        }
      } finally {
        lock?.release?.().catch(() => {});
      }
    })();
    genP.catch(() => { genP = null; });
  }
  return genP;
}

export async function askLocal({ system, messages, onText, onProgress }) {
  const gen = await loadLocal(onProgress);
  let text = '';
  const streamer = new libRef.TextStreamer(gen.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (t) => { text += t; onText?.(text); },
  });
  // A small model does best with a short history.
  const chat = [{ role: 'system', content: system }, ...messages.slice(-6)];
  const out = await gen(chat, { max_new_tokens: 160, do_sample: false, repetition_penalty: 1.1, streamer });
  const last = out?.[0]?.generated_text;
  const reply = Array.isArray(last) ? last[last.length - 1]?.content : text;
  return (reply || text).trim();
}

export async function localCached() {
  try {
    const cache = await caches.open('transformers-cache');
    return (await cache.keys()).some((r) => r.url.includes(LOCAL_MODEL) && r.url.endsWith('.onnx'));
  } catch { return false; }
}

export async function removeLocal() {
  genP = null;
  try {
    const cache = await caches.open('transformers-cache');
    for (const r of await cache.keys()) if (r.url.includes(LOCAL_MODEL)) await cache.delete(r);
  } catch { /* nothing cached */ }
}
