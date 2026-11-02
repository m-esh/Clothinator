// Weather for the hours you're out. Only `fetchForecast` touches the network;
// the rest is pure so the outfit engine and tests can use it directly.

const API = 'https://api.open-meteo.com/v1/forecast';

export async function fetchForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: [
      'temperature_2m', 'apparent_temperature', 'precipitation_probability',
      'precipitation', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'weather_code', 'cloud_cover',
    ].join(','),
    timezone: 'auto',
    forecast_days: '2',
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  return res.json();
}

export async function geocode(query) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&name=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`geocoding ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((r) => ({
    name: [r.name, r.admin1, r.country_code].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

const WET_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

// Reduce an Open-Meteo hourly response to the window [from, to) on `date`
// (YYYY-MM-DD, local to the forecast's timezone).
export function summarize(forecast, date, from = 9, to = 17) {
  const h = forecast.hourly;
  const idx = [];
  for (let i = 0; i < h.time.length; i++) {
    const [d, t] = h.time[i].split('T');
    const hour = Number(t.slice(0, 2));
    if (d === date && hour >= from && hour < to) idx.push(i);
  }
  if (!idx.length) return null;

  const pick = (key) => idx.map((i) => h[key]?.[i]).filter((v) => v != null);
  const temps = pick('temperature_2m');
  const feels = pick('apparent_temperature');
  const probs = pick('precipitation_probability');
  const mm = pick('precipitation');
  const wind = pick('wind_speed_10m');
  const gusts = pick('wind_gusts_10m');
  const clouds = pick('cloud_cover');
  const codes = pick('weather_code');

  const wetHours = idx.filter((i) => (h.precipitation_probability?.[i] ?? 0) >= 50 || (h.precipitation?.[i] ?? 0) >= 0.3);
  const firstWet = wetHours.length ? Number(h.time[wetHours[0]].slice(11, 13)) : null;
  const rainMm = mm.reduce((a, b) => a + b, 0);
  const rainChance = probs.length ? Math.max(...probs) : 0;

  const hours = idx.map((i) => ({
    h: Number(h.time[i].slice(11, 13)),
    feels: h.apparent_temperature?.[i] ?? h.temperature_2m[i],
    wet: (h.precipitation_probability?.[i] ?? 0) >= 50 || (h.precipitation?.[i] ?? 0) >= 0.3,
  }));

  return {
    date,
    from,
    to,
    hours,
    min: Math.min(...temps),
    max: Math.max(...temps),
    feelsMin: Math.min(...feels),
    feelsMax: Math.max(...feels),
    rainChance,
    rainMm: Math.round(rainMm * 10) / 10,
    wet: rainChance >= 50 || rainMm >= 1,
    snow: codes.some((c) => SNOW_CODES.has(c)),
    wetFrom: firstWet,
    wind: Math.max(...wind),
    gusts: gusts.length ? Math.max(...gusts) : 0,
    windy: Math.max(...wind) >= 28 || (gusts.length && Math.max(...gusts) >= 45),
    sunny: clouds.length ? clouds.reduce((a, b) => a + b, 0) / clouds.length < 35 && !codes.some((c) => WET_CODES.has(c)) : false,
  };
}

// How much insulation an outfit needs at a given "feels like" temperature,
// on the same scale as summed item warmth (a t-shirt and jeans ≈ 2.2).
export function requiredWarmth(feelsC) {
  return Math.min(13, Math.max(1, (24 - feelsC) / 3.2 + 2.2));
}

export const toUnit = (c, unit) => (unit === 'F' ? Math.round(c * 9 / 5 + 32) : Math.round(c));

// The same facts as short care-label items: [{ text, hot }].
export function labelParts(w, unit = 'C') {
  if (!w) return [];
  const lo = toUnit(w.feelsMin, unit), hi = toUnit(w.feelsMax, unit);
  const parts = [{ text: lo === hi ? `${lo}°${unit}` : `${lo}°→${hi}°${unit}` }];
  if (w.snow) parts.push({ text: 'snow', hot: true });
  else if (w.wet) parts.push({ text: w.wetFrom != null && w.wetFrom > w.from ? `rain ${fmtHour(w.wetFrom)}` : 'rain', hot: true });
  else if (w.rainChance >= 30) parts.push({ text: `rain ${w.rainChance}%` });
  if (w.windy) parts.push({ text: `wind ${Math.round(w.wind)} km/h`, hot: true });
  else if (w.sunny && !w.wet) parts.push({ text: 'sun' });
  else if (!w.wet) parts.push({ text: 'dry' });
  return parts;
}

export function describe(w, unit = 'C') {
  if (!w) return '';
  const lo = toUnit(w.feelsMin, unit), hi = toUnit(w.feelsMax, unit);
  const parts = [lo === hi ? `${lo}°` : `${lo}° to ${hi}°`];
  if (w.snow) parts.push('snow');
  else if (w.wet) parts.push(w.wetFrom != null && w.wetFrom > w.from ? `rain from ${fmtHour(w.wetFrom)}` : 'rain');
  else if (w.rainChance >= 30) parts.push(`${w.rainChance}% chance of rain`);
  if (w.windy) parts.push('windy');
  if (w.sunny && !w.wet) parts.push('sunny');
  return parts.join(', ');
}

export const fmtHour = (h) => (h === 0 || h === 24 ? '12am' : h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`);

// Every hour of `date`, for the detailed weather view.
export function dayHours(forecast, date) {
  const h = forecast?.hourly;
  if (!h) return [];
  const out = [];
  for (let i = 0; i < h.time.length; i++) {
    const [d, t] = h.time[i].split('T');
    if (d !== date) continue;
    out.push({
      h: Number(t.slice(0, 2)),
      temp: h.temperature_2m?.[i],
      feels: h.apparent_temperature?.[i] ?? h.temperature_2m?.[i],
      prob: h.precipitation_probability?.[i] ?? 0,
      mm: h.precipitation?.[i] ?? 0,
      wind: h.wind_speed_10m?.[i] ?? 0,
      gust: h.wind_gusts_10m?.[i] ?? 0,
      dir: h.wind_direction_10m?.[i] ?? null,
      code: h.weather_code?.[i] ?? null,
    });
  }
  return out;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
// Wind direction is where it blows *from*, as forecasts give it.
export const compass = (deg) => (deg == null ? '' : COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]);

export const windUnit = (unit) => (unit === 'F' ? 'mph' : 'km/h');
export const toWind = (kmh, unit) => Math.round(unit === 'F' ? kmh * 0.621371 : kmh);
export const rainUnit = (unit) => (unit === 'F' ? 'in' : 'mm');
export const toRain = (mm, unit) => (unit === 'F' ? Math.round((mm / 25.4) * 100) / 100 : Math.round(mm * 10) / 10);

const CODES = [
  [[0], 'Clear'], [[1], 'Mostly clear'], [[2], 'Partly cloudy'], [[3], 'Overcast'], [[45, 48], 'Fog'],
  [[51, 53, 55, 56, 57], 'Drizzle'], [[61, 80], 'Light rain'], [[63, 81], 'Rain'], [[65, 82], 'Heavy rain'],
  [[66, 67], 'Freezing rain'], [[71, 73, 75, 77, 85, 86], 'Snow'], [[95, 96, 99], 'Thunderstorms'],
];
export const codeLabel = (c) => CODES.find(([cs]) => cs.includes(c))?.[1] || '';
