// Screenshot staging: each ?shot= scene plays the real rules forward
// from a fresh world with a fixed seed, steered by a simple autopilot
// (heading PD toward the next objective, altitude PD, throttle toward
// the objective's target speed), so the frame is what a real flight
// looks like and the same seed always gives the same frame.
// One job: drive the autopilot until the shot's moment, then stop.
import { STEP, RINGS, DROP_MAX_ALT, STRIPS, HOME_APRON_Y } from './config.js';
import { EVENT_TOUCHDOWN, EVENT_CRASH, terrainHeight, windAt } from './flight.js';
import { MISSION_DONE } from './missions.js';

const MAX_SECONDS = 420;

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Steer at a point: heading error -> bank, altitude error -> pitch,
// speed error -> throttle rate. A big heading error means a hard turn
// coming, so the pilot slows for it first — a fast aircraft cannot
// turn tight enough to thread a 14 m ring 300 m ahead.
function steerTo(flight, targetX, targetZ, targetAlt, targetSpeed, maxBank) {
  const dx = targetX - flight.x;
  const dz = targetZ - flight.z;
  const wantHeading = Math.atan2(dz, dx);
  const headingErr = wrapAngle(wantHeading - flight.heading);
  const roll = clamp(headingErr * 1.6, -maxBank, maxBank);
  const pitch = clamp((targetAlt - flight.y) * 0.03, -0.9, 0.9);
  const speedTarget = Math.abs(headingErr) > 0.6 ? Math.min(targetSpeed, 34) : targetSpeed;
  const throttle = clamp((speedTarget - flight.speed) * 0.12, -1, 1);
  return { pitch, roll, throttle, brake: false, drop: false };
}

// The autopilot: heading error -> bank, altitude error -> pitch,
// speed error -> throttle rate. Returns the stick input for one step.
export function autopilot(flight, mission, hooks) {
  const obj = mission.currentObjective();
  if (!flight.airborne) {
    // Takeoff roll: full throttle, rotate past 30 m/s.
    return { pitch: flight.speed > 30 ? 0.7 : 0, roll: 0, throttle: 1, brake: false, drop: false };
  }

  if (obj !== null && obj.kind === 'ring') {
    const ring = RINGS[obj.index];
    const ringDist = Math.hypot(ring.x - flight.x, ring.z - flight.z);
    // Cruise fast between rings, slow to the band centre on approach —
    // the speed band is the test, so arrive in it, not through it.
    // Start slowing 600 m out: at 52 m/s the turn circle is wider
    // than the gap between rings, so a late slowdown overshoots.
    const targetSpeed = ringDist > 600 ? 52 : (ring.band[0] + ring.band[1]) / 2;
    return steerTo(flight, ring.x, ring.z, ring.y, targetSpeed, 0.95);
  }
  if (obj !== null && obj.kind === 'drop') {
    const dropDist = Math.hypot(obj.x - flight.x, obj.z - flight.z);
    const targetSpeed = dropDist > 350 ? 48 : 32;
    const input = steerTo(flight, obj.x, obj.z, terrainHeight(obj.x, obj.z) + 55, targetSpeed, 0.8);
    // Release when the parcel would actually land on the circle: the
    // parcel keeps the aircraft's speed and drifts with the wind, so
    // the release point is well before the target, not over it. The
    // prediction is the same physics the mission scores with.
    // One parcel at a time: drop is a level signal, not an edge, so
    // without this the autopilot would dump every parcel in a second.
    if (flight.y <= DROP_MAX_ALT && mission.predictImpactPoint && mission.state.parcelsInFlight.length === 0) {
      const impact = mission.predictImpactPoint(flight);
      const impactDist = Math.hypot(impact.x - obj.x, impact.z - obj.z);
      if (impactDist <= obj.radius) input.drop = true;
    }
    return input;
  }
  if (obj !== null && obj.kind === 'land') {
    const strip = STRIPS.find((s) => s.id === obj.stripId);
    return patternInput(flight, mission, strip);
  }
  // No objective left: fly home and land. Far out, transit toward the
  // pattern; once the pattern has started for this objective, never
  // go back to the transit target — flipping between two targets is
  // what made the aircraft circle the field forever.
  const home = STRIPS[0];
  const distHome = Math.hypot(home.x - flight.x, home.z - flight.z);
  if (distHome > 700 && mission.state.patternFor !== mission.state.current) {
    return steerTo(flight, home.x - 500, home.z, 80, 52, 0.8);
  }
  return patternInput(flight, mission, home);
}

// The traffic pattern: a left-hand rectangle that lines the aircraft
// up on final from far away, instead of cutting the corner over the
// island. Three fixed waypoints, each captured from 150 m out —
// captured early, so the bearing never flips into an orbit — then the
// final approach. The phase lives on the mission so the pattern
// restarts cleanly for the next landing objective.
function patternInput(flight, mission, strip) {
  const m = mission.state;
  if (m.patternFor !== m.current) {
    m.patternFor = m.current;
    m.patternPhase = 0;
  }
  const hx = Math.cos(strip.heading);
  const hz = Math.sin(strip.heading);
  // Left of the runway heading (toward -z when heading east).
  const lx = hz;
  const lz = -hx;
  const tx = strip.x - hx * (strip.length / 2);
  const tz = strip.z - hz * (strip.length / 2);
  const stripY = strip.stripY;
  const waypoints = [
    { x: tx + lx * 380 - hx * 100, z: tz + lz * 380 - hz * 100, alt: stripY + 65 },
    { x: tx + lx * 380 - hx * 750, z: tz + lz * 380 - hz * 750, alt: stripY + 55 },
    { x: tx - hx * 900, z: tz - hz * 900, alt: stripY + 55 },
  ];
  let phase = m.patternPhase;
  while (phase < waypoints.length) {
    const wp = waypoints[phase];
    if (Math.hypot(wp.x - flight.x, wp.z - flight.z) >= 150) {
      m.patternPhase = phase;
      return steerTo(flight, wp.x, wp.z, wp.alt, 40, 0.95);
    }
    phase += 1;
  }
  m.patternPhase = phase;
  return landingInput(flight, strip);
}

// Final approach. The traffic pattern has already lined the aircraft
// up on the centreline, so this flies the runway heading — never a
// point, which is what made it orbit the fix forever. The heading
// carries two corrections: a crab into the crosswind (without it the
// wind holds the aircraft metres off the strip all the way down) and
// a crab back toward the centreline.
function landingInput(flight, strip) {
  const hx = Math.cos(strip.heading);
  const hz = Math.sin(strip.heading);
  const tx = strip.x - hx * (strip.length / 2);
  const tz = strip.z - hz * (strip.length / 2);
  const relX = flight.x - tx;
  const relZ = flight.z - tz;
  const along = relX * hx + relZ * hz; // < 0 before the threshold
  const across = -relX * hz + relZ * hx;
  const dist = Math.max(0, -along); // metres to go before the threshold
  const wind = windAt(flight.time);
  const crossWind = wind.x * -hz + wind.z * hx; // wind across the runway
  const windCrab = Math.asin(Math.max(-0.5, Math.min(0.5, -crossWind / Math.max(flight.speed, 15))));
  // The centreline crab has to be strong far out: the pattern hands
  // the aircraft over as much as 160 m off the centreline after the
  // turn onto final, and the weak 0.008 gain only closed ~6 m/s — the
  // aircraft reached the threshold still 40 m off and met the ground
  // beside the strip. Far out it may crab up to 0.45 rad (≈13 m/s of
  // closure); close in it tapers so the touchdown is straight.
  const crabMax = dist > 250 ? 0.45 : 0.25;
  const wantHeading = strip.heading + windCrab + clamp(-across * 0.012, -crabMax, crabMax);
  const headingErr = wrapAngle(wantHeading - flight.heading);
  const roll = clamp(headingErr * 1.5, dist > 150 ? -0.6 : -0.3, dist > 150 ? 0.6 : 0.3);
  // Glidepath is measured from the strip's own elevation, not the
  // ground below the aircraft — the strip sits 8 m up and the sea
  // below the approach is at 0, so a sea-referenced path would fly
  // the plane into the water short of the threshold.
  const stripY = strip.stripY;
  const wantAlt = stripY + Math.max(1.5, dist * 0.07);
  const pitch = dist < 80 ? -0.12 : clamp((wantAlt - flight.y) * 0.03, -0.9, 0.9);
  const throttle = clamp((29 - flight.speed) * 0.15, -1, 1);
  return { pitch, roll, throttle, brake: false, drop: false };
}

function drive(flight, mission, seconds, stopWhen, hooks) {
  const steps = Math.round(seconds / STEP);
  let flightEvents = 0;
  let missionEvents = 0;
  for (let i = 0; i < steps; i += 1) {
    const input = autopilot(flight.state, mission, hooks);
    flightEvents = flight.step(STEP, input);
    if (input.drop) {
      const dropped = mission.dropParcel(flight.state);
      missionEvents |= dropped;
      if (dropped !== 0 && hooks.onDrop) hooks.onDrop(flight.state.x, flight.state.y, flight.state.z);
    }
    missionEvents |= mission.update(STEP, flight.state, flightEvents, EVENT_TOUCHDOWN);
    if (flight.state.crashed) break;
    if (stopWhen !== null && stopWhen(flight.state, mission.state)) break;
  }
  return { flightEvents, missionEvents };
}

export function stageShot(name, flight, mission, hooks) {
  flight.reset();
  mission.reset();
  if (name === 'cover') {
    drive(flight, mission, MAX_SECONDS, (f, m) => m.ringsPassed >= 3, hooks);
    drive(flight, mission, 0.4, null, hooks);
    return { screen: 'play', note: 'ring 3, just passed' };
  }
  if (name === 'drop') {
    // Stop at the release moment, wings level, marker ahead: the
    // predicted impact is on the circle, so the frame shows the green
    // marker on the target, the island, and a level aircraft — the
    // parcel is already away and falling. Stopping earlier showed a
    // red marker far short of the circle and an empty approach.
    drive(flight, mission, MAX_SECONDS, (f, m) => {
      if (!f.airborne || m.current >= m.objectives.length) return false;
      const obj = m.objectives[m.current];
      if (obj.kind !== 'drop') return false;
      if (Math.abs(f.bank) > 0.12) return false;
      const bearing = Math.atan2(obj.z - f.z, obj.x - f.x);
      if (Math.abs(wrapAngle(bearing - f.heading)) > 0.3) return false;
      const impact = mission.predictImpactPoint(f);
      return Math.hypot(impact.x - obj.x, impact.z - obj.z) <= obj.radius;
    }, hooks);
    // One breath more: the autopilot releases on the next step, so the
    // frame catches the parcel just away and falling, not the instant
    // before the release.
    drive(flight, mission, 0.1, null, hooks);
    return { screen: 'play', note: 'parcel away, marker on the circle' };
  }
  if (name === 'landing') {
    // Short final AFTER all eight rings, not the takeoff roll: the
    // old condition (near the threshold and low) also fired two
    // seconds after takeoff, while the aircraft was climbing out —
    // the frame looked like a landing but the HUD said RING 1/8.
    // Lined up, not turning: the first version stopped mid-turn onto
    // final, heading 023, with the last green ring dead ahead and
    // the runway off to one side. Close in, on the runway heading,
    // the strip fills the view and the rings are behind the aircraft.
    drive(flight, mission, MAX_SECONDS, (f, m) => {
      if (!f.airborne || m.ringsPassed < 8) return false;
      const d = Math.hypot(f.x - (STRIPS[0].x - STRIPS[0].length / 2), f.z - STRIPS[0].z);
      if (d > 130 || f.y > HOME_APRON_Y + 40) return false;
      return Math.abs(wrapAngle(STRIPS[0].heading - f.heading)) < 0.15;
    }, hooks);
    return { screen: 'play', note: 'final approach, home strip ahead', camera: 'cockpit' };
  }
  // 'complete': fly the whole rings sortie and land home.
  drive(flight, mission, MAX_SECONDS, (f, m) => (m.done || f.crashed), hooks);
  if (!mission.state.done && !flight.state.crashed) {
    drive(flight, mission, 60, (f, m) => (m.done || f.crashed), hooks);
  }
  return { screen: mission.state.done ? 'complete' : 'play', note: 'sortie complete' };
}
