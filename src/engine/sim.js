// Plays a whole game with computer players. Used by the simulator and tests.
import { createGame } from './state.js';
import { advance } from './turn.js';
import { playTurn } from './bots.js';

export function playBotGame({ players, seed, difficulty = 'chronicler', mode = 'standard' }) {
  const state = createGame({ players, seed, difficulty, mode });
  let turns = 0;
  let guard = 0;
  while (state.phase !== 'ended' && guard++ < 1000) {
    if (state.phase === 'actions') {
      playTurn(state);
      turns++;
    } else {
      advance(state);
    }
  }
  if (state.phase !== 'ended') throw new Error('Game did not finish');
  return { state, turns };
}
