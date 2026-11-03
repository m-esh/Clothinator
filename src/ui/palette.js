// Colour schemes. The colours themselves live in the CSS as token sets;
// this applies the chosen one and remembers it for the next launch.

export const PALETTES = [
  { key: 'graphite', label: 'Graphite', bg: '#0a0a0b', dots: ['#e9e9ec', '#d9c49a', '#9fb4cf', '#c3b5d6'] },
  { key: 'denim', label: 'Denim', bg: '#0b1122', dots: ['#8199ff', '#e3bf72', '#86a6ff', '#c9a6ec'] },
  { key: 'espresso', label: 'Espresso', bg: '#170f09', dots: ['#e2a465', '#e8c172', '#9fbf8f', '#dba3a0'] },
  { key: 'forest', label: 'Forest', bg: '#07150f', dots: ['#7fd6b0', '#e5c06f', '#78c2c6', '#e3a58c'] },
  { key: 'plum', label: 'Plum', bg: '#120a1c', dots: ['#b792ff', '#e9c47c', '#8fb4ff', '#f2a7cb'] },
  { key: 'oxblood', label: 'Oxblood', bg: '#18090e', dots: ['#e4707e', '#e6c27a', '#8eaee6', '#d9a6c8'] },
];

export function applyPalette(key) {
  const p = PALETTES.find((x) => x.key === key) || PALETTES[0];
  const root = document.documentElement;
  if (p.key === 'denim') delete root.dataset.palette;
  else root.dataset.palette = p.key;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bg);
  // A copy for the next launch, read before the first paint (see index.html).
  try { localStorage.setItem('palette', p.key); } catch { /* storage blocked: fine */ }
}

// The intro reads the valet before the app loads; keep a copy for it.
export function rememberMascot(key) {
  try { localStorage.setItem('mascot', key || 'fox'); } catch { /* fine */ }
}
