// A player's own device in multi-device play (phone, tablet or computer):
// join a room with its 4-character code, choose a house, then take your turns
// and press Next on the story cards. The big screen runs the game; this
// screen only draws the state it receives and sends requests back.
import { DATA, CITIES, HOME_CITIES } from '../data.js';
import { C, PLAYER_STYLES, currentPlayer, roundInfo, roundNumber, totalRounds, familyTotal, scorePlayer } from '../engine/index.js';
import { $, $$, esc, openDialog, dialogOpen, closeAllDialogs, toast, crestSvg, isTyping, warnBeforeLeaving } from './dom.js';
import { housePanelHtml, actionsPanelHtml, hintFor, quickBlock, actionPrompt, decisionPrompt, endTurnPrompt } from './prompts.js';
import { showRules, showJournal, showCity } from './panels.js';
import { storyCard, storyHtml } from './stories.js';
import { createMap, updateMap, redrawStains } from './map.js';
import { noteHtml } from './notes.js';
import { sfx } from './sound.js';
import { joinRoom } from '../net/client.js';
import { netAvailable } from '../net/transport.js';
import { isRoomCode, normalizeRoomCode, CODE_LENGTH, LOBBY, STATE, TOAST, REJECT, CLOSED, JOIN, ACT, DECIDE, END, NEXT } from '../net/protocol.js';

export function renderJoin(app, { onBack, code: preset = '' }) {
  app.onkeydown = null; // the title screen's R-for-Rules shortcut is not for this screen
  let conn = null;
  let screen = 'code';     // code → connecting → house → lobby → game
  let lobby = null;        // last LOBBY message
  let game = null;         // last STATE message
  let hostGone = false;    // the big screen left: this device is on its way back to the menu
  let waiting = null;      // id of the request sent and not yet handled by the big screen
  let waitTimer = null;
  let asking = false;      // a choice dialog is open on this device
  let nextSent = null;     // id of the story card we pressed Next on
  let lastTurnKey = null;
  let reader = null;       // the story card this device is reading: { id, close }
  let error = '';
  let form = { name: '', home: null };

  const me = () => {
    const seats = game?.seats ?? lobby?.seats ?? [];
    return conn ? seats.findIndex((s) => s.cid === conn.cid) : -1;
  };
  const leave = () => { warnBeforeLeaving(false); conn?.close(); conn = null; document.removeEventListener('keydown', onKey); onBack(); };

  // ---------- Step 1: the room code ----------
  function drawCode() {
    screen = 'code';
    app.innerHTML = `<section class="screen"><div class="frame join-box">
      <h1>Join a Game</h1>
      <p>Type the room code shown on the big screen (4 letters and numbers).</p>
      <form id="code-form" class="field" autocomplete="off">
        <label for="room-code">Room code</label>
        <input id="room-code" class="code-input" maxlength="${CODE_LENGTH}" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" value="${esc(preset)}" aria-describedby="join-error">
        <p class="error" id="join-error" role="alert">${esc(error)}</p>
        <div class="setup-actions"><button type="button" class="btn ghost" id="back">← Back</button><button class="btn primary" id="go">Join →</button></div>
      </form></div></section>`;
    const input = $('#room-code', app);
    input.oninput = () => { input.value = normalizeRoomCode(input.value).slice(0, CODE_LENGTH); };
    $('#back', app).onclick = leave;
    $('#code-form', app).onsubmit = (e) => { e.preventDefault(); connect(input.value); };
    input.focus();
  }

  async function connect(typed) {
    const code = normalizeRoomCode(typed);
    if (!isRoomCode(code)) { error = `Check the code: it has ${CODE_LENGTH} letters and numbers, like the one on the big screen.`; drawCode(); return; }
    if (!netAvailable()) { error = 'Multi-device play is not set up on this copy of the game yet (see “Supabase setup” in the README).'; drawCode(); return; }
    error = '';
    screen = 'connecting';
    app.innerHTML = `<section class="screen"><div class="frame join-box"><h1>Room ${esc(code)}</h1><p>Connecting…</p></div></section>`;
    try {
      conn = await joinRoom(code, { onMessage, onHostGone: () => hostLeft('lost') });
    } catch {
      error = 'Could not connect. Check the internet connection and try again.';
      drawCode();
      return;
    }
    // No answer from a big screen: probably a wrong code.
    setTimeout(() => {
      if (screen === 'connecting') {
        conn?.close({ leave: false });
        conn = null;
        error = `No game found with code ${code}. Check the code on the big screen.`;
        drawCode();
      }
    }, 5000);
  }

  function onMessage(m) {
    if (m.t === LOBBY) {
      lobby = m;
      if (me() >= 0) drawLobby();
      else if (screen !== 'house') drawHouse();
      else refreshTakenHomes();
    } else if (m.t === STATE) {
      const firstState = !game || screen !== 'game';
      game = m;
      if (waiting && (m.seats[me()]?.rid ?? 0) >= waiting) stopWaiting();
      if (nextSent !== null && m.view?.next?.id !== nextSent) nextSent = null;
      if (reader && reader.id !== m.view?.next?.id) reader.close?.();
      if (firstState) document.addEventListener('keydown', onKey);
      drawGame();
    } else if (m.t === TOAST) {
      toast(m.text, 4200);
    } else if (m.t === REJECT) {
      error = m.reason;
      if (screen === 'game') drawRejoin(); else drawHouse();
    } else if (m.t === CLOSED) {
      hostLeft('closed');
    }
  }

  // The big screen left (or stopped answering): a popup, then back to the menu.
  // Anything this device had open is cancelled, not sent.
  function hostLeft(why) {
    if (hostGone || !conn) return;
    hostGone = true;
    warnBeforeLeaving(false);
    const code = conn.code;
    const inGame = screen === 'game' && game?.state?.phase !== 'ended';
    conn.close({ leave: false });
    conn = null;
    stopWaiting();
    document.removeEventListener('keydown', onKey);
    closeAllDialogs();
    const reason = why === 'closed'
      ? (screen === 'game' ? 'The big screen has left the game.' : 'The big screen has closed the room.')
      : 'The big screen stopped answering. It may have been closed, or lost its internet connection.';
    const again = inGame ? `<p>If the big screen continues this saved game later, choose <em>Join a game</em> and type <strong>${esc(code)}</strong> again to get your house back.</p>` : '';
    openDialog(`<div class="frame"><h2>The big screen left</h2><p>${reason}</p>${again}
      <div class="dialog-actions"><button class="btn primary" data-value="menu" autofocus>Back to the menu</button></div></div>`,
    { dismissable: false, label: 'The big screen left' }).then(() => onBack());
  }

  // ---------- Step 2: choose a house (before the game starts) ----------
  function drawHouse() {
    screen = 'house';
    const seats = lobby?.seats ?? [];
    const mine = seats[me()];
    if (mine && !form.home) form = { name: mine.name, home: mine.home };
    const taken = seats.filter((s) => s.cid !== conn?.cid).map((s) => s.home);
    if (!form.home || taken.includes(form.home)) form.home = HOME_CITIES.find((h) => !taken.includes(h)) ?? HOME_CITIES[0];
    const style = PLAYER_STYLES[mine ? me() : seats.length] ?? PLAYER_STYLES[0];
    app.innerHTML = `<section class="screen"><div class="frame join-box">
      <h1>Room ${esc(conn.code)}</h1>
      <p>Name your merchant house and choose its home city.</p>
      <form id="house-form" autocomplete="off">
        <div class="house-card" style="--house:${style.color}">
          <h3>${crestSvg({ color: style.color, crest: style.crest }, 26)} Your house <small style="font-family:var(--serif);font-weight:400">(${esc(style.colorName)})</small></h3>
          <div class="field"><label for="house-name">House name</label><input id="house-name" maxlength="24" autocomplete="off" enterkeyhint="done" value="${esc(form.name)}" placeholder="House of the …"></div>
          <div class="field"><label for="house-home">Home city</label><select id="house-home">${HOME_CITIES.map((h) => `<option value="${h}" ${form.home === h ? 'selected' : ''} ${taken.includes(h) ? 'disabled' : ''}>${esc(CITIES[h].name)}${taken.includes(h) ? ' (taken)' : ''}</option>`).join('')}</select></div>
          <div class="home-info" id="home-info">${homeInfo(form.home)}</div>
        </div>
        <p class="error" role="alert">${esc(error)}</p>
        <div class="setup-actions"><button type="button" class="btn ghost" id="back">Leave</button><button class="btn primary">Join the game →</button></div>
      </form></div></section>`;
    const name = $('#house-name', app), home = $('#house-home', app);
    name.oninput = () => { form.name = name.value; };
    home.onchange = () => { form.home = home.value; $('#home-info', app).innerHTML = homeInfo(home.value); };
    $('#back', app).onclick = leave;
    $('#house-form', app).onsubmit = (e) => {
      e.preventDefault();
      if (!form.name.trim()) { error = 'Every house needs a name.'; drawHouse(); return; }
      error = '';
      conn.send({ t: JOIN, name: form.name.trim(), home: form.home });
    };
    if (!form.name) name.focus();
  }
  function refreshTakenHomes() {
    const taken = (lobby?.seats ?? []).filter((s) => s.cid !== conn?.cid).map((s) => s.home);
    $$('#house-home option', app).forEach((o) => {
      o.disabled = taken.includes(o.value);
      o.textContent = CITIES[o.value].name + (o.disabled ? ' (taken)' : '');
    });
  }
  function homeInfo(id) {
    const c = CITIES[id];
    const mode = lobby?.options?.mode ?? 'standard';
    const bonus = mode === 'quick' ? c.home.quickStartFlorins ?? c.home.startFlorins : c.home.startFlorins;
    return `Plague arrives: ${esc(c.arrival.dateText)}. Starts with ${C.start.florins + (bonus ?? 0)}ƒ and ${C.start.reputation + (c.home.startReputation ?? 0)} reputation.`;
  }

  // ---------- Step 3: waiting for the big screen to start ----------
  function drawLobby() {
    screen = 'lobby';
    form = { name: '', home: null };
    const seats = lobby?.seats ?? [];
    const o = lobby?.options ?? {};
    app.innerHTML = `<section class="screen"><div class="frame join-box">
      <h1>Room ${esc(conn.code)}</h1>
      <p><strong>You are in!</strong> Waiting for the big screen to start the game…</p>
      ${o.mode ? `<p class="home-info">${esc(C.modes[o.mode]?.label ?? '')} · ${esc(C.difficulty[o.difficulty]?.label ?? '')}</p>` : ''}
      <div class="houses">${seats.map((s, i) => houseRow({ ...PLAYER_STYLES[i], name: s.name }, `${esc(CITIES[s.home].name)}${s.cid === conn.cid ? ' · you' : ''}`, s.online)).join('')}</div>
      <div class="setup-actions"><button class="btn ghost" id="back">Leave</button><button class="btn" id="edit">Change my house</button></div>
    </div></section>`;
    $('#back', app).onclick = leave;
    $('#edit', app).onclick = drawHouse;
  }

  function houseRow(h, sub, online = true, current = false, prefix = '') {
    return `<div class="house-row ${current ? 'current' : ''}" style="--house:${h.color}">${crestSvg(h, 20)}
      <span><strong>${prefix}${esc(h.name)}</strong><span class="link-dot ${online ? 'on' : ''}" title="${online ? 'Connected' : 'Not connected'}"></span><br><small>${sub}</small></span><span></span></div>`;
  }

  // A device without a seat (new browser, cleared data) takes its house back by name.
  function drawRejoin() {
    screen = 'game';
    app.innerHTML = `<section class="screen"><div class="frame join-box">
      <h1>Room ${esc(conn.code)}</h1>
      <p>This game has already started. If you are one of the players, type your house name exactly as before to take your place again.</p>
      <form id="rejoin" autocomplete="off"><div class="field"><label for="rejoin-name">House name</label><input id="rejoin-name" maxlength="24" enterkeyhint="go"></div>
        <p class="error" role="alert">${esc(error)}</p>
        <div class="setup-actions"><button type="button" class="btn ghost" id="back">Leave</button><button class="btn primary">Rejoin →</button></div></form>
    </div></section>`;
    $('#back', app).onclick = leave;
    $('#rejoin', app).onsubmit = (e) => { e.preventDefault(); error = ''; conn.send({ t: JOIN, name: $('#rejoin-name', app).value.trim() }); };
    $('#rejoin-name', app).focus();
  }

  // ---------- Step 4: the game ----------
  function drawGame() {
    if (hostGone) return;
    screen = 'game';
    const { state, view = {} } = game;
    const seat = me();
    if (seat < 0) { warnBeforeLeaving(false); drawRejoin(); return; }
    // Mid-game, closing this tab asks first (not before the game or after the results).
    warnBeforeLeaving(state.phase !== 'ended');
    const p = state.players[seat];
    const cur = currentPlayer(state);
    const myTurn = cur?.id === p.id;
    // Buzz once when a new turn of mine starts.
    const turnKey = myTurn ? `${state.round}-${state.turn}` : null;
    if (turnKey && turnKey !== lastTurnKey) { try { navigator.vibrate?.(200); } catch { /* not supported */ } sfx.bell(); }
    lastTurnKey = turnKey;

    const info = roundInfo(state);
    const parts = [];
    parts.push(`<header class="ctl-bar" style="--house:${p.color}">${crestSvg(p, 28)}
      <span class="ctl-name"><strong>${esc(p.name)}</strong><small>${info ? `${esc(info.label)} · Round ${roundNumber(state)} of ${totalRounds(state)}` : 'Prologue'}</small></span>
      <span class="ctl-room">Room ${esc(conn.code)}</span></header>
      <nav class="ctl-tools" aria-label="Look things up">
        <button class="btn small" id="ctl-rules">Rules</button>
        <button class="btn small" id="ctl-journal" aria-label="Historian's Journal, ${state.journal?.length ?? 0} facts">Journal <span class="count">${state.journal?.length ?? 0}</span></button>
        <button class="btn small" id="ctl-chronicle">Chronicle</button>
        <button class="btn small" id="ctl-map">Map</button>
      </nav>`);

    if (state.phase === 'ended') {
      parts.push(`<section class="panel"><h2>Anno Domini 1353</h2><p>The game is over. Final Legacy scores:</p>
        <div class="houses">${(state.finalScores ?? []).map((r) => {
          const h = state.players[r.id];
          return `<div class="house-row ${h.id === p.id ? 'current' : ''}" style="--house:${h.color}">${crestSvg(h, 20)}<span><strong>${r.place}. ${esc(h.name)}</strong><br><small>Wealth ${r.wealth} + Family ${r.family} + Reputation ${r.reputation} + Balance ${r.balance}</small></span><span><strong>${r.total}</strong></span></div>`;
        }).join('')}</div>
        <div class="dialog-actions"><button class="btn primary" id="ctl-leave">Back to the menu</button></div></section>
        <section class="panel"><h2>What Really Happened</h2>${noteHtml(DATA.timeline.epilogue.factIds, 'The real history')}</section>`);
      app.innerHTML = `<div class="controller">${parts.join('')}</div>`;
      bindTools();
      $('#ctl-leave', app).onclick = leave;
      return;
    }

    const next = view.next;
    if (next) {
      const sent = nextSent === next.id;
      parts.push(`<section class="panel next-panel" aria-label="Story card"><h2>📜 On the big screen</h2>
        <p><strong>${esc(next.title)}</strong></p>
        ${next.kind ? '<button class="btn" id="ctl-read">Read the card here</button>' : ''}
        <button class="btn primary big" id="ctl-next" ${sent ? 'disabled' : ''}>${sent ? 'Waiting…' : `${esc(next.label)} ›`}</button>
        <p class="home-info">Anyone can press it once everyone has read the card.</p></section>`);
    }

    // Two columns (side by side on wide screens, stacked on phones): what you
    // can do now, then your house and the other houses.
    const main = [];
    const side = [];
    if (myTurn && !next) {
      const hint = hintFor(state, p, view.hints);
      if (hint) main.push(`<div class="hint" role="note"><strong>Hint:</strong> ${hint}</div>`);
      if (p.pending.length) main.push(`<section class="panel"><h2>A card needs your decision</h2><button class="btn primary" id="ctl-decide">Read the card</button></section>`);
      main.push(actionsPanelHtml(state, p, { busy: !!waiting || !!view.busy }));
    } else if (!next) {
      const what = cur ? `<strong>${esc(cur.name)}</strong> is taking their turn.` : state.phase === 'plague' ? 'The plague takes its toll. Watch the big screen.' : 'The chronicle unfolds. Watch the big screen.';
      main.push(`<section class="panel waiting-panel"><h2>Please wait</h2><p>${what}</p></section>`);
      main.push('<div id="wait-map-slot"></div>');
    }
    side.push(housePanelHtml(state, p, { label: 'Your house' }));
    side.push(`<section class="panel houses-panel" aria-label="All houses"><h2>Houses (turn order)</h2><div class="houses">${state.order.map((id, i) => {
      const h = state.players[id];
      const s = game.seats[id];
      return houseRow(h, `${h.florins}ƒ · rep ${h.reputation} · family ${familyTotal(h)} · Legacy ${scorePlayer(h).total}`, s?.online, cur?.id === id, `${i + 1}. `);
    }).join('')}</div></section>`);
    parts.push(`<div class="ctl-main ${main.length ? 'two' : ''}">${main.length ? `<div class="ctl-col">${main.join('')}</div>` : ''}<div class="ctl-col">${side.join('')}</div></div>`);

    const focused = document.activeElement?.id;
    app.innerHTML = `<div class="controller">${parts.join('')}</div>`;
    bindTools();
    placeWaitMap(state);
    $('#ctl-next', app)?.addEventListener('click', pressNext);
    $('#ctl-read', app)?.addEventListener('click', readStory);
    $('#ctl-decide', app)?.addEventListener('click', () => askDecision());
    $$('[data-action]', app).forEach((b) => (b.onclick = () => chooseAction(b.dataset.action)));
    const end = $('#end-turn', app);
    if (end) { end.onclick = tryEnd; end.disabled = !!waiting || !!view.busy; }
    if (focused) $(`#${focused}`, app)?.focus({ preventScroll: true });
    // A decision waiting at the start of the turn (or after a Fortune card) opens by itself.
    if (myTurn && !next && p.pending.length && !asking && !waiting && !dialogOpen()) askDecision();
  }

  // Rules, the Historian's Journal and the Chronicle, on this device whenever
  // the player wants them (no need to ask whoever sits at the big screen).
  function bindTools() {
    const reopen = (shown) => shown.then(() => { if (screen === 'game' && game) drawGame(); });
    $('#ctl-rules', app).onclick = () => reopen(showRules());
    $('#ctl-journal', app).onclick = () => reopen(showJournal(game.state.journal ?? []));
    $('#ctl-chronicle', app).onclick = () => reopen(showChronicle());
    $('#ctl-map', app).onclick = () => reopen(showMap());
  }

  // The card on the big screen, on this device (dice already rolled). It
  // closes by itself when someone presses Next.
  function readStory() {
    const next = game?.view?.next;
    if (!next?.kind || reader) return;
    const card = storyCard(game.state, next.kind, next.data, { hints: game.view.hints, still: true });
    if (!card) return;
    const sent = nextSent === next.id;
    reader = { id: next.id };
    openDialog(storyHtml(card, `<button class="btn" data-value="close">Close</button><button class="btn primary" data-value="next" ${sent ? 'disabled' : ''}>${esc(next.label)} ›</button>`),
      { ...card.opts, dismissable: true, onMount: (d, close) => { reader.close = close; } })
      .then((v) => {
        reader = null;
        if (v === 'next') pressNext(); else if (screen === 'game') drawGame();
      });
  }

  // While others take their turn, the map sits under "Please wait". It is
  // built once and moved into each redraw, so zoom and pan survive updates.
  let waitMap = null;
  function placeWaitMap(state) {
    const slot = $('#wait-map-slot', app);
    if (!slot) return;
    if (!waitMap) {
      const el = document.createElement('section');
      el.className = 'panel map-panel';
      el.setAttribute('aria-label', 'Map');
      el.innerHTML = '<h2>The Map</h2><div class="map-frame phone-map"></div>';
      const frame = el.querySelector('.phone-map');
      const svg = createMap(frame, { onCity: (id) => showCity(game.state, id) });
      foldLegend(frame);
      waitMap = { el, svg };
    }
    slot.replaceWith(waitMap.el);
    updateMap(waitMap.svg, state);
    redrawStains(waitMap.svg, state);
  }

  // Start with the legend folded (it would cover most of a small map); tap it to open.
  function foldLegend(frame) {
    const legend = frame.querySelector('.legend');
    if (legend && !legend.classList.contains('collapsed')) {
      legend.classList.add('collapsed');
      const toggle = legend.querySelector('.legend-toggle');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.querySelector('span').textContent = '▸';
    }
  }

  // The map as the big screen shows it; tap a city (or pick it from the list)
  // to read its history, its status and who trades there.
  function showMap() {
    const { state } = game;
    const status = (id) => {
      const cs = state.cities[id];
      return cs.state === 'stricken' ? `Stricken (${cs.severity})` : cs.state === 'aftermath' ? 'Aftermath' : state.players.some((x) => x.posts.includes(id)) ? 'Safe · trading post' : 'Safe';
    };
    const cities = [...DATA.cities].sort((a, b) => a.name.localeCompare(b.name));
    return openDialog(`<div class="frame"><h2>The Map</h2><p class="home-info">Tap a city for its history.</p>
      <div class="map-frame phone-map" id="phone-map"></div>
      <div class="city-list">${cities.map((c) => `<button class="btn small" data-city="${c.id}">${esc(c.name)} <small>${esc(status(c.id))}</small></button>`).join('')}</div>
      <div class="dialog-actions"><button class="btn primary" data-value="close" autofocus>Close</button></div></div>`,
    { wide: true, label: 'Map', onMount: (d) => {
      const svg = createMap(d.querySelector('#phone-map'), { onCity: (id) => showCity(state, id) });
      foldLegend(d.querySelector('#phone-map'));
      updateMap(svg, state);
      redrawStains(svg, state);
      d.querySelectorAll('.city-list [data-city]').forEach((b) => (b.onclick = () => showCity(state, b.dataset.city)));
    } });
  }
  function showChronicle() {
    const { state, view = {} } = game;
    const recent = state.log.filter((e) => e.text && e.type !== 'turn').reverse();
    return openDialog(`<div class="frame"><h2>The Chronicle</h2>
      ${noteHtml(view.note, 'Latest Historical Note')}
      <h3 style="margin-top:1rem">Recent events</h3>
      <ol class="log chronicle-log" reversed>${recent.map((e) => `<li>${esc(e.text)}</li>`).join('')}</ol>
      <div class="dialog-actions"><button class="btn primary" data-value="close" autofocus>Close</button></div></div>`, { label: 'Chronicle' });
  }

  function pressNext() {
    if (hostGone) return;
    const next = game?.view?.next;
    if (!next || nextSent === next.id) return;
    nextSent = next.id;
    conn.send({ t: NEXT, id: next.id });
    drawGame();
  }

  function mine() {
    const seat = me();
    const state = game?.state;
    const p = state?.players[seat];
    return p && currentPlayer(state)?.id === p.id ? { state, p } : null;
  }

  async function askDecision() {
    const m = mine();
    if (!m || !m.p.pending.length || asking) return;
    asking = true;
    const pr = decisionPrompt(m.state, m.p, m.p.pending[0]);
    const choice = pr.parse(await openDialog(pr.html, pr.opts));
    asking = false;
    request({ t: DECIDE, choice });
  }

  async function chooseAction(id) {
    const m = mine();
    if (!m || asking || waiting) return;
    const why = quickBlock(m.state, id, m.p);
    if (why) { sfx.error(); toast(why); return; }
    const pr = actionPrompt(m.state, m.p, id);
    if (!pr) return;
    asking = true;
    const action = pr.parse(await openDialog(pr.html, pr.opts));
    asking = false;
    if (action) request({ t: ACT, action });
    else drawGame();
  }

  async function tryEnd() {
    const m = mine();
    if (!m || asking || waiting) return;
    if (m.p.pending.length) { toast('Answer the card first.'); return; }
    if (m.p.ap > 0) {
      const pr = endTurnPrompt(m.p);
      asking = true;
      const ok = pr.parse(await openDialog(pr.html, pr.opts));
      asking = false;
      if (!ok) return;
    }
    request({ t: END });
  }

  // Buttons stay disabled until the big screen reports this request as handled
  // (or after a while, in case the message was lost on a bad connection).
  function request(msg) {
    if (hostGone) return;
    waiting = Date.now();
    conn.send({ ...msg, rid: waiting });
    clearTimeout(waitTimer);
    waitTimer = setTimeout(() => { if (!game?.view?.next && !game?.view?.busy) { stopWaiting(); drawGame(); } }, 15000);
    drawGame();
  }
  function stopWaiting() {
    waiting = null;
    clearTimeout(waitTimer);
  }

  function onKey(e) {
    if (screen !== 'game' || dialogOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(e)) return;
    const k = e.key.toLowerCase();
    if (k === 'r') { e.preventDefault(); $('#ctl-rules', app)?.click(); return; }
    if (k === 'j') { e.preventDefault(); $('#ctl-journal', app)?.click(); return; }
    if (k === 'c') { e.preventDefault(); $('#ctl-chronicle', app)?.click(); return; }
    if (k === 'm') { e.preventDefault(); $('#ctl-map', app)?.click(); return; }
    if ((k === 'enter' || k === ' ') && game?.view?.next && !e.target.closest?.('button')) { e.preventDefault(); pressNext(); return; }
    if (!mine() || game?.view?.next) return;
    const a = DATA.actions.find((x) => x.key === k);
    if (a) { e.preventDefault(); chooseAction(a.id); }
    if (k === 'e') { e.preventDefault(); tryEnd(); }
  }

  if (preset && isRoomCode(preset)) connect(preset); else drawCode();
}
