// The renderer: WebGL scene, chase and cockpit cameras, sunset light,
// trauma shake and the speed feel. One job: turn the world state into
// a picture each frame. It never decides rules.
import * as THREE from 'three';
import { WORLD } from './config.js';

export const CAMERA_CHASE = 0;
export const CAMERA_COCKPIT = 1;

// Trauma shake (game-feel): shake = trauma^2, decaying in real time,
// written only to the camera offset — never to the flight model.
export function createShake() {
  let trauma = 0;
  let t = 0;
  return {
    add(amount) {
      trauma = Math.min(1, trauma + amount);
    },
    decay(dt) {
      trauma = Math.max(0, trauma - dt * 1.4);
      t += dt * 31;
    },
    offset() {
      const s = trauma * trauma;
      return {
        x: 0.9 * s * Math.sin(t * 1.7),
        y: 0.7 * s * Math.sin(t * 2.3),
        roll: 0.06 * s * Math.sin(t * 1.1),
      };
    },
    get trauma() {
      return trauma;
    },
  };
}

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7a55c);
  scene.fog = new THREE.Fog(0xf2a35e, WORLD.fogNear, WORLD.fogFar);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 6000);
  camera.position.set(-30, 20, 20);

  // Warm low sun + soft sky fill, so the orange livery glows.
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
  sun.position.set(WORLD.sunPosition[0], WORLD.sunPosition[1], WORLD.sunPosition[2]);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffc890, 0x2a4a5a, 0.9));

  const shake = createShake();
  let mode = CAMERA_CHASE;

  // Smooth chase state: the camera never snaps, never fights the pilot.
  const chase = { pos: new THREE.Vector3(-30, 20, 20), look: new THREE.Vector3(0, 10, 0) };

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Chase: behind and above the plane, banking part-way with it, with a
  // little FOV kick as speed builds. Cockpit: at the nose, over the
  // panel, the prop ahead and the world unobstructed.
  function update(flight, dt, time) {
    shake.decay(dt);
    const sh = shake.offset();
    const speed01 = Math.min(1, Math.max(0, flight.speed / 72));
    if (mode === CAMERA_COCKPIT) {
      camera.fov = 68 + speed01 * 6;
      camera.updateProjectionMatrix();
      const fx = Math.cos(flight.heading);
      const fz = Math.sin(flight.heading);
      // Ahead of the prop and above the nose line: inside the fuselage
      // the camera would see nothing but orange plastic and a prop
      // blade sweeping the frame. Here it is the pilot's forward
      // view — runway, rings, horizon — with the nose at the bottom.
      camera.position.set(
        flight.x + fx * 4.2 + sh.x,
        flight.y + 1.5 + sh.y,
        flight.z + fz * 4.2,
      );
      camera.up.set(0, 1, 0);
      camera.lookAt(
        flight.x + fx * 60,
        flight.y + Math.sin(flight.pitch) * 60,
        flight.z + fz * 60,
      );
      camera.rotateZ(-flight.bank * 0.85 + sh.roll);
      return;
    }
    camera.fov = 62 + speed01 * 10;
    camera.updateProjectionMatrix();
    const fx = Math.cos(flight.heading);
    const fz = Math.sin(flight.heading);
    const behind = 15 + speed01 * 4;
    const above = 5.2 + speed01 * 1.2;
    const wantX = flight.x - fx * behind;
    const wantY = flight.y + above;
    const wantZ = flight.z - fz * behind;
    const k = 1 - Math.exp(-dt * 5.5);
    chase.pos.x += (wantX - chase.pos.x) * k;
    chase.pos.y += (wantY - chase.pos.y) * k;
    chase.pos.z += (wantZ - chase.pos.z) * k;
    const lookX = flight.x + fx * 26;
    const lookY = flight.y + Math.sin(flight.pitch) * 26;
    const lookZ = flight.z + fz * 26;
    chase.look.x += (lookX - chase.look.x) * (1 - Math.exp(-dt * 8));
    chase.look.y += (lookY - chase.look.y) * (1 - Math.exp(-dt * 8));
    chase.look.z += (lookZ - chase.look.z) * (1 - Math.exp(-dt * 8));
    camera.position.set(chase.pos.x + sh.x, chase.pos.y + sh.y, chase.pos.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(chase.look);
    camera.rotateZ(-flight.bank * 0.45 + sh.roll);
  }

  function draw() {
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    shake,
    draw,
    resize,
    get mode() {
      return mode;
    },
    toggleCamera() {
      mode = mode === CAMERA_CHASE ? CAMERA_COCKPIT : CAMERA_CHASE;
      return mode;
    },
    setCamera(next) {
      mode = next;
    },
    update,
  };
}
