// Seeded dice. The generator's state lives inside the game state, so a
// saved game resumes with exactly the same future rolls, and tests and
// simulations can be repeated.

export function seedFrom(value) {
  let h = 2166136261 >>> 0;
  for (const ch of String(value)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// mulberry32: small, fast, good enough for dice.
export function nextRandom(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function roll(state, sides = 6) {
  return 1 + Math.floor(nextRandom(state) * sides);
}

export function shuffle(state, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(state, list) {
  return list[Math.floor(nextRandom(state) * list.length)];
}
