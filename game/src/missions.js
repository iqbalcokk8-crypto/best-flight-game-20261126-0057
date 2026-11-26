// Sorties: the mission layer on top of the flight model. Each sortie is
// a list of objectives with different goals — rings to thread, parcels
// to drop, strips to land on — and the scoring that turns a flight into
// decisions: speed bands, drop accuracy, soft landings, fuel left over.
//
// Missions never draw anything. They watch the flight state, report
// what the pilot should do next, and emit events the game reacts to.
import { RINGS, RING_RADIUS, RING_SCORE, RING_PERFECT_SCORE, DROP_TARGETS, DROP_MAX_ALT, DROP_SCORE_MAX, STRIPS, SCORE, SORTIES } from './config.js';
import { stripAt } from './flight.js';

export const MISSION_RING = 1;
export const MISSION_DROP = 2;
export const MISSION_LAND = 4;
export const MISSION_DONE = 8;
export const MISSION_PERFECT = 16;

function distance3(ax, ay, az, bx, by, bz) {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function buildObjectives(sortieId) {
  if (sortieId === 'rings') {
    return RINGS.map((ring, i) => ({ kind: 'ring', index: i, x: ring.x, y: ring.y, z: ring.z, band: ring.band, done: false }));
  }
  if (sortieId === 'parcels') {
    return DROP_TARGETS.map((target, i) => ({ kind: 'drop', index: i, x: target.x, y: 0, z: target.z, radius: target.radius, done: false }));
  }
  // Island Hop: land Kuning, then Hijau, then home.
  return [
    { kind: 'land', index: 0, stripId: 'kuning', x: STRIPS[1].x, y: 0, z: STRIPS[1].z, done: false },
    { kind: 'land', index: 1, stripId: 'hijau', x: STRIPS[2].x, y: 0, z: STRIPS[2].z, done: false },
  ];
}

export function createMission(sortieId) {
  const sortie = SORTIES[sortieId] ?? SORTIES.rings;
  const objectives = buildObjectives(sortie.id);
  const state = {
    sortieId: sortie.id,
    objectives,
    current: 0,
    score: 0,
    ringsPerfect: 0,
    ringsPassed: 0,
    dropsScored: 0,
    parcelsLeft: sortie.parcels,
    landings: 0,
    elapsed: 0,
    done: false,
    homeLanded: false,
    lastMessage: '',
    lastPerfect: false,
    dropResults: [],
    patternPhase: 0, // autopilot traffic-pattern phase (shots.js scratch)
    patternFor: -1, // which objective the pattern phase belongs to
  };

  function currentObjective() {
    return state.objectives[state.current] ?? null;
  }

  function objectiveText() {
    const obj = currentObjective();
    if (state.done) return 'SORTIE COMPLETE — park on the strip';
    if (obj === null) return 'Return to PULAU SENJA and land on the home strip';
    if (obj.kind === 'ring') return `RING ${obj.index + 1}/8 — fly through, ${Math.round(obj.band[0] * 1.94)}–${Math.round(obj.band[1] * 1.94)} kt for PERFECT`;
    if (obj.kind === 'drop') return `DROP ${obj.index + 1}/3 — parcel over the marked circle, below ${Math.round(DROP_MAX_ALT * 3.28)} ft`;
    if (obj.kind === 'land') return `LAND ${obj.index + 1}/2 — touch down on the ${obj.stripId.toUpperCase()} grass strip`;
    return '';
  }

  // Call when the pilot presses the action key (Space): drop a parcel.
  function dropParcel(flight) {
    let events = 0;
    if (state.parcelsLeft <= 0) return events;
    const obj = currentObjective();
    if (obj === null || obj.kind !== 'drop') return events;
    state.parcelsLeft -= 1;
    const horizontal = Math.hypot(flight.x - obj.x, flight.z - obj.z);
    const inCylinder = horizontal <= obj.radius * 2.5 && flight.y <= DROP_MAX_ALT;
    if (inCylinder) {
      const accuracy = Math.max(0, 1 - horizontal / (obj.radius * 2.5));
      const points = Math.round(DROP_SCORE_MAX * accuracy);
      state.score += points;
      state.dropsScored += 1;
      state.dropResults.push({ target: obj.index, accuracy, points });
      state.lastMessage = points >= 120 ? `DROP BULLSEYE +${points}` : `DROP ON TARGET +${points}`;
      obj.done = true;
      state.current += 1;
      events |= MISSION_DROP;
    } else {
      state.lastMessage = flight.y > DROP_MAX_ALT ? 'TOO HIGH TO DROP — descend first' : 'OFF TARGET — the parcel missed the circle';
      state.dropResults.push({ target: obj.index, accuracy: 0, points: 0 });
    }
    return events;
  }

  // Watch the flight state every step: ring passes and landings.
  function update(dt, flight, flightEvents, EVENT_TOUCHDOWN) {
    let events = 0;
    state.elapsed += dt;
    const obj = currentObjective();

    if (obj !== null && obj.kind === 'ring' && flight.airborne) {
      const d = distance3(flight.x, flight.y, flight.z, obj.x, obj.y, obj.z);
      if (d <= RING_RADIUS) {
        const inBand = flight.speed >= obj.band[0] && flight.speed <= obj.band[1];
        const points = inBand ? RING_PERFECT_SCORE : RING_SCORE;
        state.score += points;
        state.ringsPassed += 1;
        if (inBand) state.ringsPerfect += 1;
        state.lastPerfect = inBand;
        state.lastMessage = inBand ? `PERFECT RING +${points}` : `RING +${points} — outside the speed band`;
        obj.done = true;
        state.current += 1;
        events |= MISSION_RING | (inBand ? MISSION_PERFECT : 0);
      }
    }

    if ((flightEvents & EVENT_TOUCHDOWN) !== 0) {
      const here = stripAt(flight.x, flight.z);
      if (here !== null) {
        const sink = -flight.verticalSpeed;
        const soft = sink < 2;
        const centred = Math.abs(here.acrossNorm) < 0.4;
        if (obj !== null && obj.kind === 'land' && here.strip.id === obj.stripId) {
          const points = SCORE.landingBase + (soft ? SCORE.landingSoftBonus : 0) + (centred ? SCORE.centrelineBonus : 0);
          state.score += points;
          state.landings += 1;
          state.lastMessage = `LANDED ${here.strip.id.toUpperCase()} +${points}${soft ? ' — soft!' : ''}`;
          obj.done = true;
          state.current += 1;
          events |= MISSION_LAND;
        } else if (here.strip.id === 'home' && state.current >= state.objectives.length) {
          // Final landing home ends the sortie — scored in finish().
          const points = SCORE.landingBase + (soft ? SCORE.landingSoftBonus : 0) + (centred ? SCORE.centrelineBonus : 0);
          state.score += points;
          state.landings += 1;
          state.homeLanded = true;
          state.lastMessage = `HOME — LANDED +${points}${soft ? ' — soft!' : ''}`;
          events |= MISSION_LAND;
        } else if (here.strip.id === 'home') {
          state.lastMessage = 'Back home early — objectives remain';
        }
      }
    }

    // Sortie ends when every objective is done and the pilot is home.
    if (!state.done && state.current >= state.objectives.length && state.homeLanded) {
      state.done = true;
      const timeLeft = Math.max(0, SCORE.parTime[state.sortieId] - state.elapsed);
      const timeBonus = Math.round(timeLeft * SCORE.timeBonusPerSecond);
      const fuelBonus = Math.round(flight.fuel * SCORE.fuelBonusPerPercent);
      state.score += timeBonus + fuelBonus;
      state.lastMessage = `SORTIE COMPLETE — time +${timeBonus}, fuel +${fuelBonus}`;
      events |= MISSION_DONE;
    }
    return events;
  }

  function reset() {
    for (const obj of state.objectives) obj.done = false;
    state.current = 0;
    state.score = 0;
    state.ringsPerfect = 0;
    state.ringsPassed = 0;
    state.dropsScored = 0;
    state.parcelsLeft = sortie.parcels;
    state.landings = 0;
    state.elapsed = 0;
    state.done = false;
    state.homeLanded = false;
    state.lastMessage = '';
    state.lastPerfect = false;
    state.dropResults = [];
    state.patternPhase = 0;
    state.patternFor = -1;
  }

  reset();
  return { state, currentObjective, objectiveText, dropParcel, update, reset };
}
