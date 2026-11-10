// Optional: Claude answers the valet chat, through your own API key (stored
// only on this phone). Needs the internet, and each message costs a little.
// Without a key, the built-in answers in core/ask.js are used.

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
