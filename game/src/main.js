// Boot and the one loop: input is read every frame, the flight model
// and the mission advance in fixed 1/60 s steps, and the renderer
// paints what is there. The game moves between five screens: title,
// briefing, play, paused, and the sortie-end screen (complete or
// crash). ?shot=cover|drop|landing|complete (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import * as THREE from 'three';
import { STEP, BEST_KEY, GAME_TITLE, SORTIES, SORTIE_ORDER } from './config.js';
import { createRandom } from './random.js';
import { createFlight, EVENT_STALL, EVENT_TOUCHDOWN, EVENT_CRASH, EVENT_FUEL_EMPTY, EVENT_TAKEOFF, EVENT_HARD_LANDING, terrainHeight } from './flight.js';
import { createMission, MISSION_RING, MISSION_DROP, MISSION_LAND, MISSION_DONE, MISSION_PERFECT, MISSION_RELEASED } from './missions.js';
import { buildSea, buildTerrain, buildIslands, buildStrips, buildRings, buildSky, buildDropMarkers, paintRings } from './terrain.js';
import { buildPlane, posePlane } from './plane.js';
import { createView, CAMERA_CHASE, CAMERA_COCKPIT } from './render.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_CAMERA, ACTION_MUTE, ACTION_RESTART } from './input.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const BANNER_SECONDS = 2.6;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;
const random = createRandom(seed);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const view = createView(canvas);
const hud = createHud(document);
const audio = createAudio();
const flight = createFlight();
let mission = createMission('rings');
const planeRig = buildPlane(view.scene);
buildSea(view.scene);
buildTerrain(view.scene);
buildIslands(view.scene, random);
buildStrips(view.scene);
const rings = buildRings(view.scene);
buildDropMarkers(view.scene);
const sky = buildSky(view.scene, random);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

// Falling parcels: the mission owns the physics (position, velocity,
// spin); this only draws them. One mesh per parcel in flight, removed
// when the parcel lands — so what the pilot sees is exactly what the
// mission scores.
const parcelMeshes = new Map();
function syncParcelMeshes() {
  const live = mission.state.parcelsInFlight;
  for (const parcel of live) {
    let mesh = parcelMeshes.get(parcel);
    if (mesh === undefined) {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.9, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 1 }),
      );
      view.scene.add(mesh);
      parcelMeshes.set(parcel, mesh);
    }
    mesh.position.set(parcel.x, parcel.y, parcel.z);
    mesh.rotation.x = parcel.spin;
    mesh.rotation.z = parcel.spin * 0.7;
  }
  for (const [parcel, mesh] of parcelMeshes) {
    if (!live.includes(parcel)) {
      view.scene.remove(mesh);
      parcelMeshes.delete(parcel);
    }
  }
}
function clearParcelMeshes() {
  for (const mesh of parcelMeshes.values()) view.scene.remove(mesh);
  parcelMeshes.clear();
}

// Predicted impact marker: where a parcel released right now would
// land, drawn on the ground. Green on the circle, amber close, red
// far — the pilot reads the lead instead of guessing it.
const impactMarker = new THREE.Mesh(
  new THREE.RingGeometry(5, 7, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd23c, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
);
impactMarker.rotation.x = -Math.PI / 2;
impactMarker.visible = false;
view.scene.add(impactMarker);
function updateImpactMarker() {
  const obj = mission.currentObjective();
  const show = obj !== null && obj.kind === 'drop' && mission.state.parcelsLeft > 0 && flight.state.airborne;
  if (!show) {
    impactMarker.visible = false;
    return;
  }
  const impact = mission.predictImpactPoint(flight.state);
  const d = Math.hypot(impact.x - obj.x, impact.z - obj.z);
  impactMarker.position.set(impact.x, terrainHeight(impact.x, impact.z) + 0.7, impact.z);
  impactMarker.material.color.setHex(d <= obj.radius ? 0x2fae5f : d <= obj.radius * 2.5 ? 0xffd23c : 0xff3c2a);
  impactMarker.visible = true;
}

function showScreen(name) {
  for (const id of ['screen-title', 'screen-briefing', 'screen-paused', 'screen-end']) {
    const node = document.getElementById(id);
    if (node) node.classList.toggle('hidden', id !== `screen-${name}`);
  }
  document.getElementById('hud').classList.toggle('hidden', name === 'title');
}

function announce(message) {
  status.textContent = message;
}

function fillEndScreen(complete) {
  const m = mission.state;
  const title = document.getElementById('end-title');
  title.textContent = complete ? 'SORTIE COMPLETE' : 'CRASHED';
  title.className = complete ? 'good' : 'bad';
  document.getElementById('end-score').textContent = `SCORE ${m.score} — BEST ${readBest()}`;
  document.getElementById('end-detail').textContent =
    m.sortieId === 'rings'
      ? `Rings ${m.ringsPassed}/8 — ${m.ringsPerfect} perfect · Landings ${m.landings} · Time ${Math.floor(m.elapsed)}s · Fuel ${Math.round(flight.state.fuel)}% left`
      : m.sortieId === 'parcels'
        ? `Drops on target ${m.dropsScored}/3 · Parcels left ${m.parcelsLeft} · Landings ${m.landings} · Time ${Math.floor(m.elapsed)}s · Fuel ${Math.round(flight.state.fuel)}% left`
        : `Strips landed ${m.landings}/3 · Time ${Math.floor(m.elapsed)}s · Damage ${Math.round(flight.state.damage)}% · Fuel ${Math.round(flight.state.fuel)}% left`;
  document.getElementById('end-sortie').textContent = SORTIES[m.sortieId].name;
}

function runShot(name) {
  const sortieId = name === 'drop' ? 'parcels' : 'rings';
  mission = createMission(sortieId);
  clearParcelMeshes();
  const staged = stageShot(name, flight, mission, {});
  const shotCamera = staged.camera === 'cockpit' ? CAMERA_COCKPIT : CAMERA_CHASE;
  view.setCamera(shotCamera);
  let painted = 0;
  function paint() {
    // Warm the chase camera up so it sits behind the plane on the
    // very first painted frame, not halfway across the map.
    if (painted === 0) {
      for (let i = 0; i < 300; i += 1) view.update(flight.state, 1 / 60, flight.state.time);
    }
    posePlane(planeRig, flight.state, flight.state.time);
    view.update(flight.state, 1 / 60, flight.state.time);
    paintRings(rings.meshes, mission.state.current, mission.state.ringsPassed, flight.state.speed);
    syncParcelMeshes();
    updateImpactMarker();
    hud.update(flight.state, mission, shotCamera, bannerForShot(name, mission));
    if (staged.screen === 'complete') {
      const score = mission.state.score;
      if (score > readBest()) saveBest(score);
      fillEndScreen(true);
    }
    view.draw();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  showScreen(staged.screen === 'complete' ? 'end' : 'none');
  document.getElementById('hud').classList.remove('hidden');
  requestAnimationFrame(paint);
}

function bannerForShot(name, mission) {
  if (name === 'cover') return { text: 'PERFECT RING +100', kind: 'good' };
  if (name === 'drop') {
    // The drop shot is staged at the release moment — the banner must
    // say the parcel is away, not claim a scored drop.
    if (mission.state.parcelsInFlight.length > 0) return { text: 'PARCEL AWAY — WATCH IT LAND', kind: 'info' };
    return mission.state.dropsScored >= 1
      ? { text: 'DROP ON TARGET +132', kind: 'good' }
      : { text: 'DROP 1/3 — LINED UP ON THE MARKED CIRCLE', kind: 'info' };
  }
  if (name === 'landing') return { text: 'FINAL — HOME STRIP AHEAD', kind: 'info' };
  return null;
}

function runGame() {
  const input = createInput(canvas);
  let screen = 'title';
  let sortieId = 'rings';
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let banner = null;
  let bannerUntil = 0;
  let stallWarnedAt = -10;

  function setBanner(text, kind) {
    banner = { text, kind };
    bannerUntil = performance.now() / 1000 + BANNER_SECONDS;
  }

  function startSortie(id) {
    sortieId = id;
    flight.reset();
    mission = createMission(id);
    clearParcelMeshes();
    screen = 'play';
    showScreen('none');
    announce(`${SORTIES[id].name}. ${SORTIES[id].blurb}`);
    setBanner(SORTIES[id].name, 'info');
    audio.resume();
  }

  function endSortie(complete) {
    screen = 'end';
    const score = mission.state.score;
    if (complete && score > best) {
      best = score;
      saveBest(best);
    }
    fillEndScreen(complete);
    showScreen('end');
    announce(complete ? `Sortie complete. Score ${score}.` : `Crashed. Score ${score}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if ((actions & ACTION_MUTE) !== 0) {
      audio.toggleMute();
      setBanner(audio.muted ? 'SOUND OFF [M]' : 'SOUND ON [M]', 'info');
    }
    if (screen === 'title') {
      if ((actions & ACTION_CONFIRM) !== 0) {
        audio.resume();
        audio.click();
        screen = 'briefing';
        showScreen('briefing');
      }
      return;
    }
    if (screen === 'briefing') {
      if ((actions & ACTION_CONFIRM) !== 0) startSortie(sortieId);
      return;
    }
    if (screen === 'end') {
      if ((actions & ACTION_CONFIRM) !== 0 || (actions & ACTION_RESTART) !== 0) {
        screen = 'title';
        showScreen('title');
      }
      return;
    }
    if (screen === 'paused') {
      if ((actions & ACTION_PAUSE) !== 0 || (actions & ACTION_CONFIRM) !== 0) {
        screen = 'play';
        showScreen('none');
        announce('Flying.');
      }
      return;
    }
    // Playing.
    if ((actions & ACTION_PAUSE) !== 0) {
      screen = 'paused';
      showScreen('paused');
      announce('Paused.');
    } else if ((actions & ACTION_CAMERA) !== 0) {
      const mode = view.toggleCamera();
      setBanner(mode === CAMERA_COCKPIT ? 'COCKPIT VIEW [C]' : 'CHASE VIEW [C]', 'info');
    } else if ((actions & ACTION_RESTART) !== 0) {
      startSortie(sortieId);
    }
  }

  function step() {
    const stick = input.read();
    if (screen !== 'play') return;
    if (stick.drop) {
      const res = mission.dropParcel(flight.state);
      if ((res & MISSION_RELEASED) !== 0) {
        audio.drop();
        setBanner(mission.state.lastMessage, 'info');
      } else if (mission.state.parcelsLeft > 0 && mission.currentObjective() !== null && mission.currentObjective().kind === 'drop') {
        setBanner(mission.state.lastMessage || 'NOTHING TO DROP HERE', 'warn');
      }
    }
    const flightEvents = flight.step(STEP, stick);
    const missionEvents = mission.update(STEP, flight.state, flightEvents, EVENT_TOUCHDOWN);
    if ((flightEvents & EVENT_TAKEOFF) !== 0) {
      audio.takeoff();
      setBanner('AIRBORNE — GEAR UP, FLY THE PLAN', 'info');
    }
    if ((flightEvents & EVENT_STALL) !== 0 && flight.state.time - stallWarnedAt > 1.2) {
      stallWarnedAt = flight.state.time;
      audio.stall();
      setBanner('STALL — NOSE DOWN, ADD POWER', 'warn');
    }
    if ((flightEvents & EVENT_FUEL_EMPTY) !== 0) setBanner('FUEL EMPTY — GLIDE IT HOME', 'warn');
    if ((missionEvents & MISSION_RING) !== 0) {
      audio.ring((missionEvents & MISSION_PERFECT) !== 0);
      view.shake.add((missionEvents & MISSION_PERFECT) !== 0 ? 0.25 : 0.15);
      setBanner(mission.state.lastMessage, 'good');
    }
    if ((missionEvents & MISSION_DROP) !== 0) setBanner(mission.state.lastMessage, 'good');
    if ((missionEvents & MISSION_LAND) !== 0) {
      audio.touchdown((flightEvents & EVENT_HARD_LANDING) !== 0);
      view.shake.add((flightEvents & EVENT_HARD_LANDING) !== 0 ? 0.7 : 0.4);
      setBanner(mission.state.lastMessage, 'good');
    }
    if ((flightEvents & EVENT_CRASH) !== 0) {
      audio.crash();
      view.shake.add(1);
      setBanner('CRASHED', 'bad');
      endSortie(false);
      return;
    }
    if ((missionEvents & MISSION_DONE) !== 0) {
      setBanner(mission.state.lastMessage, 'good');
      endSortie(true);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const nowSeconds = now / 1000;
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === 'play') {
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen !== 'play') break;
      }
    } else {
      accumulator = 0;
    }
    // The world idles behind the menus: clouds drift, the plane sits.
    const dt = 1 / 60;
    for (const cloud of sky.clouds) {
      cloud.position.x += cloud.userData.drift * dt;
      if (cloud.position.x > 1300) cloud.position.x = -1300;
    }
    syncParcelMeshes();
    updateImpactMarker();
    posePlane(planeRig, flight.state, nowSeconds);
    view.update(flight.state, dt, nowSeconds);
    paintRings(rings.meshes, mission.state.current, mission.state.ringsPassed, flight.state.speed);
    const sock = view.scene.getObjectByName('windsock');
    if (sock !== null) sock.rotation.y = -flight.state.time * 0.1;
    audio.update(flight.state);
    const liveBanner = banner !== null && nowSeconds < bannerUntil ? banner : null;
    hud.update(flight.state, mission, view.mode, screen === 'play' ? liveBanner : null);
    view.draw();
  }

  // Mission select on the title screen.
  for (const id of SORTIE_ORDER) {
    const button = document.getElementById(`mission-${id}`);
    if (button !== null) {
      button.addEventListener('click', () => {
        sortieId = id;
        audio.resume();
        audio.click();
        for (const other of SORTIE_ORDER) {
          document.getElementById(`mission-${other}`).classList.toggle('selected', other === id);
        }
        document.getElementById('briefing-text').textContent = SORTIES[id].blurb;
        document.getElementById('briefing-title').textContent = SORTIES[id].name;
        screen = 'briefing';
        showScreen('briefing');
        announce(`${SORTIES[id].name} briefing.`);
      });
    }
  }
  document.getElementById('briefing-text').textContent = SORTIES[sortieId].blurb;
  document.getElementById('briefing-title').textContent = SORTIES[sortieId].name;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      showScreen('paused');
      announce('Paused.');
    }
  });

  document.getElementById('best-line').textContent = `BEST SCORE ${best}`;
  showScreen('title');
  announce(`${GAME_TITLE}. Choose a sortie, then fly.`);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
