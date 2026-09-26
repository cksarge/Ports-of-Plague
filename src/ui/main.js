// Entry point: switches between the menu, setup, game and end screens.
import { createGame } from '../engine/state.js';
import { renderMenu, renderSetup } from './menu.js';
import { startGame } from './game.js';
import { renderEnd } from './endgame.js';
import { clearSave, saveGame } from './save.js';
import { music } from './music.js';
import { sfx } from './sound.js';

const app = document.getElementById('app');

function menu() {
  renderMenu(app, { onNew: setup, onContinue: (saved) => play(saved.state, saved.ui ?? {}) });
}

function setup() {
  renderSetup(app, {
    onBack: menu,
    onStart: ({ players, difficulty, mode, hints }) => {
      const state = createGame({ players, difficulty, mode, seed: `${Date.now()}-${Math.random()}` });
      const ui = { hints, seenSeq: 0 };
      saveGame(state, ui);
      play(state, ui);
    },
  });
}

function play(state, ui) {
  startGame(app, state, ui, {
    onExit: menu,
    onEnd: (finished) => {
      clearSave();
      renderEnd(app, finished, { onAgain: setup, onMenu: menu });
    },
  });
}

// Test hook: lets automated browser tests inspect and drive the game.
window.__portsOfPlague = { app };
// Music starts after the first click or key press (a browser rule).
music.enableOnFirstGesture();
// A soft click for every button press.
document.addEventListener('click', (e) => { if (e.target.closest('button')) sfx.click(); }, true);
menu();
