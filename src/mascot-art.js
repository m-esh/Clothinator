// The valets. Plain (non-module) script so the launch intro can use the
// portraits before the app has loaded. Each portrait is a 120×120 bust,
// drawn flat and rounded to sit with the rest of the app.
window.CLAD_MASCOTS = {
  fox: {
    name: 'Barnaby',
    kind: 'Fox',
    blurb: 'A fox in a tweed waistcoat. Sharp, warm, a little dry.',
    svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M16 120 Q20 92 60 88 Q100 92 104 120 Z" fill="#6f4c33"/>
      <path d="M30 120 Q32 102 44 96 L52 120 Z M90 120 Q88 102 76 96 L68 120 Z" fill="#5a3c28"/>
      <circle cx="56" cy="110" r="1.6" fill="#d8b98c"/><circle cx="56" cy="117" r="1.6" fill="#d8b98c"/>
      <path d="M47 90 L60 106 L73 90 Z" fill="#f2efe8"/>
      <path d="M60 95 L49 89.5 L49 100.5 Z M60 95 L71 89.5 L71 100.5 Z" fill="#8c2333"/>
      <circle cx="60" cy="95" r="2.8" fill="#6e1a28"/>
      <path d="M60 87 C44 87 31 74 29 57 L22 24 L43 39 C49 36.5 54.5 35.5 60 35.5 C65.5 35.5 71 36.5 77 39 L98 24 L91 57 C89 74 76 87 60 87 Z" fill="#d9712c"/>
      <path d="M26 30 L38.5 40.5 L31 47 Z M94 30 L81.5 40.5 L89 47 Z" fill="#3b2418"/>
      <path d="M60 87 C50 87 38.5 79.5 34 65 C42.5 66.5 50.5 70.5 60 75 C69.5 70.5 77.5 66.5 86 65 C81.5 79.5 70 87 60 87 Z" fill="#f5eee4"/>
      <ellipse cx="60" cy="75" rx="4.6" ry="3.3" fill="#1c1c1e"/>
      <ellipse cx="47" cy="56" rx="3" ry="3.6" fill="#1c1c1e"/><ellipse cx="73" cy="56" rx="3" ry="3.6" fill="#1c1c1e"/>
      <circle cx="48" cy="54.8" r="0.9" fill="#fff"/><circle cx="74" cy="54.8" r="0.9" fill="#fff"/>
      <path d="M41 49.5 Q47 46.5 52 49 M68 49 Q73 46.5 79 49.5" stroke="#8a4318" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M56 80 Q60 82.5 64 80" stroke="#1c1c1e" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    </svg>`,
  },
  bulldog: {
    name: 'Humphrey',
    kind: 'Bulldog',
    blurb: 'A bulldog in a tailcoat. Terse, proper, dependable.',
    svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 120 Q16 92 60 89 Q104 92 108 120 Z" fill="#1f2024"/>
      <path d="M46 91 L60 112 L74 91 Z" fill="#f4f2ec"/>
      <path d="M46 91 L56 120 L40 120 L34 95 Z M74 91 L64 120 L80 120 L86 95 Z" fill="#2c2d33"/>
      <path d="M60 96 L50 91.5 L50 100.5 Z M60 96 L70 91.5 L70 100.5 Z" fill="#111"/>
      <circle cx="60" cy="96" r="2.6" fill="#000"/>
      <path d="M84 104 L92 103 L89 109 Z" fill="#f4f2ec"/>
      <path d="M60 30 C80 30 92 38 94 52 C99 60 100 72 93 80 C86 88 74 90 60 90 C46 90 34 88 27 80 C20 72 21 60 26 52 C28 38 40 30 60 30 Z" fill="#c9a079"/>
      <path d="M30 37 C23 33 18 38 21 46 C25 42 29 41 34 42 Z M90 37 C97 33 102 38 99 46 C95 42 91 41 86 42 Z" fill="#6e5038"/>
      <path d="M48 38 Q60 34 72 38 M50 43 Q60 40 70 43" stroke="#a8825d" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M60 48 C54 56 44 60 34 66 C32 78 44 88 60 88 C76 88 88 78 86 66 C76 60 66 56 60 48 Z" fill="#f3ece1"/>
      <ellipse cx="60" cy="61" rx="9" ry="5.5" fill="#1c1c1e"/>
      <path d="M60 66.5 L60 70 M60 70 C52 70 44 73 40 79 M60 70 C68 70 76 73 80 79" stroke="#7d5c40" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M44 81 C50 85 70 85 76 81 C72 87 48 87 44 81 Z" fill="#8a3d3d"/>
      <path d="M46.5 82 L48.5 76.5 L50.5 82.6 Z M73.5 82 L71.5 76.5 L69.5 82.6 Z" fill="#fff"/>
      <circle cx="45" cy="51.5" r="3" fill="#1c1c1e"/><circle cx="75" cy="51.5" r="3" fill="#1c1c1e"/>
      <circle cx="45.9" cy="50.6" r="0.8" fill="#fff"/><circle cx="75.9" cy="50.6" r="0.8" fill="#fff"/>
      <path d="M39 46 L51 48 M81 46 L69 48" stroke="#5a3f2a" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`,
  },
  corgi: {
    name: 'Reginald',
    kind: 'Corgi',
    blurb: 'A corgi in a flat cap and scarf. Cheerful, quick, kind.',
    svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M18 120 Q22 96 60 92 Q98 96 102 120 Z" fill="#d48a3c"/>
      <path d="M33 92 Q60 103 87 92 L85 101 Q60 112 35 101 Z" fill="#b3352d"/>
      <path d="M41 96 L41 104 M51 98.5 L51 107 M61 99.5 L61 108 M71 98.5 L71 107 M81 96 L81 104" stroke="#7d1f1a" stroke-width="1.6"/>
      <path d="M74 102 L82 120 L72 120 L68 104 Z" fill="#b3352d"/>
      <path d="M33 51 L28 13 L54 39 Z M87 51 L92 13 L66 39 Z" fill="#d48a3c"/>
      <path d="M35 44 L32 22 L48 38 Z M85 44 L88 22 L72 38 Z" fill="#eaa98c"/>
      <path d="M60 91 C42 91 30 79 30 63 C30 50 38 42 48 40 L60 44 L72 40 C82 42 90 50 90 63 C90 79 78 91 60 91 Z" fill="#d48a3c"/>
      <path d="M60 45 C56.5 52 54.5 58 52 62 C43.5 66 41.5 78 51.5 84.5 C55.5 87 64.5 87 68.5 84.5 C78.5 78 76.5 66 68 62 C65.5 58 63.5 52 60 45 Z" fill="#fbf7f1"/>
      <path d="M38 41 C40 29 80 29 82 41 C82 43.5 38 43.5 38 41 Z" fill="#7d6b56"/>
      <path d="M36 41.5 C50 47 70 47 86 42.5 L84 46.5 C70 50.5 50 50.5 36 46 Z" fill="#665643"/>
      <path d="M44 35 L76 35 M42 39 L78 39" stroke="#665643" stroke-width="1"/>
      <ellipse cx="60" cy="70" rx="4.6" ry="3.3" fill="#1c1c1e"/>
      <path d="M53.5 76 Q60 81.5 66.5 76" stroke="#1c1c1e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <circle cx="46" cy="58" r="3.3" fill="#1c1c1e"/><circle cx="74" cy="58" r="3.3" fill="#1c1c1e"/>
      <circle cx="47.1" cy="56.8" r="1" fill="#fff"/><circle cx="75.1" cy="56.8" r="1" fill="#fff"/>
    </svg>`,
  },
  valet: {
    name: 'Ashworth',
    kind: 'Valet',
    blurb: 'A gentleman’s gentleman. Formal, unflappable, discreet.',
    svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M14 120 Q18 93 60 89 Q102 93 106 120 Z" fill="#2a2c32"/>
      <path d="M46 91 L60 113 L74 91 Z" fill="#f4f2ec"/>
      <path d="M50 99 L60 120 L70 99 L66 120 L54 120 Z" fill="#45474f"/>
      <circle cx="60" cy="111" r="1.4" fill="#c9b27a"/><circle cx="60" cy="117" r="1.4" fill="#c9b27a"/>
      <path d="M60 95.5 L50.5 91 L50.5 100 Z M60 95.5 L69.5 91 L69.5 100 Z" fill="#111"/>
      <circle cx="60" cy="95.5" r="2.4" fill="#000"/>
      <path d="M52.5 78 L52.5 91.5 L67.5 91.5 L67.5 78 Z" fill="#d9a986"/>
      <ellipse cx="40.5" cy="60" rx="3.6" ry="6" fill="#d9a986"/><ellipse cx="79.5" cy="60" rx="3.6" ry="6" fill="#d9a986"/>
      <ellipse cx="60" cy="58" rx="20" ry="25" fill="#e3b591"/>
      <path d="M38.5 55 C36.5 36 48 28 62 29.5 C76 30 84.5 40 81.5 55 C79.5 46 73.5 40.5 65 38.5 L55 40.5 C47.5 41.5 41.5 46.5 38.5 55 Z" fill="#2c2420"/>
      <path d="M55 40.5 C58 36 63 34 68 33.5" stroke="#4a3d36" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <path d="M47.5 51 Q52.5 49 56.5 50.5 M63.5 50.5 Q67.5 49 72.5 51" stroke="#2c2420" stroke-width="1.9" fill="none" stroke-linecap="round"/>
      <ellipse cx="52" cy="56.5" rx="2.4" ry="2.8" fill="#2c2420"/><ellipse cx="68" cy="56.5" rx="2.4" ry="2.8" fill="#2c2420"/>
      <circle cx="52.8" cy="55.6" r="0.8" fill="#fff"/><circle cx="68.8" cy="55.6" r="0.8" fill="#fff"/>
      <path d="M58.5 58 Q57.5 64 59 66 Q60.5 66.8 62 66" stroke="#b9876a" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <path d="M60 69 C56 68 52 69 49.5 72 C53 71.5 56.5 71.5 60 70.5 C63.5 71.5 67 71.5 70.5 72 C68 69 64 68 60 69 Z" fill="#2c2420"/>
      <path d="M55.5 75.5 Q60 78 64.5 75.5" stroke="#a0644c" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    </svg>`,
  },
};
