// The courier aircraft: a small high-wing prop plane in sunset orange
// and cream, built from primitives so it reads as a built machine, not
// a drawing — fuselage, wings, tail, spinning prop, canopy, fixed gear
// and blinking nav lights. One job: build it and pose it from the
// flight state each frame.
import * as THREE from 'three';

const CREAM = 0xf2e3c6;
const ORANGE = 0xe8702a;
const ORANGE_DARK = 0xb4552d;
const GLASS = 0x1d3a4a;
const METAL = 0x3a3f45;

export function buildPlane(scene) {
  const plane = new THREE.Group();
  plane.name = 'courier-plane';

  const cream = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.5, metalness: 0.15 });
  const orange = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.5, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: ORANGE_DARK, roughness: 0.6, metalness: 0.1 });
  const glass = new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.15, metalness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.4, metalness: 0.7 });

  // Fuselage: nose forward (+x). Cylinder along x plus a rounded nose.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 5.2, 12), cream);
  fuselage.rotation.z = Math.PI / 2;
  plane.add(fuselage);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), orange);
  nose.position.set(2.6, 0, 0);
  nose.scale.set(1.1, 1, 1);
  plane.add(nose);
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 10), cream);
  tailCone.rotation.z = -Math.PI / 2;
  tailCone.position.set(-3.6, 0.15, 0);
  plane.add(tailCone);

  // Belly stripe — the courier livery.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 1.75), orange);
  stripe.position.set(0.1, -0.35, 0);
  plane.add(stripe);

  // High wing: one long slab with orange tips, slight dihedral.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 11.5), cream);
  wing.position.set(0.3, 0.85, 0);
  wing.rotation.x = 0.06;
  plane.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 0.9), orange);
    tip.position.set(0.3, 0.85 + side * 0.32, side * 5.35);
    tip.rotation.x = side * 0.06;
    plane.add(tip);
  }

  // Tail: horizontal stabiliser + vertical fin.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 3.6), cream);
  stab.position.set(-4.4, 0.25, 0);
  plane.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.9, 0.16), orange);
  fin.position.set(-4.5, 1.0, 0);
  fin.rotation.z = 0.25;
  plane.add(fin);

  // Canopy: dark glass bubble the pilot sits under.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), glass);
  canopy.position.set(1.15, 0.72, 0);
  canopy.scale.set(1.5, 0.75, 1);
  plane.add(canopy);

  // Propeller at the nose: hub, two blades, and a translucent blur disc.
  const prop = new THREE.Group();
  prop.position.set(3.45, 0, 0);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8), metal);
  hub.rotation.z = Math.PI / 2;
  prop.add(hub);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.34), bladeMat);
    blade.rotation.x = angle;
    blade.position.x = 0.15;
    prop.add(blade);
  }
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(1.75, 24),
    new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.0, side: THREE.DoubleSide }),
  );
  blur.rotation.y = Math.PI / 2;
  blur.position.x = 0.18;
  prop.add(blur);
  plane.add(prop);

  // Fixed gear: two main wheels + tail wheel.
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), metal);
    leg.position.set(0.9, -0.9, side * 0.9);
    leg.rotation.x = side * 0.25;
    plane.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 }));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0.9, -1.4, side * 1.05);
    plane.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 }));
  tailWheel.rotation.x = Math.PI / 2;
  tailWheel.position.set(-4.2, -0.75, 0);
  plane.add(tailWheel);

  // Nav lights: red left, green right, white tail. Blinking in posePlane.
  const navLights = {};
  const lightGeo = new THREE.SphereGeometry(0.14, 8, 6);
  navLights.left = new THREE.Mesh(lightGeo, new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 2 }));
  navLights.left.position.set(0.3, 0.85, -5.75);
  plane.add(navLights.left);
  navLights.right = new THREE.Mesh(lightGeo, new THREE.MeshStandardMaterial({ color: 0x22ff66, emissive: 0x00cc44, emissiveIntensity: 2 }));
  navLights.right.position.set(0.3, 0.85, 5.75);
  plane.add(navLights.right);
  navLights.tail = new THREE.Mesh(lightGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 }));
  navLights.tail.position.set(-4.7, 0.3, 0);
  plane.add(navLights.tail);

  // Mail sacks under the wing — the courier's cargo, visible in flight.
  const sackMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 1 });
  for (const side of [-1, 1]) {
    const sack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.0), sackMat);
    sack.position.set(0.3, -0.15, side * 2.6);
    plane.add(sack);
  }

  scene.add(plane);
  return { group: plane, prop, blur, navLights };
}

// Pose the plane from the flight state. The model faces +x; heading 0
// is +x east, so rotation.y = -heading turns it onto its course, and
// rotation.z carries the bank (roll about the forward axis).
export function posePlane(rig, flight, time) {
  const { group, prop, blur, navLights } = rig;
  group.position.set(flight.x, flight.y, flight.z);
  group.rotation.set(0, -flight.heading, 0);
  group.rotateX(flight.bank);
  group.rotateZ(flight.pitch);
  // Prop spins with the throttle; the blur disc fades in as it spins up.
  prop.rotation.x += (2 + flight.throttle * 38) * (1 / 60);
  blur.material.opacity = flight.throttle * 0.22;
  // Nav lights blink once a second; the tail strobe double-blinks.
  const phase = time % 1;
  const on = phase < 0.12 || (phase > 0.25 && phase < 0.37);
  navLights.tail.material.emissiveIntensity = on ? 3 : 0.2;
  navLights.left.material.emissiveIntensity = 2;
  navLights.right.material.emissiveIntensity = 2;
  // A gentle idle bob on the ground, gone once airborne.
  if (!flight.airborne) group.position.y = flight.y + Math.sin(time * 2.2) * 0.03;
}
