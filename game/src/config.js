// SENJA SKY COURIER — tuning, world layout and sortie definitions.
// One job: every number the flight model, the missions and the scenery
// share lives here, so a balance change touches one file only.
// Units: metres, metres per second, radians. 1 knot = 0.51444 m/s.
export const GAME_TITLE = 'SENJA SKY COURIER';
export const GAME_TAGLINE = 'Pos udara kepulauan senja — antar, lewati, mendarat.';

// --- Flight tuning -------------------------------------------------------
export const FLIGHT = {
  stallSpeed: 24, // m/s — below this the wing quits and the nose drops
  takeoffSpeed: 28, // m/s — rotate speed on the runway
  minCruise: 14, // m/s at throttle 0 (glide)
  maxCruise: 72, // m/s at throttle 1 (~140 kt)
  speedApproach: 0.22, // how fast speed chases the throttle target
  pitchRate: 0.55, // rad/s at full stick and full authority
  rollRate: 1.7, // rad/s toward the commanded bank
  maxBank: 0.95, // rad (~54 deg) — hard bank, hard turn, heavy bleed
  maxPitch: 0.6, // rad
  climbBleed: 11, // m/s^2 lost while climbing steeply
  diveGain: 9, // m/s^2 gained while diving
  bankBleed: 2.4, // m/s^2 lost per radian of bank
  stallSink: 0.9, // extra sink per m/s under stall speed
  gravity: 9.81,
  fuelBurnIdle: 0.1, // %/s on the ground
  fuelBurnBase: 0.08, // %/s airborne at throttle 0 (gliding sips fuel)
  fuelBurnThrottle: 0.42, // %/s extra at full throttle
  fuelStart: 100,
  maxDamage: 100,
  hardTouchSink: 4, // m/s sink that dents the airframe on touchdown
  crashSink: 6.5, // m/s sink that ends the sortie on touchdown
  maxLandingSpeed: 46, // m/s — faster than this, the strip runs out
  maxLandingBank: 0.28, // rad — land wings-level or pay for it
};

// --- Wind ----------------------------------------------------------------
export const WIND = {
  baseSpeed: 6, // m/s from the west (heading 270 -> pushes east)
  baseHeading: 0, // wind blows toward +x (eastward), a tailwind on runway 09
  gustAmp: 3, // m/s
  gustPeriod: 9, // seconds per gust cycle
};

// --- Islands -------------------------------------------------------------
// x, z in metres; radius and height shape the terrain bump. The home
// island carries the main runway; B and C carry short grass strips.
export const ISLANDS = [
  { id: 'home', name: 'PULAU SENJA', x: 0, z: 0, radius: 280, height: 26, palms: 26, huts: 5 },
  { id: 'kuning', name: 'PULAU KUNING', x: -650, z: -420, radius: 185, height: 34, palms: 18, huts: 3 },
  { id: 'merah', name: 'PULAU MERAH', x: 550, z: 650, radius: 155, height: 30, palms: 14, huts: 2 },
  { id: 'hijau', name: 'PULAU HIJAU', x: 700, z: -600, radius: 205, height: 40, palms: 20, huts: 3 },
  { id: 'biru', name: 'PULAU BIRU', x: -750, z: 550, radius: 175, height: 44, palms: 16, huts: 2 },
  { id: 'kecil', name: 'PULAU KECIL', x: 150, z: -950, radius: 135, height: 22, palms: 10, huts: 1 },
];

// Runway strips: centre, heading (rad, 0 = +x east), length, width (m).
// The home strip is asphalt; B and C are mown-grass strips.
export const STRIPS = [
  { id: 'home', island: 'home', x: 0, z: 0, heading: 0, length: 380, width: 26, surface: 'asphalt', stripY: 8 },
  { id: 'kuning', island: 'kuning', x: -650, z: -420, heading: Math.PI / 2, length: 240, width: 20, surface: 'grass', stripY: 34 },
  { id: 'hijau', island: 'hijau', x: 700, z: -600, heading: 0, length: 260, width: 20, surface: 'grass', stripY: 40 },
];

// The home strip sits on a flattened apron so the runway is level.
export const HOME_APRON_Y = 8;

// --- Ring Run: 8 rings, each with an ideal speed band (m/s) --------------
// Fly through the middle. Inside the band: PERFECT (+100). Through but
// outside it: +50. The band is the throttle-discipline test.
export const RINGS = [
  { x: 300, y: 70, z: -80, band: [30, 44] },
  { x: 550, y: 90, z: -250, band: [32, 46] },
  { x: 650, y: 110, z: -550, band: [30, 44] },
  { x: 350, y: 100, z: -750, band: [34, 48] },
  { x: 0, y: 80, z: -900, band: [30, 44] },
  { x: -450, y: 90, z: -700, band: [32, 46] },
  { x: -700, y: 70, z: -450, band: [28, 42] },
  { x: -350, y: 60, z: -150, band: [28, 42] },
];
export const RING_RADIUS = 14; // m — pass within this of the centre
export const RING_SCORE = 50;
export const RING_PERFECT_SCORE = 100;

// --- Parcel Drop: 3 islands, one parcel each ------------------------------
export const DROP_TARGETS = [
  { island: 'merah', x: 550, z: 650, radius: 18 },
  { island: 'biru', x: -750, z: 550, radius: 18 },
  { island: 'kecil', x: 150, z: -950, radius: 18 },
];
export const DROP_MAX_ALT = 130; // m — drop from above this and it drifts off
export const DROP_SCORE_MAX = 150;

// --- Sorties ---------------------------------------------------------------
export const SORTIES = {
  rings: {
    id: 'rings',
    name: 'RING RUN',
    blurb: '8 cincin senja, tiap cincin punya kecepatan ideal. Terbang bersih, hemat bahan bakar, pulang mendarat.',
    fuel: 100,
    parcels: 0,
  },
  parcels: {
    id: 'parcels',
    name: 'PARCEL DROP',
    blurb: '3 paket untuk 3 pulau. Jatuhkan tepat di lingkaran target dari ketinggian rendah — makin dekat, makin besar skor.',
    fuel: 100,
    parcels: 3,
  },
  hop: {
    id: 'hop',
    name: 'ISLAND HOP',
    blurb: 'Mendarat di dua landasan rumput pendek — Kuning lalu Hijau — lalu pulang ke Senja. Mendarat lembut atau rusak.',
    fuel: 100,
    parcels: 0,
  },
};
export const SORTIE_ORDER = ['rings', 'parcels', 'hop'];

// --- Scoring ---------------------------------------------------------------
export const SCORE = {
  landingBase: 120, // a safe landing on the home strip
  landingSoftBonus: 80, // extra for a gentle touchdown (sink < 2 m/s)
  centrelineBonus: 40, // extra for touching down near the centreline
  timeBonusPerSecond: 2, // unspent seconds under the sortie par time
  fuelBonusPerPercent: 1, // unburnt fuel at the end
  parTime: { rings: 300, parcels: 330, hop: 360 }, // seconds
};

// --- World bounds ----------------------------------------------------------
export const WORLD = {
  size: 2400, // terrain mesh spans +/- 1200 m
  seaLevel: 0,
  fogNear: 420,
  fogFar: 2300,
  sunPosition: [-900, 260, -1400],
};

// --- Timing ----------------------------------------------------------------
export const STEP = 1 / 60;
export const BEST_KEY = 'senja-sky-courier-best';
