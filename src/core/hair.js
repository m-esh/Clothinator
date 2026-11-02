// Hairstyles, optional (Settings → Hair). Pure: pick one for the day.

export const DEFAULT_STYLES = [
  { id: 'natural', name: 'Natural', modes: ['fancy', 'casual', 'comfy'], weatherProof: false },
  { id: 'side-part', name: 'Side part', modes: ['fancy', 'casual'], weatherProof: false },
  { id: 'slicked', name: 'Slicked back', modes: ['fancy'], weatherProof: true },
  { id: 'textured', name: 'Textured / messy', modes: ['casual', 'comfy'], weatherProof: false },
  { id: 'ponytail', name: 'Ponytail', modes: ['casual', 'comfy'], weatherProof: true },
  { id: 'bun', name: 'Bun', modes: ['fancy', 'casual', 'comfy'], weatherProof: true },
];

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * @param styles  [{ id, name, modes, weatherProof }]
 * @param o.mode, o.weather, o.today, o.wears (with .hair = style id), o.offset (taps on "Change")
 * @returns the chosen style, or null when there are none
 */
export function pickHair(styles, { mode, weather, today, wears = [], offset = 0 }) {
  if (!styles?.length) return null;
  const fits = styles.filter((s) => !s.modes?.length || s.modes.includes(mode));
  const pool = fits.length ? fits : styles;
  const rough = !!(weather && (weather.wet || weather.windy));
  const lastHair = [...wears].filter((w) => w.hair && w.date < today).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.hair;
  const ranked = pool
    .map((s) => ({
      s,
      score: (rough && s.weatherProof ? 2 : 0) - (s.id === lastHair ? 1 : 0) + (hash(`${today}:${mode}:${s.id}`) % 1000) / 1000,
    }))
    .sort((a, b) => b.score - a.score);
  return ranked[((offset % ranked.length) + ranked.length) % ranked.length].s;
}
