// Builds data/map.json from the Natural Earth files in tools/map-source/.
// Run with: npm run map
import { readFileSync, writeFileSync } from 'node:fs';
import { project, MAP_WIDTH, MAP_HEIGHT } from '../src/projection.js';

const W = MAP_WIDTH, H = MAP_HEIGHT, M = 420; // clip margin in px (land is drawn beyond the frame so wide screens show no hard edge)
const src = (f) => JSON.parse(readFileSync(new URL(`./map-source/${f}`, import.meta.url)));

// Sutherland–Hodgman polygon clipping against the padded map rectangle.
function clipPolygon(pts) {
  const edges = [
    [(p) => p[0] >= -M, (a, b) => at(a, b, (-M - a[0]) / (b[0] - a[0]))],
    [(p) => p[0] <= W + M, (a, b) => at(a, b, (W + M - a[0]) / (b[0] - a[0]))],
    [(p) => p[1] >= -M, (a, b) => at(a, b, (-M - a[1]) / (b[1] - a[1]))],
    [(p) => p[1] <= H + M, (a, b) => at(a, b, (H + M - a[1]) / (b[1] - a[1]))],
  ];
  let out = pts;
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) { if (!inside(prev)) out.push(cross(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(cross(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}
const at = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Douglas–Peucker line simplification.
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = pts[s], [bx, by] = pts[e];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const fmt = (n) => Math.round(n * 10) / 10;
const ring = (pts) => 'M' + pts.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join('L') + 'Z';
const line = (pts) => 'M' + pts.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join('L');

function polygons(fc, tol, minArea) {
  const parts = [];
  for (const f of fc.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) for (const r of poly) {
      let pts = r.map(([lon, lat]) => project(lon, lat));
      if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop(); // open the closed ring
      pts = clipPolygon(pts);
      if (pts.length < 3) continue;
      pts = simplify(pts, tol);
      let area = 0;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
      if (Math.abs(area) / 2 < minArea) continue;
      parts.push(ring(pts));
    }
  }
  return parts.join('');
}

function lines(fc, tol, filter) {
  const parts = [];
  for (const f of fc.features) {
    if (!filter(f.properties)) continue;
    const g = f.geometry;
    const ls = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const l of ls) {
      let run = [];
      const flush = () => { if (run.length > 1) parts.push(line(simplify(run, tol))); run = []; };
      for (const [lon, lat] of l) {
        const p = project(lon, lat);
        if (p[0] < -M || p[0] > W + M || p[1] < -M || p[1] > H + M) flush(); else run.push(p);
      }
      flush();
    }
  }
  return parts.join('');
}

const land = polygons(src('land50.geojson'), 0.5, 2);
const lakes = polygons(src('lakes50.geojson'), 0.5, 6);
const RIVERS = /Rh[oô]ne|Danube|Donau|Rhine|Rhein|Seine|Thames|Po$|Elbe|Loire|Dnieper|Volga|Oder|Vistula|Garonne|Ebro|Tagus|Nile|Dniester|Don$/i;
const rivers = lines(src('rivers50.geojson'), 0.8, (p) => RIVERS.test(p.name ?? '') || RIVERS.test(p.name_en ?? ''));

const map = { width: W, height: H, credit: 'Coastlines: Natural Earth (public domain)', land, lakes, rivers };
writeFileSync(new URL('../data/map.json', import.meta.url), JSON.stringify(map));
console.log(`map.json: ${W}×${H}, land ${(land.length / 1024).toFixed(0)} KB, rivers ${(rivers.length / 1024).toFixed(0)} KB, lakes ${(lakes.length / 1024).toFixed(0)} KB`);
