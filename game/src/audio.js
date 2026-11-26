// Sound, synthesised live with WebAudio — no audio files, no network.
// Engine hum follows throttle, wind rush follows speed, and each event
// (ring, drop, touchdown, crash) has its own short voice. One job:
// make the flight audible. Mute with M.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windSource = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx !== null) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineGain.connect(ctx.destination);
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc.connect(engineGain);
    engineOsc.start();
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 110;
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    engineOsc2.connect(g2);
    g2.connect(engineGain);
    engineOsc2.start();
    // Wind: looped noise through a low-pass filter.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    windSource = ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSource.connect(filter);
    filter.connect(windGain);
    windGain.connect(ctx.destination);
    windSource.start();
    started = true;
  }

  function resume() {
    ensure();
    if (ctx !== null && ctx.state === 'suspended') void ctx.resume();
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (ctx === null || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  return {
    resume,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (engineGain !== null) engineGain.gain.value = muted ? 0 : engineGain.gain.value;
      return muted;
    },
    // Called every frame while flying: engine pitch and wind follow the aircraft.
    update(flight) {
      if (ctx === null || !started) return;
      if (muted) {
        engineGain.gain.value = 0;
        windGain.gain.value = 0;
        return;
      }
      const target = flight.airborne || flight.throttle > 0.05 ? 0.05 + flight.throttle * 0.1 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + flight.throttle * 65 + flight.speed * 0.35, ctx.currentTime, 0.1);
      engineOsc2.frequency.setTargetAtTime(96 + flight.throttle * 130 + flight.speed * 0.7, ctx.currentTime, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.12, (flight.speed / 72) * 0.12), ctx.currentTime, 0.15);
    },
    ring(perfect) {
      tone(660, 0.16, 'sine', 0.22);
      tone(880, 0.2, 'sine', 0.22, 0.08);
      if (perfect) tone(1320, 0.28, 'sine', 0.22, 0.16);
    },
    drop() {
      tone(520, 0.12, 'triangle', 0.2);
      tone(780, 0.18, 'triangle', 0.2, 0.09);
    },
    touchdown(hard) {
      tone(70, hard ? 0.4 : 0.22, 'sine', hard ? 0.5 : 0.3);
      if (hard) tone(55, 0.5, 'sawtooth', 0.2, 0.02);
    },
    crash() {
      tone(90, 0.7, 'sawtooth', 0.4);
      tone(45, 0.9, 'sine', 0.5, 0.05);
    },
    takeoff() {
      tone(440, 0.12, 'sine', 0.16);
      tone(660, 0.16, 'sine', 0.16, 0.1);
    },
    click() {
      tone(800, 0.05, 'square', 0.08);
    },
    stall() {
      tone(220, 0.3, 'square', 0.1);
    },
  };
}
