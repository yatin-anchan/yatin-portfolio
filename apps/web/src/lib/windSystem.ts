/**
 * Shared wind model for the hero scene.
 *
 * One state object drives every wind-reactive element:
 *  - CSS consumers (summit flag, prayer flags, tree foliage, grass) read the
 *    custom properties written onto the root element.
 *  - JS consumers (falling leaves) subscribe and read the state directly.
 *
 * Nothing here touches React state, so wind never triggers a re-render.
 */

export interface WindState {
  /** Smoothed direction: -1 blows towards the left, +1 towards the right. Passes through 0 when it reverses. */
  direction: number;
  /** Slowly drifting base strength, 0–1. */
  strength: number;
  /** Gust envelope, 0–1 (0 between gusts). */
  gust: number;
  /** strength + gust contribution, 0–~1.4. */
  force: number;
  /** direction * force — the signed push most consumers want. */
  velocity: number;
}

export type WindListener = (state: WindState, dt: number) => void;

export interface WindSystem {
  readonly state: WindState;
  subscribe: (listener: WindListener) => () => void;
  stop: () => void;
}

const CSS_WRITE_INTERVAL_MS = 40;
const random = (min: number, max: number) => min + Math.random() * (max - min);
const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

function writeCssVariables(root: HTMLElement, state: WindState) {
  const style = root.style;
  style.setProperty('--wind-dir', state.direction.toFixed(3));
  style.setProperty('--wind-strength', state.strength.toFixed(3));
  style.setProperty('--wind-gust', state.gust.toFixed(3));
  style.setProperty('--wind-force', state.force.toFixed(3));
  style.setProperty('--wind', state.velocity.toFixed(3));
}

export function createWindSystem(root: HTMLElement, reducedMotion: boolean): WindSystem {
  const state: WindState = { direction: 1, strength: 0.34, gust: 0, force: 0.34, velocity: 0.34 };
  const listeners = new Set<WindListener>();

  root.dataset.wind = 'right';
  writeCssVariables(root, state);

  // Reduced motion: a calm, fixed breeze and no loop at all.
  if (reducedMotion) {
    return {
      state,
      subscribe: () => () => undefined,
      stop: () => undefined,
    };
  }

  let frame = 0;
  let last = performance.now();
  let lastCssWrite = 0;
  let time = random(0, 100);
  let targetDirection = Math.random() < 0.5 ? 1 : -1;
  state.direction = targetDirection;
  let nextFlipAt = time + random(26, 48);
  let gustStart = -100;
  let gustPeak = 0;
  let nextGustAt = time + random(4, 9);

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    // Direction eases towards its target, so a reversal passes through calm air.
    if (time >= nextFlipAt) {
      targetDirection *= -1;
      nextFlipAt = time + random(26, 52);
    }
    state.direction += (targetDirection - state.direction) * (1 - Math.exp(-dt * 0.22));

    // Layered slow oscillations give an irregular, never-repeating base strength.
    state.strength = Math.min(
      1,
      Math.max(
        0.1,
        0.36 + 0.16 * Math.sin(time * 0.11 + 1) + 0.08 * Math.sin(time * 0.37 + 2.1) + 0.04 * Math.sin(time * 0.91),
      ),
    );

    // Gusts: quick attack, long decay, random spacing and intensity.
    if (time >= nextGustAt) {
      gustStart = time;
      gustPeak = random(0.45, 1);
      nextGustAt = time + random(7, 17);
    }
    const sinceGust = time - gustStart;
    state.gust =
      sinceGust < 1.4
        ? gustPeak * smoothstep(sinceGust / 1.4)
        : gustPeak * Math.exp(-(sinceGust - 1.4) / 2.4);

    state.force = state.strength + state.gust * 0.6;
    state.velocity = state.direction * state.force;

    // Mirrored artwork flips at the calm moment of a reversal, hiding the phase change.
    if (Math.abs(state.direction) < 0.12) {
      const side = targetDirection > 0 ? 'right' : 'left';
      if (root.dataset.wind !== side) root.dataset.wind = side;
    }

    if (now - lastCssWrite >= CSS_WRITE_INTERVAL_MS) {
      lastCssWrite = now;
      writeCssVariables(root, state);
    }
    listeners.forEach((listener) => listener(state, dt));
  };

  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };

  document.addEventListener('visibilitychange', onVisibility);
  frame = requestAnimationFrame(tick);

  return {
    state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop: () => {
      cancelAnimationFrame(frame);
      frame = 0;
      document.removeEventListener('visibilitychange', onVisibility);
      listeners.clear();
    },
  };
}
