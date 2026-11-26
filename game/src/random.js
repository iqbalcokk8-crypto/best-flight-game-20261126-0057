// Seeded random numbers (mulberry32) so a fixed seed always builds the
// same sky: the same gusts, the same cloud drift, the same screenshot.
export function createRandom(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A value-noise helper for gentle, repeatable variation (cloud wobble,
// gust shape). Deterministic in its inputs: same x, same answer.
export function smoothNoise(x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(i);
  const b = hash01(i + 1);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

function hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
