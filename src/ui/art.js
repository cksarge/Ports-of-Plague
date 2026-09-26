// Hand-drawn SVG artwork used across the game (all original, no image files).

export const THEME_COLORS = {
  trade: { main: '#1d4a86', light: '#dbe6f5', label: 'Trade' },
  timeline: { main: '#6b4a1f', light: '#efe2c4', label: 'Timeline' },
  cities: { main: '#8a5a12', light: '#f5e7c6', label: 'Cities' },
  social: { main: '#a82318', light: '#f7dcd6', label: 'Society' },
  economic: { main: '#8b6b0a', light: '#f6ebc4', label: 'Economy' },
  medical: { main: '#1f6b4f', light: '#d7ede3', label: 'Medicine' },
  church: { main: '#5b2a86', light: '#e8dcf2', label: 'Church' },
  persecution: { main: '#3b3024', light: '#e6e0d6', label: 'Persecution' },
  fortune: { main: '#b07d12', light: '#fbf0cf', label: 'Fortune' },
};

// Big illustration for the top band of each card, by theme.
export function themeIllustration(theme, size = 64) {
  const c = THEME_COLORS[theme]?.main ?? '#6b4a1f';
  const g = {
    trade: `<path d="M8 40 h48 l-7 12 H15z" fill="${c}"/><path d="M31 38 V8 l17 26z" fill="#f4e8c8" stroke="${c}" stroke-width="2"/><path d="M29 38 V14 L14 34z" fill="#f4e8c8" stroke="${c}" stroke-width="2"/><path d="M4 56 q7 -5 14 0 t14 0 t14 0 t14 0" fill="none" stroke="${c}" stroke-width="2.5"/>`,
    timeline: `<circle cx="32" cy="32" r="22" fill="#f4e8c8" stroke="${c}" stroke-width="3"/><path d="M32 16 V32 L43 39" stroke="${c}" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="32" cy="32" r="3" fill="${c}"/>`,
    cities: `<path d="M8 54 V30 h8 v-6 h6 v6 h6 V18 l6 -8 l6 8 v12 h6 v-6 h6 v6 h4 v24z" fill="${c}"/><rect x="29" y="40" width="10" height="14" rx="5" fill="#f4e8c8"/><rect x="13" y="36" width="5" height="6" fill="#f4e8c8"/><rect x="47" y="36" width="5" height="6" fill="#f4e8c8"/>`,
    social: `<circle cx="20" cy="20" r="7" fill="${c}"/><circle cx="44" cy="20" r="7" fill="${c}"/><circle cx="32" cy="16" r="8" fill="${c}"/><path d="M8 52 q12 -26 24 0 M32 52 q12 -26 24 0 M18 54 q14 -32 28 0" fill="${c}"/>`,
    economic: `<ellipse cx="24" cy="46" rx="15" ry="6" fill="${c}"/><ellipse cx="24" cy="40" rx="15" ry="6" fill="#d9a82b" stroke="${c}" stroke-width="2"/><ellipse cx="40" cy="30" rx="15" ry="6" fill="${c}"/><ellipse cx="40" cy="24" rx="15" ry="6" fill="#d9a82b" stroke="${c}" stroke-width="2"/><text x="40" y="28" text-anchor="middle" font-family="serif" font-weight="700" font-size="11" fill="${c}">ƒ</text>`,
    medical: `<path d="M32 6 v52" stroke="${c}" stroke-width="4"/><path d="M22 14 q10 6 20 0 q-10 8 -20 14 q10 6 20 14 q-10 6 -20 10" fill="none" stroke="${c}" stroke-width="3"/><circle cx="32" cy="8" r="4" fill="${c}"/><path d="M14 44 q-6 -12 6 -18 M50 44 q6 -12 -6 -18" stroke="${c}" stroke-width="2.5" fill="none"/>`,
    church: `<path d="M28 6 h8 v10 h10 v8 H36 v34 h-8 V24 H18 v-8 h10z" fill="${c}"/><circle cx="32" cy="20" r="14" fill="none" stroke="#d9a82b" stroke-width="2.5"/>`,
    persecution: `<rect x="27" y="22" width="10" height="32" rx="2" fill="#efe6d4" stroke="${c}" stroke-width="2"/><path d="M32 6 q7 8 0 14 q-7 -6 0 -14z" fill="#e0a02a"/><path d="M20 56 h24" stroke="${c}" stroke-width="3"/>`,
    fortune: `<circle cx="32" cy="32" r="24" fill="#fbf0cf" stroke="${c}" stroke-width="3"/>${Array.from({ length: 8 }, (_, i) => `<line x1="32" y1="32" x2="${32 + 24 * Math.cos((i * Math.PI) / 4)}" y2="${32 + 24 * Math.sin((i * Math.PI) / 4)}" stroke="${c}" stroke-width="2"/>`).join('')}<circle cx="32" cy="32" r="7" fill="${c}"/><circle cx="32" cy="32" r="3" fill="#fbf0cf"/>`,
  }[theme] ?? '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${g}</svg>`;
}

// A small castle/city icon centred on (0,0) for the map.
export function castle(fill = '#f4e8c8', stroke = '#2a1c0c') {
  return `<g class="castle"><path d="M-11 7 V-3 h3 v-3 h3 v3 h3 V-9 l2 -3 l2 3 v6 h3 v-3 h3 v3 h3 V7z" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/><path d="M-2 7 v-5 a2 2 0 0 1 4 0 v5" fill="${stroke}" opacity="0.75"/></g>`;
}

// Crest shape centred on (cx, cy) with radius r (used on banners).
export function crestAt(crest, cx, cy, r, fill = '#fff8e8', stroke = 'none', sw = 0) {
  const pts = (list) => list.map(([x, y]) => `${(cx + x * r).toFixed(2)},${(cy + y * r).toFixed(2)}`).join(' ');
  const a = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"`;
  switch (crest) {
    case 'circle': return `<circle cx="${cx}" cy="${cy}" r="${r * 0.95}" ${a}/>`;
    case 'square': return `<rect x="${cx - r * 0.82}" y="${cy - r * 0.82}" width="${r * 1.64}" height="${r * 1.64}" ${a}/>`;
    case 'triangle': return `<polygon points="${pts([[0, -1], [0.95, 0.75], [-0.95, 0.75]])}" ${a}/>`;
    case 'diamond': return `<polygon points="${pts([[0, -1.05], [0.8, 0], [0, 1.05], [-0.8, 0]])}" ${a}/>`;
    case 'hexagon': return `<polygon points="${pts([[-0.5, -0.87], [0.5, -0.87], [1, 0], [0.5, 0.87], [-0.5, 0.87], [-1, 0]])}" ${a}/>`;
    case 'star': return `<polygon points="${pts(Array.from({ length: 10 }, (_, i) => { const rr = i % 2 ? 0.45 : 1; const ang = (i * Math.PI) / 5 - Math.PI / 2; return [rr * Math.cos(ang), rr * Math.sin(ang)]; }))}" ${a}/>`;
    default: return '';
  }
}

// A small house banner (flag on a pole) for trading posts on the map.
// The pole's base is at (0, 0); the number is how many family live there.
export function banner(color, crest, count = 0) {
  return `<g class="banner"><line x1="0" y1="2" x2="0" y2="-24" stroke="#f3d27a" stroke-width="2.4"/><line x1="0" y1="2" x2="0" y2="-24" stroke="#2a1c0c" stroke-width="1"/><circle cx="0" cy="-24.5" r="1.6" fill="#f3d27a" stroke="#2a1c0c" stroke-width="0.6"/><g class="flag"><path d="M0.6 -23 h14 l-3.2 5 l3.2 5 h-14z" fill="${color}" stroke="#1a1208" stroke-width="1"/>${crestAt(crest, 6.2, -18, 2.6, '#fff8e8', '#1a1208', 0.4)}</g>${count ? `<circle cx="0" cy="4" r="5.5" fill="#fff8e8" stroke="#1a1208" stroke-width="1.2"/><text x="0" y="7.3" text-anchor="middle" font-size="8.5" font-weight="800" fill="#1a1208">${count}</text>` : ''}</g>`;
}

// A large hanging heraldic banner (gonfalon) for the pass-the-device screen
// and the turn-order ceremony. viewBox 0 0 100 140.
export function heraldicBanner(color, crest) {
  return `<svg class="heraldic" viewBox="0 0 100 140" aria-hidden="true">
    <defs><linearGradient id="gold-${crest}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset="0.5" stop-color="#d9a82b"/><stop offset="1" stop-color="#8a5a12"/></linearGradient>
    <linearGradient id="cloth-${crest}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0.25"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.15"/><stop offset="0.7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></linearGradient></defs>
    <rect x="6" y="8" width="88" height="6" rx="3" fill="url(#gold-${crest})" stroke="#3b2413" stroke-width="1.2"/>
    <circle cx="6" cy="11" r="5" fill="url(#gold-${crest})" stroke="#3b2413"/><circle cx="94" cy="11" r="5" fill="url(#gold-${crest})" stroke="#3b2413"/>
    <line x1="30" y1="4" x2="50" y2="-6" stroke="#d9a82b" stroke-width="1.5"/><line x1="70" y1="4" x2="50" y2="-6" stroke="#d9a82b" stroke-width="1.5"/>
    <path d="M16 14 H84 V112 L50 132 L16 112 Z" fill="${color}" stroke="#1a1208" stroke-width="2"/>
    <path d="M16 14 H84 V112 L50 132 L16 112 Z" fill="url(#cloth-${crest})"/>
    <path d="M22 20 H78 V109 L50 125 L22 109 Z" fill="none" stroke="#f3d27a" stroke-width="1.6" stroke-dasharray="3 2"/>
    <circle cx="50" cy="62" r="22" fill="#fff8e8" stroke="#1a1208" stroke-width="2"/>
    ${crestAt(crest, 50, 62, 15, color, '#1a1208', 1.6)}
    <path d="M16 112 L50 132 L84 112" fill="none" stroke="#f3d27a" stroke-width="3"/>
    <line x1="50" y1="132" x2="50" y2="138" stroke="#d9a82b" stroke-width="2"/><circle cx="50" cy="138.5" r="2.2" fill="#d9a82b" stroke="#3b2413" stroke-width="0.6"/>
  </svg>`;
}

export function galley(sail = '#f4e8c8', hull = '#5a3a1a', flag = null) {
  return `<g class="galley"><path d="M-12 2 Q0 9 12 2 L10 -1 H-10z" fill="${hull}" stroke="#1a1208" stroke-width="1"/><line x1="-8" y1="3" x2="-11" y2="8" stroke="#1a1208" stroke-width="0.8"/><line x1="-3" y1="4" x2="-5" y2="9" stroke="#1a1208" stroke-width="0.8"/><line x1="3" y1="4" x2="2" y2="9" stroke="#1a1208" stroke-width="0.8"/><line x1="0" y1="-1" x2="0" y2="-15" stroke="#1a1208" stroke-width="1.2"/><path d="M1 -14 L10 -3 H1z" fill="${sail}" stroke="#1a1208" stroke-width="0.9"/>${flag ? `<path d="M0 -15 l5 1.5 l-5 1.5z" fill="${flag}"/>` : ''}</g>`;
}

export function cog(sail = '#f4e8c8', hull = '#6b4423', flag = null) {
  return `<g class="cog"><path d="M-11 0 Q-11 7 0 7 Q11 7 11 0z" fill="${hull}" stroke="#1a1208" stroke-width="1"/><rect x="-11" y="-2" width="4" height="3" fill="${hull}" stroke="#1a1208" stroke-width="0.8"/><rect x="7" y="-2" width="4" height="3" fill="${hull}" stroke="#1a1208" stroke-width="0.8"/><line x1="0" y1="0" x2="0" y2="-17" stroke="#1a1208" stroke-width="1.2"/><path d="M-6 -15 Q0 -12 6 -15 V-4 Q0 -1 -6 -4z" fill="${sail}" stroke="#1a1208" stroke-width="0.9"/>${flag ? `<path d="M0 -17 l5 1.5 l-5 1.5z" fill="${flag}"/>` : ''}</g>`;
}

export function cart(color = '#8a5a2b') {
  return `<g class="cart"><rect x="-8" y="-6" width="16" height="7" rx="1.5" fill="${color}" stroke="#1a1208" stroke-width="1"/><path d="M-7 -6 q7 -6 14 0" fill="#e8d6a8" stroke="#1a1208" stroke-width="0.9"/><circle cx="-5" cy="2.5" r="2.6" fill="#3a2a18"/><circle cx="5" cy="2.5" r="2.6" fill="#3a2a18"/><path d="M8 -2 h6" stroke="#1a1208" stroke-width="1"/></g>`;
}

export function mountains(n = 3, scale = 1) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = i * 11 * scale, h = (10 + (i % 2) * 5) * scale;
    out += `<path d="M${x - 8 * scale} 0 L${x} ${-h} L${x + 8 * scale} 0z" fill="#b8955a" stroke="#6b4a1f" stroke-width="1"/><path d="M${x} ${-h} L${x + 8 * scale} 0 H${x + 2 * scale}z" fill="#8a6a36" opacity="0.6"/><path d="M${x - 2.5 * scale} ${-h + 3.5 * scale} L${x} ${-h} L${x + 2.5 * scale} ${-h + 3.5 * scale}" fill="#fbf5e4"/>`;
  }
  return out;
}

export function trees(n = 3) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = i * 8, y = (i % 2) * 4;
    out += `<path d="M${x} ${y - 11} L${x + 5} ${y - 2} H${x - 5}z M${x} ${y - 7} L${x + 6} ${y + 2} H${x - 6}z" fill="#5f7d3a" stroke="#34491f" stroke-width="0.8"/><line x1="${x}" y1="${y + 2}" x2="${x}" y2="${y + 5}" stroke="#4d3a22" stroke-width="1.2"/>`;
  }
  return out;
}

export function seaMonster() {
  return `<g class="monster" opacity="0.85"><path d="M-30 4 q6 -14 14 -2 q6 -16 14 -2 q6 -14 14 0" fill="none" stroke="#1d4a86" stroke-width="4" stroke-linecap="round"/><path d="M12 0 q10 -10 18 -4 q-2 6 -8 5 q-4 2 -10 -1z" fill="#2c6a8f" stroke="#12324f" stroke-width="1.2"/><circle cx="25" cy="-4" r="1.3" fill="#fff"/><path d="M-30 4 q-8 2 -10 -6" fill="none" stroke="#1d4a86" stroke-width="3" stroke-linecap="round"/><path d="M-26 -1 q-2 -8 4 -10" fill="none" stroke="#7fb3c9" stroke-width="1.5"/></g>`;
}

export function whale() {
  return `<g class="whale" opacity="0.8"><path d="M-22 0 q4 -12 22 -10 q18 2 20 10 q-10 8 -26 6 q-10 -1 -16 -6z" fill="#44708a" stroke="#1e3a4f" stroke-width="1.2"/><path d="M-22 0 l-8 -6 l2 8 l-2 7z" fill="#44708a" stroke="#1e3a4f" stroke-width="1"/><circle cx="12" cy="-3" r="1.2" fill="#fff"/><path d="M4 -12 q-2 -8 3 -12 M4 -12 q4 -7 9 -8" fill="none" stroke="#bfe0ee" stroke-width="1.5"/></g>`;
}

export function compassRose() {
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const long = i % 2 === 0 ? 42 : 26;
    const x = Math.cos(a) * long, y = Math.sin(a) * long;
    const l = Math.cos(a + Math.PI / 2) * 6, m = Math.sin(a + Math.PI / 2) * 6;
    const fill = i % 2 === 0 ? (i === 0 ? '#a82318' : '#1d4a86') : '#c9971f';
    return `<polygon points="${x.toFixed(1)},${y.toFixed(1)} ${l.toFixed(1)},${m.toFixed(1)} ${(-l).toFixed(1)},${(-m).toFixed(1)}" fill="${fill}" stroke="#2a1c0c" stroke-width="1"/>`;
  }).join('');
  return `<g class="compass" aria-hidden="true"><circle r="34" fill="rgba(251,245,228,0.85)" stroke="#8a6a36" stroke-width="2"/><circle r="30" fill="none" stroke="#c9971f" stroke-width="1" stroke-dasharray="2 3"/>${pts}<circle r="5" fill="#c9971f" stroke="#2a1c0c"/><text y="-48" text-anchor="middle" font-family="Cinzel, serif" font-weight="800" font-size="15" fill="#a82318">N</text></g>`;
}

export function cartouche(title, sub) {
  return `<g class="cartouche"><path d="M-110 -30 h220 q12 0 12 12 v36 q0 12 -12 12 h-220 q-12 0 -12 -12 v-36 q0 -12 12 -12z" fill="#fbf5e4" stroke="#8a6a36" stroke-width="2.5"/><path d="M-104 -24 h208 v48 h-208z" fill="none" stroke="#c9971f" stroke-width="1"/><path d="M-122 0 q-14 -10 -8 -24 q6 10 8 24 q-6 12 -14 18 q12 -2 14 -18z" fill="#a82318"/><path d="M122 0 q14 -10 8 -24 q-6 10 -8 24 q6 12 14 18 q-12 -2 -14 -18z" fill="#a82318"/><text y="-2" text-anchor="middle" font-family="Unifraktur, serif" font-size="25" fill="#a82318">${title}</text><text y="17" text-anchor="middle" font-family="Cinzel, serif" font-weight="800" font-size="10.5" letter-spacing="2" fill="#4d3a22">${sub}</text></g>`;
}

export function coinIcon(size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#e0b13a" stroke="#7a560c" stroke-width="1.5"/><circle cx="10" cy="10" r="5.8" fill="none" stroke="#b58415" stroke-width="1"/><text x="10" y="13.6" text-anchor="middle" font-family="serif" font-weight="700" font-size="10" fill="#6b4a0a">ƒ</text></svg>`;
}
export function laurelIcon(size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 18 C4 16 2 10 4 4 M10 18 C16 16 18 10 16 4" fill="none" stroke="#3f6b2a" stroke-width="1.6"/>${[5, 8, 11, 14].map((y, i) => `<ellipse cx="${4 + i * 0.4}" cy="${y}" rx="2.4" ry="1.2" transform="rotate(-35 ${4 + i * 0.4} ${y})" fill="#5f8f3a"/><ellipse cx="${16 - i * 0.4}" cy="${y}" rx="2.4" ry="1.2" transform="rotate(35 ${16 - i * 0.4} ${y})" fill="#5f8f3a"/>`).join('')}<circle cx="10" cy="9" r="2.2" fill="#c9971f"/></svg>`;
}
export function familyIcon(size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="7" cy="5.5" r="2.8" fill="#8a3b2a"/><path d="M2.5 17 q0 -8 4.5 -8 q4.5 0 4.5 8z" fill="#8a3b2a"/><circle cx="14" cy="7.5" r="2.3" fill="#1d4a86"/><path d="M10.3 17 q0 -6.5 3.7 -6.5 q3.7 0 3.7 6.5z" fill="#1d4a86"/></svg>`;
}
export function candleIcon(lit = true, size = 20) {
  return `<svg width="${size * 0.7}" height="${size}" viewBox="0 0 14 20" aria-hidden="true"><rect x="4" y="8" width="6" height="11" rx="1" fill="${lit ? '#f4ead0' : '#b9ad92'}" stroke="#6b4a1f" stroke-width="1"/>${lit ? '<path class="flame" d="M7 1 q3.5 4 0 7 q-3.5 -3 0 -7z" fill="#f0a32a"/><path d="M7 3.5 q1.5 2 0 3.4 q-1.5 -1.4 0 -3.4z" fill="#fff3c4"/>' : '<path d="M7 7 v-2" stroke="#4d3a22" stroke-width="1"/>'}</svg>`;
}

// Crest shapes for sidebars and dialogs (hexagon and star for players 5 and 6).
export function crestPath(crest, s) {
  const c = s / 2;
  return {
    circle: `<circle cx="${c}" cy="${c}" r="${c - 2}"/>`,
    square: `<rect x="2" y="2" width="${s - 4}" height="${s - 4}" rx="2"/>`,
    triangle: `<polygon points="${c},2 ${s - 2},${s - 2} 2,${s - 2}"/>`,
    diamond: `<polygon points="${c},1 ${s - 1},${c} ${c},${s - 1} 1,${c}"/>`,
    hexagon: `<polygon points="${s * 0.25},2 ${s * 0.75},2 ${s - 1},${c} ${s * 0.75},${s - 2} ${s * 0.25},${s - 2} 1,${c}"/>`,
    star: `<polygon points="${Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? c * 0.45 : c - 1; const a = (i * Math.PI) / 5 - Math.PI / 2; return `${(c + r * Math.cos(a)).toFixed(1)},${(c + r * Math.sin(a)).toFixed(1)}`; }).join(' ')}"/>`,
  }[crest];
}
