import type { WindState } from './windSystem';

/**
 * Lightweight physics for the falling-leaf images. Each leaf has its own mass,
 * flutter and spin; horizontal velocity chases the shared wind, so weak wind
 * gives near-vertical fall and strong wind gives diagonal drift in whichever
 * direction the wind currently blows. Transforms are written straight to the DOM.
 */

interface Leaf {
  el: HTMLElement;
  active: boolean;
  wait: number;
  age: number;
  x: number;
  y: number;
  vx: number;
  rotation: number;
  spin: number;
  fallSpeed: number; // in "u" per second
  reach: number; // how strongly wind pushes this leaf (px/s at full force)
  response: number; // how quickly it picks up wind
  swayPhase: number;
  swaySpeed: number;
  swayAmp: number;
  tumblePhase: number;
  tumbleSpeed: number;
  peakOpacity: number;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);

export interface LeafController {
  update: (wind: WindState, dt: number) => void;
  measure: () => void;
}

export function createLeafController(root: HTMLElement, elements: HTMLElement[]): LeafController {
  let width = 0;
  let height = 0;
  let unit = 10;
  let portrait = false;

  const leaves: Leaf[] = elements.map((el) => ({
    el,
    active: true,
    wait: random(0, 14),
    age: 0,
    x: 0,
    y: 0,
    vx: 0,
    rotation: random(0, 360),
    spin: random(-45, 45),
    fallSpeed: random(2.1, 3.9),
    reach: random(35, 210),
    response: random(0.5, 1.6),
    swayPhase: random(0, 6.28),
    swaySpeed: random(1.1, 2.4),
    swayAmp: random(8, 30),
    tumblePhase: random(0, 6.28),
    tumbleSpeed: random(1.4, 3),
    peakOpacity: random(0.65, 0.95),
  }));

  const spawn = (leaf: Leaf) => {
    // Spawn inside the canopy area (top-left of the scene).
    leaf.x = portrait ? width * random(0.06, 0.5) : unit * random(12, 42);
    leaf.y = portrait ? width * random(0.04, 0.2) : unit * random(1.5, 11);
    leaf.vx = 0;
    leaf.age = 0;
    leaf.rotation = random(0, 360);
    leaf.wait = random(0.5, 9);
  };

  const measure = () => {
    const rect = root.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    portrait = height > width || width < 720;
    unit = Math.min(width / 100, (height / 100) * 1.78);
    leaves.forEach((leaf) => {
      // Leaves hidden by CSS (fewer on mobile) are skipped.
      leaf.active = getComputedStyle(leaf.el).display !== 'none';
      if (leaf.age === 0) spawn(leaf);
    });
  };

  const update = (wind: WindState, dt: number) => {
    for (const leaf of leaves) {
      if (!leaf.active) continue;

      if (leaf.wait > 0) {
        leaf.wait -= dt;
        leaf.el.style.opacity = '0';
        continue;
      }

      leaf.age += dt;
      const gustBoost = 1 + wind.gust * 0.8;
      const targetVx = wind.velocity * leaf.reach * gustBoost;
      leaf.vx += (targetVx - leaf.vx) * (1 - Math.exp(-dt * leaf.response));

      const flutter = Math.sin(leaf.age * leaf.swaySpeed + leaf.swayPhase);
      const fall = leaf.fallSpeed * (portrait ? width / 100 : unit) * (1 + 0.32 * Math.sin(leaf.age * leaf.swaySpeed * 0.8 + leaf.swayPhase));

      leaf.x += (leaf.vx + flutter * leaf.swayAmp) * dt;
      leaf.y += (fall - wind.gust * 14) * dt;
      leaf.rotation += (leaf.spin + wind.velocity * 55 + flutter * 40) * dt;

      const tumble = Math.sin(leaf.age * leaf.tumbleSpeed + leaf.tumblePhase) * 62;
      const progress = leaf.y / height;
      const opacity =
        Math.min(1, leaf.age / 0.9) * Math.min(1, Math.max(0, (1.02 - progress) / 0.14)) * leaf.peakOpacity;

      leaf.el.style.transform = `translate3d(${leaf.x.toFixed(1)}px, ${leaf.y.toFixed(1)}px, 0) perspective(300px) rotateZ(${leaf.rotation.toFixed(1)}deg) rotateX(${tumble.toFixed(1)}deg)`;
      leaf.el.style.opacity = opacity.toFixed(3);

      if (leaf.y > height * 1.03 || leaf.x < -120 || leaf.x > width + 120) spawn(leaf);
    }
  };

  measure();
  return { update, measure };
}
