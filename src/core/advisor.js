// What the valet knows when you chat with them, and quick answers to the
// questions people ask most. Pure functions: no DOM, no network.
//
// ctx = {
//   today, unit ('C'|'F'), weather (summary from weather.js, or null),
//   mode, outfit (assembled outfit on show, or null), worn (bool),
//   items, wears, place
// }

import { stats } from './catalog.js';
import { toUnit, describe, fmtHour } from './weather.js';

const nameOf = (i) => i.name || stats(i).label;
const lower = (s) => s.toLowerCase();

const outfitPieces = (o) => (o ? [o.outer, o.mid, o.base, o.onepiece, o.bottom, o.shoes, ...(o.accessories || [])].filter(Boolean) : []);
const outers = (items) => items.filter((i) => stats(i).cat === 'outer' && !i.inLaundry);

// ── facts for the language model ───────────────────────────

export function facts(ctx) {
  const { weather: w, unit = 'C' } = ctx;
  const t = (c) => `${toUnit(c, unit)}°${unit}`;
  const out = [];
  out.push(`Today is ${ctx.today}${ctx.place ? `, in ${ctx.place}` : ''}.`);
  if (w) {
    out.push(`Weather for their hours (${fmtHour(w.from)} to ${fmtHour(w.to)}): ${describe(w, unit)}. Feels like ${t(w.feelsMin)} to ${t(w.feelsMax)} (air ${t(w.min)} to ${t(w.max)}). Chance of rain up to ${w.rainChance}%, about ${w.rainMm} mm${w.wetFrom != null ? `, wet from ${fmtHour(w.wetFrom)}` : ''}. Wind up to ${Math.round(w.wind)} km/h, gusts ${Math.round(w.gusts)} km/h.`);
    if (w.hours?.length) out.push(`Hourly feels-like: ${w.hours.map((p) => `${fmtHour(p.h)} ${toUnit(p.feels, unit)}°${p.wet ? ' wet' : ''}`).join(', ')}.`);
  } else out.push('The weather has not loaded, so you do not know it.');
  if (ctx.mode) out.push(`They chose ${ctx.mode} for today's mood.`);
  const pieces = outfitPieces(ctx.outfit);
  if (pieces.length) out.push(`${ctx.worn ? 'They are wearing' : 'Your current suggestion is'}: ${pieces.map(nameOf).join(', ')}.`);
  const items = ctx.items || [];
  if (items.length) {
    out.push(`Their closet (${items.length} pieces): ${items.map((i) => {
      const s = stats(i);
      const tags = [s.label.toLowerCase(), `warmth ${s.warmth}`, s.rain === 'ok' ? 'rainproof' : null, i.inLaundry ? 'IN THE WASH' : null, i.wearsSinceWash ? `${i.wearsSinceWash} wears since wash` : null].filter(Boolean);
      return `${nameOf(i)} (${tags.join(', ')})`;
    }).join('; ')}.`);
  } else out.push('Their closet is empty so far.');
  const recent = (ctx.wears || []).filter((x) => x.date < ctx.today).slice(-7);
  if (recent.length) {
    const byId = new Map(items.map((i) => [i.id, i]));
    out.push(`Recently worn: ${recent.map((x) => `${x.date} (${x.mode}): ${x.itemIds.map((id) => byId.get(id)).filter(Boolean).map(nameOf).join(', ')}`).join('; ')}.`);
  }
  return out.join('\n');
}

export function persona(m, unit = 'C') {
  return [
    `You are ${m.name}, the valet in Clad, a personal wardrobe app. ${m.blurb} You are British and speak with that character's voice, but stay helpful.`,
    'You help one person decide what to wear and answer their questions about clothes, the weather and their wardrobe. Small talk is fine; keep it brief.',
    'Reply in one to three short sentences of plain text. No markdown, lists or emoji.',
    'Use only the facts below about the weather and their clothes. If something is not in the facts, say you do not know rather than guessing. When suggesting clothes, name pieces from their closet and avoid anything in the wash.',
    `Give temperatures in °${unit}.`,
  ].join(' ');
}

// A much shorter brief for the small on-phone model: long fact sheets
// confuse it, so just the voice, today's weather and what's clean.
export function localPrompt(m, ctx) {
  const unit = ctx.unit || 'C';
  const w = ctx.weather;
  const clean = (ctx.items || []).filter((i) => !i.inLaundry).slice(0, 24).map((i) => lower(nameOf(i)));
  const pieces = outfitPieces(ctx.outfit).map((i) => lower(nameOf(i)));
  return [
    `You are ${m.name}, a witty British valet. Give practical, specific advice in one or two short sentences. If asked something unrelated to clothes, answer briefly and kindly.`,
    '',
    w ? `Today's weather: ${toUnit(w.feelsMin, unit)}° to ${toUnit(w.feelsMax, unit)}°${unit}${w.wet ? (w.wetFrom != null && w.wetFrom > w.from ? `, rain from ${fmtHour(w.wetFrom)}` : ', rain') : ', dry'}${w.windy ? ', windy' : ''}.` : null,
    clean.length ? `Wardrobe: ${clean.join(', ')}.` : null,
    pieces.length ? `${ctx.worn ? 'Wearing today' : 'Today\'s suggestion'}: ${pieces.join(', ')}.` : null,
  ].filter((x) => x != null).join('\n');
}

// Small models ramble and add markdown: keep the first few sentences, plain.
export function tidyReply(t, max = 3) {
  let s = String(t || '').replace(/\*\*|__|^#+\s*/gm, '').replace(/^(certainly|sure|of course)[!,.]\s*/i, '').replace(/\s+/g, ' ').trim();
  const parts = s.match(/[^.!?]+[.!?]+["’”)]*|[^.!?]+$/g) || [s];
  s = parts.slice(0, max).join('').trim();
  return s;
}

// ── quick answers, straight from the app's own data ─────────

const INTENTS = [
  ['jacket', /\b(jacket|coat|layer|cardigan|blazer|parka|fleece|cold|chilly|freez\w*|warm enough)\b/i],
  ['rain', /\b(rain\w*|umbrella|wet|showers?|drizzle|waterproof|snow\w*)\b/i],
  ['wind', /\b(wind\w*|gust\w*|breez\w*|blustery)\b/i],
  ['shorts', /\b(shorts|sandals|t-?shirt weather)\b/i],
  ['wash', /\b(wash\w*|laundry|dirty|clean)\b/i],
  ['forgotten', /\b(haven'?t worn|not worn|forgot\w*|neglect\w*|gathering dust|oldest)\b/i],
  ['wear', /\b(what (should|do|shall) i wear|wear today|outfit|dress(ed)? for)\b/i],
  ['weather', /\b(weather|temperature|forecast|hot|warm|how (cold|warm)|degrees|outside|sunny|sun)\b/i],
];

export function intentOf(q) {
  for (const [k, re] of INTENTS) if (re.test(q)) return k;
  return null;
}

// A short factual answer, or null when this isn't a question we can answer
// from data. `v` is the valet's voice (for the yes/no openers).
export function quickAnswer(q, ctx, v = {}) {
  const intent = intentOf(q);
  if (!intent) return null;
  const c = v.chat || {};
  const yes = c.yes || 'Yes.', no = c.no || 'No.';
  const w = ctx.weather, unit = ctx.unit || 'C';
  const t = (x) => `${toUnit(x, unit)}°`;
  const needsWeather = ['jacket', 'rain', 'wind', 'shorts', 'weather'].includes(intent);
  if (needsWeather && !w) return c.noWeather || 'I don’t have the weather yet. Open Today and I’ll check.';
  const items = ctx.items || [];

  switch (intent) {
    case 'weather': {
      const lines = [`${t(w.feelsMin)} to ${t(w.feelsMax)} feels-like, ${fmtHour(w.from)} to ${fmtHour(w.to)}.`];
      if (w.snow) lines.push('Snow about.');
      else if (w.wet) lines.push(w.wetFrom != null && w.wetFrom > w.from ? `Rain from ${fmtHour(w.wetFrom)}.` : 'Rain on and off.');
      else lines.push(w.rainChance >= 30 ? `Small chance of rain (${w.rainChance}%).` : 'Dry.');
      if (w.windy) lines.push(`Windy, gusts to ${Math.round(w.gusts)} km/h.`);
      return lines.join(' ');
    }
    case 'jacket': {
      const cold = w.feelsMin < 12 || w.wet || w.snow || w.windy;
      const swing = !cold && w.feelsMin < 16 && w.feelsMax - w.feelsMin >= 5;
      const pick = (want) => {
        const o = outers(items);
        if (!o.length) return null;
        const ranked = o.slice().sort((a, b) => score(b) - score(a));
        function score(i) {
          const s = stats(i);
          return (w.wet && s.rain === 'ok' ? 3 : 0) + (w.windy && s.wind ? 1 : 0) - Math.abs(s.warmth - want);
        }
        return ranked[0];
      };
      const onFit = ctx.outfit?.outer;
      if (cold) {
        const why = [w.feelsMin < 12 ? `it feels like ${t(w.feelsMin)}` : null, w.wet ? 'rain’s due' : null, w.windy ? 'it’s windy' : null].filter(Boolean).join(' and ');
        const best = onFit || pick(w.feelsMin < 5 ? 5 : w.feelsMin < 10 ? 3.5 : 2.5);
        return `${yes} ${cap(why)}.${best ? ` The ${lower(nameOf(best))} would do.` : ' Nothing in the closet fits the bill, mind.'}`;
      }
      if (swing) {
        const best = onFit || pick(2);
        return `A light one for the morning. ${t(w.feelsMin)} early, ${t(w.feelsMax)} later, so it’ll come off.${best ? ` The ${lower(nameOf(best))}.` : ''}`;
      }
      return `${no} ${t(w.feelsMin)} to ${t(w.feelsMax)} and dry. You won’t need one.`;
    }
    case 'rain': {
      if (w.snow) return `${yes} Snow’s forecast. Boots, if you have them.`;
      if (w.wet) {
        const shell = outers(items).find((i) => stats(i).rain === 'ok');
        return `${yes} ${w.wetFrom != null && w.wetFrom > w.from ? `Rain from ${fmtHour(w.wetFrom)}` : 'Rain on and off'}, about ${w.rainMm} mm. ${shell ? `Take the ${lower(nameOf(shell))}.` : 'Take an umbrella.'}`;
      }
      if (w.rainChance >= 30) return `Possibly. ${w.rainChance}% chance, so a small umbrella wouldn’t hurt.`;
      return `${no} Dry all day.`;
    }
    case 'wind': {
      if (w.windy) return `${yes} Up to ${Math.round(w.wind)} km/h, gusts ${Math.round(w.gusts)}. Something that blocks the wind.`;
      return `Not much. ${Math.round(w.wind)} km/h at most.`;
    }
    case 'shorts': {
      const ok = w.feelsMin >= 19 && !w.wet;
      return ok ? `${yes} ${t(w.feelsMin)} to ${t(w.feelsMax)} and dry.` : `${no} ${w.wet ? 'It’s wet' : `It only gets to ${t(w.feelsMax)}`}.`;
    }
    case 'wash': {
      const inWash = items.filter((i) => i.inLaundry);
      const due = items.filter((i) => !i.inLaundry && (i.wearsSinceWash || 0) >= 3).sort((a, b) => b.wearsSinceWash - a.wearsSinceWash).slice(0, 3);
      const parts = [];
      if (inWash.length) parts.push(`${inWash.length} piece${inWash.length === 1 ? ' is' : 's are'} in the wash.`);
      if (due.length) parts.push(`Most worn since a wash: ${due.map((i) => `the ${lower(nameOf(i))} (${i.wearsSinceWash})`).join(', ')}.`);
      return parts.length ? parts.join(' ') : 'Nothing’s been out more than twice since a wash. You’re in good shape.';
    }
    case 'forgotten': {
      const old = items.filter((i) => !i.inLaundry).sort((a, b) => (a.lastWorn || '') < (b.lastWorn || '') ? -1 : 1)[0];
      if (!old) return 'Your closet’s empty so far.';
      return old.lastWorn ? `The ${lower(nameOf(old))}. Last out on ${old.lastWorn}.` : `The ${lower(nameOf(old))}. It hasn’t been out yet.`;
    }
    case 'wear': {
      const pieces = outfitPieces(ctx.outfit);
      if (!pieces.length) return ctx.mode ? 'Nothing suits today with what’s clean, I’m afraid.' : 'Pick Fancy, Casual or Comfy on Today and I’ll put something together.';
      return `${ctx.worn ? 'You’re in' : 'I’d go with'} the ${listJoin(pieces.map((i) => lower(nameOf(i))))}.`;
    }
  }
  return null;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function listJoin(a) {
  return a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}
