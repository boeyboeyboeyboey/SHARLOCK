// full turn camera helpers: angles keep accumulating past pi, so every comparison goes through the shortest arc

// any angle wrapped into [-pi, pi]
export const wrapAngle = (angle) => angle - Math.PI * 2 * Math.round(angle / (Math.PI * 2));

// the alpha equal to wanted (mod a turn) that lies closest to from, so a flight never spins the long way round
export const nearestAlpha = (from, wanted) => from + wrapAngle(wanted - from);

// the alpha that puts the camera behind something heading along (sin heading, cos heading)
export const alphaBehind = (heading) => Math.atan2(-Math.cos(heading), -Math.sin(heading));

const typing = (target) => target instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);

// Z and C turn the camera while held, R asks for the reset. enabled() is false while an overlay owns the keyboard
export function createOrbitKeys({ camera, enabled, onReset, rate = Math.PI / 2 }) {
  const held = new Set();
  const onKey = (event, isDown) => {
    if (event.code !== 'KeyZ' && event.code !== 'KeyC' && event.code !== 'KeyR') return;
    if (typing(event.target)) return;
    if (!isDown) {
      held.delete(event.code);
      return;
    }
    // browser shortcuts such as reload keep working
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!enabled()) return;
    if (event.code === 'KeyR') {
      if (!event.repeat) onReset();
    } else {
      held.add(event.code);
    }
  };
  const down = (event) => onKey(event, true);
  const up = (event) => onKey(event, false);
  const blur = () => held.clear();
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return {
    update(dt) {
      if (!held.size) return;
      if (!enabled()) {
        held.clear();
        return;
      }
      // z swings the camera to the left of the target, c to the right
      camera.alpha += ((held.has('KeyC') ? 1 : 0) - (held.has('KeyZ') ? 1 : 0)) * rate * dt;
    },
    dispose() {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    },
  };
}
