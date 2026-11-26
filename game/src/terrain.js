// The archipelago: sea, islands, strips, rings, clouds and the sunset
// sky, all built from the same numbers config.js and flight.js use, so
// what the pilot sees is exactly what the flight model flies over.
// One job: turn numbers into meshes. No game rules here.
import * as THREE from 'three';
import { ISLANDS, STRIPS, RINGS, WORLD, HOME_APRON_Y } from './config.js';
import { terrainHeight } from './flight.js';

const SAND = 0xd9b380;
const GRASS = 0x5e8a4a;
const GRASS_DARK = 0x4a7038;
const ROCK = 0x8a6a52;
const SEA = 0x1f6f8b;
const SEA_DEEP = 0x175a73;
const RUNWAY = 0x2e2a28;
const RUNWAY_LINE = 0xf2e8d5;

function islandColor(height, maxHeight) {
  const t = height / maxHeight;
  if (t < 0.08) return new THREE.Color(SAND);
  if (t < 0.55) return new THREE.Color(GRASS).lerp(new THREE.Color(GRASS_DARK), t);
  return new THREE.Color(GRASS_DARK).lerp(new THREE.Color(ROCK), (t - 0.55) / 0.45);
}

export function buildSea(scene) {
  const geo = new THREE.PlaneGeometry(WORLD.size * 3, WORLD.size * 3, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: SEA, roughness: 0.55, metalness: 0.05 });
  const sea = new THREE.Mesh(geo, mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  sea.name = 'sea';
  scene.add(sea);
  const deep = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size * 3, WORLD.size * 3, 1, 1),
    new THREE.MeshBasicMaterial({ color: SEA_DEEP }),
  );
  deep.rotation.x = -Math.PI / 2;
  deep.position.y = -0.6;
  scene.add(deep);
  return sea;
}

export function buildTerrain(scene) {
  const segments = 150;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    color.copy(islandColor(h, 44));
    // Beaches stay sandy right at the waterline.
    if (h < 2.5 && h > 0.1) color.setHex(SAND);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
  const terrain = new THREE.Mesh(geo, mat);
  terrain.name = 'terrain';
  scene.add(terrain);
  return terrain;
}

function buildPalm(random) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.55, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 }),
  );
  trunk.position.y = 3.5;
  trunk.rotation.z = 0.12;
  group.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a34, roughness: 1, flatShading: true });
  for (let i = 0; i < 5; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 4), leafMat);
    const a = (i / 5) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.6, 7.2, Math.sin(a) * 1.6);
    leaf.rotation.z = Math.cos(a) * 1.1;
    leaf.rotation.x = -Math.sin(a) * 1.1;
    group.add(leaf);
  }
  group.rotation.y = random() * Math.PI * 2;
  return group;
}

function buildHut(random) {
  const group = new THREE.Group();
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(5, 3, 4),
    new THREE.MeshStandardMaterial({ color: 0xe8d9b0, roughness: 1 }),
  );
  walls.position.y = 1.5;
  group.add(walls);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(4.2, 2.4, 4),
    new THREE.MeshStandardMaterial({ color: 0xb4552d, roughness: 1, flatShading: true }),
  );
  roof.position.y = 4.2;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  group.rotation.y = random() * Math.PI * 2;
  return group;
}

export function buildIslands(scene, random) {
  const group = new THREE.Group();
  group.name = 'islands';
  for (const island of ISLANDS) {
    for (let i = 0; i < island.palms; i += 1) {
      const a = random() * Math.PI * 2;
      const r = island.radius * (0.25 + random() * 0.55);
      const x = island.x + Math.cos(a) * r;
      const z = island.z + Math.sin(a) * r;
      const palm = buildPalm(random);
      palm.position.set(x, Math.max(0.5, terrainHeight(x, z)), z);
      const s = 0.8 + random() * 0.5;
      palm.scale.setScalar(s);
      group.add(palm);
    }
    for (let i = 0; i < island.huts; i += 1) {
      const a = random() * Math.PI * 2;
      const r = island.radius * (0.2 + random() * 0.4);
      const x = island.x + Math.cos(a) * r;
      const z = island.z + Math.sin(a) * r;
      const hut = buildHut(random);
      hut.position.set(x, Math.max(0.5, terrainHeight(x, z)), z);
      group.add(hut);
    }
  }
  scene.add(group);
  return group;
}

export function buildStrips(scene) {
  const group = new THREE.Group();
  group.name = 'strips';
  for (const strip of STRIPS) {
    const isHome = strip.id === 'home';
    const y = isHome ? HOME_APRON_Y + 0.15 : terrainHeight(strip.x, strip.z) + 0.15;
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(strip.length, 0.3, strip.width),
      new THREE.MeshStandardMaterial({ color: isHome ? RUNWAY : 0x6a8a4a, roughness: 1 }),
    );
    pad.position.set(strip.x, y, strip.z);
    pad.rotation.y = -strip.heading;
    group.add(pad);
    // Centreline dashes.
    const dashGeo = new THREE.BoxGeometry(12, 0.1, 1.2);
    const dashMat = new THREE.MeshBasicMaterial({ color: RUNWAY_LINE });
    const count = Math.floor(strip.length / 30);
    for (let i = 0; i < count; i += 1) {
      const along = -strip.length / 2 + 20 + i * 30;
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.position.set(
        strip.x + Math.cos(strip.heading) * along,
        y + 0.25,
        strip.z + Math.sin(strip.heading) * along,
      );
      dash.rotation.y = -strip.heading;
      group.add(dash);
    }
    // Threshold bars at both ends.
    for (const end of [-1, 1]) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.1, strip.width * 0.8),
        new THREE.MeshBasicMaterial({ color: RUNWAY_LINE }),
      );
      bar.position.set(
        strip.x + Math.cos(strip.heading) * end * (strip.length / 2 - 6),
        y + 0.25,
        strip.z + Math.sin(strip.heading) * end * (strip.length / 2 - 6),
      );
      bar.rotation.y = -strip.heading;
      group.add(bar);
    }
  }
  // Hangar + windsock beside the home strip.
  const hangar = new THREE.Mesh(
    new THREE.BoxGeometry(18, 8, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8702a, roughness: 0.8 }),
  );
  hangar.position.set(-40, HOME_APRON_Y + 4, -55);
  group.add(hangar);
  const hangarRoof = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, 18, 12, 1, false, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xf2e3c6, roughness: 0.8 }),
  );
  hangarRoof.rotation.z = Math.PI / 2;
  hangarRoof.rotation.y = Math.PI / 2;
  hangarRoof.position.set(-40, HOME_APRON_Y + 8, -55);
  group.add(hangarRoof);
  const sockPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 9, 6),
    new THREE.MeshStandardMaterial({ color: 0xf2e8d5 }),
  );
  sockPole.position.set(60, HOME_APRON_Y + 4.5, 40);
  group.add(sockPole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 4.5, 8),
    new THREE.MeshStandardMaterial({ color: 0xff5a3c, emissive: 0x881100, roughness: 0.7 }),
  );
  sock.rotation.z = -Math.PI / 2;
  sock.position.set(62.2, HOME_APRON_Y + 8.6, 40);
  sock.name = 'windsock';
  group.add(sock);
  scene.add(group);
  return group;
}

export function buildRings(scene) {
  const group = new THREE.Group();
  group.name = 'rings';
  const meshes = [];
  for (let i = 0; i < RINGS.length; i += 1) {
    const ring = RINGS[i];
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(14, 1.1, 10, 40),
      new THREE.MeshStandardMaterial({
        color: 0xff8c2a, emissive: 0xcc5500, emissiveIntensity: 0.9, roughness: 0.4,
      }),
    );
    mesh.position.set(ring.x, ring.y, ring.z);
    mesh.userData.index = i;
    group.add(mesh);
    meshes.push(mesh);
  }
  scene.add(group);
  return { group, meshes };
}

// Mark a ring passed (green) or next (coloured by the pilot's speed
// against that ring's band, so the speed test reads at a glance);
// the rest stay dim. Passed: green. Next: green in the band, orange
// too slow, red too fast. The score is unchanged — the colour is the
// feedback, not the rule.
export function paintRings(meshes, nextIndex, passedCount, speed) {
  for (let i = 0; i < meshes.length; i += 1) {
    const mat = meshes[i].material;
    if (i < passedCount) {
      mat.color.setHex(0x2fae5f);
      mat.emissive.setHex(0x0a6626);
    } else if (i === nextIndex) {
      const band = RINGS[i].band;
      if (speed >= band[0] && speed <= band[1]) {
        mat.color.setHex(0x2fae5f);
        mat.emissive.setHex(0x0a6626);
      } else if (speed < band[0]) {
        mat.color.setHex(0xff8c2a);
        mat.emissive.setHex(0xcc5500);
      } else {
        mat.color.setHex(0xff3c2a);
        mat.emissive.setHex(0x881100);
      }
    } else {
      mat.color.setHex(0x8a6a52);
      mat.emissive.setHex(0x332211);
    }
  }
}

export function buildSky(scene, random) {
  const group = new THREE.Group();
  group.name = 'sky';
  // Low sun disc on the horizon, due west.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(90, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }),
  );
  sun.position.set(WORLD.sunPosition[0], WORLD.sunPosition[1], WORLD.sunPosition[2]);
  sun.lookAt(0, 60, 0);
  group.add(sun);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(150, 32),
    new THREE.MeshBasicMaterial({ color: 0xff9a5c, transparent: true, opacity: 0.28, fog: false }),
  );
  glow.position.copy(sun.position).multiplyScalar(1.001);
  glow.lookAt(0, 60, 0);
  group.add(glow);
  // Clouds: flattened puffs in sunset pink and white, drifting slowly.
  const clouds = [];
  const cloudMats = [
    new THREE.MeshBasicMaterial({ color: 0xffe3c2, transparent: true, opacity: 0.85 }),
    new THREE.MeshBasicMaterial({ color: 0xf7b8c4, transparent: true, opacity: 0.8 }),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }),
  ];
  for (let i = 0; i < 16; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(random() * 3);
    for (let p = 0; p < puffs; p += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(18 + random() * 22, 10, 8), cloudMats[i % 3]);
      s.position.set((random() - 0.5) * 70, (random() - 0.5) * 8, (random() - 0.5) * 24);
      s.scale.y = 0.45;
      cloud.add(s);
    }
    cloud.position.set((random() - 0.5) * 2200, 150 + random() * 140, (random() - 0.5) * 2200);
    cloud.userData.drift = 1.5 + random() * 2.5;
    group.add(cloud);
    clouds.push(cloud);
  }
  scene.add(group);
  return { group, clouds };
}

export function buildDropMarkers(scene) {
  const group = new THREE.Group();
  group.name = 'drop-markers';
  const markers = [];
  for (const target of [{ x: 550, z: 650 }, { x: -750, z: 550 }, { x: 150, z: -950 }]) {
    const y = terrainHeight(target.x, target.z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(14, 18, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(target.x, y + 0.6, target.z);
    group.add(ring);
    // A thin smoke column so the target reads from the air.
    const smoke = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 2.2, 60, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    smoke.position.set(target.x, y + 30, target.z);
    group.add(smoke);
    markers.push(ring);
  }
  scene.add(group);
  return markers;
}
