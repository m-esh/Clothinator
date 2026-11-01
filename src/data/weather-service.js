// Where you are and what the weather is doing there, with caching so the
// app opens instantly and still works on a flaky connection.

import { fetchForecast, summarize } from '../core/weather.js';
import { getKV, setKV } from './store.js';

const HOUR = 3600000;

function geolocate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location isn\'t available on this device'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? 'Location permission was declined' : 'Couldn\'t get your location')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 30 * 60000 },
    );
  });
}

async function coords(prefs) {
  if (prefs.location) return { ...prefs.location, label: prefs.location.name };
  const cached = await getKV('coords');
  if (cached && Date.now() - cached.at < 3 * HOUR) return { ...cached, label: null };
  try {
    const c = await geolocate();
    await setKV('coords', { ...c, at: Date.now() });
    return { ...c, label: null };
  } catch (e) {
    if (cached) return { ...cached, label: null };
    throw e;
  }
}

const near = (a, b) => Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.05;

/** @returns { summary, place, stale } — throws if there's nothing at all to show */
export async function getWeather(prefs, date, { force = false } = {}) {
  const c = await coords(prefs);
  const cached = await getKV('forecast');
  const fresh = cached && near(cached, c) && Date.now() - cached.at < HOUR;
  if (fresh && !force) {
    const s = summarize(cached.data, date, prefs.from, prefs.to);
    if (s) return { summary: s, place: c.label, stale: false };
  }
  try {
    const data = await fetchForecast(c.lat, c.lon);
    await setKV('forecast', { lat: c.lat, lon: c.lon, at: Date.now(), data });
    return { summary: summarize(data, date, prefs.from, prefs.to), place: c.label, stale: false };
  } catch (e) {
    if (cached && near(cached, c)) {
      const s = summarize(cached.data, date, prefs.from, prefs.to);
      if (s) return { summary: s, place: c.label, stale: true };
    }
    throw new Error('Couldn\'t load the weather');
  }
}
