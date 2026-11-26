import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, RefObject } from 'react';
import { createLeafController } from '../lib/fallingLeaves';
import { createWindSystem } from '../lib/windSystem';
import './css/HeroSection.css';

import treeBranch from '../assets/tree-branch.png';
import cairnWithBanner from '../assets/cairn-with-banner.png';
import backpack from '../assets/backpack.png';
import foreground from '../assets/foreground.png';
import mountains from '../assets/mountains.png';
import summitFlag from '../assets/summit-flag.png';
import prayerFlags from '../assets/prayer-flags.png';
import wildflowerGrass from '../assets/wildflower-grass.png';
import leafImage from '../assets/leaf.png';

export interface HeroSectionProps {
  /** Destination of the "Explore my work" button. */
  projectsHref?: string;
}

const EXPEDITION_STAGES = 6;
const FLAG_STRIPS = 12;
const GARLAND_STRIPS = 24;
const TREE_SEGMENTS = ['trunk', 'limb', 'outer', 'tip'] as const;
const BACK_CLOUDS = ['far-a', 'far-b', 'mid-a'] as const;
const FRONT_CLOUDS = ['mid-b', 'near'] as const;
const FOG_BANKS = {
  high: ['a', 'b'],
  mid: ['a'],
  low: ['a', 'b'],
} as const;

/** Leaf sizes in "u" (1% of a 16:9 viewport width). Mobile hides the later ones via CSS. */
const LEAF_SIZES = [1.7, 2.1, 1.5, 2.5, 1.9, 2.3, 1.6, 2.0, 1.8];

interface BirdSpec {
  x: number; // start, vw
  y: number; // start, % of hero height
  dx: number; // travel towards the viewer, vw
  dy: number; // vh
  finalScale: number;
  duration: number; // s
  delay: number; // s
  flap: number; // wing-beat period, s
  wobble: number; // s
}

/** Birds start tiny behind the fog and grow as they fly towards the camera. */
const BIRDS: BirdSpec[] = [
  { x: 66, y: 29, dx: 14, dy: -26, finalScale: 1.0, duration: 34, delay: -9, flap: 0.62, wobble: 4.2 },
  { x: 74, y: 33, dx: 24, dy: -14, finalScale: 1.25, duration: 41, delay: -27, flap: 0.74, wobble: 5.1 },
  { x: 58, y: 31, dx: -6, dy: -30, finalScale: 0.85, duration: 47, delay: -38, flap: 0.58, wobble: 3.6 },
  { x: 82, y: 27, dx: 10, dy: -20, finalScale: 1.1, duration: 38, delay: -17, flap: 0.68, wobble: 4.7 },
];

/**
 * Deterministic pseudo-random generator (cheap sine-hash), so star/firefly
 * layouts are stable across renders and hydration instead of using
 * Math.random() directly in render output.
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}


/* ---------- Night sky star field ----------
   ~500 stars from four layers, none of which move:
   1. dust      – 340 faint pinpricks   (one element, static box-shadows)
   2. small     – 120 dim stars         (one element, static box-shadows)
   3. twinklers – 32 mid stars          (individual spans, independent twinkle)
   4. prominent – 12 stars with halos   (individual spans, independent twinkle)
   Dust and small stars are denser along a faint diagonal "Milky Way" band. */

/** Tiny seeded PRNG (mulberry32): the sky is identical on every render. */
function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stars live in the top part of the hero (% of height); landscape layers hide the rest. */
const SKY_DEPTH = 62;
const STAR_TINTS = ['255,255,255', '255,255,255', '214,226,255', '190,208,255', '255,236,208', '255,222,190'];

/** Stars dim towards the horizon (atmospheric extinction). */
const horizonFade = (y: number) => 1 - (y / SKY_DEPTH) * 0.6;

function pickStarPosition(rand: () => number, bandChance: number, depthScale = 1) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = rand() * 100;
    let y: number;
    if (rand() < bandChance) {
      // Milky Way: bell-curve scatter around a diagonal line (matches .hero__milkyway)
      const gauss = rand() + rand() + rand() - 1.5;
      y = (46 - x * 0.36 + gauss * 16) * depthScale;
    } else {
      y = Math.pow(rand(), 1.3) * SKY_DEPTH * depthScale;
    }
    if (y >= 0 && y <= SKY_DEPTH) return { x, y };
  }
  return { x: rand() * 100, y: rand() * SKY_DEPTH * 0.5 };
}

function buildStarShadows(
  count: number,
  seed: number,
  bandChance: number,
  alphaMin: number,
  alphaRange: number,
  maxBlur: number,
  bigSpread: number,
): string {
  const rand = createRng(seed);
  const shadows: string[] = [];
  for (let i = 0; i < count; i++) {
    const { x, y } = pickStarPosition(rand, bandChance);
    const tint = STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)];
    const alpha = (alphaMin + Math.pow(rand(), 2) * alphaRange) * horizonFade(y);
    const blur = rand() * maxBlur;
    const spread = rand() < 0.25 ? bigSpread : 0;
    shadows.push(
      `${x.toFixed(2)}vw ${y.toFixed(2)}svh ${blur.toFixed(2)}px ${spread}px rgba(${tint},${alpha.toFixed(2)})`,
    );
  }
  return shadows.join(',');
}

const DUST_SHADOWS = buildStarShadows(340, 101, 0.4, 0.14, 0.5, 0.5, 0);
const SMALL_SHADOWS = buildStarShadows(120, 202, 0.3, 0.5, 0.45, 0.9, 0.35);

interface StarSpec {
  left: number; // %
  top: number; // %
  size: number; // px
  opacity: number; // resting brightness
  duration: number; // s
  delay: number; // s (negative: desynchronised from the first frame)
  tint: string;
  halo: boolean;
}

function buildTwinklers(): StarSpec[] {
  const rand = createRng(303);
  const stars: StarSpec[] = [];
  const make = (
    count: number, sizeMin: number, sizeRange: number,
    opMin: number, opRange: number, halo: boolean, depthScale: number,
  ) => {
    for (let i = 0; i < count; i++) {
      const { x, y } = pickStarPosition(rand, 0.3, depthScale);
      const duration = 5 + rand() * 9;
      stars.push({
        left: x,
        top: y,
        size: sizeMin + rand() * sizeRange,
        opacity: (opMin + rand() * opRange) * horizonFade(y),
        duration,
        delay: -rand() * duration,
        tint: STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)],
        halo,
      });
    }
  };
  make(32, 1.5, 1.1, 0.55, 0.35, false, 0.8);
  make(12, 2.4, 1.4, 0.8, 0.2, true, 0.55); // prominent stars stay in the open upper sky
  return stars;
}

const TWINKLERS = buildTwinklers();

interface FireflySpec {
  left: number; // %
  top: number; // %
  delay: number; // s
  duration: number; // s
  driftX: number; // px
  driftY: number; // px
}

const FIREFLY_COUNT = 10;

/** Fireflies drift low, over the grass/foreground band. */
const FIREFLIES: FireflySpec[] = Array.from({ length: FIREFLY_COUNT }, (_, i) => {
  const r1 = seededRandom(i * 51.17 + 11);
  const r2 = seededRandom(i * 91.73 + 13);
  const r3 = seededRandom(i * 13.37 + 17);
  return {
    left: 8 + r1 * 82,
    top: 44 + r2 * 42,
    delay: r3 * 8,
    duration: 6 + r2 * 5,
    driftX: (r1 - 0.5) * 60,
    driftY: (r3 - 0.5) * 40,
  };
});

type RangeLayer = 'far' | 'mid' | 'near';

const GRASS_SEGMENTS = ['left', 'middle', 'right'] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Writes the real page-scroll progress to a CSS custom property on the hero root
 * (no re-render) and reports the discrete expedition stage back as state.
 */
function useScrollProgress(
  rootRef: RefObject<HTMLElement | null>,
  onStageChange: (stage: number) => void,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? clamp(window.scrollY / scrollable, 0, 1) : 0;
      root.style.setProperty('--progress', progress.toFixed(4));
      onStageChange(Math.round(progress * (EXPEDITION_STAGES - 1)));
    };

    const requestUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      cancelAnimationFrame(frame);
    };
  }, [rootRef, onStageChange]);
}

/** Starts the shared wind model and the leaf controller; both write straight to the DOM. */
function useWindEnvironment(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = prefersReducedMotion();
    const wind = createWindSystem(root, reduced);
    if (reduced) return wind.stop;

    const leafElements = Array.from(root.querySelectorAll<HTMLElement>('[data-leaf]'));
    const leaves = createLeafController(root, leafElements);
    const unsubscribe = wind.subscribe(leaves.update);
    window.addEventListener('resize', leaves.measure);

    return () => {
      window.removeEventListener('resize', leaves.measure);
      unsubscribe();
      wind.stop();
    };
  }, [rootRef]);
}

/** Smooth-scrolls to an in-page anchor; does nothing if that section is not mounted yet. */
function goToAnchor(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (!href.startsWith('#')) return;
  event.preventDefault();
  const target = href.length > 1 ? document.getElementById(href.slice(1)) : null;
  if (!target) return;
  target.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  });
}

interface FabricProps {
  src: string;
  count: number;
  variant: 'flag' | 'garland';
}

/**
 * Fakes cloth deformation from a flat image: the same image is stacked as N
 * full-size layers, each clipped to one vertical slice. Slices are animated with
 * a phase offset, so a wave travels left to right across the artwork.
 */
function Fabric({ src, count, variant }: FabricProps) {
  const containerStyle = {
    '--fabric-src': `url(${src})`,
    '--n': count,
  } as CSSProperties;

  return (
    <div className={`fabric fabric--${variant}`} style={containerStyle} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="fabric__slice"
          style={{ '--i': index } as CSSProperties}
        />
      ))}
    </div>
  );
}

function MountainLayer({ layer }: { layer: RangeLayer }) {
  return (
    <div className={`hero__parallax hero__parallax--range-${layer}`} aria-hidden="true">
      <div
        className={`hero__range hero__range--${layer}`}
        style={{ '--range-src': `url(${mountains})` } as CSSProperties}
      >
        <img
          className="hero__range-img"
          src={mountains}
          alt=""
          decoding="async"
          fetchPriority={layer === 'far' ? 'high' : undefined}
        />
        <span className="hero__range-tint" />
      </div>
    </div>
  );
}

function FogBank({ depth }: { depth: keyof typeof FOG_BANKS }) {
  return (
    <div className="hero__fog-bank" aria-hidden="true">
      {FOG_BANKS[depth].map((variant) => (
        <span key={variant} className={`hero__fog hero__fog--${depth}-${variant}`} />
      ))}
    </div>
  );
}

/** Night sky: a scene-wide darkening veil, twinkling stars and drifting fireflies.
 *  All three are always mounted — their visibility is pure CSS, keyed off the
 *  `data-theme="dark"` attribute Header.tsx sets on <html>, so the toggle just
 *  cross-fades them in instead of mounting/unmounting anything. */
function NightSky() {
  return (
    <>
      <div className="hero__night-veil" aria-hidden="true" />

      <div className="hero__stars" aria-hidden="true">
        <div className="hero__milkyway" />
        <span className="hero__stars-layer" style={{ boxShadow: DUST_SHADOWS }} />
        <span className="hero__stars-layer" style={{ boxShadow: SMALL_SHADOWS }} />
        {TWINKLERS.map((star, index) => (
          <span
            key={index}
            className={`hero__star${star.halo ? ' hero__star--halo' : ''}`}
            style={{
              left: `${star.left.toFixed(2)}%`,
              top: `${star.top.toFixed(2)}%`,
              animationDuration: `${star.duration.toFixed(1)}s`,
              animationDelay: `${star.delay.toFixed(1)}s`,
              '--s': `${star.size.toFixed(2)}px`,
              '--o': star.opacity.toFixed(2),
              '--c': `rgb(${star.tint})`,
            } as CSSProperties}
          />
        ))}
      </div>

      <div className="hero__fireflies" aria-hidden="true">
        {FIREFLIES.map((fly, index) => (
          <span
            key={index}
            className="hero__firefly"
            style={{
              left: `${fly.left}%`,
              top: `${fly.top}%`,
              animationDelay: `${fly.delay}s, ${fly.delay * 0.6}s`,
              animationDuration: `${fly.duration}s, ${fly.duration * 0.55}s`,
              '--fx': `${fly.driftX}px`,
              '--fy': `${fly.driftY}px`,
            } as CSSProperties}
          />
        ))}
      </div>
    </>
  );
}
function HeroSection({ projectsHref = '#projects' }: HeroSectionProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState(0);

  useScrollProgress(rootRef, setStage);
  useWindEnvironment(rootRef);

  return (
    <section id="home" className="hero" ref={rootRef} aria-label="Introduction">
      <svg className="hero__defs" width="0" height="0" focusable="false" aria-hidden="true">
        <defs>
          {/* Static turbulence displacement gives clouds and fog soft, irregular edges */}
          <filter id="hero-cloud-wisp" x="-20%" y="-40%" width="140%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.011 0.02" numOctaves="4" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="46" />
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          <filter id="hero-fog-wisp-1" x="-10%" y="-40%" width="120%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.005 0.016" numOctaves="3" seed="11" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="90" />
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id="hero-fog-wisp-2" x="-10%" y="-40%" width="120%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.007 0.022" numOctaves="3" seed="23" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="70" />
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>
      </svg>

      {/* 1-2. Sunrise sky, sun, light rays, back clouds */}
      <div className="hero__sky" aria-hidden="true" />
      <div className="hero__parallax hero__parallax--sun" aria-hidden="true">
        <div className="hero__sunglow" />
        <div className="hero__rays" />
        <div className="hero__sun" />
      </div>
      <div className="hero__clouds" aria-hidden="true">
        {BACK_CLOUDS.map((cloud) => (
          <span key={cloud} className={`hero__cloud hero__cloud--${cloud}`} />
        ))}
      </div>

      {/* 3. Mountains in three atmospheric depths, interleaved with fog and birds */}
      <MountainLayer layer="far" />

      {/* Birds begin behind the high fog and approach the viewer (dark mode: none) */}
      <div className="hero__birds" aria-hidden="true">
        {BIRDS.map((bird, index) => (
          <span
            key={index}
            className="hero__bird"
            style={{
              '--x': `${bird.x}vw`,
              '--y': `${bird.y}%`,
              '--dx': `${bird.dx}vw`,
              '--dy': `${bird.dy}vh`,
              '--s1': bird.finalScale,
              '--duration': `${bird.duration}s`,
              '--delay': `${bird.delay}s`,
              '--flap': `${bird.flap}s`,
              '--wobble': `${bird.wobble}s`,
            } as CSSProperties}
          >
            <span className="hero__bird-bob">
              <svg viewBox="0 0 40 20" className="hero__bird-svg">
                <path className="hero__wing hero__wing--left" d="M20 12 C14 4 6 3 0 7 C8 6 14 8 20 12Z" />
                <path className="hero__wing hero__wing--right" d="M20 12 C26 4 34 3 40 7 C32 6 26 8 20 12Z" />
                <ellipse cx="20" cy="12.5" rx="3" ry="1.3" />
              </svg>
            </span>
          </span>
        ))}
      </div>

      <FogBank depth="high" />
      <MountainLayer layer="mid" />
      <FogBank depth="mid" />
      <MountainLayer layer="near" />
      <FogBank depth="low" />

      {/* Front clouds pass over the range */}
      <div className="hero__clouds hero__clouds--front" aria-hidden="true">
        {FRONT_CLOUDS.map((cloud) => (
          <span key={cloud} className={`hero__cloud hero__cloud--${cloud}`} />
        ))}
      </div>

      {/* 4. Distant atmosphere */}
      <div className="hero__mist" aria-hidden="true" />
      <div className="hero__valley" aria-hidden="true" />

      {/* 5-6. Tree: trunk stays still, outer foliage groups sway independently */}
      <div className="hero__parallax hero__parallax--tree" aria-hidden="true">
        <div className="hero__tree">
          {TREE_SEGMENTS.map((segment) => (
            <img
              key={segment}
              className={`hero__img hero__tree-layer hero__tree-layer--${segment}`}
              src={treeBranch}
              alt=""
              decoding="async"
              fetchPriority={segment === 'trunk' ? 'high' : undefined}
            />
          ))}
        </div>
      </div>

      {/* 7. Prayer flags */}
      <div className="hero__parallax hero__parallax--garland" aria-hidden="true">
        <div className="hero__garland">
          <Fabric src={prayerFlags} count={GARLAND_STRIPS} variant="garland" />
        </div>
      </div>

      {/* 8. Backpack */}
      <div className="hero__parallax hero__parallax--backpack" aria-hidden="true">
        <img className="hero__img hero__backpack" src={backpack} alt="" decoding="async" />
      </div>

      {/* 9. Cairn (static) + summit flag (animated separately) */}
      <div className="hero__parallax hero__parallax--cairn" aria-hidden="true">
        <div className="hero__cairn">
          <img className="hero__img hero__cairn-stones" src={cairnWithBanner} alt="" decoding="async" />
          <div className="hero__summit-flag">
            <Fabric src={summitFlag} count={FLAG_STRIPS} variant="flag" />
          </div>
        </div>
      </div>

      {/* 10. Grass and wildflowers */}
      {(['a', 'b'] as const).map((clump) => (
        <div
          key={clump}
          className={`hero__parallax hero__parallax--grass-${clump}`}
          aria-hidden="true"
        >
          <div className={`hero__grass hero__grass--${clump}`}>
            {GRASS_SEGMENTS.map((segment) => (
              <img
                key={segment}
                className={`hero__img hero__grass-layer hero__grass-layer--${segment}`}
                src={wildflowerGrass}
                alt=""
                decoding="async"
              />
            ))}
          </div>
        </div>
      ))}

      {/* Falling leaves: positioned by the leaf controller, pushed by the shared wind */}
      <div className="hero__leaves" aria-hidden="true">
        {LEAF_SIZES.map((size, index) => (
          <img
            key={index}
            data-leaf=""
            className="hero__leaf"
            src={leafImage}
            alt=""
            decoding="async"
            style={{ '--size': size } as CSSProperties}
          />
        ))}
      </div>

      {/* Night sky: darkening veil + stars + fireflies (cross-fades with theme) */}
      <NightSky />

      {/* 11. Rocky foreground */}
      <div className="hero__parallax hero__parallax--foreground" aria-hidden="true">
        <img className="hero__img hero__foreground" src={foreground} alt="" decoding="async" />
      </div>

      {/* 12. Content (site navigation lives in Header.tsx) */}
      <div className="hero__content">
        <p className="hero__eyebrow">Portfolio</p>
        <h1 className="hero__title">
          <span>Yatin</span> <span>Anchan</span>
        </h1>
        <p className="hero__role">Jr Full Stack Developer</p>
        <p className="hero__description">
          Building meaningful software at the intersection of technology, people and real-world impact.
        </p>
        <a className="hero__cta" href={projectsHref} onClick={(event) => goToAnchor(event, projectsHref)}>
          <span>Explore my work</span>
          <span className="hero__cta-arrow" aria-hidden="true">→</span>
        </a>
      </div>

      <aside className="hero__expedition" aria-hidden="true">
        <span className="hero__expedition-track">
          <span className="hero__expedition-fill" />
        </span>
        {Array.from({ length: EXPEDITION_STAGES }, (_, index) => (
          <span
            key={index}
            className={`hero__expedition-node${index <= stage ? ' is-reached' : ''}`}
          />
        ))}
      </aside>
    </section>
  );
}

export default HeroSection;