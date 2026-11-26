// The HUD and the instrument cluster: DOM readouts plus one small
// canvas of live instruments (attitude ball, airspeed, altitude,
// throttle) that are driven by the flight state every frame —
// instruments that are flown, not drawn once. One job: show the pilot
// what the aircraft is doing, loudly enough for a screenshot to read.
import { CAMERA_COCKPIT } from './render.js';

const MS_TO_KT = 1.94384;
const M_TO_FT = 3.28084;

function headingLabel(headingDeg) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round(headingDeg / 45) % 8];
}

export function createHud(doc) {
  const el = (id) => doc.getElementById(id);
  const canvas = el('instruments');
  const ctx = canvas.getContext('2d');

  function drawInstruments(flight, mission) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    // Panel backplate: dark glass, amber-lit.
    ctx.fillStyle = 'rgba(12, 16, 22, 0.88)';
    roundRect(ctx, 0, 0, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // --- Heading compass tape (top strip) ---
    // A window of headings around the nose, ticks every 15 deg, cardinals
    // labelled — the pilot reads where the nose points, not just a number.
    // The game's heading 0 is east (+x), so the compass adds 90: the
    // runway heading reads 090 E, matching the briefing.
    const headingDegTape = (((flight.heading * 180) / Math.PI + 90) % 360 + 360) % 360;
    ctx.save();
    ctx.beginPath();
    ctx.rect(4, 2, w - 8, 14);
    ctx.clip();
    ctx.font = 'bold 9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let off = -60; off <= 60; off += 15) {
      const deg = Math.round((headingDegTape + off + 360) % 360);
      const x = w / 2 + off * 2.4;
      const isCardinal = deg % 45 === 0;
      ctx.strokeStyle = isCardinal ? '#ffb347' : '#5a6a78';
      ctx.lineWidth = isCardinal ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 3);
      ctx.lineTo(x, isCardinal ? 12 : 9);
      ctx.stroke();
      if (isCardinal) {
        ctx.fillStyle = '#f2e8d5';
        ctx.fillText(headingLabel(deg), x, 14);
      }
    }
    ctx.restore();
    // Centre caret: the nose.
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 4, 16);
    ctx.lineTo(w / 2 + 4, 16);
    ctx.lineTo(w / 2, 21);
    ctx.closePath();
    ctx.fill();

    // --- Attitude ball (left) ---
    const cx = 62;
    const cy = h / 2;
    const r = 40;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-flight.bank);
    const pitchPx = Math.max(-r, Math.min(r, flight.pitch * r * 1.4));
    ctx.fillStyle = '#2a6db0';
    ctx.fillRect(-r, -r - pitchPx, r * 2, r + pitchPx);
    ctx.fillStyle = '#c47b33';
    ctx.fillRect(-r, -pitchPx, r * 2, r + pitchPx);
    ctx.strokeStyle = '#f2e8d5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, -pitchPx);
    ctx.lineTo(r, -pitchPx);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#ffb347';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed wings marker.
    ctx.strokeStyle = '#ffe9b0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.moveTo(cx + 8, cy);
    ctx.lineTo(cx + 26, cy);
    ctx.stroke();
    label(ctx, 'ATT', cx, cy + r + 13, '#ffb347');

    // --- Airspeed dial ---
    dial(ctx, 165, cy, 34, flight.speed * MS_TO_KT, 160, 'KT', '#7ee0a3');
    label(ctx, 'AIRSPEED', 165, cy + r + 13, '#ffb347');
    // --- Altitude dial ---
    dial(ctx, 248, cy, 34, flight.y * M_TO_FT, 6000, 'FT', '#7ec8e0');
    label(ctx, 'ALTITUDE', 248, cy + r + 13, '#ffb347');
    // --- Throttle lever + fuel ---
    const tx = 315;
    ctx.fillStyle = '#222a33';
    roundRect(ctx, tx - 8, 12, 16, h - 40, 6);
    ctx.fill();
    const fillH = (h - 40) * flight.throttle;
    ctx.fillStyle = '#ffb347';
    roundRect(ctx, tx - 8, 12 + (h - 40 - fillH), 16, fillH, 6);
    ctx.fill();
    label(ctx, 'THR', tx, h - 10, '#ffb347');
    // Fuel arc under the throttle.
    ctx.fillStyle = flight.fuel < 20 ? '#ff5a3c' : '#7ee0a3';
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`FUEL ${Math.round(flight.fuel)}%`, tx + 6, 26);
    void mission;
  }

  function dial(ctx2, cx, cy, r, value, max, unit, color) {
    ctx2.strokeStyle = '#3a4550';
    ctx2.lineWidth = 5;
    ctx2.beginPath();
    ctx2.arc(cx, cy, r, 0, Math.PI * 2);
    ctx2.stroke();
    const frac = Math.max(0, Math.min(1, value / max));
    ctx2.strokeStyle = color;
    ctx2.beginPath();
    ctx2.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx2.stroke();
    ctx2.fillStyle = '#f2e8d5';
    ctx2.font = 'bold 17px ui-monospace, monospace';
    ctx2.textAlign = 'center';
    ctx2.fillText(String(Math.round(value)), cx, cy + 1);
    ctx2.font = '11px ui-monospace, monospace';
    ctx2.fillStyle = '#9fb0bd';
    ctx2.fillText(unit, cx, cy + 17);
  }

  function label(ctx2, text, x, y, color) {
    ctx2.fillStyle = color;
    ctx2.font = '10px ui-monospace, monospace';
    ctx2.textAlign = 'center';
    ctx2.fillText(text, x, y);
  }

  function roundRect(ctx2, x, y, w, h, r) {
    ctx2.beginPath();
    ctx2.moveTo(x + r, y);
    ctx2.arcTo(x + w, y, x + w, y + h, r);
    ctx2.arcTo(x + w, y + h, x, y + h, r);
    ctx2.arcTo(x, y + h, x, y, r);
    ctx2.arcTo(x, y, x + w, y, r);
    ctx2.closePath();
  }

  function setText(id, text) {
    const node = el(id);
    if (node && node.textContent !== text) node.textContent = text;
  }

  function setWidth(id, pct) {
    const node = el(id);
    if (node) node.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  function update(flight, mission, cameraMode, banner) {
    // Heading 0 is east in the game's world, so the compass adds 90.
    const headingDeg = (((flight.heading * 180) / Math.PI + 90) % 360 + 360) % 360;
    setText('hud-alt', `${Math.round(flight.y * M_TO_FT)} FT`);
    setText('hud-spd', `${Math.round(flight.speed * MS_TO_KT)} KT`);
    setText('hud-hdg', `${String(Math.round(headingDeg)).padStart(3, '0')}° ${headingLabel(headingDeg)}`);
    setText('hud-fuel', `FUEL ${Math.round(flight.fuel)}%`);
    setText('hud-score', `SCORE ${mission.state.score}`);
    setText('hud-objective', mission.objectiveText());
    setText('hud-timer', `${Math.floor(mission.state.elapsed / 60)}:${String(Math.floor(mission.state.elapsed % 60)).padStart(2, '0')}`);
    setText('hud-sortie', mission.state.sortieId.toUpperCase());
    setText('hud-cam', cameraMode === CAMERA_COCKPIT ? 'COCKPIT [C]' : 'CHASE [C]');
    setWidth('bar-fuel', flight.fuel);
    setWidth('bar-damage', flight.damage);
    setWidth('bar-throttle', flight.throttle * 100);
    el('bar-fuel').classList.toggle('low', flight.fuel < 20);
    el('hud-damage').style.display = flight.damage > 0 ? 'block' : 'none';
    setText('hud-damage', `DAMAGE ${Math.round(flight.damage)}%`);

    // Ring speed band: show where the needle sits in the band —
    // green in it, amber too slow, red too fast. The decision is made
    // in m/s, exactly like the scoring; the knots are only the label,
    // so the readout can never disagree with the ring by a rounding.
    const obj = mission.currentObjective();
    const bandEl = el('hud-band');
    if (obj !== null && obj.kind === 'ring') {
      const lo = Math.round(obj.band[0] * MS_TO_KT);
      const hi = Math.round(obj.band[1] * MS_TO_KT);
      const inBand = flight.speed >= obj.band[0] && flight.speed <= obj.band[1];
      bandEl.style.display = 'block';
      bandEl.textContent = `RING ${obj.index + 1} BAND ${lo}–${hi} KT ${inBand ? '● IN BAND' : flight.speed < obj.band[0] ? '◐ TOO SLOW' : '● TOO FAST'}`;
      bandEl.classList.toggle('in', inBand);
      bandEl.classList.toggle('slow', !inBand && flight.speed < obj.band[0]);
    } else {
      bandEl.style.display = 'none';
    }

    // Engine out: the fuel is gone and the lever does nothing — say so
    // plainly, every frame, until the aircraft is on the ground.
    const engineEl = el('hud-engine');
    engineEl.style.display = flight.engineOff ? 'block' : 'none';
    if (flight.engineOff) engineEl.textContent = 'ENGINE OUT — GLIDE';

    // Banner: warnings and celebrations, newest wins.
    const bannerEl = el('banner');
    if (banner !== null && banner !== undefined) {
      bannerEl.textContent = banner.text;
      bannerEl.className = `show ${banner.kind}`;
    } else {
      bannerEl.className = '';
      bannerEl.textContent = '';
    }

    drawInstruments(flight, mission);
  }

  return { update, drawInstruments };
}
