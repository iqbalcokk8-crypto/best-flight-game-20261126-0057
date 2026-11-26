// Keyboard and mouse input. Arrow keys / WASD fly the plane, W/S (or
// Shift/Ctrl) work the throttle, Space is the action key (drop a
// parcel), C swaps cameras, P pauses, M mutes, R restarts, Enter
// confirms on menus. Mouse clicks the on-screen buttons. One job:
// turn keys and clicks into a clean per-frame input state.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CAMERA = 4;
export const ACTION_DROP = 8;
export const ACTION_MUTE = 16;
export const ACTION_RESTART = 32;

const KEYMAP = {
  ArrowUp: 'pitchUp',
  KeyW: 'pitchUp',
  ArrowDown: 'pitchDown',
  KeyS: 'pitchDown',
  ArrowLeft: 'rollLeft',
  KeyA: 'rollLeft',
  ArrowRight: 'rollRight',
  KeyD: 'rollRight',
  ShiftLeft: 'throttleUp',
  ShiftRight: 'throttleUp',
  ControlLeft: 'throttleDown',
  ControlRight: 'throttleDown',
  KeyQ: 'throttleDown',
  KeyE: 'throttleUp',
  KeyB: 'brake',
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let dropQueued = false;

  function onKeyDown(event) {
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) dropQueued = true;
      return;
    }
    if (event.code === 'Enter') {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      return;
    }
    if (event.code === 'KeyP' || event.code === 'Escape') {
      if (!event.repeat) actions |= ACTION_PAUSE;
      return;
    }
    if (event.code === 'KeyC') {
      if (!event.repeat) actions |= ACTION_CAMERA;
      return;
    }
    if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
      return;
    }
    if (event.code === 'KeyR') {
      if (!event.repeat) actions |= ACTION_RESTART;
      return;
    }
    const name = KEYMAP[event.code];
    if (name !== undefined) {
      keys.add(name);
      if (event.code.startsWith('Arrow')) event.preventDefault();
    }
  }

  function onKeyUp(event) {
    const name = KEYMAP[event.code];
    if (name !== undefined) keys.delete(name);
  }

  function onBlur() {
    keys.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  // Per-frame stick state: pitch -1..1 (up positive), roll -1..1,
  // throttle -1..1 (change per second), brake, and a one-shot drop.
  function read() {
    const pitch = (keys.has('pitchUp') ? 1 : 0) - (keys.has('pitchDown') ? 1 : 0);
    const roll = (keys.has('rollRight') ? 1 : 0) - (keys.has('rollLeft') ? 1 : 0);
    const throttle = (keys.has('throttleUp') ? 1 : 0) - (keys.has('throttleDown') ? 1 : 0);
    const drop = dropQueued;
    dropQueued = false;
    return { pitch, roll, throttle, brake: keys.has('brake'), drop };
  }

  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  return { read, takeActions };
}
