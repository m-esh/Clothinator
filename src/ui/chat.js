// Chat with your valet. Tap them anywhere and this opens: ask about the
// weather, whether you need a jacket, what to wash, or anything else.
//
// Who answers:
//   - Claude, when you've added an API key in Settings (and chosen it).
//   - Otherwise the on-phone model, once it's downloaded.
//   - Questions about the weather and your clothes are answered straight from
//     the app's own data when no AI is set up, or when the on-phone model is
//     in use (so it's always accurate on what matters most).

import { h, sheet } from './dom.js';
import * as store from '../data/store.js';
import { state } from '../data/store.js';
import * as valet from './mascot.js';
import { facts, persona, quickAnswer, intentOf } from '../core/advisor.js';
import { isoDate } from '../core/week.js';

const SUGGESTIONS = ['Do I need a jacket?', 'What’s the weather like?', 'Will it rain?', 'What should I wash?'];

// Today's screen tells us what's going on (weather, the outfit on show).
let contextOf = () => ({});
export const setChatContext = (fn) => { contextOf = fn; };

export function chatContext() {
  const c = contextOf() || {};
  return {
    today: isoDate(),
    unit: state.prefs.unit,
    items: state.items,
    wears: state.wears,
    ...c,
  };
}

// Which brain answers: 'claude' | 'local' | 'quick'.
export async function brainFor(prefs = state.prefs) {
  const pref = prefs.chat?.brain || 'auto';
  const key = await claudeKey();
  if (pref !== 'local' && key) return 'claude';
  if (pref !== 'claude' && prefs.chat?.localReady) return 'local';
  return 'quick';
}

export const claudeKey = async () => (await store.getKV('claudeKey')) || '';
export const setClaudeKey = (k) => store.setKV('claudeKey', k || '');

let open = false;

export async function openChat({ opening } = {}) {
  const m = valet.current();
  if (!m || open) return;
  open = true;
  const today = isoDate();
  const saved = await store.getKV('chat');
  let log = saved?.date === today && saved.key === m.key ? saved.messages : [];
  // Start from what they just said; an ongoing chat carries on as it was.
  if (opening && !log.length) log.push({ from: 'valet', text: opening });
  let busy = null; // { text } while a reply streams in
  let draft = '';
  let brain = await brainFor();
  let controller = null;
  const persist = () => store.setKV('chat', { date: today, key: m.key, messages: log.slice(-40) });

  sheet(m.name, (close, render) => {
    const send = async (q) => {
      q = q.trim();
      if (!q || busy) return;
      draft = '';
      const live = document.querySelector('.chat-input input');
      if (live) live.value = '';
      log.push({ from: 'me', text: q });
      busy = { text: '' };
      render();
      scrollDown();
      try {
        const reply = await answer(q, log, brain, m, (t) => { busy.text = t; schedule(); }, (c) => { controller = c; });
        log.push({ from: 'valet', text: reply });
      } catch (e) {
        log.push({ from: 'valet', text: e.message || 'Something went wrong.', error: true });
      }
      busy = null;
      controller = null;
      persist();
      render();
      scrollDown();
    };
    let raf = 0;
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); scrollDown(); }); };

    const input = h('input', {
      type: 'text', placeholder: `Ask ${m.name}…`, value: draft, enterkeyhint: 'send', autocomplete: 'off',
      'aria-label': `Message ${m.name}`,
      oninput: (e) => { draft = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(e.currentTarget.value); } },
    });
    const asked = log.some((x) => x.from === 'me');

    return h('div', { class: 'chat' },
      h('div', { class: 'chat-log', 'aria-live': 'polite' },
        log.length ? null : bubble('valet', m.voice.chat?.intro || m.voice.hello, m),
        log.map((x, i) => bubble(x.from, x.text, m, { key: `${i}`, error: x.error })),
        busy ? bubble('valet', busy.text || '', m, { key: 'busy', typing: !busy.text }) : null),
      asked || busy ? null : h('div', { class: 'chat-chips' },
        SUGGESTIONS.map((s) => h('button', { class: 'chip', onclick: () => send(s) }, s))),
      h('div', { class: 'chat-input' },
        input,
        busy && controller
          ? h('button', { class: 'chat-send stop', 'aria-label': 'Stop', onclick: () => controller?.abort() }, h('i'))
          : h('button', { class: 'chat-send', 'aria-label': 'Send', disabled: !!busy, onclick: (e) => send(e.currentTarget.parentNode.querySelector('input').value) }, h('span', { class: 'chev up' }))),
      h('div', { class: 'chat-foot tiny faint' },
        brainLabel(brain),
        log.length > 1 && !busy ? h('button', { class: 'link tiny', onclick: () => { log = []; persist(); render(); } }, 'Clear') : null),
    );
  }, { onClose: () => { open = false; controller?.abort(); } });
  scrollDown();
}

function brainLabel(brain) {
  if (brain === 'claude') {
    const id = state.prefs.chat?.model;
    return `Claude${id?.includes('haiku') ? ' Haiku' : ' Opus'} · via your API key`;
  }
  if (brain === 'local') return 'On-phone model · private';
  return h('span', null, 'Weather and wardrobe answers only. ', h('a', { class: 'link tiny', href: '#settings' }, 'Set up chat'));
}

function bubble(from, text, m, { key, error, typing } = {}) {
  return h('div', { key, class: `chat-msg ${from}${error ? ' error' : ''}` },
    from === 'valet' ? valet.avatar(m.key, 28) : null,
    h('p', null, typing ? h('span', { class: 'typing', 'aria-label': `${m.name} is typing` }, h('i'), h('i'), h('i')) : text));
}

function scrollDown() {
  requestAnimationFrame(() => {
    const el = document.querySelector('.chat-log');
    if (el) el.scrollTop = el.scrollHeight;
  });
}

// ── answering ──────────────────────────────────────────────

async function answer(q, log, brain, m, onText, setController) {
  const ctx = chatContext();
  const v = m.voice;
  // Weather and wardrobe questions: the app's own numbers beat a small model.
  if (brain !== 'claude') {
    const quick = quickAnswer(q, ctx, v);
    if (quick) { await pause(350); return quick; }
    if (brain === 'quick') {
      return intentOf(q) ? quick : (v.chat?.offTopic || 'I can tell you about the weather, your outfit and the laundry. For anything else, set up chat in Settings.');
    }
  }
  const system = `${persona(m, ctx.unit)}\n\nFacts:\n${facts(ctx)}`;
  // Alternate user/assistant, starting with the user, ending with this question.
  const msgs = [];
  for (const x of log) {
    if (x.error) continue;
    const role = x.from === 'me' ? 'user' : 'assistant';
    if (!msgs.length && role === 'assistant') continue;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += `\n${x.text}`;
    else msgs.push({ role, content: x.text });
  }
  const brainMod = await import('../ai/brain.js');
  if (brain === 'claude') {
    const c = new AbortController();
    setController(c);
    return brainMod.askClaude({ key: await claudeKey(), model: state.prefs.chat?.model, system, messages: msgs, onText, signal: c.signal });
  }
  return brainMod.askLocal({ system, messages: msgs, onText });
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
