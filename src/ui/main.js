// Entry point: switches between the menu, setup, game and end screens, and
// the player's own screen when joining a multi-device game.
import { C, createGame } from '../engine/state.js';
import { HOME_CITIES } from '../data.js';
import { renderMenu, renderSetup } from './menu.js';
import { startGame } from './game.js';
import { renderEnd } from './endgame.js';
import { renderJoin } from './controller.js';
import { clearSave, saveGame } from './save.js';
import { music } from './music.js';
import { sfx } from './sound.js';
import { esc } from './dom.js';
import { hostRoom } from '../net/host.js';
import { lastRoom } from '../net/client.js';
import { netAvailable } from '../net/transport.js';

const app = document.getElementById('app');

function menu() {
  renderMenu(app, { onNew: setup, onContinue: resume, onJoin: () => join() });
}

function setup() {
  renderSetup(app, {
    onBack: menu,
    onStart: ({ players, difficulty, mode, hints, room }) => {
      const state = createGame({ players, difficulty, mode, seed: `${Date.now()}-${Math.random()}` });
      const ui = { hints, seenSeq: 0, room: room ? { code: room.code, seats: room.savedSeats() } : null };
      saveGame(state, ui);
      play(state, ui, room);
    },
  });
}

function join(code = '') {
  renderJoin(app, { code, onBack: menu });
}

// A saved multi-device game reopens its room, so the players' devices can rejoin.
async function resume(saved) {
  app.onkeydown = null;
  const ui = saved.ui ?? {};
  if (!ui.room) { play(saved.state, ui); return; }
  const message = (html) => { app.innerHTML = `<section class="screen"><div class="frame join-box">${html}</div></section>`; };
  message(`<h1>Room ${esc(ui.room.code)}</h1><p>Reopening the room for the players’ devices…</p>`);
  try {
    if (!netAvailable()) throw new Error('not set up');
    const room = await hostRoom({ code: ui.room.code, seats: ui.room.seats, started: true, joinRules: { max: C.players.max, homes: HOME_CITIES } });
    ui.room.code = room.code;
    play(saved.state, ui, room);
  } catch {
    message(`<h1>Could not reopen the room</h1><p>Check the internet connection. You can also finish this game on this device only.</p>
      <div class="setup-actions"><button class="btn ghost" id="back">← Menu</button><button class="btn" id="here">Play on this device</button><button class="btn primary" id="retry">Try again</button></div>`);
    app.querySelector('#back').onclick = menu;
    app.querySelector('#retry').onclick = () => resume(saved);
    app.querySelector('#here').onclick = () => { ui.room = null; play(saved.state, ui); };
  }
}

function play(state, ui, room = null) {
  const leave = (then) => () => { room?.close(); then(); };
  startGame(app, state, ui, {
    room,
    onExit: leave(menu),
    onEnd: (finished) => {
      clearSave();
      renderEnd(app, finished, { onAgain: leave(setup), onMenu: leave(menu), fit: !!room });
    },
  });
}

// Test hook: lets automated browser tests inspect and drive the game.
window.__portsOfPlague = { app };
// Music starts after the first click or key press (a browser rule).
music.enableOnFirstGesture();
// A soft click for every button press.
document.addEventListener('click', (e) => { if (e.target.closest('button')) sfx.click(); }, true);

if (typeof HTMLDialogElement !== 'function') {
  // Every card and choice is a <dialog>: Safari 15.4+, Chrome, Edge and Firefox 98+ have it.
  app.innerHTML = `<section class="screen"><div class="frame join-box"><h1>Please update your browser</h1>
    <p>Ports of Plague needs a newer web browser. Update this device’s browser (Safari, Chrome, Edge or Firefox) and open the page again.</p></div></section>`;
} else if (lastRoom()) {
  // This tab was in a multi-device game before it reloaded: go straight back in.
  join(lastRoom());
} else {
  menu();
}
