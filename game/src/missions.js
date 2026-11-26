// Sorties: the mission layer on top of the flight model. Each sortie is
// a list of objectives with different goals — rings to thread, parcels
// to drop, strips to land on — and the scoring that turns a flight into
// decisions: speed bands, drop accuracy, soft landings, fuel left over.
//
// Parcels are physical: a dropped parcel keeps the aircraft's velocity,
// falls under gravity, drifts toward the wind, and is scored where it
// actually lands — not where the pilot pressed the key. The pilot has
// to judge the lead, the wind and the height.
//
// Missions never draw anything. They watch the flight state, report
// what the pilot should do next, and emit events the game reacts to.
import { RINGS, RING_RADIUS, RING_SCORE, RING_PERFECT_SCORE, DROP_TARGETS, DROP_MAX_ALT, DROP_SCORE_MAX, STRIPS, SCORE, SORTIES, FLIGHT } from './config.js';
import { stripAt, terrainHeight, windAt } from './flight.js';

export const MISSION_RING = 1;
export const MISSION_DROP = 2;
export const MISSION_LAND = 4;
export const MISSION_DONE = 8;
export const MISSION_PERFECT = 16;
export const MISSION_RELEASED = 32;

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
    parcelsInFlight: [],
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

  // Where would a parcel released from this flight state land?
  // The same physics as the falling parcels below, stepped forward:
  // the parcel keeps the aircraft's velocity, falls under gravity and
  // drifts toward the wind. The autopilot and the HUD's impact marker
  // both use this, so what the pilot aims at is what actually happens.
  function predictImpactPoint(flight) {
    const wind = windAt(flight.time);
    const fx = Math.cos(flight.heading) * Math.cos(flight.pitch);
    const fz = Math.sin(flight.heading) * Math.cos(flight.pitch);
    const fy = Math.sin(flight.pitch);
    let x = flight.x;
    let y = flight.y;
    let z = flight.z;
    let vx = fx * flight.speed + wind.x;
    let vy = fy * flight.speed;
    let vz = fz * flight.speed + wind.z;
    const dt = 0.05;
    for (let i = 0; i < 400; i += 1) {
      vy -= FLIGHT.gravity * dt;
      vx += (wind.x - vx) * 0.15 * dt;
      vz += (wind.z - vz) * 0.15 * dt;
      x += vx * dt;
      y += vy * dt;
      z += vz * dt;
      if (y <= terrainHeight(x, z) + 0.5) return { x, z, fallTime: (i + 1) * dt };
    }
    return { x, z, fallTime: 20 };
  }

  // Call when the pilot presses the action key (Space): release a parcel.
  // The parcel is only released below the drop ceiling and while the
  // aircraft is flying; a refused drop costs nothing. The score is
  // decided when the parcel lands, in update() — not here.
  function dropParcel(flight) {
    let events = 0;
    if (state.parcelsLeft <= 0) return events;
    const obj = currentObjective();
    if (obj === null || obj.kind !== 'drop') return events;
    if (!flight.airborne) {
      state.lastMessage = 'TAKE OFF FIRST — parcels drop from the air';
      return events;
    }
    if (flight.y > DROP_MAX_ALT) {
      state.lastMessage = 'TOO HIGH TO DROP — descend first';
      return events;
    }
    state.parcelsLeft -= 1;
    const wind = windAt(flight.time);
    const fx = Math.cos(flight.heading) * Math.cos(flight.pitch);
    const fz = Math.sin(flight.heading) * Math.cos(flight.pitch);
    const fy = Math.sin(flight.pitch);
    state.parcelsInFlight.push({
      x: flight.x,
      y: flight.y - 2,
      z: flight.z,
      vx: fx * flight.speed + wind.x,
      vy: fy * flight.speed,
      vz: fz * flight.speed + wind.z,
      target: obj.index,
      spin: 0,
    });
    state.lastMessage = 'PARCEL AWAY — watch where it lands';
    events |= MISSION_RELEASED;
    return events;
  }

  // A parcel hits the ground: score where it actually landed.
  function scoreParcel(parcel) {
    const target = DROP_TARGETS[parcel.target];
    const d = Math.hypot(parcel.x - target.x, parcel.z - target.z);
    const obj = state.objectives[parcel.target];
    // A late parcel for a target that is already done scores nothing —
    // one target, one score, however many sacks are in the air.
    if (obj !== undefined && obj.done) return 0;
    if (d <= target.radius * 2.5) {
      const accuracy = Math.max(0, 1 - d / (target.radius * 2.5));
      const points = Math.round(DROP_SCORE_MAX * accuracy);
      state.score += points;
      state.dropsScored += 1;
      state.dropResults.push({ target: parcel.target, accuracy, points });
      state.lastMessage = points >= 120 ? `DROP BULLSEYE +${points}` : `DROP ON TARGET +${points}`;
      if (obj !== undefined && !obj.done) {
        obj.done = true;
        if (state.current === parcel.target) state.current += 1;
      }
      return MISSION_DROP;
    }
    state.lastMessage = 'OFF TARGET — the parcel missed the circle';
    state.dropResults.push({ target: parcel.target, accuracy: 0, points: 0 });
    return 0;
  }

  // Watch the flight state every step: ring passes, falling parcels
  // and landings.
  function update(dt, flight, flightEvents, EVENT_TOUCHDOWN) {
    let events = 0;
    state.elapsed += dt;
    const obj = currentObjective();

    // Falling parcels: gravity, drift toward the wind, then the ground.
    if (state.parcelsInFlight.length > 0) {
      const wind = windAt(flight.time);
      for (let i = state.parcelsInFlight.length - 1; i >= 0; i -= 1) {
        const parcel = state.parcelsInFlight[i];
        parcel.vy -= FLIGHT.gravity * dt;
        parcel.vx += (wind.x - parcel.vx) * 0.15 * dt;
        parcel.vz += (wind.z - parcel.vz) * 0.15 * dt;
        parcel.x += parcel.vx * dt;
        parcel.y += parcel.vy * dt;
        parcel.z += parcel.vz * dt;
        parcel.spin += dt * 2;
        if (parcel.y <= terrainHeight(parcel.x, parcel.z) + 0.5) {
          state.parcelsInFlight.splice(i, 1);
          events |= scoreParcel(parcel);
        }
      }
    }

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
    state.parcelsInFlight = [];
    state.patternPhase = 0;
    state.patternFor = -1;
  }

  reset();
  return { state, currentObjective, objectiveText, dropParcel, update, reset, predictImpactPoint };
}
