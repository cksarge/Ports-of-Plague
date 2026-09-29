// The SVG game board: a painted map with routes, castle cities, plague
// clouds, house banners, and ships and carts that sail the routes.
import mapData from '../../data/map.json' with { type: 'json' };
import { DATA, CITIES } from '../data.js';
import { project } from '../projection.js';
import { isThreatened, familyAt } from '../engine/state.js';
import { sleep, reducedMotion, esc } from './dom.js';
import { castle, banner, galley, cog, cart, mountains, trees, seaMonster, whale, compassRose, cartouche } from './art.js';

const NS = 'http://www.w3.org/2000/svg';
const P = (lon, lat) => project(lon, lat).map((v) => v.toFixed(1)).join(',');
export const POS = {};
for (const c of DATA.cities) {
  const [x, y] = project(c.lon, c.lat);
  POS[c.id] = [x + (c.map?.dx ?? 0), y + (c.map?.dy ?? 0)];
}

function smoothPath(pts) {
  if (pts.length === 2) return `M${pts[0]}L${pts[1]}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
const routePoints = (r) => [POS[r.a], ...(r.via ?? []).map(([lon, lat]) => project(lon, lat)), POS[r.b]];

const LABEL = {
  right: (x, y) => ({ x: x + 15, y: y + 2, anchor: 'start' }),
  left: (x, y) => ({ x: x - 15, y: y + 2, anchor: 'end' }),
  above: (x, y) => ({ x, y: y - 17, anchor: 'middle' }),
  below: (x, y) => ({ x, y: y + 46, anchor: 'middle' }),
};

// Latin region names, painted faintly on the map (decoration only).
const REGIONS = [
  ['OCEANVS', -9.2, 45, -90, 16], ['MARE MEDITERRANEVM', 16.5, 34.6, 0, 15], ['MARE NIGRVM', 34.5, 43.3, 0, 12],
  ['MARE BALTICVM', 19.6, 57.3, -52, 11], ['MARE GERMANICVM', 3.2, 56.3, -70, 11], ['FRANCIA', 2.3, 46.6, 0, 15],
  ['HISPANIA', -4.2, 40.2, 0, 15], ['ITALIA', 14.2, 42.1, -48, 13], ['ANGLIA', -1.5, 52.9, 0, 11], ['IMPERIVM', 11.5, 50.7, 0, 13],
  ['RVSSIA', 35, 58.2, 0, 15], ['AFRICA', 4, 32.4, 0, 15], ['AEGYPTVS', 27.5, 29.8, 0, 11], ['HVNGARIA', 19.8, 47.2, 0, 11], ['NORVEGIA', 9.5, 61.8, 0, 10],
];
const MOUNTAINS = [[7.2, 46.4, 5, 1], [10.5, 46.8, 4, 0.9], [-0.8, 42.7, 4, 0.85], [22.5, 48.2, 4, 0.85], [21.5, 42.6, 3, 0.8], [12.8, 43.2, 2, 0.7], [8.2, 60.5, 3, 0.8], [-4, 32.8, 4, 0.9], [40.5, 43.2, 3, 0.9], [15.5, 50.4, 2, 0.7]];
const FORESTS = [[9, 51.8, 3], [18, 52.8, 4], [29, 56, 4], [26, 61, 3], [14, 57.3, 3], [34, 52.5, 3], [0.5, 48.8, 2], [4, 50.2, 2]];

export function createMap(container, { onCity, decorative = false } = {}) {
  const W = mapData.width, H = mapData.height;
  const routesSvg = DATA.routes.map((r) => `<path id="route-${r.id}" class="route ${r.type}" d="${smoothPath(routePoints(r))}"><title>${esc(CITIES[r.a].name)}–${esc(CITIES[r.b].name)}: ${r.type} route, value ${r.value}</title></path>`).join('');
  const citiesSvg = DATA.cities.map((c) => {
    const [x, y] = POS[c.id];
    const l = LABEL[c.map?.label ?? 'right'](x, y);
    return `<g class="city" id="city-${c.id}" data-city="${c.id}" ${decorative ? '' : 'tabindex="0" role="button"'} aria-label="${esc(c.name)}">
      <circle class="glow" cx="${x}" cy="${y}" r="20"/>
      <circle class="ring" cx="${x}" cy="${y}" r="15"/>
      <g transform="translate(${x},${y})">${castle()}</g>
      <g class="pips"></g><g class="miasma"></g>
      <text class="label" x="${l.x}" y="${l.y}" text-anchor="${l.anchor}">${esc(c.name)}</text>
    </g>`;
  }).join('');
  const deco = [
    ...REGIONS.map(([t, lon, lat, rot, size]) => { const [x, y] = project(lon, lat); return `<text class="region" x="${x}" y="${y}" font-size="${size}" transform="rotate(${rot} ${x} ${y})" text-anchor="middle">${t}</text>`; }),
    ...MOUNTAINS.map(([lon, lat, n, s]) => `<g transform="translate(${P(lon, lat)})">${mountains(n, s)}</g>`),
    ...FORESTS.map(([lon, lat, n]) => `<g transform="translate(${P(lon, lat)})">${trees(n)}</g>`),
    `<g transform="translate(${P(-9.4, 49.5)}) scale(0.9)"><g class="bob">${seaMonster()}</g></g>`,
    `<g transform="translate(${P(1.5, 61.2)}) scale(0.8)"><g class="bob slow">${whale()}</g></g>`,
    `<g transform="translate(${P(39.1, 42.4)}) scale(0.95)">${compassRose()}</g>`,
    `<g transform="translate(${P(-4.6, 60.6)})">${cartouche('Europa', 'MCCCXLVII – MCCCLIII')}</g>`,
  ].join('');
  container.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="map-title" preserveAspectRatio="xMidYMid meet" style="overflow:visible">
    <title id="map-title">Painted map of Europe and the Mediterranean with ${DATA.cities.length} trading cities and their routes</title>
    <defs>
      <linearGradient id="seaGrad" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#1b5a6e"/><stop offset="0.55" stop-color="#26788a"/><stop offset="1" stop-color="#2f8a8f"/></linearGradient>
      <radialGradient id="landGrad" cx="0.45" cy="0.45" r="0.8"><stop offset="0" stop-color="#f6e7bd"/><stop offset="0.7" stop-color="#ead08e"/><stop offset="1" stop-color="#d9b56a"/></radialGradient>
      <pattern id="waves" width="46" height="26" patternUnits="userSpaceOnUse"><path d="M2 13 q5 -5 10 0 t10 0" fill="none" stroke="#9fd3d6" stroke-width="1.2" opacity="0.45"/><path d="M25 3 q4 -4 8 0 t8 0" fill="none" stroke="#9fd3d6" stroke-width="1" opacity="0.3"/>${reducedMotion() ? '' : '<animateTransform attributeName="patternTransform" type="translate" from="0 0" to="46 0" dur="14s" repeatCount="indefinite"/>'}</pattern>
      <radialGradient id="stain"><stop offset="0" stop-color="#5a0d07" stop-opacity="0.6"/><stop offset="0.6" stop-color="#8f1d14" stop-opacity="0.28"/><stop offset="1" stop-color="#8f1d14" stop-opacity="0"/></radialGradient>
      <radialGradient id="puff"><stop offset="0" stop-color="#3b4a32" stop-opacity="0.7"/><stop offset="1" stop-color="#3b4a32" stop-opacity="0"/></radialGradient>
      <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#b8322a"/><line x1="0" y1="0" x2="0" y2="5" stroke="#5c0f09" stroke-width="2"/></pattern>
      <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.1  0 0 0 0.09 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    </defs>
    <rect x="-420" y="-420" width="${W + 840}" height="${H + 840}" fill="url(#seaGrad)"/>
    <rect x="-420" y="-420" width="${W + 840}" height="${H + 840}" fill="url(#waves)"/>
    <path class="shallows" d="${mapData.land}"/>
    <path class="land" d="${mapData.land}"/>
    <path class="lake" d="${mapData.lakes}"/>
    <path class="river" d="${mapData.rivers}"/>
    <path d="${mapData.land}" filter="url(#paper)" fill="#000" pointer-events="none"/>
    <g id="deco" pointer-events="none">${deco}</g>
    <g id="stains"></g>
    <g id="routes">${routesSvg}</g>
    <g id="route-values"></g>
    <g id="ambient"></g>
    <g id="cities">${citiesSvg}</g>
    <g id="tokens"></g>
    <g id="ships"></g>
    <g id="floaters"></g>
  </svg>
  ${decorative ? '' : `<div class="legend" aria-label="Map legend">
    <h3><button class="legend-toggle" aria-expanded="true">Legend <span aria-hidden="true">▾</span></button></h3>
    <div class="row"><svg width="26" height="22" viewBox="-13 -12 26 22">${castle()}</svg> Safe city</div>
    <div class="row"><svg width="26" height="22" viewBox="-13 -12 26 22"><circle r="10" fill="none" stroke="#e7a02b" stroke-width="3" stroke-dasharray="4 3"/>${castle()}</svg> Threatened (next to plague)</div>
    <div class="row"><svg width="26" height="22" viewBox="-13 -12 26 22"><circle r="10" fill="none" stroke="#c0281c" stroke-width="3"/>${castle('url(#hatch)')}</svg> Stricken (pips = severity)</div>
    <div class="row"><svg width="26" height="22" viewBox="-13 -12 26 22"><circle r="10" fill="none" stroke="#6f6a5f" stroke-width="3"/>${castle('#cfc8b8', '#55504a')}</svg> Aftermath</div>
    <div class="row"><svg width="26" height="26" viewBox="-6 -20 22 28">${banner('#888', 'circle', 2)}</svg> Trading post (number = family)</div>
    <div class="row"><svg width="26" height="10"><line x1="1" y1="5" x2="25" y2="5" stroke="#10375c" stroke-width="2.5" stroke-dasharray="1 4" stroke-linecap="round"/></svg> Sea route <svg width="26" height="10"><line x1="1" y1="5" x2="25" y2="5" stroke="#6b4423" stroke-width="2.5" stroke-dasharray="6 4"/></svg> Land</div>
  </div>`}
  <div class="map-credit">${esc(mapData.credit)}</div>
  ${decorative ? '' : `<div class="map-zoom" role="group" aria-label="Map zoom">
    <button class="zoom-in" aria-label="Zoom in" title="Zoom in (or scroll / pinch)">+</button>
    <button class="zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
    <button class="zoom-reset" aria-label="Show the whole map" title="Show the whole map">⤢</button>
  </div>`}`;

  const svg = container.querySelector('svg');
  container.style.setProperty('--map-aspect', `${W} / ${H}`);
  const vals = svg.querySelector('#route-values');
  for (const r of DATA.routes) {
    const path = svg.querySelector(`#route-${CSS.escape(r.id)}`);
    const len = path.getTotalLength?.() ?? 0;
    const pt = len ? path.getPointAtLength(len / 2) : { x: (POS[r.a][0] + POS[r.b][0]) / 2, y: (POS[r.a][1] + POS[r.b][1]) / 2 };
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', `route-value ${r.type}`);
    g.innerHTML = `<circle cx="${pt.x}" cy="${pt.y}" r="7.5"/><text x="${pt.x}" y="${pt.y + 3.8}" text-anchor="middle">${r.value}</text>`;
    vals.appendChild(g);
  }
  if (!decorative) {
    const legend = container.querySelector('.legend');
    const toggle = legend.querySelector('.legend-toggle');
    const setLegend = (open) => {
      legend.classList.toggle('collapsed', !open);
      toggle.setAttribute('aria-expanded', open);
      toggle.querySelector('span').textContent = open ? '▾' : '▸';
      try { localStorage.setItem('ports-of-plague-legend-open', open ? '1' : '0'); } catch { /* ignore */ }
    };
    // Folded by default: open, it would cover the cities of southern Spain.
    let open = false;
    try { open = localStorage.getItem('ports-of-plague-legend-open') === '1'; } catch { /* ignore */ }
    setLegend(open);
    toggle.onclick = () => setLegend(legend.classList.contains('collapsed'));
    enableZoom(container, svg, W, H);
    svg.querySelector('#cities').addEventListener('click', (e) => {
      const g = e.target.closest('.city');
      if (g) onCity?.(g.dataset.city);
    });
    svg.querySelector('#cities').addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.city')) {
        e.preventDefault();
        onCity?.(e.target.closest('.city').dataset.city);
      }
    });
  }
  return svg;
}

// ---------- Zoom and pan ----------
// Wheel or trackpad pinch zooms around the pointer, dragging pans, two
// fingers pinch on touch screens, and the +/−/⤢ buttons do the same. The
// view is the SVG viewBox, sized to the frame so nothing is letterboxed.
const MAX_ZOOM = 5;
function enableZoom(container, svg, W, H) {
  const xs = Object.values(POS).map((p) => p[0]);
  const homeX = Math.max(W / 2, (Math.min(...xs) - 70 + Math.max(...xs) + 100) / 2); // centre on the cities, not the empty Atlantic
  let z = 1, cx = homeX, cy = H / 2;
  const base = () => {
    const a = (container.clientWidth || W) / (container.clientHeight || H);
    return a > W / H ? [H * a, H] : [W, W / a];
  };
  const clampAxis = (c, view, extent) => {
    const lo = Math.min(view / 2, extent - view / 2), hi = Math.max(view / 2, extent - view / 2);
    return Math.min(hi, Math.max(lo, c));
  };
  const apply = () => {
    const [bw, bh] = base();
    const vw = bw / z, vh = bh / z;
    if (z === 1) { cx = homeX; cy = H / 2; }
    cx = clampAxis(cx, vw, W);
    cy = clampAxis(cy, vh, H);
    svg.setAttribute('viewBox', `${(cx - vw / 2).toFixed(1)} ${(cy - vh / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`);
    svg.style.touchAction = z > 1 ? 'none' : 'pan-y';
    container.classList.toggle('zoomed', z > 1);
    container.querySelector('.zoom-in').disabled = z >= MAX_ZOOM;
    container.querySelector('.zoom-out').disabled = container.querySelector('.zoom-reset').disabled = z <= 1;
  };
  // Map point under a screen point, for the current view.
  const toMap = (px, py) => {
    const r = svg.getBoundingClientRect();
    const [bw, bh] = base();
    return [cx - bw / z / 2 + ((px - r.left) / r.width) * (bw / z), cy - bh / z / 2 + ((py - r.top) / r.height) * (bh / z)];
  };
  const zoomAt = (px, py, factor) => {
    const [mx, my] = toMap(px, py);
    const nz = Math.min(MAX_ZOOM, Math.max(1, z * factor));
    const k = z / nz;
    cx = mx + (cx - mx) * k;
    cy = my + (cy - my) * k;
    z = nz;
    apply();
  };
  const zoomCentre = (factor) => {
    const r = svg.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  };

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)));
  }, { passive: false });

  const pointers = new Map();
  let dragged = false, pinch = null;
  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (pointers.size === 1) dragged = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d);
      pinch.d = d;
      dragged = true;
      return;
    }
    if (!dragged && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 6) return;
    if (z === 1) return; // nothing to pan: let the page scroll instead
    if (!dragged) { dragged = true; svg.setPointerCapture?.(e.pointerId); container.classList.add('panning'); }
    const r = svg.getBoundingClientRect();
    const [bw] = base();
    const s = bw / z / r.width;
    cx -= dx * s; cy -= dy * s;
    apply();
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) container.classList.remove('panning');
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  // A drag or pinch that ends over a city must not also select it.
  svg.addEventListener('click', (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);

  container.querySelector('.zoom-in').onclick = () => zoomCentre(1.5);
  container.querySelector('.zoom-out').onclick = () => zoomCentre(1 / 1.5);
  container.querySelector('.zoom-reset').onclick = () => { z = 1; apply(); };
  new ResizeObserver(apply).observe(container);
  apply();
}

export function updateMap(svg, state, { selectable = null, selected = null, highlightRoutes = [] } = {}) {
  for (const c of DATA.cities) {
    const g = svg.querySelector(`#city-${c.id}`);
    const cs = state.cities[c.id];
    const threatened = isThreatened(state, c.id);
    g.classList.toggle('stricken', cs.state === 'stricken');
    g.classList.toggle('aftermath', cs.state === 'aftermath');
    g.classList.toggle('threatened', threatened);
    g.classList.toggle('home', state.players.some((p) => p.home === c.id));
    g.classList.toggle('selectable', !!selectable?.has(c.id));
    g.classList.toggle('selected', selected === c.id);
    const [x, y] = POS[c.id];
    const castleFill = cs.state === 'stricken' ? 'url(#hatch)' : cs.state === 'aftermath' ? '#cfc8b8' : state.players.some((p) => p.home === c.id) ? '#fff3d2' : '#f4e8c8';
    const castleEl = g.querySelector('.castle path');
    if (castleEl) castleEl.setAttribute('fill', castleFill);
    g.querySelector('.pips').innerHTML = cs.state === 'stricken'
      ? Array.from({ length: cs.severity }, (_, i) => `<circle class="pip" cx="${x - 7 + i * 7}" cy="${y - 19}" r="3.2"/>`).join('')
      : '';
    const mia = g.querySelector('.miasma');
    if (cs.state === 'stricken' && !mia.childElementCount && !reducedMotion()) {
      mia.innerHTML = [0, 1, 2].map((i) => `<ellipse class="puff p${i}" cx="${x + (i - 1) * 7}" cy="${y - 6}" rx="${10 + i * 2}" ry="${7 + i}" fill="url(#puff)"/>`).join('');
    } else if (cs.state !== 'stricken') mia.innerHTML = '';
    const status = cs.state === 'stricken' ? `Stricken, severity ${cs.severity}` : cs.state === 'aftermath' ? 'Aftermath' : threatened ? 'Safe but threatened' : 'Safe';
    const houses = state.players.filter((p) => p.posts.includes(c.id)).map((p) => p.name).join(', ');
    g.setAttribute('aria-label', `${c.name}: ${status}.${houses ? ' Trading posts: ' + houses + '.' : ''}`);
  }
  for (const path of svg.querySelectorAll('.route')) path.classList.remove('highlight');
  for (const id of highlightRoutes) svg.querySelector(`#route-${CSS.escape(id)}`)?.classList.add('highlight');
  drawTokens(svg, state);
}

function drawTokens(svg, state) {
  let html = '';
  for (const c of DATA.cities) {
    const here = state.players.filter((p) => p.posts.includes(c.id));
    if (!here.length) continue;
    const [x, y] = POS[c.id];
    here.forEach((p, i) => {
      const tx = x - ((here.length - 1) * 16) / 2 + i * 16 - 4;
      html += `<g transform="translate(${tx},${y + 33}) scale(1.3)">${banner(p.color, p.crest, familyAt(p, c.id))}</g>`;
    });
  }
  // Closed gates: a small portcullis in the colour of the house that shut them.
  for (const p of state.players) {
    if (!p.gates) continue;
    const [x, y] = POS[p.gates.city];
    html += `<g class="gate-mark" transform="translate(${x + 12},${y - 22})"><title>Gates closed by ${esc(p.name)}</title>
      <rect x="0" y="0" width="12" height="12" rx="1.5" fill="${p.color}" stroke="#2a1a0c" stroke-width="1.2"/>
      <path d="M3 1v10M6 1v10M9 1v10M1 4h10M1 8h10" stroke="#2a1a0c" stroke-width="1"/></g>`;
  }
  svg.querySelector('#tokens').innerHTML = html;
}

// ---------- Ambient life: merchant ships and carts travelling the routes ----------
export function startAmbient(svg, { ships = 7, carts = 3, stateRef = () => null } = {}) {
  if (reducedMotion()) return () => {};
  const layer = svg.querySelector('#ambient');
  const sea = DATA.routes.filter((r) => r.type === 'sea');
  const land = DATA.routes.filter((r) => r.type === 'land');
  const movers = [];
  const spawn = (kind) => {
    const pool = kind === 'cart' ? land : sea;
    const r = pool[Math.floor(Math.random() * pool.length)];
    const path = svg.querySelector(`#route-${CSS.escape(r.id)}`);
    if (!path) return;
    const len = path.getTotalLength();
    const reverse = Math.random() < 0.5;
    const from = reverse ? r.b : r.a;
    const st = stateRef();
    const plagueShip = st?.cities?.[from]?.state === 'stricken';
    const el = document.createElementNS(NS, 'g');
    el.setAttribute('class', 'mover');
    const northern = Math.max(CITIES[r.a].lat, CITIES[r.b].lat) > 47;
    el.innerHTML = kind === 'cart' ? cart() : northern ? cog('#f4e8c8', '#6b4423', plagueShip ? '#1a1208' : '#c9971f') : galley('#fbf5e4', '#5a3a1a', plagueShip ? '#1a1208' : '#a82318');
    layer.appendChild(el);
    movers.push({ el, path, len, reverse, t: Math.random() * 0.3, dur: (kind === 'cart' ? 22000 : 12000) + len * (kind === 'cart' ? 60 : 28), kind });
  };
  for (let i = 0; i < ships; i++) spawn('ship');
  for (let i = 0; i < carts; i++) spawn('cart');
  let last = performance.now();
  let raf = 0;
  const step = (now) => {
    const dt = Math.min(100, now - last);
    last = now;
    if (!document.hidden) {
      for (let i = movers.length - 1; i >= 0; i--) {
        const m = movers[i];
        m.t += dt / m.dur;
        if (m.t >= 1) {
          m.el.remove();
          movers.splice(i, 1);
          spawn(m.kind);
          continue;
        }
        const d = (m.reverse ? 1 - m.t : m.t) * m.len;
        const pt = m.path.getPointAtLength(d);
        const ahead = m.path.getPointAtLength(Math.min(m.len, Math.max(0, d + (m.reverse ? -2 : 2))));
        const flip = ahead.x < pt.x ? -1 : 1;
        const fade = Math.min(1, m.t * 8, (1 - m.t) * 8);
        m.el.setAttribute('transform', `translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)}) scale(${0.72 * flip},0.72)`);
        m.el.setAttribute('opacity', (fade * 0.92).toFixed(2));
      }
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { cancelAnimationFrame(raf); layer.innerHTML = ''; };
}

// A player's own ship (or cart) travels along a route.
export async function animateShipment(svg, routeId, from, color, infected) {
  const r = DATA.routes.find((x) => x.id === routeId);
  const path = svg.querySelector(`#route-${CSS.escape(routeId)}`);
  if (!path || reducedMotion()) return;
  const len = path.getTotalLength();
  const reverse = r.a !== from;
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'player-ship');
  const northern = Math.max(CITIES[r.a].lat, CITIES[r.b].lat) > 47;
  g.innerHTML = r.type === 'sea' ? (northern ? cog(color, '#4a2f14', infected ? '#1a1208' : '#fff8e8') : galley(color, '#4a2f14', infected ? '#1a1208' : '#fff8e8')) : cart(color);
  svg.querySelector('#ships').appendChild(g);
  path.classList.add('highlight');
  const dur = Math.min(2200, 700 + len * 2.2);
  const start = performance.now();
  await new Promise((resolve) => {
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const d = (reverse ? 1 - e : e) * len;
      const pt = path.getPointAtLength(d);
      const ahead = path.getPointAtLength(Math.min(len, Math.max(0, d + (reverse ? -2 : 2))));
      const flip = ahead.x < pt.x ? -1 : 1;
      g.setAttribute('transform', `translate(${pt.x},${pt.y}) scale(${1.25 * flip},1.25)`);
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
  await sleep(150);
  g.remove();
  path.classList.remove('highlight');
}

// Floating text rising from a city: "+9ƒ", "Infected!" …
export function floatText(svg, cityId, text, cls = 'gain') {
  if (reducedMotion()) return;
  const [x, y] = POS[cityId];
  const t = document.createElementNS(NS, 'text');
  t.setAttribute('class', `floater ${cls}`);
  t.setAttribute('x', x);
  t.setAttribute('y', y - 22);
  t.setAttribute('text-anchor', 'middle');
  t.textContent = text;
  svg.querySelector('#floaters').appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// A spreading stain when the plague reaches a city.
export function animateStrike(svg, cityId, { still = false } = {}) {
  const [x, y] = POS[cityId];
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('class', 'stain');
  if (still) c.style.animation = 'none';
  c.setAttribute('cx', x);
  c.setAttribute('cy', y);
  c.setAttribute('r', 42);
  svg.querySelector('#stains').appendChild(c);
}

export function redrawStains(svg, state) {
  svg.querySelector('#stains').innerHTML = '';
  for (const c of DATA.cities) if (state.cities[c.id].state === 'stricken') animateStrike(svg, c.id, { still: true });
}
