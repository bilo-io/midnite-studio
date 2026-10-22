import { COMPANION_LEVEL_VAR, type CompanionState } from '@midnite/studio-shared';
import { project3D, rotate3D, type ProjectedPoint, type Vec3 } from '@midnite/studio-frame';
import { useEffect, useRef, type CSSProperties } from 'react';

export type OrbStateVisualProfile = {
  mode: 'idle' | 'listening' | 'thinking' | 'speaking' | 'handoff';
  label: string;
  primaryHue: number;
  secondaryHue: number;
  accentHue: number;
  rotSpeed: number;
  fogDensity: number;
  harmonicAmp: number;
  pulseRate: number;
};

export const ORB_STATE_PROFILES: Record<CompanionState, OrbStateVisualProfile> = {
  off: {
    mode: 'idle',
    label: 'Offline',
    primaryHue: 200,
    secondaryHue: 215,
    accentHue: 195,
    rotSpeed: 0.002,
    fogDensity: 0.25,
    harmonicAmp: 0.02,
    pulseRate: 0.8,
  },
  idle: {
    mode: 'idle',
    label: 'Standby Core',
    primaryHue: 194,
    secondaryHue: 212,
    accentHue: 38,
    rotSpeed: 0.0048,
    fogDensity: 0.52,
    harmonicAmp: 0.05,
    pulseRate: 1.4,
  },
  greeting: {
    mode: 'speaking',
    label: 'Vocal Resonance',
    primaryHue: 38,
    secondaryHue: 192,
    accentHue: 48,
    rotSpeed: 0.012,
    fogDensity: 0.82,
    harmonicAmp: 0.24,
    pulseRate: 3.6,
  },
  listening: {
    mode: 'listening',
    label: 'Acoustic Intake',
    primaryHue: 162,
    secondaryHue: 188,
    accentHue: 142,
    rotSpeed: 0.0085,
    fogDensity: 0.68,
    harmonicAmp: 0.14,
    pulseRate: 2.4,
  },
  thinking: {
    mode: 'thinking',
    label: 'Synaptic Matrix',
    primaryHue: 268,
    secondaryHue: 196,
    accentHue: 315,
    rotSpeed: 0.019,
    fogDensity: 0.78,
    harmonicAmp: 0.18,
    pulseRate: 4.2,
  },
  speaking: {
    mode: 'speaking',
    label: 'Vocal Resonance',
    primaryHue: 38,
    secondaryHue: 192,
    accentHue: 48,
    rotSpeed: 0.012,
    fogDensity: 0.85,
    harmonicAmp: 0.26,
    pulseRate: 3.8,
  },
  handoff: {
    mode: 'handoff',
    label: 'Agent Telemetry',
    primaryHue: 182,
    secondaryHue: 40,
    accentHue: 200,
    rotSpeed: 0.011,
    fogDensity: 0.64,
    harmonicAmp: 0.12,
    pulseRate: 2.6,
  },
};

export const ORB_FIBONACCI_NODES = 144;
/** A smaller counter-rotating lattice inside the outer shell. */
export const ORB_INNER_SHELL_NODES = 55;
export const ORB_FOG_CLOUD_COUNT = 40;
export const ORB_PARTICLE_COUNT = 280;

/**
 * How far the Zen canvas reaches past its layout box on every side, as a
 * fraction of that box. The corona blooms to ~2.4x the orb's radius, which a
 * canvas the size of the box would cut off square; the orb itself is still
 * sized from the box, so only the glow uses the extra room.
 */
export const ORB_ZEN_GLOW_BLEED = 0.35;

/** The orb's resting radius as a fraction of its layout box's shorter side. */
export const ORB_RADIUS_FRACTION = 0.3;

/** Backing-store pixel ratio cap for the oversized Zen canvas. */
export const ORB_ZEN_MAX_DPR = 1.5;

/** The orb's radius: swells with speech (0..1) and a gentle pulse (-1..1). */
export function orbBaseRadius(layoutMin: number, speech: number, pulse: number): number {
  return layoutMin * ORB_RADIUS_FRACTION * (1 + speech * 0.14 + pulse * 0.03);
}

/**
 * Where the edge mask starts fading, as a fraction of the distance from the
 * centre to the canvas edge. Everything drawn has faded to nothing by the edge
 * itself, so no layer can meet it with a hard line, whatever its radius.
 */
export const ORB_EDGE_FADE_START = 0.82;

/**
 * A CSS mask rather than a per-frame `destination-in` fill: the compositor
 * applies it once to the whole canvas. `closest-side` makes it an ellipse
 * inscribed in the canvas, so a wide docked canvas keeps its horizontal room.
 */
const ORB_EDGE_MASK = `radial-gradient(closest-side, #000 ${ORB_EDGE_FADE_START * 100}%, transparent 100%)`;

/**
 * The corona's outer radius: grows with speech and breathes with `breath`
 * (-1..1), but never past `maxRadius`, so its gradient always reaches
 * transparent inside the canvas. The cap breathes too, so a corona held at
 * the cap (the docked canvas, where there is no spare room) still visibly
 * changes size.
 */
export function orbCoronaRadius(
  baseRadius: number,
  speech: number,
  breath: number,
  maxRadius: number,
): number {
  const cap = maxRadius * (0.93 + 0.035 * (breath + 1));
  return Math.min(cap, baseRadius * (1.85 + speech * 0.35) * (1 + breath * 0.07));
}

type FogCloud3D = {
  theta: number;
  phi: number;
  radiusFrac: number;
  sizeFrac: number;
  vTheta: number;
  vPhi: number;
  hueShift: number;
  alpha: number;
};

type OrbParticle3D = {
  theta: number;
  phi: number;
  radiusFrac: number;
  vTheta: number;
  vPhi: number;
  vRadial: number;
  size: number;
  alpha: number;
  hueOffset: number;
};

/**
 * Reads the live `--companion-level` CSS custom property written by `speaker.ts`
 * on `document.documentElement` (clamped to `0..1`).
 */
export function readCompanionSpeechLevel(): number {
  if (typeof document === 'undefined') return 0;
  const raw = document.documentElement.style.getPropertyValue(COMPANION_LEVEL_VAR).trim();
  if (!raw) return 0;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

/**
 * Computes a 3D point on the volumetric Jarvis sphere with spherical-harmonic
 * acoustic displacement (`Y_l^m(theta, phi)`) driven by speech & state energy.
 */
export function computeSphericalHarmonicVertex(
  index: number,
  total: number,
  radius: number,
  timeSec: number,
  harmonicAmp: number,
  speechLevel: number,
  mode: OrbStateVisualProfile['mode'],
): Vec3 {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const yBase = 1 - (2 * (index + 0.5)) / total;
  const rSlice = Math.sqrt(Math.max(0, 1 - yBase * yBase));
  const theta = index * goldenAngle;
  const phi = Math.acos(Math.max(-1, Math.min(1, yBase)));

  // Multi-lobe spherical harmonics: responds to voice formants when speaking/listening
  const h1 = Math.sin(theta * 3 + timeSec * 4.2) * Math.sin(phi * 2 - timeSec * 3.1);
  const h2 = Math.cos(theta * 5 - timeSec * 5.5) * Math.sin(phi * 3 + timeSec * 2.7);
  const vocalRipple =
    mode === 'speaking'
      ? (h1 * 0.65 + h2 * 0.35) * (harmonicAmp + speechLevel * 0.34)
      : mode === 'thinking'
        ? Math.sin(theta * 6 + phi * 4 + timeSec * 7) * harmonicAmp
        : mode === 'listening'
          ? Math.cos(phi * 4 - timeSec * 5) * (harmonicAmp + speechLevel * 0.22)
          : h1 * harmonicAmp;

  const r = radius * (1 + vocalRipple);
  return [
    r * rSlice * Math.cos(theta),
    r * yBase,
    r * rSlice * Math.sin(theta),
  ];
}

/**
 * 3D Jarvis-inspired Volumetric Spherical Orb Visualizer for the Companion.
 *
 * Built on `@midnite/studio-frame`'s `rotate3D` and `project3D` foundation:
 * - **Breathing Corona & Bright Core**: a radial halo that pulses in size and
 *   brightness, over a white-hot core added with `lighter` compositing.
 * - **Volumetric Fog / Cloud Nebula Core**: 40 depth-sorted 3D radial nebula clouds
 *   billowing inside and around the sphere.
 * - **3D Spherical Fibonacci Geodesic Shell**: 144 spherical-harmonic vertices with
 *   triangulated holographic filaments that deform with live speech (`--companion-level`),
 *   around a 55-vertex inner lattice that counter-rotates.
 * - **Jarvis Segmented 3D Holographic Gimbal Rings**: 4 counter-rotating 3D telemetry
 *   and equatorial voice-waveform rings.
 * - **280-Particle 3D Spherical Cloud Swarm**: Centripetal intake during `listening`,
 *   vocal surge during `speaking`, rapid synaptic swirl during `thinking`.
 * - **State-Specific Synaptic Arcs & Vocal Resonance Shells**: Distinct animations
 *   and color palettes for `idle`, `listening`, `thinking`, `speaking`, and `handoff`.
 *
 * Nothing it draws is ever cut off by the canvas edge: a CSS edge mask fades
 * every layer out before the edge, and in Zen the canvas bleeds
 * {@link ORB_ZEN_GLOW_BLEED} past its box so the corona has room to bloom.
 */
export function CompanionOrb({
  state,
  zen = false,
  compact = false,
}: {
  state: CompanionState;
  zen?: boolean;
  /** Zen only: a ~240px piece for hosts that stack it with text (the screensaver). */
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<CompanionState>(state);
  stateRef.current = state;

  const animRef = useRef({
    rotX: 0.28,
    rotY: 0.45,
    rotZ: 0.12,
    hue: ORB_STATE_PROFILES[state].primaryHue,
    secHue: ORB_STATE_PROFILES[state].secondaryHue,
    accHue: ORB_STATE_PROFILES[state].accentHue,
    speechEnv: 0,
    pulsePhase: 0,
  });

  const fogCloudsRef = useRef<FogCloud3D[]>([]);
  const particlesRef = useRef<OrbParticle3D[]>([]);

  // Initialize deterministic 3D volumetric fog puffs and 3D spherical particles
  useEffect(() => {
    const clouds: FogCloud3D[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < ORB_FOG_CLOUD_COUNT; i++) {
      const y = 1 - (2 * (i + 0.5)) / ORB_FOG_CLOUD_COUNT;
      const phi = Math.acos(Math.max(-1, Math.min(1, y)));
      const theta = i * golden;
      const layer = i % 3; // 0 = inner plasma, 1 = mid nebula, 2 = outer mist
      clouds.push({
        theta,
        phi,
        radiusFrac: layer === 0 ? 0.28 : layer === 1 ? 0.58 : 0.86,
        sizeFrac: layer === 0 ? 0.52 : layer === 1 ? 0.44 : 0.38,
        vTheta: (0.003 + (i % 5) * 0.0012) * (i % 2 === 0 ? 1 : -1),
        vPhi: (0.002 + (i % 4) * 0.0008) * (i % 3 === 0 ? 1 : -1),
        hueShift: ((i * 19) % 50) - 25,
        alpha: layer === 0 ? 0.26 : layer === 1 ? 0.18 : 0.12,
      });
    }
    fogCloudsRef.current = clouds;

    const particles: OrbParticle3D[] = [];
    for (let i = 0; i < ORB_PARTICLE_COUNT; i++) {
      // 11 is coprime with the count, so this visits every band once; a shared factor clumps the swarm into rings.
      const y = 1 - (2 * ((i * 11) % ORB_PARTICLE_COUNT + 0.5)) / ORB_PARTICLE_COUNT;
      particles.push({
        theta: (i / ORB_PARTICLE_COUNT) * Math.PI * 2,
        phi: Math.acos(Math.max(-1, Math.min(1, y))),
        radiusFrac: 0.35 + ((i * 13) % 100) / 100 * 0.95,
        vTheta: (0.005 + (i % 7) * 0.0015) * (i % 2 === 0 ? 1 : -1),
        vPhi: (0.003 + (i % 5) * 0.001) * (i % 3 === 0 ? 1 : -1),
        vRadial: 0.004 + (i % 4) * 0.0015,
        size: 1.1 + (i % 4) * 0.55,
        alpha: 0.35 + (i % 5) * 0.12,
        hueOffset: ((i * 17) % 60) - 30,
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    let active = true;
    let rafId: number | null = null;

    const renderFrame = () => {
      if (!active) return;

      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }

      // Skip unmocked jsdom getContext('2d') to avoid noisy jsdom stderr in unit tests
      const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
      const isMockedContext =
        typeof canvas.getContext === 'function' && 'mock' in canvas.getContext;
      if (isJsdom && !isMockedContext) {
        return;
      }

      let ctx: CanvasRenderingContext2D | null = null;
      try {
        ctx = canvas.getContext('2d');
      } catch {
        ctx = null;
      }
      if (!ctx) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }

      // The Zen canvas covers ~2.9x its box's area for the glow, which is soft enough not to need full retina.
      const dpr = Math.min(window.devicePixelRatio || 1, zen ? ORB_ZEN_MAX_DPR : Infinity);
      const width = canvas.clientWidth || 280;
      const height = canvas.clientHeight || 112;

      // Rounded: canvas dimensions are integers, so a fractional product would reallocate every frame.
      const backingWidth = Math.round(width * dpr);
      const backingHeight = Math.round(height * dpr);
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // If parent panel has inline animation frozen (e.g. edge-glow pixel calibration), leave canvas clear
      const parentPanel = canvas.closest('[data-testid="companion-panel"]') as HTMLElement | null;
      if (parentPanel && parentPanel.style.animation === 'none') {
        ctx.restore();
        return;
      }

      const domAttrState = parentPanel?.getAttribute('data-companion-state') as CompanionState | null;
      const curState =
        domAttrState && domAttrState in ORB_STATE_PROFILES ? domAttrState : stateRef.current;
      const profile = ORB_STATE_PROFILES[curState];
      const anim = animRef.current;
      const nowMs = performance.now();
      const timeSec = nowMs * 0.001;

      // Respect reduced-motion and window-focus gates
      const reducedMotion =
        typeof document !== 'undefined' &&
        (document.documentElement.getAttribute('data-motion') === 'reduced' ||
          document.documentElement.getAttribute('data-window-focused') === 'false');

      // Smoothly interpolate color palette toward active state profile
      const lerpHue = (from: number, to: number, factor: number) => {
        const diff = ((((to - from) % 360) + 540) % 360) - 180;
        return (from + diff * factor + 360) % 360;
      };
      anim.hue = lerpHue(anim.hue, profile.primaryHue, 0.08);
      anim.secHue = lerpHue(anim.secHue, profile.secondaryHue, 0.08);
      anim.accHue = lerpHue(anim.accHue, profile.accentHue, 0.08);

      // Read live speech level from `--companion-level` + natural vocal formant oscillation when speaking
      const rawLevel = readCompanionSpeechLevel();
      const syntheticVocal =
        profile.mode === 'speaking' && !reducedMotion
          ? 0.28 +
            0.22 * Math.sin(timeSec * 9.5) * Math.cos(timeSec * 14.2) +
            0.15 * Math.sin(timeSec * 21.0)
          : profile.mode === 'listening' && !reducedMotion
            ? 0.14 + 0.1 * Math.sin(timeSec * 4.8)
            : 0;
      const targetSpeech = Math.min(1, Math.max(rawLevel, Math.max(0, syntheticVocal)));
      anim.speechEnv += (targetSpeech - anim.speechEnv) * (targetSpeech > anim.speechEnv ? 0.35 : 0.14);
      const speech = anim.speechEnv;

      if (!reducedMotion) {
        const speedBoost = 1 + speech * 1.45;
        anim.rotX += profile.rotSpeed * 0.75 * speedBoost;
        anim.rotY += profile.rotSpeed * 1.15 * speedBoost;
        anim.rotZ += profile.rotSpeed * 0.55 * speedBoost;
        anim.pulsePhase += 0.04 * profile.pulseRate;
      }

      const centerX = width / 2;
      const centerY = height / 2;
      const canvasHalf = Math.min(width, height) / 2;
      // The orb is sized from the layout box; in Zen the canvas is larger than that box.
      const layoutMin = Math.min(width, height) / (zen ? 1 + 2 * ORB_ZEN_GLOW_BLEED : 1);
      const baseRadius = orbBaseRadius(layoutMin, speech, Math.sin(anim.pulsePhase));
      const fov = 320;
      const camDist = 340;
      // Slow breathing (~7s) with a faster overtone, independent of speech.
      const breath = reducedMotion ? 0 : Math.sin(timeSec * 0.9) * 0.75 + Math.sin(timeSec * 2.3 + 1.3) * 0.25;

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 1: Outer Volumetric Atmospheric Corona & Nebula Halo
      // ═══════════════════════════════════════════════════════════════════════
      const coronaRadius = orbCoronaRadius(baseRadius, speech, breath, canvasHalf);
      const coronaGlow = 1 + breath * 0.18;
      const coronaGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.1,
        centerX,
        centerY,
        coronaRadius,
      );
      coronaGrad.addColorStop(
        0,
        `hsla(${anim.accHue}, 95%, 70%, ${(0.34 + speech * 0.28) * coronaGlow})`,
      );
      coronaGrad.addColorStop(
        0.38,
        `hsla(${anim.hue}, 92%, 56%, ${(0.18 + profile.fogDensity * 0.16 + speech * 0.18) * coronaGlow})`,
      );
      coronaGrad.addColorStop(
        0.72,
        `hsla(${anim.secHue}, 88%, 42%, ${0.07 + speech * 0.08})`,
      );
      coronaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = coronaGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coronaRadius, 0, Math.PI * 2);
      ctx.fill();

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 2: 3D Volumetric Fog / Cloud Nebula Puffs (Sorted Back-to-Front)
      // ═══════════════════════════════════════════════════════════════════════
      const clouds = fogCloudsRef.current;
      const projectedClouds: Array<{
        proj: ProjectedPoint;
        cloud: FogCloud3D;
      }> = [];

      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i];
        if (!c) continue;
        if (!reducedMotion) {
          c.theta += c.vTheta * (1 + speech * 2.2);
          c.phi += c.vPhi * (1 + speech * 1.6);
        }

        const r =
          baseRadius *
          c.radiusFrac *
          (1 + Math.sin(timeSec * 1.8 + i) * 0.08 + speech * 0.18);
        const sinP = Math.sin(c.phi);
        const x3 = r * sinP * Math.cos(c.theta);
        const y3 = r * Math.cos(c.phi);
        const z3 = r * sinP * Math.sin(c.theta);

        const rotated = rotate3D([x3, y3, z3], anim.rotX * 0.6, anim.rotY * 0.8, anim.rotZ * 0.5);
        const proj = project3D(rotated, centerX, centerY, fov, camDist);
        if (proj.visible) {
          projectedClouds.push({ proj, cloud: c });
        }
      }

      projectedClouds.sort((a, b) => b.proj.z - a.proj.z);

      for (let i = 0; i < projectedClouds.length; i++) {
        const item = projectedClouds[i];
        if (!item) continue;
        const { proj, cloud } = item;
        const puffR = Math.max(8, baseRadius * cloud.sizeFrac * proj.scale * (1 + speech * 0.25));
        const cHue = (anim.hue + cloud.hueShift + 360) % 360;
        const alpha = Math.min(
          0.48,
          cloud.alpha * profile.fogDensity * proj.scale * (1 + speech * 0.65),
        );

        const puffGrad = ctx.createRadialGradient(
          proj.sx,
          proj.sy,
          puffR * 0.08,
          proj.sx,
          proj.sy,
          puffR,
        );
        puffGrad.addColorStop(0, `hsla(${cHue}, 95%, 72%, ${alpha})`);
        puffGrad.addColorStop(0.5, `hsla(${anim.secHue}, 88%, 54%, ${alpha * 0.45})`);
        puffGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = puffGrad;
        ctx.beginPath();
        ctx.arc(proj.sx, proj.sy, puffR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bright core: added light, so it lifts whatever fog sits behind it.
      const coreR = baseRadius * 0.46 * (1 + breath * 0.05 + speech * 0.25);
      const coreGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreR);
      coreGrad.addColorStop(0, `hsla(${anim.accHue}, 100%, 94%, ${0.7 + speech * 0.2})`);
      coreGrad.addColorStop(0.22, `hsla(${anim.accHue}, 100%, 84%, ${0.55 + speech * 0.2})`);
      coreGrad.addColorStop(0.6, `hsla(${anim.hue}, 95%, 64%, 0.2)`);
      coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 3: 3D Spherical Fibonacci Geodesic Shell & Acoustic Surface
      // ═══════════════════════════════════════════════════════════════════════
      const projectedNodes: ProjectedPoint[] = [];
      for (let i = 0; i < ORB_FIBONACCI_NODES; i++) {
        const v3d = computeSphericalHarmonicVertex(
          i,
          ORB_FIBONACCI_NODES,
          baseRadius,
          timeSec,
          profile.harmonicAmp,
          speech,
          profile.mode,
        );
        const rotated = rotate3D(v3d, anim.rotX, anim.rotY, anim.rotZ);
        projectedNodes.push(project3D(rotated, centerX, centerY, fov, camDist));
      }

      // Inner lattice: a smaller shell spinning the other way, seen through the outer one.
      const innerNodes: ProjectedPoint[] = [];
      for (let i = 0; i < ORB_INNER_SHELL_NODES; i++) {
        const v3d = computeSphericalHarmonicVertex(
          i,
          ORB_INNER_SHELL_NODES,
          baseRadius * 0.56,
          timeSec * 1.3,
          profile.harmonicAmp * 0.6,
          speech,
          profile.mode,
        );
        const rotated = rotate3D(v3d, -anim.rotX * 1.4, -anim.rotY * 1.2, anim.rotZ * 0.8);
        innerNodes.push(project3D(rotated, centerX, centerY, fov, camDist));
      }
      // Neighbour offsets on a Fibonacci sphere are Fibonacci numbers; joining them triangulates it.
      strokeLattice(ctx, innerNodes, [5, 8, 13], anim.accHue, 0.38 + speech * 0.3, 0.75);
      strokeLattice(ctx, projectedNodes, [8, 13, 21], anim.hue, 0.28 + speech * 0.42, 1, anim.secHue);

      // Glowing 3D geodesic surface nodes
      for (let i = 0; i < projectedNodes.length; i++) {
        const pt = projectedNodes[i];
        if (!pt || !pt.visible) continue;
        const isFront = pt.z < 0;
        const nodeR = Math.max(0.8, (isFront ? 1.8 + speech * 1.4 : 1.1) * pt.scale);
        ctx.fillStyle = `hsla(${isFront ? anim.accHue : anim.hue}, 98%, 78%, ${
          isFront ? 0.78 : 0.25
        })`;
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, nodeR, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < innerNodes.length; i++) {
        const pt = innerNodes[i];
        if (!pt || !pt.visible) continue;
        ctx.fillStyle = `hsla(${anim.accHue}, 100%, 85%, ${pt.z < 0 ? 0.7 : 0.3})`;
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, Math.max(0.6, (pt.z < 0 ? 1.3 + speech : 0.8) * pt.scale), 0, Math.PI * 2);
        ctx.fill();
      }

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 4: Jarvis Segmented 3D Holographic Gimbal Rings & Voice Waveform
      // ═══════════════════════════════════════════════════════════════════════
      const ringConfigs: Array<{
        radiusMult: number;
        tilt: Vec3;
        hue: number;
        dashed: boolean;
        voiceMod: boolean;
      }> = [
        {
          radiusMult: 1.16,
          tilt: [anim.rotX * 0.9, anim.rotY * -1.1, 0.25],
          hue: anim.accHue,
          dashed: false,
          voiceMod: true,
        },
        {
          radiusMult: 1.28,
          tilt: [1.15, anim.rotY * 0.85, -anim.rotZ * 1.2],
          hue: anim.hue,
          dashed: true,
          voiceMod: false,
        },
        {
          radiusMult: 1.4,
          tilt: [-0.65, -anim.rotY * 0.7, anim.rotZ * 1.35],
          hue: anim.secHue,
          dashed: true,
          voiceMod: false,
        },
        // Zen only: docked, a ring this wide would turn into the edge fade and look truncated.
        ...(zen
          ? [
              {
                radiusMult: 1.5,
                tilt: [Math.PI / 2 + anim.rotX * 0.3, anim.rotZ * 0.6, anim.rotY * 0.4] as Vec3,
                hue: anim.accHue,
                dashed: true,
                voiceMod: false,
              },
            ]
          : []),
      ];

      for (let rIdx = 0; rIdx < ringConfigs.length; rIdx++) {
        const rc = ringConfigs[rIdx];
        if (!rc) continue;
        const ringR = baseRadius * rc.radiusMult;
        const segs = 56;

        ctx.strokeStyle = `hsla(${rc.hue}, 95%, 70%, ${0.34 + speech * 0.38})`;
        ctx.lineWidth = rc.voiceMod ? 1.5 + speech * 1.4 : 1.1;
        ctx.beginPath();

        for (let s = 0; s <= segs; s++) {
          if (rc.dashed && Math.floor(s / 4) % 2 === 1) continue;
          const a = (s / segs) * Math.PI * 2;
          const waveOffset = rc.voiceMod
            ? Math.sin(a * 8 + timeSec * 12) * baseRadius * 0.14 * speech
            : 0;
          const rad = ringR + waveOffset;
          const pt3d = rotate3D(
            [Math.cos(a) * rad, Math.sin(a) * rad, 0],
            rc.tilt[0],
            rc.tilt[1],
            rc.tilt[2],
          );
          const proj = project3D(pt3d, centerX, centerY, fov, camDist);
          if (s === 0 || (rc.dashed && s % 4 === 0)) {
            ctx.moveTo(proj.sx, proj.sy);
          } else {
            ctx.lineTo(proj.sx, proj.sy);
          }
        }
        ctx.stroke();
      }

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 5: 3D Spherical Particle Swarm + Synaptic Arcs / Vocal Shells
      // ═══════════════════════════════════════════════════════════════════════
      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!p) continue;

        if (!reducedMotion) {
          p.theta += p.vTheta * (1 + speech * 2.5);
          p.phi += p.vPhi * (1 + speech * 1.8);

          // Inward vortex when listening, outward surge when speaking
          if (profile.mode === 'listening') {
            p.radiusFrac -= p.vRadial * 1.4;
            if (p.radiusFrac < 0.25) p.radiusFrac = 1.35;
          } else if (profile.mode === 'speaking') {
            p.radiusFrac += p.vRadial * (0.6 + speech * 2.2);
            if (p.radiusFrac > 1.42) p.radiusFrac = 0.3;
          }
        }

        const pr = baseRadius * p.radiusFrac;
        const sinP = Math.sin(p.phi);
        const px3 = pr * sinP * Math.cos(p.theta);
        const py3 = pr * Math.cos(p.phi);
        const pz3 = pr * sinP * Math.sin(p.theta);

        const rotP = rotate3D([px3, py3, pz3], -anim.rotX * 0.5, anim.rotY * 0.9, anim.rotZ * 0.4);
        const proj = project3D(rotP, centerX, centerY, fov, camDist);
        if (!proj.visible) continue;

        const pHue = (anim.hue + p.hueOffset + 360) % 360;
        const dotR = Math.max(0.7, p.size * proj.scale * (1 + speech * 0.6));
        ctx.fillStyle = `hsla(${pHue}, 96%, 76%, ${Math.min(0.9, p.alpha * proj.scale)})`;
        ctx.beginPath();
        ctx.arc(proj.sx, proj.sy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      // State-specific interior discharges:
      // - `thinking`: Neural synaptic lightning arcs jumping between 3D sphere nodes
      // - `speaking`: Concentric vocal pressure shells pulsing outward
      if (profile.mode === 'thinking') {
        const arcCount = 7;
        for (let a = 0; a < arcCount; a++) {
          const idxA = Math.floor((a * 13 + Math.floor(timeSec * 16)) % projectedNodes.length);
          const idxB = (idxA + 29) % projectedNodes.length;
          const ptA = projectedNodes[idxA];
          const ptB = projectedNodes[idxB];
          if (!ptA || !ptB || !ptA.visible || !ptB.visible) continue;

          const midX = (ptA.sx + ptB.sx) * 0.5 + Math.sin(timeSec * 22 + a * 3) * 9;
          const midY = (ptA.sy + ptB.sy) * 0.5 + Math.cos(timeSec * 22 + a * 3) * 9;

          ctx.strokeStyle = `hsla(${anim.accHue}, 100%, 78%, 0.55)`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(ptA.sx, ptA.sy);
          ctx.lineTo(midX, midY);
          ctx.lineTo(ptB.sx, ptB.sy);
          ctx.stroke();
        }
      } else if (profile.mode === 'speaking' && speech > 0.08) {
        const shellCount = 2;
        for (let s = 0; s < shellCount; s++) {
          const phase = ((timeSec * 1.8 + s * 0.5) % 1);
          const shellR = baseRadius * (0.45 + phase * (0.95 + speech * 0.45));
          const shellAlpha = (1 - phase) * (0.28 + speech * 0.42);
          ctx.strokeStyle = `hsla(${anim.accHue}, 98%, 72%, ${shellAlpha})`;
          ctx.lineWidth = 1.4 + speech * 1.4;
          ctx.beginPath();
          ctx.arc(centerX, centerY, shellR, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();

      if (!reducedMotion) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => {
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [state, zen]);

  const profile = ORB_STATE_PROFILES[state];

  return (
    <div
      data-testid="companion-orb"
      data-orb-mode={profile.mode}
      data-orb-size={zen ? 'zen' : 'docked'}
      aria-hidden="true"
      /*
        Docked: h-72 (288px) — 2.57x the original h-28. Zen: a 440-520px
        centred stage piece. Transparent either way, so the panel-glow pixel
        spec's ground patch still reads pure panel fill.
      */
      className={
        zen
          ? compact
            ? 'pointer-events-none relative flex h-[200px] w-[200px] shrink-0 items-center justify-center overflow-visible bg-transparent sm:h-[240px] sm:w-[240px]'
            : 'pointer-events-none relative flex h-[440px] w-[440px] shrink-0 items-center justify-center overflow-visible bg-transparent sm:h-[520px] sm:w-[520px]'
          : 'pointer-events-none relative mx-2 my-1 flex h-72 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-transparent'
      }
    >
      <canvas
        ref={canvasRef}
        data-testid="companion-orb-canvas"
        className={zen ? 'absolute' : 'h-full w-full'}
        style={zen ? ZEN_CANVAS_STYLE : EDGE_MASK_STYLE}
      />
      <span
        data-testid="companion-orb-mode-badge"
        className="absolute bottom-1 right-2 rounded-full border border-white/10 bg-black/35 px-2 py-0.5 text-[9px] font-medium tracking-wider text-white/70 uppercase backdrop-blur-sm"
      >
        {profile.label}
      </span>
    </div>
  );
}

const EDGE_MASK_STYLE: CSSProperties = { maskImage: ORB_EDGE_MASK, WebkitMaskImage: ORB_EDGE_MASK };

const ZEN_CANVAS_STYLE: CSSProperties = {
  ...EDGE_MASK_STYLE,
  left: `${-ORB_ZEN_GLOW_BLEED * 100}%`,
  top: `${-ORB_ZEN_GLOW_BLEED * 100}%`,
  width: `${(1 + 2 * ORB_ZEN_GLOW_BLEED) * 100}%`,
  height: `${(1 + 2 * ORB_ZEN_GLOW_BLEED) * 100}%`,
};

/**
 * Joins each vertex to the ones `offsets` further along the Fibonacci spiral —
 * on a Fibonacci sphere a vertex's nearest neighbours sit a Fibonacci number of
 * indices away, so this triangulates the shell. Offsets never wrap past the end,
 * which would join the two poles straight through the orb. Edges are batched
 * into one path for the front of the shell (midpoint `z < 0`, in `frontHue` at
 * `frontAlpha`) and one faint path for the back (in `backHue` when given).
 */
function strokeLattice(
  ctx: CanvasRenderingContext2D,
  nodes: readonly ProjectedPoint[],
  offsets: readonly number[],
  frontHue: number,
  frontAlpha: number,
  widthScale: number,
  backHue = frontHue,
): void {
  for (const front of [false, true]) {
    ctx.beginPath();
    for (let i = 0; i < nodes.length; i++) {
      const pA = nodes[i];
      if (!pA || !pA.visible) continue;
      for (const offset of offsets) {
        const pB = nodes[i + offset];
        // Classified by the edge's midpoint, so an edge over the limb is not drawn bright end to end.
        if (!pB || !pB.visible || pA.z + pB.z < 0 !== front) continue;
        ctx.moveTo(pA.sx, pA.sy);
        ctx.lineTo(pB.sx, pB.sy);
      }
    }
    ctx.strokeStyle = front
      ? `hsla(${frontHue}, 94%, 68%, ${Math.min(0.72, frontAlpha)})`
      : `hsla(${backHue}, 94%, 68%, 0.1)`;
    ctx.lineWidth = (front ? 0.95 : 0.55) * widthScale;
    ctx.stroke();
  }
}
