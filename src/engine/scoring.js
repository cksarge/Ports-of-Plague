// Legacy score = Wealth + Family + Reputation + Balance bonus (lowest of the three).
import { C, familyTotal } from './state.js';

export function scorePlayer(p) {
  const s = C.scoring;
  const wealth = Math.floor(p.florins / s.florinsPerPoint) + p.posts.length * s.pointsPerPost;
  const family = familyTotal(p) * s.pointsPerFamily;
  // Reputation: full points up to the soft cap, then 1 point per `reputationHighRate` above it.
  const soft = s.reputationSoftCap ?? Infinity;
  const reputation = Math.min(p.reputation, soft) * s.reputationPoints +
    Math.floor(Math.max(0, p.reputation - soft) / (s.reputationHighRate ?? 1));
  const balance = Math.min(wealth, family, reputation);
  return { wealth, family, reputation, balance, total: wealth + family + reputation + balance };
}

// Final ranking. Ties: higher reputation, then more family; otherwise shared.
export function rankPlayers(state) {
  const rows = state.players.map((p) => ({ id: p.id, name: p.name, ...scorePlayer(p), familyCount: familyTotal(p), rep: p.reputation }));
  rows.sort((a, b) => b.total - a.total || b.rep - a.rep || b.familyCount - a.familyCount);
  let place = 0;
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.total !== r.total || prev.rep !== r.rep || prev.familyCount !== r.familyCount) place = i + 1;
    r.place = place;
  });
  return rows;
}

// The single house in last place right now (lowest score; ties go to the
// house with fewer florins, then the later seat).
export function lastPlaceId(state) {
  let worst = null;
  for (const p of state.players) {
    const t = scorePlayer(p).total;
    if (!worst || t < worst.t || (t === worst.t && p.florins <= worst.f)) worst = { id: p.id, t, f: p.florins };
  }
  return worst.id;
}
