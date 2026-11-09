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
export const LOCAL_SIZE = 'about 480 MB';

export const localSupported = () => typeof navigator !== 'undefined' && !!navigator.gpu;

let genP = null;
let libRef = null;
export function loadLocal(onProgress) {
  if (!localSupported()) return Promise.reject(new BrainError('unsupported', 'This phone can’t run the on-phone model (it needs WebGPU, iOS 26 or later).'));
  if (!genP) {
    const files = new Map();
    genP = import(/* @vite-ignore */ LIB).then(async (m) => {
      libRef = m;
      m.env.allowLocalModels = false;
      m.env.useBrowserCache = true;
      return m.pipeline('text-generation', LOCAL_MODEL, {
        device: 'webgpu',
        dtype: 'q4f16',
        progress_callback: (e) => {
          if (e.status === 'progress' && e.total) {
            files.set(e.file, [e.loaded, e.total]);
            let l = 0, t = 0;
            for (const [a, b] of files.values()) { l += a; t += b; }
            onProgress?.(t ? l / t : 0);
          }
        },
      });
    });
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
