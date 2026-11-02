// The detailed weather view: the whole day, hour by hour, as three stacked
// charts (feels-like, rain, wind) on one time axis, with your hours shaded.

import { h, sheet } from './dom.js';
import { toUnit, toWind, windUnit, toRain, rainUnit, compass, codeLabel, fmtHour } from '../core/weather.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

const W = 340, L = 6, R = 6;

function frame(hours, from, to, height) {
  const first = hours[0].h, last = hours[hours.length - 1].h;
  const x = (hr) => L + ((hr - first) * (W - L - R)) / Math.max(1, last - first);
  const svg = el('svg', { viewBox: `0 0 ${W} ${height}`, class: 'wxd' });
  // your hours
  const x0 = x(Math.max(first, from)), x1 = x(Math.min(last, to));
  if (x1 > x0) svg.append(el('rect', { x: x0, y: 0, width: x1 - x0, height, class: 'wxd-band' }));
  return { svg, x };
}

function axis(svg, hours, x, y) {
  for (const p of hours) {
    if (p.h % 3) continue;
    svg.append(el('text', { x: x(p.h), y, 'text-anchor': 'middle', class: 'wx-t' }, fmtHour(p.h)));
  }
}

function tempChart(hours, unit, from, to) {
  const H = 112, T = 22, B = 22;
  const { svg, x } = frame(hours, from, to, H);
  const vals = hours.map((p) => toUnit(p.feels, unit));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 4) { const m = (hi + lo) / 2; lo = m - 2; hi = m + 2; }
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(hours[i].h).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  svg.append(el('path', { d: `${d} L${x(hours.at(-1).h)} ${H - B} L${x(hours[0].h)} ${H - B} Z`, fill: 'url(#wxfill)' }));
  svg.append(el('path', { d, class: 'wx-line', pathLength: '1' }));
  const iMax = vals.indexOf(Math.max(...vals)), iMin = vals.indexOf(Math.min(...vals));
  for (const i of new Set([iMin, iMax])) {
    svg.append(el('circle', { cx: x(hours[i].h), cy: y(vals[i]), r: 3.2, class: 'wx-dot' }));
    const anchor = i === 0 ? 'start' : i === hours.length - 1 ? 'end' : 'middle';
    svg.append(el('text', { x: x(hours[i].h), y: y(vals[i]) - 8, 'text-anchor': anchor, class: 'wx-v' }, `${vals[i]}°`));
  }
  axis(svg, hours, x, H - 5);
  const defs = el('defs');
  const g = el('linearGradient', { id: 'wxfill', x1: '0', y1: '0', x2: '0', y2: '1' });
  g.append(el('stop', { offset: '0', class: 'wx-fill-top' }), el('stop', { offset: '1', class: 'wx-fill-bottom' }));
  defs.append(g);
  svg.prepend(defs);
  return svg;
}

function rainChart(hours, unit, from, to) {
  const H = 96, T = 20, B = 20;
  const { svg, x } = frame(hours, from, to, H);
  const step = (W - L - R) / Math.max(1, hours.length - 1);
  const bw = Math.max(3, step * 0.62);
  for (const p of hours) {
    const bh = ((H - T - B) * p.prob) / 100;
    if (bh > 0) svg.append(el('rect', { x: x(p.h) - bw / 2, y: H - B - bh, width: bw, height: bh, rx: 1.5, class: p.prob >= 50 ? 'wxd-rain wet' : 'wxd-rain' }));
  }
  // Amounts: only the wettest hour of each rainy stretch, so labels never collide.
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const p = run.reduce((a, b) => (b.mm > a.mm ? b : a));
    const bh = ((H - T - B) * p.prob) / 100;
    const i = hours.indexOf(p);
    const anchor = i < 1 ? 'start' : i > hours.length - 2 ? 'end' : 'middle';
    svg.append(el('text', { x: x(p.h), y: H - B - bh - 5, 'text-anchor': anchor, class: 'wxd-amt' }, `${toRain(p.mm, unit)} ${rainUnit(unit)}`));
    run = [];
  };
  for (const p of hours) {
    if (p.mm >= 0.2 && p.prob >= 30) run.push(p);
    else flush();
  }
  flush();
  svg.append(el('line', { x1: 0, x2: W, y1: H - B, y2: H - B, class: 'wx-base' }));
  axis(svg, hours, x, H - 4);
  return svg;
}

function windChart(hours, unit, from, to) {
  const H = 112, T = 38, B = 20;
  const { svg, x } = frame(hours, from, to, H);
  const max = Math.max(20, ...hours.map((p) => p.gust || p.wind));
  const y = (v) => T + ((max - v) * (H - T - B)) / max;
  const line = (key) => hours.map((p, i) => `${i ? 'L' : 'M'}${x(p.h).toFixed(1)} ${y(p[key] || 0).toFixed(1)}`).join(' ');
  svg.append(el('path', { d: line('gust'), class: 'wxd-gust' }));
  svg.append(el('path', { d: line('wind'), class: 'wxd-wind' }));
  // arrows every 3 hours, pointing where the wind blows to
  for (const p of hours) {
    if (p.h % 3 || p.dir == null) continue;
    const g = el('g', { transform: `translate(${x(p.h)} 10) rotate(${p.dir + 180})` });
    g.append(el('path', { d: 'M0 -6 L4 4 L0 1.5 L-4 4 Z', class: 'wxd-arrow' }));
    svg.append(g);
  }
  const iMax = hours.reduce((m, p, i) => ((p.gust || 0) > (hours[m].gust || 0) ? i : m), 0);
  if (hours[iMax].gust) {
    const anchor = iMax < 2 ? 'start' : iMax > hours.length - 3 ? 'end' : 'middle';
    svg.append(el('text', { x: x(hours[iMax].h), y: y(hours[iMax].gust) - 6, 'text-anchor': anchor, class: 'wx-v' }, String(toWind(hours[iMax].gust, unit))));
  }
  svg.append(el('line', { x1: 0, x2: W, y1: H - B, y2: H - B, class: 'wx-base' }));
  axis(svg, hours, x, H - 4);
  return svg;
}

// Plain-language lines for your hours.
function headlines(hours, unit, from, to) {
  const mine = hours.filter((p) => p.h >= from && p.h < to);
  const lines = [];
  const wet = mine.filter((p) => p.prob >= 50 || p.mm >= 0.3);
  if (wet.length) {
    const mm = mine.reduce((a, p) => a + p.mm, 0);
    const peak = Math.max(...wet.map((p) => p.prob));
    lines.push({ hot: true, text: `Rain likely from ${fmtHour(wet[0].h)} (${peak}%)${mm >= 0.2 ? `, about ${toRain(mm, unit)} ${rainUnit(unit)}` : ''}` });
  } else {
    const peak = Math.max(0, ...mine.map((p) => p.prob));
    lines.push({ text: peak >= 20 ? `Small chance of rain (${peak}%)` : 'Dry' });
  }
  const gust = mine.reduce((m, p) => (p.gust > (m?.gust || 0) ? p : m), null);
  const wind = Math.max(0, ...mine.map((p) => p.wind));
  if (gust && (gust.gust >= 40 || wind >= 28)) {
    lines.push({ hot: true, text: `Windy, gusts up to ${toWind(gust.gust, unit)} ${windUnit(unit)}${gust.dir != null ? ` from the ${compass(gust.dir)}` : ''}` });
  } else {
    const mid = mine[Math.floor(mine.length / 2)];
    lines.push({ text: `Wind ${toWind(wind, unit)} ${windUnit(unit)}${mid?.dir != null ? ` from the ${compass(mid.dir)}` : ''}` });
  }
  return lines;
}

export function openWeather({ day, summary, place, unit, from, to }) {
  // Show from early morning to evening, around your hours.
  const hours = day.filter((p) => p.h >= Math.min(6, from) && p.h <= Math.max(21, to));
  if (hours.length < 2) return;
  const codes = hours.filter((p) => p.h >= from && p.h < to).map((p) => p.code);
  const worst = codes.reduce((a, c) => (c > a ? c : a), 0);
  sheet(place ? `Weather · ${place}` : 'Weather', () => h('div', { class: 'wxd-wrap' },
    h('div', { class: 'wxd-head' },
      h('b', null, `${toUnit(summary.feelsMin, unit)}° → ${toUnit(summary.feelsMax, unit)}°`),
      h('span', null, `${codeLabel(worst) || 'Feels like'} · ${fmtHour(from)}–${fmtHour(to)}`)),
    h('ul', { class: 'why' }, headlines(hours, unit, from, to).map((l) => h('li', { class: l.hot ? 'warn' : '' }, l.text))),
    h('section', null, h('div', { class: 'label' }, 'Feels like'), tempChart(hours, unit, from, to)),
    h('section', null, h('div', { class: 'label' }, 'Chance of rain'), rainChart(hours, unit, from, to)),
    h('section', null,
      h('div', { class: 'label row between' }, h('span', null, `Wind · ${windUnit(unit)}`),
        h('span', { class: 'wxd-key' }, h('i', { class: 'k-wind' }), 'steady', h('i', { class: 'k-gust' }), 'gusts')),
      windChart(hours, unit, from, to)),
    h('p', { class: 'tiny faint' }, 'Shaded: your hours.'),
  ));
}
