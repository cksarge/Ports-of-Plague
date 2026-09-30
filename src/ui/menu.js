// Title screen (with a living map behind it) and the setup screen.
import { DATA, CITIES, HOME_CITIES } from '../data.js';
import { C, PLAYER_STYLES, validateSetup, createGame, roundInfo } from '../engine/state.js';
import { esc, crestSvg, $, $$, isTyping } from './dom.js';
import { showRules, showCredits } from './panels.js';
import { loadGame } from './save.js';
import { createMap, updateMap, startAmbient, redrawStains, animateStrike, POS } from './map.js';
import { music } from './music.js';
import { hostRoom } from '../net/host.js';
import { netAvailable } from '../net/transport.js';
import { JOIN_ADDRESS } from '../net/config.js';
import { zoomToFit, pageFits } from './fit.js';
import { isMuted, setMuted, isMusicOn, setMusicOn } from './sound.js';

let stopTitle = null;
export function stopTitleAnimation() { stopTitle?.(); stopTitle = null; }

// A decorative game state for the title map: the plague spreads across
// Europe, one historical half-year every few seconds.
function titleBackdrop(el) {
  const svg = createMap(el, { decorative: true });
  const demo = createGame({ players: [{ name: 'A', home: 'venice' }, { name: 'B', home: 'genoa' }], seed: 'title' });
  demo.players.forEach((p) => { p.posts = []; p.family = {}; });
  let half = 0;
  let timers = [];
  const reset = () => {
    half = 0;
    for (const c of DATA.cities) Object.assign(demo.cities[c.id], { state: c.arrival.round === 0 ? 'stricken' : 'safe', severity: 3 });
    updateMap(svg, demo);
    redrawStains(svg, demo);
  };
  const tick = () => {
    if (half >= C.rounds) {
      // End of 1353: hold, fade out, reset while invisible, fade back in.
      el.classList.add('fading');
      timers.push(setTimeout(() => { reset(); el.classList.remove('fading'); }, 1500));
      return;
    }
    half++;
    for (const c of DATA.cities) {
      const r = c.arrival.round;
      const st = demo.cities[c.id];
      if (r === half) {
        Object.assign(st, { state: 'stricken', severity: 1 + ((c.lat * 7) | 0) % 3 });
        animateStrike(svg, c.id); // the stain spreads smoothly
      } else if (st.state === 'stricken' && r <= half - 2) st.state = 'aftermath';
    }
    // Remove stains of cities that have passed into Aftermath.
    svg.querySelectorAll('#stains .stain').forEach((s) => {
      const id = DATA.cities.find((c) => Math.abs(POS[c.id][0] - Number(s.getAttribute('cx'))) < 0.5 && Math.abs(POS[c.id][1] - Number(s.getAttribute('cy'))) < 0.5)?.id;
      if (id && demo.cities[id].state !== 'stricken') s.classList.add('fade-out');
    });
    updateMap(svg, demo);
  };
  reset();
  const interval = setInterval(tick, 2600);
  const stopAmbient = startAmbient(svg, { ships: 9, carts: 4, stateRef: () => demo });
  return () => { clearInterval(interval); timers.forEach(clearTimeout); stopAmbient(); };
}

export function renderMenu(app, { onNew, onContinue, onJoin }) {
  stopTitleAnimation();
  const saved = loadGame();
  app.innerHTML = `<section class="screen title-screen">
    <div class="title-map" id="title-map" aria-hidden="true"></div>
    <div class="menu frame">
      <h1 class="title">${esc(C.title)}</h1>
      <p class="subtitle">Trade, survival and conscience in the years of the Black Death, 1347–1353</p>
      <p class="drop-cap" style="text-align:left">In 1347 Italian merchant ships carried a deadly plague from the Black Sea into the ports of Europe. You lead a merchant house in one of the great trading cities. Grow rich from trade, but every ship may carry the plague. Protect your family, keep your good name, and face the same hard choices people faced six and a half centuries ago.</p>
      <div class="menu-buttons">
        ${saved ? `<button class="btn primary" id="continue">Continue saved game<br><small style="font-family:var(--serif);font-weight:400">${esc(roundInfo(saved.state)?.label ?? 'Start')} · ${saved.state.players.map((p) => esc(p.name)).join(', ')}</small></button>` : ''}
        <button class="btn ${saved ? '' : 'primary'}" id="new">New game</button>
        <button class="btn" id="join">Join a game <small style="font-family:var(--serif);font-weight:400">(room code)</small></button>
        <button class="btn" id="rules">Rules <span class="key">R</span></button>
        <button class="btn" id="about">About &amp; credits</button>
        <div style="display:flex;gap:0.6rem;justify-content:center">
          <button class="btn small" id="menu-sound" aria-pressed="${!isMuted()}">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
          <button class="btn small" id="menu-music" aria-pressed="${isMusicOn()}">${isMusicOn() ? '🎵 Music on' : '🎵 Music off'}</button>
        </div>
      </div>
      <p class="menu-foot">1–${C.players.max} players (bots can play any house) on one device or each on their own · about ${C.timeEstimates.quick['2']}–${C.timeEstimates.standard['6']} minutes · touch, mouse or keyboard</p>
    </div></section>`;
  stopTitle = titleBackdrop($('#title-map', app));
  music.setMood('menu');
  const sb = $('#menu-sound', app), mb = $('#menu-music', app);
  sb.onclick = () => { setMuted(!isMuted()); sb.setAttribute('aria-pressed', !isMuted()); sb.textContent = isMuted() ? '🔇 Sound off' : '🔊 Sound on'; };
  mb.onclick = () => { setMusicOn(!isMusicOn()); mb.setAttribute('aria-pressed', isMusicOn()); mb.textContent = isMusicOn() ? '🎵 Music on' : '🎵 Music off'; };
  $('#new', app).onclick = () => { stopTitleAnimation(); onNew(); };
  $('#join', app).onclick = () => { stopTitleAnimation(); onJoin(); };
  $('#rules', app).onclick = showRules;
  $('#about', app).onclick = showCredits;
  if (saved) $('#continue', app).onclick = () => { stopTitleAnimation(); onContinue(saved); };
  $('#continue, #new', app)?.focus();
  app.onkeydown = (e) => { if (!isTyping(e) && e.key.toLowerCase() === 'r' && !document.querySelector('dialog')) showRules(); };
}

const DEFAULT_NAMES = ['House of the Anchor', 'House of the Lion', 'House of the Rose', 'House of the Star', 'House of the Ship', 'House of the Sun'];
const DEFAULT_HOMES = ['genoa', 'bruges', 'venice', 'london', 'florence', 'lubeck'];

export function renderSetup(app, { onStart, onBack }) {
  app.onkeydown = null;
  music.setMood('menu');
  const setup = {
    where: 'here', // 'here': one shared device · 'devices': each player on their own device
    count: 2,
    difficulty: 'chronicler',
    mode: 'standard',
    hints: true,
    prePlague: true,
    timer: true,
    // bot: a computer plays this house, at the chosen skill level.
    players: PLAYER_STYLES.map((s, i) => ({ name: DEFAULT_NAMES[i], home: DEFAULT_HOMES[i], bot: false, skill: 'medium', ...s })),
  };
  let room = null;
  let roomError = '';
  let opening = false;
  const homeInfo = (id) => {
    const c = CITIES[id];
    const h = c.home;
    const bonus = setup.mode === 'quick' ? h.quickStartFlorins ?? h.startFlorins : h.startFlorins;
    return `Plague arrives: ${esc(c.arrival.dateText)}. Starts with ${C.start.florins + bonus}ƒ and ${C.start.reputation + (h.startReputation ?? 0)} reputation.`;
  };
  const diffText = {
    apprentice: 'Apprentice: the plague is gentler (severity rolls 1 lower) and hints stay on all game.',
    chronicler: 'Chronicler: the standard game.',
    mortality: 'Great Mortality: severity rolls are 1 higher and every shipment has +1 contagion risk. For experienced merchants.',
  };
  const devices = () => setup.where === 'devices';
  const roomOptions = () => ({ mode: setup.mode, difficulty: setup.difficulty, prePlague: setup.prePlague, timer: setup.timer });
  // The estimates in config.json assume the default options (pre-plague rounds and the timer on).
  function estimateText() {
    let est = C.timeEstimates[setup.mode][String(playerCount())];
    if (!setup.prePlague) est -= Math.round(est * C.prePlague.rounds[setup.mode] / (C.prePlague.rounds[setup.mode] + C.rounds / C.modes[setup.mode].span));
    return `About ${est} minutes for ${playerCount()} players${setup.timer ? '' : ' (longer without the turn timer)'}`;
  }
  const preText = () => {
    const n = C.prePlague.rounds[setup.mode];
    return `${n > 1 ? `${n} extra rounds` : 'One extra round'} before the plague arrives (from ${DATA.timeline.prePlague[0].label}): no Event card, no plague, and trading posts cost ${C.prePlague.postDiscount}ƒ less.`;
  };
  // With a room open, this screen is the big screen: the room code and every
  // house must be visible without scrolling.
  const fitLobby = () => { const f = $('.setup', app); if (f) zoomToFit(f, pageFits, 0.5, { widen: true }); };
  const onResize = () => { if (devices()) fitLobby(); };
  window.addEventListener('resize', onResize);
  const leaveSetup = () => window.removeEventListener('resize', onResize);
  // "Played by" switch and skill buttons for one house (i: its index).
  const whoHtml = (i, p) => `
    <div class="field"><span class="label" id="who-${i}">Played by</span>
      <div class="seg" role="group" aria-labelledby="who-${i}">
        <button class="btn small" data-bot="${i}" data-val="" aria-pressed="${!p.bot}">A person</button>
        <button class="btn small" data-bot="${i}" data-val="1" aria-pressed="${!!p.bot}">A bot</button>
      </div></div>
    ${p.bot ? skillHtml(i, p.skill) : ''}`;
  const skillHtml = (i, skill) => `
    <div class="field"><span class="label" id="skill-${i}">Bot skill</span>
      <div class="seg" role="group" aria-labelledby="skill-${i}">
        ${Object.entries(C.bots.skills).map(([k, sk]) => `<button class="btn small" data-skill="${i}" data-val="${k}" aria-pressed="${skill === k}">${esc(sk.label)}</button>`).join('')}
      </div>
      <span class="home-info">${esc(C.bots.skills[skill]?.description ?? '')}</span></div>`;
  const playerCount = () => (devices() ? Math.max(room?.seats.length ?? 0, C.players.min) : setup.count);
  const draw = () => {
    const est = C.timeEstimates[setup.mode][String(playerCount())];
    app.innerHTML = `<section class="screen"><div class="setup frame">
      <h1>New Game</h1>
      <div class="field"><span class="label" id="where-label">Play on</span>
        <div class="seg" role="group" aria-labelledby="where-label">
          <button class="btn small" data-where="here" aria-pressed="${!devices()}">This device only</button>
          <button class="btn small" data-where="devices" aria-pressed="${devices()}">Everyone on their own device</button>
        </div>
        <span class="home-info">${devices() ? 'This screen shows the map for everyone. Each player joins on a phone, tablet or computer with the room code and takes their turn there.' : 'Players take turns on this device and pass it on.'}</span></div>
      ${devices() ? '<div id="lobby" class="lobby" aria-live="polite"></div>' : `
      <div class="field"><span class="label" id="count-label">Number of houses</span>
        <div class="seg" role="group" aria-labelledby="count-label">${Array.from({ length: C.players.max - C.players.min + 1 }, (_, i) => i + C.players.min).map((n) => `<button class="btn small" data-count="${n}" aria-pressed="${setup.count === n}">${n} houses</button>`).join('')}</div>
        <span class="home-info">Any house can be played by a bot, so you can also play alone.</span></div>
      <div class="setup-grid">${setup.players.slice(0, setup.count).map((p, i) => `
        <div class="house-card" style="--house:${p.color}">
          <h3>${crestSvg(p, 26)} ${p.bot ? 'Bot' : 'Player'} ${i + 1} <small style="font-family:var(--serif);font-weight:400">(${esc(p.colorName)}, ${p.crest})</small></h3>
          ${whoHtml(i, p)}
          <div class="field"><label for="name-${i}">House name</label><input id="name-${i}" data-name="${i}" value="${esc(p.name)}" maxlength="24" autocomplete="off"></div>
          <div class="field"><label for="home-${i}">Home city</label>
            <select id="home-${i}" data-home="${i}">${HOME_CITIES.map((h) => `<option value="${h}" ${p.home === h ? 'selected' : ''}>${esc(CITIES[h].modern)}</option>`).join('')}</select></div>
          <div class="home-info" id="info-${i}">${homeInfo(p.home)}</div>
        </div>`).join('')}</div>`}
      <div class="option-grid">
        <div class="field"><span class="label" id="mode-label">Game length</span>
          <div class="seg" role="group" aria-labelledby="mode-label">
            ${Object.entries(C.modes).map(([k, m]) => `<button class="btn small" data-mode="${k}" aria-pressed="${setup.mode === k}">${esc(m.label)}</button>`).join('')}
          </div>
          <span class="home-info">${esc(C.modes[setup.mode].description)} ${C.modes[setup.mode].actionPoints} action points per turn.<br><span class="time-est">${estimateText()}</span>${est > 60 && setup.mode === 'standard' ? ' · Quick Play is recommended for this many players.' : ''}</span>
        </div>
        <div class="field"><span class="label" id="diff-label">Difficulty</span>
          <div class="seg" role="group" aria-labelledby="diff-label">
            ${Object.entries(C.difficulty).map(([k, d]) => `<button class="btn small" data-diff="${k}" aria-pressed="${setup.difficulty === k}">${esc(d.label)}</button>`).join('')}
          </div>
          <span class="home-info">${diffText[setup.difficulty]}</span>
        </div>
      </div>
      <div class="option-checks">
        <label class="check"><input type="checkbox" id="pre-plague" ${setup.prePlague ? 'checked' : ''}> <span><strong>Pre-plague ${C.prePlague.rounds[setup.mode] > 1 ? 'rounds' : 'round'}</strong><small>${preText()}</small></span></label>
        <label class="check"><input type="checkbox" id="timer" ${setup.timer ? 'checked' : ''}> <span><strong>Turn timer</strong><small>${C.turnTimer.seconds} seconds per turn; when time runs out, the next house plays. The clock stops while cards are shown.</small></span></label>
        <label class="check"><input type="checkbox" id="hints" ${setup.hints ? 'checked' : ''}> <span><strong>Guided hints</strong><small>Tips on screen during the first round.</small></span></label>
      </div>
      <p class="error" id="setup-error" role="alert"></p>
      <div class="setup-actions">
        <button class="btn ghost" id="back">← Back</button>
        <button class="btn primary" id="start">Roll for turn order →</button>
      </div>
    </div></section>`;
    $$('[data-where]', app).forEach((b) => (b.onclick = () => { setup.where = b.dataset.where; if (devices()) openRoom(); else closeRoom(); draw(); }));
    $$('[data-count]', app).forEach((b) => (b.onclick = () => { setup.count = Number(b.dataset.count); fixHomes(); draw(); }));
    $$('[data-diff]', app).forEach((b) => (b.onclick = () => { setup.difficulty = b.dataset.diff; draw(); }));
    $$('[data-mode]', app).forEach((b) => (b.onclick = () => { setup.mode = b.dataset.mode; draw(); }));
    $$('[data-bot]', app).forEach((b) => (b.onclick = () => { setup.players[b.dataset.bot].bot = !!b.dataset.val; draw(); }));
    $$('[data-skill]', app).forEach((b) => (b.onclick = () => {
      if (devices()) room?.setSkill(Number(b.dataset.skill), b.dataset.val);
      else { setup.players[b.dataset.skill].skill = b.dataset.val; draw(); }
    }));
    $$('[data-name]', app).forEach((inp) => (inp.oninput = () => { setup.players[inp.dataset.name].name = inp.value; }));
    $$('[data-home]', app).forEach((sel) => (sel.onchange = () => {
      const i = Number(sel.dataset.home);
      setup.players[i].home = sel.value;
      $(`#info-${i}`, app).innerHTML = homeInfo(sel.value);
    }));
    $('#hints', app).onchange = (e) => { setup.hints = e.target.checked; };
    $('#pre-plague', app).onchange = (e) => { setup.prePlague = e.target.checked; draw(); };
    $('#timer', app).onchange = (e) => { setup.timer = e.target.checked; draw(); };
    $('#back', app).onclick = () => { closeRoom(); leaveSetup(); onBack(); };
    $('#start', app).onclick = start;
    if (devices()) drawLobby();
    if (room) { room.options = roomOptions(); room.pushLobby(); }
  };

  // ---------- Lobby (multi-device play) ----------
  async function openRoom() {
    if (room || opening) return;
    if (!netAvailable()) { roomError = 'Multi-device play is not set up on this copy of the game yet (see “Supabase setup” in the README).'; return; }
    opening = true;
    roomError = '';
    try {
      room = await hostRoom({ joinRules: { max: C.players.max, homes: HOME_CITIES } });
      if (!devices()) { closeRoom(); return; }
      room.options = roomOptions();
      room.onChange = () => { if (devices()) { drawLobby(); updateEstimate(); } };
      room.pushLobby();
    } catch {
      roomError = 'Could not open a room. Check the internet connection and try again.';
    } finally {
      opening = false;
      if (devices()) draw();
    }
  }
  function closeRoom() {
    room?.close();
    room = null;
  }
  function drawLobby() {
    const el = $('#lobby', app);
    if (!el) return;
    if (roomError) {
      el.innerHTML = `<p class="error">${esc(roomError)}</p>${netAvailable() ? '<button class="btn small" id="retry">Try again</button>' : ''}`;
      $('#retry', el)?.addEventListener('click', () => { roomError = ''; openRoom(); drawLobby(); });
      return;
    }
    if (!room) { el.innerHTML = '<p>Opening a room…</p>'; return; }
    const seats = room.seats;
    el.innerHTML = `<div class="room-code-box">
        <div>Join at <strong>${esc(JOIN_ADDRESS)}</strong> → <em>Join a game</em></div>
        <div class="room-code" aria-label="Room code ${[...room.code].join(' ')}">${esc(room.code)}</div>
      </div>
      <h3>Houses (${seats.length} of ${C.players.max})</h3>
      ${seats.length ? `<div class="setup-grid">${seats.map((s, i) => {
        const style = PLAYER_STYLES[i];
        return `<div class="house-card" style="--house:${style.color}">
          <h3>${crestSvg(style, 26)} ${esc(s.name)} ${s.bot ? '<small class="bot-tag">Bot</small>' : `<span class="link-dot ${s.online ? 'on' : ''}" title="${s.online ? 'Connected' : 'Not connected'}"></span>`}</h3>
          <div class="home-info">${esc(CITIES[s.home].name)} · ${esc(style.colorName)}</div>
          ${s.bot ? skillHtml(i, s.skill) : ''}
          <button class="btn small ghost" data-remove="${i}">Remove</button></div>`;
      }).join('')}</div>` : `<p class="home-info">Waiting for players… Each player opens the game on their own device, chooses <em>Join a game</em> and types the code.</p>`}
      ${seats.length < C.players.max ? '<button class="btn small" id="add-bot">+ Add a bot</button> <span class="home-info">A computer house, played on this screen.</span>' : ''}`;
    $$('[data-remove]', el).forEach((b) => (b.onclick = () => room.removeSeat(Number(b.dataset.remove))));
    $$('[data-skill]', el).forEach((b) => (b.onclick = () => room.setSkill(Number(b.dataset.skill), b.dataset.val)));
    const add = $('#add-bot', el);
    if (add) add.onclick = () => {
      const home = HOME_CITIES.find((h) => !seats.some((s) => s.home === h));
      const name = DEFAULT_NAMES.find((n) => !seats.some((s) => s.name === n)) ?? `Bot ${seats.length + 1}`;
      room.addBot({ name, home, skill: 'medium' });
    };
    fitLobby();
  }
  function updateEstimate() {
    const t = $('.time-est', app);
    if (t) t.textContent = estimateText();
  }

  function start() {
    if (devices()) {
      if (!room) { $('#setup-error', app).textContent = 'The room is not open yet.'; return; }
      const players = room.seats.map((s) => ({ name: s.name, home: s.home, bot: s.bot, skill: s.skill }));
      const problem = players.length < C.players.min ? `At least ${C.players.min} houses are needed: wait for players to join, or add a bot.` : validateSetup({ players });
      if (problem) { $('#setup-error', app).textContent = problem; return; }
      room.started = true;
      const started = room;
      room = null;
      leaveSetup();
      onStart({ players, difficulty: setup.difficulty, mode: setup.mode, prePlague: setup.prePlague, timer: setup.timer, hints: setup.hints || setup.difficulty === 'apprentice', room: started });
      return;
    }
    const players = setup.players.slice(0, setup.count).map((p) => ({ ...p, name: p.name.trim() }));
    const problem = validateSetup({ players });
    if (problem) { $('#setup-error', app).textContent = problem; return; }
    leaveSetup();
    onStart({ players, difficulty: setup.difficulty, mode: setup.mode, prePlague: setup.prePlague, timer: setup.timer, hints: setup.hints || setup.difficulty === 'apprentice' });
  }
  const fixHomes = () => {
    const used = new Set();
    for (const p of setup.players.slice(0, setup.count)) {
      if (used.has(p.home)) p.home = HOME_CITIES.find((h) => !used.has(h));
      used.add(p.home);
    }
  };
  draw();
  $('#name-0', app)?.focus();
}
