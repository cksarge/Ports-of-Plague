// The end-of-game finale: a short animated show in scenes, played before the
// final results page (endgame.js). It moves on by itself; Next, Back, the
// scene buttons and the arrow keys move it by hand, P pauses it, and
// "Results" (or Esc) skips to the end. Every number and sentence about the
// game is the same as on the results page (see summary()).
import { CITIES } from '../data.js';
import { C, familyTotal } from '../engine/state.js';
import { esc, crestSvg, reducedMotion, isTyping } from './dom.js';
import { heraldicBanner, candleIcon } from './art.js';
import { createMap, updateMap, animateShipment, animateStrike, floatText, startAmbient } from './map.js';
import { sfx } from './sound.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const rand = (a, b) => a + Math.random() * (b - a);

// The facts about this game, worded once for both the finale and the results page.
export function summary(state) {
  const totalStart = state.players.length * C.start.family;
  const lost = state.players.reduce((a, p) => a + p.lostFamily, 0);
  const pct = Math.round((100 * lost) / totalStart);
  const early = state.log.filter((e) => e.type === 'arrival' && e.early);
  const infectedShips = state.log.filter((e) => e.type === 'ship' && e.infected);
  const infected = infectedShips.length;
  const protectedBy = state.players.filter((p) => p.stats.protected > 0).map((p) => esc(p.name));
  const names = state.winner.map((id) => esc(state.players[id].name)).join(' and ');
  return {
    totalStart, lost, pct, early, infectedShips, infected, names,
    winLine: `${names} ${state.winner.length > 1 ? 'share the victory' : 'wins'} with the greatest Legacy.`,
    lostLine: `Your houses lost <strong>${lost}</strong> of ${totalStart} family members (${pct}%). Historians estimate that between a third and 60 percent of Europeans died.`,
    shipLine: `Your ships carried infected cargo <strong>${infected}</strong> time${infected === 1 ? '' : 's'}, bringing the plague early to ${early.length ? early.map((e) => esc(CITIES[e.city].name)).join(', ') : 'no city'}. In real history, trade routes carried the plague across Europe.`,
    standLine: `${protectedBy.length ? `${protectedBy.join(', ')} took a stand to protect a persecuted community.` : 'No house took a stand to protect the persecuted community.'} In 1349, the people who tried were overruled; the accusations were false and the violence unjust.`,
  };
}

// Legacy parts in the order they are added up, with their bar colours (CSS).
export const PARTS = [['wealth', 'Wealth'], ['family', 'Family'], ['reputation', 'Reputation'], ['balance', 'Balance']];

const SCENES = [
  { id: 'title', label: 'Anno Domini', play: titleScene },
  { id: 'toll', label: 'The Toll', play: tollScene },
  { id: 'ships', label: 'Plague Ships', play: shipsScene },
  { id: 'vigil', label: 'Conscience', play: vigilScene },
  { id: 'honours', label: 'Honours', play: honoursScene, skip: (state) => !awards(state).length },
  { id: 'reckoning', label: 'The Reckoning', play: reckoningScene },
  { id: 'crown', label: 'Victory', play: crownScene },
];

export function playFinale(app, state, { onDone }) {
  const sum = summary(state);
  const scenes = SCENES.filter((s) => !s.skip?.(state));
  app.innerHTML = `<div class="finale" role="region" aria-label="The end of the game">
    <div class="fin-stage" aria-live="polite"></div>
    <nav class="fin-bar" aria-label="Finale scenes">
      <button class="fin-btn" id="fin-back" aria-label="Previous scene">‹</button>
      <ol class="fin-dots">${scenes.map((s, i) => `<li><button class="fin-dot" data-i="${i}" aria-label="Scene ${i + 1}: ${s.label}"><span>${s.label}</span></button></li>`).join('')}</ol>
      <button class="fin-btn" id="fin-pause" aria-label="Pause" aria-pressed="false">❚❚</button>
      <button class="fin-btn next" id="fin-next"><span class="fin-fill"></span><span>Next ›</span></button>
      <button class="fin-btn" id="fin-skip">Results »</button>
    </nav></div>`;
  const root = app.querySelector('.finale');
  const stage = root.querySelector('.fin-stage');
  const fill = root.querySelector('.fin-fill');
  const pauseBtn = root.querySelector('#fin-pause');
  let index = -1;
  let timers = [];
  let stops = [];
  let clock = null;
  let paused = false;
  let done = false;

  const ctx = {
    state, sum, stage,
    later: (fn, ms) => { timers.push(setTimeout(fn, ms)); },
    onLeave: (fn) => { stops.push(fn); },
  };
  ctx.count = (el, to, ms) => countUp(ctx, el, to, ms);

  function clear() {
    timers.forEach(clearTimeout);
    stops.forEach((fn) => fn());
    timers = [];
    stops = [];
    clock?.cancel();
    clock = null;
  }

  function show(i) {
    if (done) return;
    clear();
    if (i >= scenes.length) { finish(); return; }
    index = Math.max(0, i);
    const scene = scenes[index];
    stage.className = `fin-stage scene-${scene.id}`;
    stage.removeAttribute('style');
    stage.innerHTML = '';
    // Restart the stage's entrance animation for every scene.
    void stage.offsetWidth;
    const hold = scene.play(ctx);
    root.querySelectorAll('.fin-dot').forEach((d, j) => {
      d.classList.toggle('on', j === index);
      d.classList.toggle('seen', j < index);
      if (j === index) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
    root.querySelector('#fin-back').disabled = index === 0;
    // The fill on the Next button shows when the show moves on by itself.
    clock = fill.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: hold, fill: 'forwards' });
    if (paused) clock.pause();
    clock.onfinish = () => show(index + 1);
  }

  function finish() {
    if (done) return;
    done = true;
    clear();
    document.removeEventListener('keydown', onKey);
    onDone();
  }

  function setPaused(v) {
    paused = v;
    pauseBtn.textContent = v ? '▶' : '❚❚';
    pauseBtn.setAttribute('aria-label', v ? 'Play' : 'Pause');
    pauseBtn.setAttribute('aria-pressed', String(v));
    root.classList.toggle('paused', v);
    if (v) clock?.pause(); else clock?.play();
  }

  function onKey(e) {
    if (isTyping(e) || document.querySelector('dialog[open]')) return;
    const onButton = !!e.target.closest?.('button, a');
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (!onButton && (e.key === ' ' || e.key === 'Enter'))) {
      e.preventDefault();
      show(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      show(index - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish();
    } else if (e.key === 'p' || e.key === 'P') {
      setPaused(!paused);
    }
  }

  document.addEventListener('keydown', onKey);
  root.querySelector('#fin-back').onclick = () => show(index - 1);
  root.querySelector('#fin-next').onclick = () => show(index + 1);
  root.querySelector('#fin-skip').onclick = finish;
  pauseBtn.onclick = () => setPaused(!paused);
  root.querySelectorAll('.fin-dot').forEach((d) => (d.onclick = () => show(Number(d.dataset.i))));
  show(0);
  root.querySelector('#fin-next').focus({ preventScroll: true });
}

// ---------- Helpers ----------

// Counts a number up from 0 (eased), or shows it at once with reduced motion.
function countUp(ctx, el, to, ms, suffix = '') {
  if (!el) return;
  if (reducedMotion() || ms <= 0) { el.textContent = `${to}${suffix}`; return; }
  const start = performance.now();
  let raf = 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = `${Math.round(to * (1 - Math.pow(1 - t, 3)))}${suffix}`;
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  ctx.onLeave(() => cancelAnimationFrame(raf));
}

// Glowing embers drifting up the screen.
const embers = (n, cls = '') => `<div class="fin-embers ${cls}" aria-hidden="true">${Array.from({ length: n }, () =>
  `<i style="left:${rand(0, 100).toFixed(1)}%;--d:${rand(7, 14).toFixed(1)}s;--delay:-${rand(0, 14).toFixed(1)}s;--s:${rand(2, 5).toFixed(1)}px;--drift:${rand(-80, 80).toFixed(0)}px"></i>`).join('')}</div>`;

const head = (kicker, title) => `<header class="fin-head"><p class="fin-kicker">${kicker}</p><h2 class="fin-h">${title}</h2></header>`;

// Letters that drop in one by one (the screen reader gets the plain text).
const letters = (text, first = 0, cls = '') => `<span aria-hidden="true">${[...text].map((ch, i) =>
  `<span class="fin-letter ${cls}" style="--i:${first + i}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')}</span>`;

// ---------- 1. Anno Domini 1353 ----------
function titleScene({ state, stage, later }) {
  const rounds = state.log.filter((e) => e.type === 'round').length;
  stage.innerHTML = `${embers(46)}<div class="fin-glow" aria-hidden="true"></div>
    <div class="fin-center">
      <p class="fin-kicker rise" style="--at:0.2s">MCCCLIII</p>
      <h1 class="fin-year"><span class="sr-only">Anno Domini 1353</span>${letters('Anno Domini', 0)}<br>${letters('1353', 0, 'digit')}</h1>
      <p class="fin-lede rise" style="--at:2.7s">The years of trade and plague are over.<br>Now every house is judged.</p>
      <p class="fin-meta rise" style="--at:3.4s">${plural(state.players.length, 'house')} · ${plural(rounds, 'round')} played · ${plural(state.journal.length, 'fact')} discovered</p>
    </div>`;
  sfx.knell();
  // The four digits land like seals pressed into wax.
  [0, 1, 2, 3].forEach((i) => later(() => sfx.stamp(), 1500 + i * 280));
  return 7600;
}

// ---------- 2. The Toll: the family members each house lost ----------
const FIGURE = '<svg viewBox="0 0 20 32" aria-hidden="true"><circle cx="10" cy="6" r="5"/><path d="M2 31 q0 -19 8 -19 q8 0 8 19z"/></svg>';

function gauge(pct) {
  const R = 50;
  const B = 61;
  const arc = (r, from, to) => { const L = 2 * Math.PI * r; return `stroke-dasharray="${((L * (to - from)) / 100).toFixed(2)} ${L.toFixed(2)}" stroke-dashoffset="${((-L * from) / 100).toFixed(2)}"`; };
  return `<svg class="toll-dial" viewBox="0 0 140 140" aria-hidden="true"><g transform="rotate(-90 70 70)">
      <circle class="d-track" cx="70" cy="70" r="${R}"/>
      <circle class="d-band" cx="70" cy="70" r="${B}" ${arc(B, 100 / 3, 60)}/>
      <circle class="d-you" cx="70" cy="70" r="${R}" stroke-dasharray="0 ${(2 * Math.PI * R).toFixed(2)}" data-r="${R}" data-pct="${Math.min(100, pct)}"/>
    </g><text x="70" y="74" class="d-pct">0%</text><text x="70" y="90" class="d-sub">of the families lost</text></svg>`;
}

function tollScene(ctx) {
  const { state, sum, stage, later } = ctx;
  stage.innerHTML = `${head('Your game', 'The Toll')}
    <div class="toll">
      <div class="toll-houses">${state.players.map((p, r) => {
        const alive = familyTotal(p);
        return `<div class="toll-row rise" style="--at:${(0.3 + r * 0.12).toFixed(2)}s;--house:${p.color}">
          <span class="toll-name">${crestSvg(p, 26)}<strong>${esc(p.name)}</strong></span>
          <span class="toll-figs" aria-label="${plural(alive, 'family member')} alive, ${p.lostFamily} lost">${Array.from({ length: alive + p.lostFamily }, (_, i) =>
            `<i class="toll-fig ${i >= alive ? 'doomed' : ''}" style="--k:${i}">${FIGURE}</i>`).join('')}</span>
        </div>`;
      }).join('')}</div>
      <figure class="toll-gauge rise" style="--at:0.7s">${gauge(sum.pct)}
        <figcaption><span><i class="fin-key you"></i>Your houses</span><span><i class="fin-key band"></i>Historians’ estimate for Europe</span></figcaption></figure>
    </div>
    <p class="fin-text toll-text">${sum.lostLine}</p>`;
  // The lost fall one by one, taking turns between the houses.
  const rows = [...stage.querySelectorAll('.toll-row')].map((row) => [...row.querySelectorAll('.doomed')]);
  const doomed = [];
  for (let k = 0; rows.some((r) => r[k]); k++) rows.forEach((r) => r[k] && doomed.push(r[k]));
  const start = 1900;
  const step = doomed.length ? Math.max(90, Math.min(260, 3400 / doomed.length)) : 0;
  const fallTime = doomed.length * step;
  if (doomed.length) later(() => sfx.knell(), start);
  doomed.forEach((el, i) => later(() => el.classList.add('fallen'), start + i * step));
  // The dial fills while they fall.
  const you = stage.querySelector('.d-you');
  const label = stage.querySelector('.d-pct');
  later(() => dial(ctx, you, label, sum.pct, Math.max(800, fallTime)), start);
  const textAt = start + fallTime + 500;
  later(() => stage.querySelector('.toll-text').classList.add('show'), textAt);
  return textAt + 7500;
}

function dial(ctx, circle, label, pct, ms) {
  const L = 2 * Math.PI * Number(circle.dataset.r);
  const arcTo = Number(circle.dataset.pct);
  const draw = (t) => {
    circle.setAttribute('stroke-dasharray', `${((L * arcTo * t) / 100).toFixed(2)} ${L.toFixed(2)}`);
    label.textContent = `${Math.round(pct * t)}%`;
  };
  if (reducedMotion()) { draw(1); return; }
  const start = performance.now();
  let raf = 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    draw(1 - Math.pow(1 - t, 2));
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  ctx.onLeave(() => cancelAnimationFrame(raf));
}

// ---------- 3. Plague Ships: the infected cargoes sail again on the map ----------
function shipsScene(ctx) {
  const { state, sum, stage, later, onLeave } = ctx;
  stage.innerHTML = `<div class="fin-map" aria-hidden="true"></div>
    ${head('Your game', 'Plague Ships')}
    <div class="ship-tally rise" style="--at:0.5s"><span class="n">0</span><span class="l">infected cargo${sum.infected === 1 ? '' : 'es'}</span></div>
    <div class="early-stamps" aria-hidden="true"></div>
    <p class="fin-text fin-caption">${sum.shipLine}</p>`;
  const svg = createMap(stage.querySelector('.fin-map'), { decorative: true });
  updateMap(svg, state);
  onLeave(startAmbient(svg, { ships: 4, carts: 2, stateRef: () => state }));
  let live = true;
  onLeave(() => { live = false; });

  // At most a dozen voyages, spread over the whole game.
  const all = sum.infectedShips;
  const ships = all.length <= 12 ? all : Array.from({ length: 12 }, (_, i) => all[Math.round((i * (all.length - 1)) / 11)]);
  const gap = ships.length ? Math.min(650, 3800 / ships.length) : 0;
  if (ships.length) later(() => sfx.sail(), 900);
  ships.forEach((e, i) => later(() => {
    animateShipment(svg, e.route, e.from, state.players[e.player]?.color ?? '#888', true)
      .then(() => { if (live) floatText(svg, e.to, 'Infected!', 'loss'); });
  }, 900 + i * gap));
  const replayEnd = ships.length ? 900 + (ships.length - 1) * gap + 2400 : 900;
  ctx.later(() => ctx.count(stage.querySelector('.ship-tally .n'), sum.infected, Math.max(600, replayEnd - 900)), 900);

  // Then the cities the plague reached early are stamped.
  const box = stage.querySelector('.early-stamps');
  const early = sum.early.slice(0, 10);
  if (early.length) {
    later(() => { box.innerHTML = '<h3>Plague arrived early</h3>'; sfx.plague(); }, replayEnd);
    early.forEach((e, i) => later(() => {
      animateStrike(svg, e.city);
      floatText(svg, e.city, 'Early!', 'loss');
      box.insertAdjacentHTML('beforeend', `<span class="stamp-chip">${esc(CITIES[e.city].name)}</span>`);
      sfx.stamp();
    }, replayEnd + 300 + i * 450));
    if (sum.early.length > early.length) later(() => box.insertAdjacentHTML('beforeend', `<span class="stamp-more">and ${sum.early.length - early.length} more</span>`), replayEnd + 300 + early.length * 450);
  }
  const captionAt = replayEnd + (early.length ? 600 + early.length * 450 : 200);
  later(() => stage.querySelector('.fin-caption').classList.add('show'), captionAt);
  return captionAt + 8000;
}

// ---------- 4. Conscience: who protected the persecuted community ----------
function vigilScene({ state, sum, stage }) {
  const n = state.players.length;
  stage.innerHTML = `${embers(16, 'dim')}${head('Your game', 'A Matter of Conscience')}
    <div class="vigil">${state.players.map((p, i) => {
      const stood = p.stats.protected > 0;
      return `<div class="vigil-house ${stood ? 'lit' : 'dark'}" style="--house:${p.color};--at:${(0.6 + i * 0.45).toFixed(2)}s">
        <div class="vigil-candle">${candleIcon(stood, 90)}</div>
        <span>${crestSvg(p, 22)}${esc(p.name)}</span>
        <small>${stood ? 'took a stand' : 'did not take a stand'}</small>
      </div>`;
    }).join('')}</div>
    <p class="fin-text rise" style="--at:${(1.2 + n * 0.45).toFixed(2)}s">${sum.standLine}</p>`;
  return 1200 + n * 450 + 8500;
}

// ---------- 5. Honours: light-hearted titles from each house's record ----------
const AWARDS = [
  { icon: '⛵', title: 'Master of the Seas', value: (p) => p.stats.shipments, what: (n) => plural(n, 'shipment') },
  { icon: '👪', title: 'The Survivors', value: (p) => familyTotal(p), what: (n) => `${plural(n, 'family member')} alive` },
  { icon: '💰', title: 'Fullest Coffers', value: (p) => p.florins, what: (n) => `${n}ƒ in the strongbox` },
  { icon: '🕯️', title: 'Pillar of Charity', value: (p) => p.stats.charity, what: (n) => plural(n, 'act') + ' of charity' },
  { icon: '🎡', title: 'Fortune’s Favourite', value: (p) => p.stats.fortune ?? 0, what: (n) => plural(n, 'Fortune card') },
  { icon: '🐀', title: 'Unlucky Cargo', value: (p) => p.stats.infected, what: (n) => plural(n, 'infected shipment') },
  { icon: '🏛️', title: 'Web of Trade', value: (p) => p.posts.length, what: (n) => plural(n, 'trading post') },
  { icon: '🏃', title: 'Always on the Road', value: (p) => p.stats.fled, what: (n) => `fled ${plural(n, 'time')}` },
  { icon: '⭐', title: 'Best Reputation', value: (p) => p.reputation, what: (n) => `${n} reputation` },
  { icon: '💍', title: 'The Matchmaker', value: (p) => p.stats.married, what: (n) => plural(n, 'marriage') },
  { icon: '🌾', title: 'Lord of the Land', value: (p) => p.land?.length ?? 0, what: (n) => `${plural(n, 'estate')} of land` },
];

// Up to six honours: the most of something, held by one or two houses (not everyone).
export function awards(state) {
  const out = [];
  for (const a of AWARDS) {
    const vals = state.players.map((p) => a.value(p));
    const best = Math.max(...vals);
    const winners = state.players.filter((p, i) => vals[i] === best);
    if (best <= 0 || winners.length > 2 || winners.length === state.players.length) continue;
    out.push({ ...a, winners, best });
    if (out.length === 6) break;
  }
  return out;
}

function honoursScene({ state, stage, later }) {
  const list = awards(state);
  stage.innerHTML = `${embers(20)}${head('Before the reckoning', 'Honours of the Realm')}
    <div class="honours n${list.length}">${list.map((a, i) => `<article class="honour" style="--house:${a.winners[0].color};--at:${(0.8 + i * 0.7).toFixed(2)}s">
      <div class="honour-medal" aria-hidden="true">${a.icon}</div>
      <h3>${esc(a.title)}</h3>
      <p class="honour-who">${a.winners.map((p) => `<span>${crestSvg(p, 20)}${esc(p.name)}</span>`).join('<span class="amp">&amp;</span>')}</p>
      <p class="honour-what">${esc(a.what(a.best))}</p>
    </article>`).join('')}</div>`;
  list.forEach((_, i) => later(() => sfx.page(), 800 + i * 700));
  return 800 + list.length * 700 + 6500;
}

// ---------- 6. The Reckoning: Legacy scores, from last place to first ----------
function reckoningScene(ctx) {
  const { state, stage, later } = ctx;
  const rows = state.finalScores;
  const max = Math.max(1, ...rows.map((r) => r.total));
  stage.innerHTML = `${head('Final Legacy', 'The Reckoning')}
    <p class="rk-legend">${PARTS.map(([k, l]) => `<span class="fin-legend k-${k}">${l}</span>`).join('')}</p>
    <div class="rk-rows">${rows.map((r) => {
      const p = state.players[r.id];
      return `<div class="rk-row ${r.place === 1 ? 'win' : ''}" data-place="${r.place}" style="--house:${p.color}">
        <span class="rk-place">${r.place}</span>
        <span class="rk-who">${crestSvg(p, 30)}<span><strong>${esc(p.name)}</strong><small>of ${esc(CITIES[p.home].name)}</small></span></span>
        <span class="rk-bar">${PARTS.map(([k, l]) => `<i class="fin-seg k-${k}" style="--w:${((100 * r[k]) / max).toFixed(2)}%" title="${l} ${r[k]}">${r[k] || ''}</i>`).join('')}</span>
        <span class="rk-total">0</span></div>`;
    }).join('')}</div>
    <p class="rk-suspense" aria-hidden="true">And the greatest Legacy belongs to…</p>`;
  const els = [...stage.querySelectorAll('.rk-row')];
  const reveal = (el, at) => {
    const r = rows[els.indexOf(el)];
    later(() => { el.classList.add('in'); sfx.cart(); }, at);
    el.querySelectorAll('.fin-seg').forEach((s, k) => later(() => s.classList.add('grow'), at + 350 + k * 300));
    later(() => { ctx.count(el.querySelector('.rk-total'), r.total, 1300); sfx.coin(); }, at + 350);
  };
  let t = 900;
  els.filter((el) => el.dataset.place !== '1').reverse().forEach((el) => { reveal(el, t); t += 1900; });
  later(() => { stage.classList.add('suspense'); sfx.drumroll(2.2); }, t);
  t += 2600;
  later(() => { stage.classList.remove('suspense'); stage.classList.add('flash'); }, t);
  els.filter((el) => el.dataset.place === '1').forEach((el) => reveal(el, t));
  later(() => sfx.fanfare(), t + 1500);
  return t + 6500;
}

// ---------- 7. Victory: the winner is crowned ----------
const CROWN = `<svg class="crown" viewBox="0 0 100 62" aria-hidden="true"><defs><linearGradient id="fin-crown-gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset="0.45" stop-color="#e3b340"/><stop offset="1" stop-color="#8a5a12"/></linearGradient></defs>
  <path d="M10 50 L4 14 L28 32 L50 4 L72 32 L96 14 L90 50 Z" fill="url(#fin-crown-gold)" stroke="#5a3a0a" stroke-width="3" stroke-linejoin="round"/>
  <rect x="8" y="46" width="84" height="12" rx="3" fill="url(#fin-crown-gold)" stroke="#5a3a0a" stroke-width="3"/>
  <circle cx="4" cy="14" r="4" fill="#fff3c4" stroke="#5a3a0a" stroke-width="2"/><circle cx="50" cy="4" r="4" fill="#fff3c4" stroke="#5a3a0a" stroke-width="2"/><circle cx="96" cy="14" r="4" fill="#fff3c4" stroke="#5a3a0a" stroke-width="2"/>
  <circle cx="50" cy="30" r="5.5" fill="#b0261a" stroke="#5a0d07" stroke-width="1.5"/><circle cx="28" cy="40" r="3.8" fill="#1d4a86"/><circle cx="72" cy="40" r="3.8" fill="#1d4a86"/>
  <circle cx="30" cy="52" r="2.6" fill="#1f6b4f"/><circle cx="50" cy="52" r="2.6" fill="#b0261a"/><circle cx="70" cy="52" r="2.6" fill="#1f6b4f"/></svg>`;

function crownScene({ state, sum, stage, onLeave }) {
  const winners = state.winner.map((id) => state.players[id]);
  const top = state.finalScores.find((r) => r.place === 1);
  stage.style.setProperty('--house', winners[0].color);
  stage.innerHTML = `<div class="crown-rays" aria-hidden="true"></div><canvas class="confetti" aria-hidden="true"></canvas>
    <div class="fin-center crown-center">
      <div class="crown-banners">${winners.map((p, i) => `<div class="crown-banner" style="--i:${i}">${CROWN}${heraldicBanner(p.color, p.crest)}</div>`).join('')}</div>
      <p class="fin-kicker rise" style="--at:1.4s">Victory · Anno Domini 1353</p>
      <h1 class="crown-name">${winners.map((p) => esc(p.name)).join(' &amp; ')}</h1>
      <p class="crown-sub rise" style="--at:2.1s">${sum.winLine}</p>
      <p class="crown-score rise" style="--at:2.5s"><span class="n">${top.total}</span> Legacy points</p>
    </div>`;
  sfx.victory();
  if (!reducedMotion()) onLeave(confetti(stage.querySelector('.confetti'), winners.map((p) => p.color)));
  return 11000;
}

// Gold florins and coloured paper bursting out and drifting down (canvas).
function confetti(canvas, colors) {
  const g = canvas.getContext('2d');
  if (!g) return () => {};
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0;
  let H = 0;
  const size = () => {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  window.addEventListener('resize', size);
  const palette = [...colors, ...colors, '#f3d27a', '#d9a82b', '#fff3c4', '#b0261a', '#f7ecd0'];
  const parts = [];
  const add = (burst) => {
    const coin = Math.random() < 0.3;
    parts.push({
      x: burst ? W / 2 + rand(-60, 60) : rand(0, W), y: burst ? H * 0.42 : rand(-40, -10),
      vx: burst ? rand(-9, 9) : rand(-0.6, 0.6), vy: burst ? rand(-14, -3) : rand(1, 3),
      r: rand(0, Math.PI * 2), vr: rand(-0.15, 0.15), flip: rand(0, Math.PI * 2), vf: rand(0.05, 0.2),
      w: coin ? rand(11, 16) : rand(7, 12), h: rand(4, 8), coin, color: palette[Math.floor(Math.random() * palette.length)],
    });
  };
  for (let i = 0; i < 180; i++) add(true);
  const start = performance.now();
  let last = start;
  let raf = 0;
  const step = (now) => {
    const dt = Math.min(3, (now - last) / 16.7);
    last = now;
    const raining = now - start < 7000;
    if (raining && !document.hidden) for (let i = 0; i < 2; i++) add(false);
    g.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.vy = Math.min(q.vy + 0.22 * dt, q.coin ? 5 : 3.2);
      q.vx *= Math.pow(0.985, dt);
      q.flip += q.vf * dt;
      q.x += (q.vx + Math.sin(q.flip) * 0.5) * dt;
      q.y += q.vy * dt;
      q.r += q.vr * dt;
      if (q.y > H + 30) { parts.splice(i, 1); continue; }
      g.save();
      g.translate(q.x, q.y);
      g.rotate(q.r);
      if (q.coin) {
        g.scale(Math.max(0.15, Math.abs(Math.cos(q.flip))), 1);
        g.beginPath();
        g.arc(0, 0, q.w / 2, 0, Math.PI * 2);
        g.fillStyle = '#e3b340';
        g.fill();
        g.lineWidth = 1.5;
        g.strokeStyle = '#7a560c';
        g.stroke();
        g.fillStyle = '#7a560c';
        g.font = `700 ${Math.round(q.w * 0.75)}px Georgia, serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('ƒ', 0, 1);
      } else {
        g.scale(1, Math.cos(q.flip));
        g.fillStyle = q.color;
        g.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
      }
      g.restore();
    }
    if (parts.length || raining) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
}
