// Saves the game in this browser (localStorage) after every change, so a
// game can be continued later. Everything is wrapped in try/catch because
// storage can be blocked (private windows, strict settings).
import { SAVE_VERSION } from '../engine/state.js';

const KEY = 'ports-of-plague-save';

export function saveGame(state, ui) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), state, ui }));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.state?.version !== SAVE_VERSION || data.state.phase === 'ended') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
