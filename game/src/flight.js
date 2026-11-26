// The flight model: pure logic, no drawing, no browser in it.
// A small prop courier over a sunset archipelago. Throttle sets the
// speed the engine wants; pitch trades speed for altitude; bank turns
// the nose; below stall speed the wing quits. Fuel, damage and the
// ground are all decided here, so the browser tests can drive it.
//
// State: pos {x, y, z} (y up, metres), heading (rad, 0 = +x east,
// positive turns toward +z / south), pitch, bank, speed (m/s),
// throttle 0..1, fuel %, damage %, airborne, verticalSpeed.
// step() advances one fixed step and returns event bit flags.
import { FLIGHT, ISLANDS, STRIPS, WIND, HOME_APRON_Y } from './config.js';

export const EVENT_NONE = 0;
export const EVENT_STALL = 1;
export const EVENT_TOUCHDOWN = 2;
export const EVENT_CRASH = 4;
export const EVENT_FUEL_EMPTY = 8;
export const EVENT_TAKEOFF = 16;
export const EVENT_HARD_LANDING = 32;

export function terrainHeight(x, z) {
  let h = 0;
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dz = z - island.z;
    const d = Math.sqrt(dx * dx + dz * dz) / island.radius;
    if (d >= 1) continue;
    // Smooth island bump: 1 at the centre, 0 at the shore, with a
    // flattened shoulder so beaches read as beaches.
    const bump = Math.cos(d * Math.PI * 0.5);
    h = Math.max(h, island.height * bump * bump);
  }
  // The home apron is graded flat so the runway sits level: fully flat
  // over the strip itself, feathering out beyond it.
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax < 230 && az < 45) {
    const ex = Math.min(1, Math.max(0, (ax - 195) / 35));
    const ez = Math.min(1, Math.max(0, (az - 20) / 25));
    const edge = Math.max(ex, ez);
    const flat = 1 - edge * edge * (3 - 2 * edge);
    h = h * (1 - flat) + HOME_APRON_Y * flat;
  }
  // The grass strips are graded flat too, or the runway mesh would
  // float above the island's slope at its ends.
  for (const strip of STRIPS) {
    if (strip.id === 'home') continue;
    const dx = x - strip.x;
    const dz = z - strip.z;
    const cos = Math.cos(-strip.heading);
    const sin = Math.sin(-strip.heading);
    const along = dx * cos - dz * sin;
    const across = dx * sin + dz * cos;
    if (Math.abs(along) < strip.length / 2 + 50 && Math.abs(across) < strip.width / 2 + 30) {
      const eAlong = Math.min(1, Math.max(0, (Math.abs(along) - strip.length / 2) / 50));
      const eAcross = Math.min(1, Math.max(0, (Math.abs(across) - strip.width / 2) / 30));
      const edge = Math.max(eAlong, eAcross);
      const flat = 1 - edge * edge * (3 - 2 * edge);
      h = h * (1 - flat) + strip.stripY * flat;
    }
  }
  return h;
}

// Which strip (if any) covers this ground point, and how far along it
// the point sits (-1..1 across, 0..1 along, in strip-local space).
export function stripAt(x, z) {
  for (const strip of STRIPS) {
    const dx = x - strip.x;
    const dz = z - strip.z;
    const cos = Math.cos(-strip.heading);
    const sin = Math.sin(-strip.heading);
    const along = dx * cos - dz * sin;
    const across = dx * sin + dz * cos;
    if (Math.abs(along) <= strip.length / 2 && Math.abs(across) <= strip.width / 2) {
      return { strip, along, across, alongNorm: along / (strip.length / 2), acrossNorm: across / (strip.width / 2) };
    }
  }
  return null;
}

export function windAt(time) {
  const gust = Math.sin((time / WIND.gustPeriod) * Math.PI * 2) * WIND.gustAmp
    + Math.sin((time / (WIND.gustPeriod * 0.37)) * Math.PI * 2) * WIND.gustAmp * 0.4;
  const speed = Math.max(0, WIND.baseSpeed + gust);
  return { speed, heading: WIND.baseHeading, x: Math.cos(WIND.baseHeading) * speed, z: Math.sin(WIND.baseHeading) * speed };
}

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createFlight() {
  const home = STRIPS[0];
  const state = {
    x: -home.length / 2 + 30,
    y: HOME_APRON_Y + 0.4,
    z: 0,
    heading: 0,
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    fuel: FLIGHT.fuelStart,
    damage: 0,
    airborne: false,
    verticalSpeed: 0,
    time: 0,
    stalled: false,
    crashed: false,
    landed: false,
  };

  function reset() {
    state.x = -home.length / 2 + 30;
    state.y = HOME_APRON_Y + 0.4;
    state.z = 0;
    state.heading = 0;
    state.pitch = 0;
    state.bank = 0;
    state.speed = 0;
    state.throttle = 0;
    state.fuel = FLIGHT.fuelStart;
    state.damage = 0;
    state.airborne = false;
    state.verticalSpeed = 0;
    state.time = 0;
    state.stalled = false;
    state.crashed = false;
    state.landed = false;
  }

  // input: { pitch: -1..1 (stick back = climb), roll: -1..1,
  // throttle: -1..1 (change per second), brake: bool }
  function step(dt, input) {
    let events = EVENT_NONE;
    if (state.crashed) return events;
    state.time += dt;

    // Throttle: fuel gone means the engine is out, whatever the lever says.
    if (state.fuel <= 0 && state.throttle > 0) {
      state.throttle = 0;
      events |= EVENT_FUEL_EMPTY;
    }
    state.throttle = clamp(state.throttle + input.throttle * dt, 0, 1);

    // Wind pushes the airframe sideways, always.
    const wind = windAt(state.time);
    const authority = clamp(state.speed / 40, 0, 1);

    // Bank follows the stick; the nose follows the bank.
    const targetBank = input.roll * FLIGHT.maxBank;
    state.bank += clamp(targetBank - state.bank, -FLIGHT.rollRate * dt, FLIGHT.rollRate * dt);
    const turnRate = (FLIGHT.gravity * Math.tan(state.bank)) / Math.max(state.speed, 20);
    state.heading = wrapAngle(state.heading + turnRate * dt);

    // Pitch follows the stick, with authority only when there is airflow.
    const targetPitch = input.pitch * FLIGHT.maxPitch;
    state.pitch += clamp(targetPitch - state.pitch, -FLIGHT.pitchRate * authority * dt, FLIGHT.pitchRate * authority * dt);

    // Speed: the engine pulls toward its throttle speed; climbing bleeds
    // speed, diving gains it, banking costs a little. Damage costs a lot.
    const wantSpeed = FLIGHT.minCruise + state.throttle * (FLIGHT.maxCruise - FLIGHT.minCruise);
    let speed = state.speed + (wantSpeed - state.speed) * FLIGHT.speedApproach * dt;
    speed -= Math.sin(state.pitch) * (state.pitch > 0 ? FLIGHT.climbBleed : FLIGHT.diveGain) * dt;
    speed -= Math.abs(state.bank) * FLIGHT.bankBleed * dt;
    speed -= (state.damage / 100) * 6 * dt;
    if (state.airborne === false && input.brake) speed = Math.max(0, speed - 22 * dt);
    state.speed = Math.max(0, speed);

    // Stall: below stall speed the wing quits — extra sink, nose drops.
    state.stalled = state.airborne && state.speed < FLIGHT.stallSpeed;
    if (state.stalled) {
      events |= EVENT_STALL;
      state.pitch += clamp(0 - state.pitch, -0.4 * dt, 0.4 * dt);
    }

    // Move: forward along heading and pitch, plus the wind drift.
    const forwardX = Math.cos(state.heading) * Math.cos(state.pitch);
    const forwardZ = Math.sin(state.heading) * Math.cos(state.pitch);
    const forwardY = Math.sin(state.pitch);
    let vx = forwardX * state.speed + wind.x;
    let vz = forwardZ * state.speed + wind.z;
    let vy = forwardY * state.speed;
    if (state.stalled) vy -= (FLIGHT.stallSpeed - state.speed) * FLIGHT.stallSink;
    if (!state.airborne) {
      vy = 0;
      vx = forwardX * state.speed;
      vz = forwardZ * state.speed;
    }
    state.verticalSpeed = vy;
    state.x += vx * dt;
    state.z += vz * dt;
    state.y += vy * dt;

    // Fuel: throttle burns it; gliding sips it.
    const burn = state.airborne
      ? FLIGHT.fuelBurnBase + state.throttle * FLIGHT.fuelBurnThrottle
      : FLIGHT.fuelBurnIdle;
    state.fuel = Math.max(0, state.fuel - burn * dt);

    // Takeoff: rotate once the wheels are fast enough and the pilot pulls.
    if (!state.airborne && state.speed >= FLIGHT.takeoffSpeed && input.pitch > 0.25) {
      state.airborne = true;
      state.y = terrainHeight(state.x, state.z) + 0.5;
      events |= EVENT_TAKEOFF;
    }

    // Ground contact.
    const ground = terrainHeight(state.x, state.z);
    if (state.airborne && state.y <= ground + 0.4) {
      const strip = stripAt(state.x, state.z);
      const sink = -state.verticalSpeed;
      const aligned = strip !== null && Math.abs(wrapAngle(state.heading - strip.strip.heading)) < 0.35;
      const gentle = sink < FLIGHT.hardTouchSink && Math.abs(state.bank) < FLIGHT.maxLandingBank && state.speed < FLIGHT.maxLandingSpeed;
      if (strip !== null && aligned && gentle) {
        state.airborne = false;
        state.landed = true;
        state.y = ground + 0.4;
        state.pitch = 0;
        state.bank = 0;
        events |= EVENT_TOUCHDOWN;
      } else if (strip !== null && aligned && sink < FLIGHT.crashSink && Math.abs(state.bank) < 0.5) {
        // A hard landing on a strip: the airframe takes it, the sortie goes on.
        state.airborne = false;
        state.landed = true;
        state.y = ground + 0.4;
        state.pitch = 0;
        state.bank = 0;
        state.damage = Math.min(FLIGHT.maxDamage, state.damage + 25);
        events |= EVENT_TOUCHDOWN | EVENT_HARD_LANDING;
      } else {
        state.crashed = true;
        state.y = ground + 0.4;
        events |= EVENT_CRASH;
      }
    }
    if (!state.airborne && state.y < ground + 0.4) state.y = ground + 0.4;
    return events;
  }

  reset();
  return { state, reset, step };
}

export { clamp, wrapAngle };
