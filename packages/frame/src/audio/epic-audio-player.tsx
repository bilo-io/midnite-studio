import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LuMusic,
  LuPause,
  LuPlay,
  LuRepeat,
  LuRotateCcw,
  LuSparkles,
  LuVolume1,
  LuVolume2,
  LuVolumeX,
} from 'react-icons/lu';

export type EpicAudioPlayerProps = {
  src: string;
  fileName: string;
  /** Optional accessible label for the underlying `<audio>` element. */
  ariaLabel?: string;
  /** Start playback automatically on mount. */
  autoPlay?: boolean;
  /** Seek to this timestamp (in seconds) once metadata loads. */
  resumeAt?: number;
  /** Callback fired with the track's duration (in seconds) when metadata loads. */
  onLoadedMetadataDuration?: (duration: number) => void;
  /** Progress callback for Media ▸ Library playback tracking. */
  onProgress?: (
    currentTime: number,
    duration: number,
    state: 'playing' | 'paused' | 'ended',
  ) => void;
  /** Additional container classes. */
  className?: string;
};

/**
 * Available 3D sacred geometry & abstract fractal topologies for the visualizer.
 * Automatically morphs every 8 to 16 beats (12 beats default) or on user click.
 */
export const SHAPE_NAMES = [
  'Tesseract Hypercube',
  'Menger Fractal Lattice',
  'Geodesic Lorenz Attractor',
  'Torus Knot Vortex',
  'Merkaba Fractal Star',
] as const;

export type ShapeKind = (typeof SHAPE_NAMES)[number];

export const SPECTRUM_NAMES = [
  'Cyber Neon',
  'Aurora Borealis',
  'Solar Flare',
  'Deep Cosmos',
] as const;

export type Vec3 = [number, number, number];

export type ProjectedPoint = {
  sx: number;
  sy: number;
  z: number;
  scale: number;
  visible: boolean;
};

type Particle3D = {
  theta: number;
  phi: number;
  baseRadius: number;
  radius: number;
  vTheta: number;
  vPhi: number;
  hueOffset: number;
  size: number;
  alpha: number;
  layer: number;
};

type Shockwave3D = {
  radius: number;
  maxRadius: number;
  tiltX: number;
  tiltY: number;
  alpha: number;
  hue: number;
};

export const PARTICLE_COUNT_3D = 160;
const VERTEX_COUNT_3D = 96;

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Computes the 3-tier beat intensity glow level from total audio energy and beat pulse.
 */
export function computeGlowTier(totalEnergy: number, beatPulse: number): 1 | 2 | 3 {
  const composite = totalEnergy * 0.72 + beatPulse * 0.48;
  if (composite > 0.56 || (beatPulse > 0.65 && totalEnergy > 0.34)) return 3;
  if (composite > 0.26 || beatPulse > 0.3) return 2;
  return 1;
}

/**
 * Rotates a 3D point `(x, y, z)` around X, Y, and Z Euler axes.
 */
export function rotate3D(v: Vec3, rx: number, ry: number, rz: number): Vec3 {
  const [x0, y0, z0] = v;

  // Rotate around X
  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const y1 = y0 * cosX - z0 * sinX;
  const z1 = y0 * sinX + z0 * cosX;

  // Rotate around Y
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const x2 = x0 * cosY + z1 * sinY;
  const z2 = -x0 * sinY + z1 * cosY;

  // Rotate around Z
  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);
  const x3 = x2 * cosZ - y1 * sinZ;
  const y3 = x2 * sinZ + y1 * cosZ;

  return [x3, y3, z2];
}

/**
 * Perspective-projects a 3D point `(x, y, z)` onto 2D canvas coordinates.
 */
export function project3D(
  v: Vec3,
  centerX: number,
  centerY: number,
  fov: number = 420,
  camDist: number = 460,
): ProjectedPoint {
  const [x, y, z] = v;
  const depth = fov + z + camDist;
  if (depth <= 25) {
    return { sx: centerX, sy: centerY, z, scale: 0, visible: false };
  }
  const scale = fov / depth;
  return {
    sx: centerX + x * scale,
    sy: centerY + y * scale,
    z,
    scale,
    visible: true,
  };
}

/**
 * Calculates a 3D radial multiplier for a given shape type at spherical angles `(theta, phi)`.
 */
export function getShapeRadiusMultiplier(
  shapeIndex: number,
  theta: number,
  phi: number = Math.PI / 2,
): number {
  const idx = ((shapeIndex % SHAPE_NAMES.length) + SHAPE_NAMES.length) % SHAPE_NAMES.length;
  switch (idx) {
    case 0: {
      // Tesseract Hypercube — 4D hyper-faceted projection profile
      const c4 = Math.abs(Math.cos(theta * 2)) + Math.abs(Math.sin(phi * 2)) * 0.35;
      return 0.78 + 0.34 * Math.min(1.3, c4);
    }
    case 1: {
      // Menger Fractal Lattice — self-similar recursive harmonic steps
      const f1 = Math.abs(Math.cos(theta * 3));
      const f2 = Math.abs(Math.sin(theta * 9 + phi * 3)) * 0.5;
      const f3 = Math.abs(Math.cos(theta * 27 - phi * 6)) * 0.25;
      return 0.68 + 0.36 * (f1 + f2 + f3);
    }
    case 2: {
      // Geodesic Lorenz Attractor — chaotic double-lobe spiral harmonic
      const lorenz = Math.sin(theta * 2) * Math.cos(phi * 3) + Math.cos(theta * 5) * 0.4;
      return 0.75 + 0.38 * Math.abs(lorenz);
    }
    case 3: {
      // Torus Knot Vortex — (3,5) braided trefoil-cinquefoil profile
      const knot = Math.sin(theta * 3 + phi * 5) * 0.5 + Math.cos(theta * 5 - phi * 3) * 0.5;
      return 0.74 + 0.42 * (knot * 0.5 + 0.5);
    }
    case 4: {
      // Merkaba Fractal Star — 8-pointed counter-tetrahedral star tips
      const star = Math.pow(Math.abs(Math.sin(theta * 4) * Math.sin(phi * 2)), 0.65);
      return 0.66 + 0.52 * star;
    }
    default:
      return 1.0;
  }
}

/**
 * Generates normalized 3D coordinates `(x, y, z)` in `[-1.4, 1.4]` for vertex `i` of `count`
 * for each of the 5 3D sacred-geometry & fractal shapes.
 */
export function compute3DShapeVertex(
  shapeIndex: number,
  i: number,
  count: number,
  timeSec: number,
): Vec3 {
  const idx = ((shapeIndex % SHAPE_NAMES.length) + SHAPE_NAMES.length) % SHAPE_NAMES.length;
  const t = i / count;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  switch (idx) {
    case 0: {
      // 0: Tesseract Hypercube (4D -> 3D stereographic projection of nested cubes + hyper-struts)
      const cubeIdx = i % 16;
      const tier = Math.floor(i / 16); // 0..5 sub-divisions along hyper-edges
      const x4 = cubeIdx & 1 ? 1 : -1;
      const y4 = cubeIdx & 2 ? 1 : -1;
      const z4 = cubeIdx & 4 ? 1 : -1;
      const w4 = cubeIdx & 8 ? 1 : -1;

      // Interpolate along hyper-edges for higher tiers so all 96 vertices form the 4D wireframe
      const nextIdx = (cubeIdx + tier) % 16;
      const nx4 = nextIdx & 1 ? 1 : -1;
      const ny4 = nextIdx & 2 ? 1 : -1;
      const nz4 = nextIdx & 4 ? 1 : -1;
      const nw4 = nextIdx & 8 ? 1 : -1;
      const mix = (tier % 3) / 3;

      const px = x4 * (1 - mix) + nx4 * mix;
      const py = y4 * (1 - mix) + ny4 * mix;
      const pz = z4 * (1 - mix) + nz4 * mix;
      const pw = w4 * (1 - mix) + nw4 * mix;

      // 4D rotation in XW and ZW planes
      const angle4D = timeSec * 0.65;
      const cosW = Math.cos(angle4D);
      const sinW = Math.sin(angle4D);
      const rx = px * cosW - pw * sinW;
      const rw = px * sinW + pw * cosW;
      const rz = pz * Math.cos(angle4D * 0.7) - rw * Math.sin(angle4D * 0.7);
      const rw2 = pz * Math.sin(angle4D * 0.7) + rw * Math.cos(angle4D * 0.7);

      const wProj = 1.9 / (2.6 - rw2 * 0.55);
      return [rx * wProj * 0.72, py * wProj * 0.72, rz * wProj * 0.72];
    }

    case 1: {
      // 1: Menger Fractal Lattice (3-level recursive 3D octahedral/cubic sponge)
      const branch = i % 6;
      const subBranch = Math.floor(i / 6) % 4;
      const leaf = Math.floor(i / 24); // 0..3

      const axes: Vec3[] = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      const primary = axes[branch] ?? [1, 0, 0];
      const secondary = axes[(branch + subBranch + 1) % 6] ?? [0, 1, 0];
      const tertiary = axes[(branch + leaf * 2 + 2) % 6] ?? [0, 0, 1];

      const pulse = 1 + 0.12 * Math.sin(timeSec * 1.4 + leaf);
      const r1 = 0.78 * pulse;
      const r2 = 0.38 * (1 + 0.2 * Math.cos(timeSec * 2.1 + subBranch));
      const r3 = 0.19 * (leaf + 1) * 0.5;

      return [
        primary[0] * r1 + secondary[0] * r2 + tertiary[0] * r3,
        primary[1] * r1 + secondary[1] * r2 + tertiary[1] * r3,
        primary[2] * r1 + secondary[2] * r2 + tertiary[2] * r3,
      ];
    }

    case 2: {
      // 2: Geodesic Lorenz Attractor (Fibonacci geodesic shell + chaotic strange-attractor wings)
      const yGeo = 1 - 2 * t;
      const rGeo = Math.sqrt(Math.max(0, 1 - yGeo * yGeo));
      const theta = i * goldenAngle + timeSec * 0.3;

      // Chaotic double-scroll Lorenz-inspired harmonic warp
      const u = t * Math.PI * 4 + timeSec * 0.5;
      const lx = Math.sin(u) * Math.cos(u * 1.5);
      const ly = Math.sin(u * 2) * 0.75;
      const lz = Math.cos(u) * Math.sin(u * 2.5);

      return [
        rGeo * Math.cos(theta) * 0.75 + lx * 0.45,
        yGeo * 0.75 + ly * 0.45,
        rGeo * Math.sin(theta) * 0.75 + lz * 0.45,
      ];
    }

    case 3: {
      // 3: Torus Knot Vortex (3D (p=3, q=5) braided torus knot with helical cross-ribs)
      const p = 3;
      const q = 5;
      const u = t * Math.PI * 2;
      const tubePhase = (i % 4) * (Math.PI / 2) + timeSec * 1.2;
      const rCore = 0.78 + 0.32 * Math.cos(q * u + timeSec * 0.4);
      const tubeR = 0.16;

      const x = rCore * Math.cos(p * u) + tubeR * Math.cos(p * u) * Math.cos(tubePhase);
      const y = rCore * Math.sin(p * u) + tubeR * Math.sin(p * u) * Math.cos(tubePhase);
      const z = 0.48 * Math.sin(q * u + timeSec * 0.4) + tubeR * Math.sin(tubePhase);
      return [x, y, z];
    }

    case 4:
    default: {
      // 4: Merkaba Fractal Star (Dual counter-rotating 3D star tetrahedra + fractal tips)
      const tetraA: Vec3[] = [
        [0, 1.15, 0],
        [1.08, -0.38, 0.62],
        [-1.08, -0.38, 0.62],
        [0, -0.38, -1.24],
      ];
      const tetraB: Vec3[] = [
        [0, -1.15, 0],
        [1.08, 0.38, -0.62],
        [-1.08, 0.38, -0.62],
        [0, 0.38, 1.24],
      ];

      const isUp = i % 2 === 0;
      const baseSet = isUp ? tetraA : tetraB;
      const vIdx = Math.floor(i / 2) % 4;
      const nextVIdx = (vIdx + 1 + (Math.floor(i / 8) % 3)) % 4;
      const subStep = (Math.floor(i / 24) % 4) / 3;

      const v1 = baseSet[vIdx] ?? [0, 1, 0];
      const v2 = baseSet[nextVIdx] ?? [1, 0, 0];

      // Fractal tip protrusion at midpoint
      const midSpike = Math.sin(subStep * Math.PI) * (0.35 + 0.15 * Math.sin(timeSec * 2 + i));
      const nx = (v1[0] + v2[0]) * 0.5;
      const ny = (v1[1] + v2[1]) * 0.5;
      const nz = (v1[2] + v2[2]) * 0.5;

      return [
        v1[0] * (1 - subStep) + v2[0] * subStep + nx * midSpike,
        v1[1] * (1 - subStep) + v2[1] * subStep + ny * midSpike,
        v1[2] * (1 - subStep) + v2[2] * subStep + nz * midSpike,
      ];
    }
  }
}

export type EpicAudioVisualizerCanvasProps = {
  /** Whether playback is currently active. */
  isPlaying: boolean;
  /** Optional HTMLAudioElement to connect via Web Audio API AnalyserNode. */
  audioElement?: HTMLAudioElement | null;
  /** Controlled or uncontrolled current 3D shape index. */
  shapeIndex: number;
  /** Called when the automatic beat counter morphs into the next shape. */
  onShapeChange?: (nextShapeIdx: number) => void;
  /** Called whenever the 3-tier beat glow tier changes. */
  onGlowTierChange?: (tier: 1 | 2 | 3) => void;
  /** Vertical offset for the 3D origin (default `-24` to leave room for floating bottom controls). */
  centerYOffset?: number;
  className?: string;
};

/**
 * Pure 5-Layer 3D Audio Visualizer Canvas:
 * - Layer 1 (3D Shape): Receding 3D Sacred-Geometry Perspective Warp Tunnel & Horizon Grid
 * - Layer 2 (New Layer): Volumetric 3D Audio-Reactive Aurora & FFT Ribbon Curtains
 * - Layer 3 (3D Particles): 160-Particle 3D Spherical/Toroidal Swarm with 3D Constellation Web
 * - Layer 4 (3D Shape): Counter-Rotating 3D Gyroscopic Armillary & Opposite Fractal Cage
 * - Layer 5 (3D Shape + New Layer): Central Morphing 3D Polyhedral/Fractal Core + 3D Beat Shockwaves & God-Ray Plasma Arcs
 */
export function EpicAudioVisualizerCanvas({
  isPlaying,
  audioElement,
  shapeIndex,
  onShapeChange,
  onGlowTierChange,
  centerYOffset = -24,
  className,
}: EpicAudioVisualizerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const connectedElementRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const onShapeChangeRef = useRef(onShapeChange);
  onShapeChangeRef.current = onShapeChange;
  const onGlowTierChangeRef = useRef(onGlowTierChange);
  onGlowTierChangeRef.current = onGlowTierChange;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const audioElementRef = useRef(audioElement);
  audioElementRef.current = audioElement;

  const beatStateRef = useRef({
    energyHistory: [] as number[],
    lastBeatTime: 0,
    beatCount: 0,
    currentShape: shapeIndex,
    targetShape: shapeIndex,
    morphProgress: 1,
    beatPulse: 0,
    baseHue: 270,
    rotX: 0.35,
    rotY: 0.5,
    rotZ: 0.15,
    lastTier: 1 as 1 | 2 | 3,
  });

  const particlesRef = useRef<Particle3D[]>([]);
  const shockwavesRef = useRef<Shockwave3D[]>([]);

  // Sync external shapeIndex change into morph target
  useEffect(() => {
    const state = beatStateRef.current;
    if (shapeIndex !== state.targetShape) {
      state.currentShape = state.targetShape;
      state.targetShape = shapeIndex;
      state.morphProgress = 0;
    }
  }, [shapeIndex]);

  // Initialize 160 3D particles across 3 orbital shells
  useEffect(() => {
    const particles: Particle3D[] = [];
    for (let i = 0; i < PARTICLE_COUNT_3D; i++) {
      const layer = i % 3;
      const baseRadius = 105 + layer * 62 + (i % 17) * 5.5;
      particles.push({
        theta: (i / PARTICLE_COUNT_3D) * Math.PI * 2 + (i % 7) * 0.4,
        phi: Math.acos(1 - (2 * ((i * 13) % PARTICLE_COUNT_3D)) / PARTICLE_COUNT_3D),
        baseRadius,
        radius: baseRadius,
        vTheta: (0.004 + (i % 9) * 0.0012) * (i % 2 === 0 ? 1 : -1),
        vPhi: (0.0025 + (i % 5) * 0.001) * (i % 3 === 0 ? 1 : -1),
        hueOffset: ((i * 23) % 120) - 60,
        size: 1.4 + (i % 5) * 0.65,
        alpha: 0.35 + (i % 6) * 0.1,
        layer,
      });
    }
    particlesRef.current = particles;
  }, []);

  // Connect Web Audio API AnalyserNode when playing and an HTMLAudioElement is provided
  useEffect(() => {
    if (!isPlaying || !audioElement) return;

    if (!audioContextRef.current) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (typeof AudioContextClass === 'function') {
        try {
          const ctx = new AudioContextClass();
          audioContextRef.current = ctx;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.78;
          analyserRef.current = analyser;
        } catch {
          // AudioContext unavailable in restricted/test environments
        }
      }
    }

    const ctx = audioContextRef.current;
    const analyser = analyserRef.current;
    if (ctx && analyser && connectedElementRef.current !== audioElement) {
      try {
        const source = ctx.createMediaElementSource(audioElement);
        source.connect(analyser);
        analyser.connect(ctx.destination);
        connectedElementRef.current = audioElement;
      } catch {
        // Element may already be bound to a MediaElementSourceNode
      }
    }

    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }, [isPlaying, audioElement]);

  // Main 3D render loop
  useEffect(() => {
    let active = true;

    const render = () => {
      if (!active) return;

      const canvas = canvasRef.current;
      const state = beatStateRef.current;
      const particles = particlesRef.current;
      const shockwaves = shockwavesRef.current;

      if (!canvas) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth || 640;
      const displayHeight = canvas.clientHeight || 420;

      if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const width = displayWidth;
      const height = displayHeight;
      const centerX = width / 2;
      const centerY = height / 2 + centerYOffset;

      const analyser = analyserRef.current;
      const freqData = new Uint8Array(128);
      const isAudible =
        isPlayingRef.current || Boolean(audioElementRef.current && !audioElementRef.current.paused);

      let bassEnergy = 0;
      let midEnergy = 0;
      let trebleEnergy = 0;

      if (analyser && isAudible) {
        analyser.getByteFrequencyData(freqData);

        let bassSum = 0;
        for (let i = 0; i < 7; i++) bassSum += freqData[i] ?? 0;
        bassEnergy = bassSum / (7 * 255);

        let midSum = 0;
        for (let i = 7; i < 26; i++) midSum += freqData[i] ?? 0;
        midEnergy = midSum / (19 * 255);

        let trebleSum = 0;
        for (let i = 26; i < 65; i++) trebleSum += freqData[i] ?? 0;
        trebleEnergy = trebleSum / (39 * 255);
      }

      // Synthetic harmonic fallback when analyser bins are silent (e.g. test/CORS/WebAudio detached)
      if (isAudible && bassEnergy + midEnergy + trebleEnergy < 0.01) {
        const t = performance.now() * 0.0032;
        bassEnergy = 0.42 + 0.34 * Math.pow(Math.sin(t * 2.4) * 0.5 + 0.5, 2);
        midEnergy = 0.34 + 0.28 * Math.sin(t * 3.8 + 1.1);
        trebleEnergy = 0.28 + 0.22 * Math.cos(t * 5.3 + 2.2);
        for (let i = 0; i < freqData.length; i++) {
          freqData[i] = Math.floor(
            (Math.sin(t * 3.2 + i * 0.22) * 0.5 + 0.5) * (bassEnergy * 210 + 45),
          );
        }
      } else if (!isAudible) {
        const t = performance.now() * 0.001;
        bassEnergy = 0.07 + 0.04 * Math.sin(t * 1.4);
        midEnergy = 0.06 + 0.03 * Math.cos(t * 1.9);
        trebleEnergy = 0.05;
      }

      const totalEnergy = bassEnergy * 0.55 + midEnergy * 0.3 + trebleEnergy * 0.15;

      // Dynamic beat detection
      const now = performance.now();
      state.energyHistory.push(bassEnergy);
      if (state.energyHistory.length > 30) state.energyHistory.shift();

      const avgEnergy =
        state.energyHistory.reduce((a, b) => a + b, 0) / state.energyHistory.length || 0.1;

      if (
        isAudible &&
        bassEnergy > avgEnergy * 1.28 &&
        bassEnergy > 0.26 &&
        now - state.lastBeatTime > 230
      ) {
        state.lastBeatTime = now;
        state.beatCount += 1;
        state.beatPulse = 1.0;

        // Spawn a 3D shockwave torus ring on every beat
        shockwaves.push({
          radius: Math.min(width, height) * 0.14,
          maxRadius: Math.min(width, height) * (0.68 + bassEnergy * 0.35),
          tiltX: (state.beatCount % 5) * 0.35 - 0.7,
          tiltY: ((state.beatCount * 3) % 5) * 0.3 - 0.6,
          alpha: 0.75 + bassEnergy * 0.25,
          hue: (state.baseHue + (state.beatCount % 3) * 45) % 360,
        });
        if (shockwaves.length > 6) shockwaves.shift();

        // Morph to a new 3D shape every 12 beats (within the 8–16 beat window)
        if (state.beatCount % 12 === 0) {
          state.currentShape = state.targetShape;
          state.targetShape = (state.targetShape + 1) % SHAPE_NAMES.length;
          state.morphProgress = 0;
          onShapeChangeRef.current?.(state.targetShape);
        }
      }

      // Smooth morph transition & beat decay
      if (state.morphProgress < 1) {
        state.morphProgress = Math.min(1, state.morphProgress + 0.022);
      } else {
        state.currentShape = state.targetShape;
      }
      state.beatPulse *= 0.91;

      // Advance 3D Euler camera/object rotations & color spectrum
      const rotSpeed = isAudible ? 0.011 + totalEnergy * 0.028 : 0.0035;
      state.rotX += rotSpeed * 0.72;
      state.rotY += rotSpeed * 1.14;
      state.rotZ += rotSpeed * 0.48;
      state.baseHue = (state.baseHue + (isAudible ? 0.38 + totalEnergy * 1.25 : 0.09)) % 360;

      // Update 3-tier container glow state
      const newTier = computeGlowTier(totalEnergy, state.beatPulse);
      if (newTier !== state.lastTier) {
        state.lastTier = newTier;
        onGlowTierChangeRef.current?.(newTier);
      }

      const hue = state.baseHue;
      const secondaryHue = (hue + 64) % 360;
      const accentHue = (hue + 145) % 360;
      const timeSec = now * 0.001;
      const fov = 420 + state.beatPulse * 45;
      const camDist = 450;

      // Smooth cubic easing for morphing
      const rawT = state.morphProgress;
      const morphT = rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

      // ─── Deep Cosmic Backdrop ───
      ctx.fillStyle = 'rgba(5, 5, 14, 0.34)';
      ctx.fillRect(0, 0, width, height);

      const bgGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        12,
        centerX,
        centerY,
        Math.max(width, height) * 0.78,
      );
      bgGrad.addColorStop(0, `hsla(${hue}, 88%, 22%, ${0.2 + bassEnergy * 0.28})`);
      bgGrad.addColorStop(0.48, `hsla(${secondaryHue}, 82%, 12%, ${0.12 + midEnergy * 0.16})`);
      bgGrad.addColorStop(1, 'rgba(3, 3, 9, 0.92)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 1 (3D Shape #3): 3D Perspective Sacred-Geometry Warp Tunnel & Grid
      // ═══════════════════════════════════════════════════════════════════════
      const tunnelPlanes = 7;
      const tunnelSides = 4 + (state.targetShape % 4) * 2; // 4, 6, 8, 10 sides matching shape
      const tunnelRadius = Math.min(width, height) * 0.52;
      const tunnelSpeed = (timeSec * (isAudible ? 140 : 35)) % 110;

      for (let p = tunnelPlanes - 1; p >= 0; p--) {
        const zDepth = p * 110 - tunnelSpeed - 140;
        const depthAlpha = Math.max(0.02, (1 - p / tunnelPlanes) * (0.14 + bassEnergy * 0.16));
        ctx.strokeStyle = `hsla(${(hue + p * 18) % 360}, 85%, 60%, ${depthAlpha})`;
        ctx.lineWidth = 1 + (1 - p / tunnelPlanes) * 1.2;
        ctx.beginPath();

        for (let s = 0; s <= tunnelSides; s++) {
          const a = (s / tunnelSides) * Math.PI * 2 + state.rotZ * 0.35 + p * 0.08;
          const rMod = getShapeRadiusMultiplier(state.targetShape, a);
          const vx = Math.cos(a) * tunnelRadius * rMod;
          const vy = Math.sin(a) * tunnelRadius * rMod;
          const rotated = rotate3D([vx, vy, zDepth], Math.sin(timeSec * 0.3) * 0.18, Math.cos(timeSec * 0.25) * 0.18, 0);
          const proj = project3D(rotated, centerX, centerY, fov, camDist);
          if (s === 0) ctx.moveTo(proj.sx, proj.sy);
          else ctx.lineTo(proj.sx, proj.sy);
        }
        ctx.stroke();
      }

      // Longitudinal 3D perspective corridor rails
      ctx.strokeStyle = `hsla(${secondaryHue}, 80%, 55%, ${0.08 + midEnergy * 0.12})`;
      ctx.lineWidth = 0.9;
      for (let s = 0; s < tunnelSides; s++) {
        const a = (s / tunnelSides) * Math.PI * 2 + state.rotZ * 0.35;
        const rMod = getShapeRadiusMultiplier(state.targetShape, a);
        const vx = Math.cos(a) * tunnelRadius * rMod;
        const vy = Math.sin(a) * tunnelRadius * rMod;
        const nearP = project3D([vx, vy, -180], centerX, centerY, fov, camDist);
        const farP = project3D([vx, vy, 580], centerX, centerY, fov, camDist);
        if (nearP.visible && farP.visible) {
          ctx.beginPath();
          ctx.moveTo(nearP.sx, nearP.sy);
          ctx.lineTo(farP.sx, farP.sy);
          ctx.stroke();
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 2 (Extra Layer #1): Volumetric 3D Audio-Reactive Aurora Ribbons
      // ═══════════════════════════════════════════════════════════════════════
      const ribbonCount = 3;
      const ribbonSegments = 36;
      const spanX = width * 0.72;

      for (let rIdx = 0; rIdx < ribbonCount; rIdx++) {
        const ribbonZ = -90 + rIdx * 110;
        const baseElevY = (rIdx - 1) * (height * 0.16);
        const rHue = (hue + rIdx * 52) % 360;

        ctx.beginPath();
        let firstPt: ProjectedPoint | null = null;
        let lastPt: ProjectedPoint | null = null;

        for (let seg = 0; seg <= ribbonSegments; seg++) {
          const frac = seg / ribbonSegments;
          const x3d = (frac - 0.5) * spanX * 1.4;
          const bin = Math.min(freqData.length - 1, Math.floor(frac * 48) + rIdx * 8);
          const fVal = (freqData[bin] ?? 0) / 255;

          const waveY =
            baseElevY +
            Math.sin(frac * Math.PI * 4 + timeSec * (1.8 + rIdx * 0.5)) * (22 + midEnergy * 48) +
            (fVal - 0.3) * (55 + bassEnergy * 65);
          const waveZ = ribbonZ + Math.cos(frac * Math.PI * 3 + timeSec * 1.4) * 55;

          const rotated = rotate3D([x3d, waveY, waveZ], state.rotX * 0.15, state.rotY * 0.12, 0);
          const proj = project3D(rotated, centerX, centerY, fov, camDist);

          if (seg === 0) {
            firstPt = proj;
            ctx.moveTo(proj.sx, proj.sy);
          } else {
            ctx.lineTo(proj.sx, proj.sy);
          }
          lastPt = proj;
        }

        ctx.strokeStyle = `hsla(${rHue}, 95%, 68%, ${0.22 + totalEnergy * 0.32})`;
        ctx.lineWidth = 1.8 + state.beatPulse * 1.5;
        ctx.stroke();

        // Translucent volumetric curtain drop
        if (firstPt && lastPt) {
          ctx.lineTo(lastPt.sx, lastPt.sy + 48 * lastPt.scale);
          ctx.lineTo(firstPt.sx, firstPt.sy + 48 * firstPt.scale);
          ctx.closePath();
          const auroraGrad = ctx.createLinearGradient(0, centerY - 120, 0, centerY + 160);
          auroraGrad.addColorStop(0, `hsla(${rHue}, 95%, 65%, ${0.12 + bassEnergy * 0.15})`);
          auroraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = auroraGrad;
          ctx.fill();
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 3: 160-Particle 3D Spherical/Toroidal Field & Constellation Web
      // ═══════════════════════════════════════════════════════════════════════
      const projectedParticles: Array<{
        proj: ProjectedPoint;
        p: Particle3D;
        pHue: number;
      }> = [];

      for (let idx = 0; idx < particles.length; idx++) {
        const p = particles[idx];
        if (!p) continue;

        p.theta += p.vTheta * (1 + totalEnergy * 3.4);
        p.phi += p.vPhi * (1 + midEnergy * 2.6);

        // Opposite/complementary 3D radial morphing against the active shape
        const multA = getShapeRadiusMultiplier(state.currentShape, p.theta, p.phi);
        const multB = getShapeRadiusMultiplier(state.targetShape, p.theta, p.phi);
        const shapeFactor = multA * (1 - morphT) + multB * morphT;
        const inverseFactor = 2.08 - shapeFactor;

        const bin = idx % 64;
        const freqBoost = ((freqData[bin] ?? 0) / 255) * 42;
        const targetRadius =
          p.baseRadius * inverseFactor * (1 + bassEnergy * 0.28 + state.beatPulse * 0.16) +
          freqBoost;
        p.radius += (targetRadius - p.radius) * 0.12;

        const sinPhi = Math.sin(p.phi);
        const x3 = p.radius * sinPhi * Math.cos(p.theta);
        const y3 = p.radius * Math.cos(p.phi);
        const z3 = p.radius * sinPhi * Math.sin(p.theta);

        const rotP = rotate3D(
          [x3, y3, z3],
          -state.rotX * 0.65,
          -state.rotY * 0.75,
          state.rotZ * 0.4,
        );
        const proj = project3D(rotP, centerX, centerY, fov, camDist);
        if (proj.visible) {
          projectedParticles.push({
            proj,
            p,
            pHue: (hue + p.hueOffset + 360) % 360,
          });
        }
      }

      // Sort particles back-to-front by Z for true 3D depth occlusion
      projectedParticles.sort((a, b) => b.proj.z - a.proj.z);

      for (let i = 0; i < projectedParticles.length; i++) {
        const item = projectedParticles[i];
        if (!item) continue;
        const { proj, p, pHue } = item;

        const depthScale = Math.max(0.35, Math.min(2.1, proj.scale * 1.15));
        const r = (p.size + state.beatPulse * 1.6) * depthScale;
        const alpha = Math.min(0.95, p.alpha * depthScale * (0.65 + totalEnergy * 0.55));

        ctx.fillStyle = `hsla(${pHue}, 95%, 72%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(proj.sx, proj.sy, r, 0, Math.PI * 2);
        ctx.fill();

        // 3D constellation web between depth-proximate particles
        const nextItem = projectedParticles[i + 1];
        if (i % 2 === 0 && nextItem) {
          const dx = proj.sx - nextItem.proj.sx;
          const dy = proj.sy - nextItem.proj.sy;
          const dz = proj.z - nextItem.proj.z;
          const distSq = dx * dx + dy * dy + dz * dz * 0.25;
          if (distSq < 3400) {
            ctx.strokeStyle = `hsla(${pHue}, 90%, 68%, ${(1 - distSq / 3400) * 0.24 * depthScale})`;
            ctx.lineWidth = 0.85 * depthScale;
            ctx.beginPath();
            ctx.moveTo(proj.sx, proj.sy);
            ctx.lineTo(nextItem.proj.sx, nextItem.proj.sy);
            ctx.stroke();
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 4 (3D Shape #2): Counter-Rotating 3D Gyroscopic & Fractal Cage
      // ═══════════════════════════════════════════════════════════════════════
      const cageScale = Math.min(width, height) * 0.31 * (1 + midEnergy * 0.18);
      const compShapeA = (state.currentShape + 2) % SHAPE_NAMES.length;
      const compShapeB = (state.targetShape + 2) % SHAPE_NAMES.length;

      // 3 Tilted 3D Armillary / Gyroscopic Rings
      const gimbalTilts: Vec3[] = [
        [state.rotX * -1.2, state.rotY * 0.9, 0.4],
        [0.6, state.rotY * -1.3, state.rotZ * 1.1],
        [state.rotX * 0.8, -0.5, state.rotZ * -1.25],
      ];

      for (let g = 0; g < gimbalTilts.length; g++) {
        const tilt = gimbalTilts[g];
        if (!tilt) continue;
        const gHue = (secondaryHue + g * 40) % 360;
        ctx.strokeStyle = `hsla(${gHue}, 92%, 64%, ${0.26 + trebleEnergy * 0.32})`;
        ctx.lineWidth = 1.4 + state.beatPulse * 1.1;
        ctx.beginPath();

        const ringSegs = 48;
        for (let s = 0; s <= ringSegs; s++) {
          const a = (s / ringSegs) * Math.PI * 2;
          const rModA = getShapeRadiusMultiplier(compShapeA, a, g);
          const rModB = getShapeRadiusMultiplier(compShapeB, a, g);
          const rMod = 1.65 - (rModA * (1 - morphT) + rModB * morphT) * 0.55;
          const bin = (s * 2 + g * 11) % 64;
          const fDisp = ((freqData[bin] ?? 0) / 255) * 18;
          const rad = cageScale * rMod + fDisp;

          const pt3d = rotate3D(
            [Math.cos(a) * rad, Math.sin(a) * rad, Math.sin(a * 3) * 24],
            tilt[0],
            tilt[1],
            tilt[2],
          );
          const proj = project3D(pt3d, centerX, centerY, fov, camDist);
          if (s === 0) ctx.moveTo(proj.sx, proj.sy);
          else ctx.lineTo(proj.sx, proj.sy);
        }
        ctx.stroke();
      }

      // ═══════════════════════════════════════════════════════════════════════
      // LAYER 5 (3D Shape #1 + Extra Layer #2):
      // Central Morphing 3D Polyhedral/Fractal Core + 3D Shockwaves & God-Rays
      // ═══════════════════════════════════════════════════════════════════════
      const coreScale =
        Math.min(width, height) * 0.23 * (1 + state.beatPulse * 0.16 + bassEnergy * 0.12);
      const projectedCore: ProjectedPoint[] = [];

      for (let i = 0; i < VERTEX_COUNT_3D; i++) {
        const vA = compute3DShapeVertex(state.currentShape, i, VERTEX_COUNT_3D, timeSec);
        const vB = compute3DShapeVertex(state.targetShape, i, VERTEX_COUNT_3D, timeSec);

        // Smooth 3D vertex interpolation
        let vx = vA[0] * (1 - morphT) + vB[0] * morphT;
        let vy = vA[1] * (1 - morphT) + vB[1] * morphT;
        let vz = vA[2] * (1 - morphT) + vB[2] * morphT;

        // Displace outward along 3D normal using FFT frequency bin
        const binIndex = Math.floor((i / VERTEX_COUNT_3D) * 64);
        const freqVal = (freqData[binIndex] ?? 0) / 255;
        const displacement = 1 + freqVal * (0.38 + bassEnergy * 0.42);

        vx = vx * coreScale * displacement;
        vy = vy * coreScale * displacement;
        vz = vz * coreScale * displacement;

        // Rotate core in 3D space
        const rotated = rotate3D([vx, vy, vz], state.rotX, state.rotY, state.rotZ);
        projectedCore.push(project3D(rotated, centerX, centerY, fov, camDist));
      }

      ctx.save();

      // 5a. Volumetric 3D God-Rays / Plasma Lightning Arcs on energetic beats
      if (totalEnergy > 0.22 || state.beatPulse > 0.25) {
        const rayCount = 12;
        for (let r = 0; r < rayCount; r++) {
          const vIdx = (r * Math.floor(VERTEX_COUNT_3D / rayCount)) % VERTEX_COUNT_3D;
          const pt = projectedCore[vIdx];
          if (!pt || !pt.visible) continue;

          const angle = Math.atan2(pt.sy - centerY, pt.sx - centerX);
          const rayLen = (55 + bassEnergy * 110 + state.beatPulse * 75) * pt.scale;
          const endX = pt.sx + Math.cos(angle) * rayLen;
          const endY = pt.sy + Math.sin(angle) * rayLen;
          const midX = (pt.sx + endX) * 0.5 + Math.sin(timeSec * 14 + r) * 12;
          const midY = (pt.sy + endY) * 0.5 + Math.cos(timeSec * 14 + r) * 12;

          ctx.strokeStyle = `hsla(${accentHue}, 100%, 75%, ${(0.18 + state.beatPulse * 0.35) * pt.scale})`;
          ctx.lineWidth = 1.3 * pt.scale;
          ctx.beginPath();
          ctx.moveTo(pt.sx, pt.sy);
          ctx.lineTo(midX, midY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }
      }

      // 5b. Translucent 3D Holographic Core Facets
      for (let i = 0; i < projectedCore.length - 2; i += 3) {
        const p0 = projectedCore[i];
        const p1 = projectedCore[i + 1];
        const p2 = projectedCore[i + 2];
        if (!p0 || !p1 || !p2 || !p0.visible || !p1.visible || !p2.visible) continue;

        const avgScale = (p0.scale + p1.scale + p2.scale) / 3;
        const facetHue = (hue + (i % 5) * 18) % 360;
        ctx.fillStyle = `hsla(${facetHue}, 92%, 60%, ${Math.min(0.28, (0.06 + bassEnergy * 0.14) * avgScale)})`;
        ctx.beginPath();
        ctx.moveTo(p0.sx, p0.sy);
        ctx.lineTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.closePath();
        ctx.fill();
      }

      // 5c. 3D Polyhedral & Fractal Wireframe Lattice Struts
      const primaryColor = `hsl(${hue}, 96%, 66%)`;
      ctx.shadowColor = primaryColor;
      ctx.shadowBlur = 12 + state.beatPulse * 24 + bassEnergy * 16;

      for (let i = 0; i < projectedCore.length; i++) {
        const pA = projectedCore[i];
        const pB = projectedCore[(i + 1) % projectedCore.length];
        const pCross = projectedCore[(i + 6) % projectedCore.length];
        if (!pA || !pA.visible) continue;

        const alpha = Math.min(0.95, (0.38 + totalEnergy * 0.45) * pA.scale);
        ctx.strokeStyle = `hsla(${(hue + (i % 8) * 8) % 360}, 95%, 68%, ${alpha})`;
        ctx.lineWidth = (1.4 + state.beatPulse * 1.6) * pA.scale;

        if (pB && pB.visible) {
          ctx.beginPath();
          ctx.moveTo(pA.sx, pA.sy);
          ctx.lineTo(pB.sx, pB.sy);
          ctx.stroke();
        }

        if (i % 2 === 0 && pCross && pCross.visible) {
          ctx.strokeStyle = `hsla(${secondaryHue}, 90%, 64%, ${alpha * 0.55})`;
          ctx.lineWidth = 0.9 * pA.scale;
          ctx.beginPath();
          ctx.moveTo(pA.sx, pA.sy);
          ctx.lineTo(pCross.sx, pCross.sy);
          ctx.stroke();
        }
      }

      // 5d. Glowing 3D Vertex Nodes
      ctx.shadowBlur = 0;
      for (let i = 0; i < projectedCore.length; i += 2) {
        const pt = projectedCore[i];
        if (!pt || !pt.visible) continue;
        const nodeR = Math.max(1.2, (2.2 + state.beatPulse * 1.8) * pt.scale);
        ctx.fillStyle = `hsla(${accentHue}, 100%, 82%, ${Math.min(0.95, 0.55 * pt.scale)})`;
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, nodeR, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5e. Expanding 3D Beat Shockwave Torus Rings
      for (let sIdx = shockwaves.length - 1; sIdx >= 0; sIdx--) {
        const sw = shockwaves[sIdx];
        if (!sw) continue;
        sw.radius += 4.2 + bassEnergy * 6.5;
        sw.alpha *= 0.94;

        if (sw.alpha < 0.03 || sw.radius > sw.maxRadius) {
          shockwaves.splice(sIdx, 1);
          continue;
        }

        ctx.strokeStyle = `hsla(${sw.hue}, 96%, 70%, ${sw.alpha})`;
        ctx.lineWidth = 2.2 * sw.alpha;
        ctx.beginPath();
        const swSegs = 40;
        for (let k = 0; k <= swSegs; k++) {
          const a = (k / swSegs) * Math.PI * 2;
          const pt3d = rotate3D(
            [Math.cos(a) * sw.radius, Math.sin(a) * sw.radius, 0],
            sw.tiltX + state.rotX * 0.3,
            sw.tiltY + state.rotY * 0.3,
            0,
          );
          const proj = project3D(pt3d, centerX, centerY, fov, camDist);
          if (k === 0) ctx.moveTo(proj.sx, proj.sy);
          else ctx.lineTo(proj.sx, proj.sy);
        }
        ctx.stroke();
      }

      ctx.restore();
      ctx.restore();

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      active = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [centerYOffset]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="epic-audio-canvas"
      className={className ?? 'absolute inset-0 h-full w-full object-cover'}
    />
  );
}

/**
 * Epic 3D Audio Player: Spotify-style floating controls, real-time reactive Web Audio 5-layer 3D canvas
 * visualizer, 3D sacred-geometry & abstract-fractal shape morphing every 8–16 beats, 160-particle 3D field,
 * volumetric 3D aurora ribbons, 3D beat shockwaves, and 3-tier beat-responsive container border glow.
 */
export function EpicAudioPlayer({
  src,
  fileName,
  ariaLabel,
  autoPlay = false,
  resumeAt = 0,
  onLoadedMetadataDuration,
  onProgress,
  className,
}: EpicAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reportRef = useRef(onProgress);
  reportRef.current = onProgress;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [glowTier, setGlowTier] = useState<1 | 2 | 3>(1);
  const [currentShapeIdx, setCurrentShapeIdx] = useState(0);

  // Report pause position on unmount or track change when used in Media ▸ Library
  useEffect(() => {
    const el = audioRef.current;
    return () => {
      if (el && el.currentTime > 0 && reportRef.current) {
        reportRef.current(el.currentTime, el.duration || 0, 'paused');
      }
    };
  }, [src]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  // Restart / Skip to start
  const handleRestart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
  }, []);

  // Seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  // Volume
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const val = Number(e.target.value);
    setVolume(val);
    if (audio) {
      audio.volume = val;
      audio.muted = val === 0;
    }
    if (val > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audio.muted = nextMuted;
  };

  const toggleLoop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextLoop = !isLooping;
    setIsLooping(nextLoop);
    audio.loop = nextLoop;
  };

  const cycleShape = () => {
    const next = (currentShapeIdx + 1) % SHAPE_NAMES.length;
    setCurrentShapeIdx(next);
  };

  // Sync volume & mute on audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
    audio.loop = isLooping;
  }, [volume, isMuted, isLooping]);

  return (
    <div
      ref={containerRef}
      data-testid="epic-audio-player-container"
      data-glow-tier={glowTier}
      className={`group relative flex h-full min-h-[360px] w-full flex-col overflow-hidden rounded-2xl bg-neutral-950 transition-all duration-300 ease-out select-none ${
        glowTier === 3
          ? 'shadow-[0_0_50px_rgba(217,70,239,0.5),inset_0_0_35px_rgba(6,182,212,0.3)] ring-2 ring-fuchsia-400 scale-[1.008]'
          : glowTier === 2
            ? 'shadow-[0_0_30px_rgba(168,85,247,0.35),inset_0_0_20px_rgba(6,182,212,0.18)] ring-1 ring-cyan-400'
            : 'shadow-[0_0_15px_rgba(147,51,234,0.15)] ring-1 ring-white/10'
      } ${className ?? ''}`}
    >
      {/* Dynamic Animated Gradient Border Glow */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300 ${
          glowTier === 3 ? 'opacity-100' : glowTier === 2 ? 'opacity-70' : 'opacity-30'
        }`}
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(217, 70, 239, 0.25), transparent 70%), radial-gradient(circle at 50% 100%, rgba(6, 182, 212, 0.2), transparent 70%)',
        }}
      />

      {/* Full 5-Layer 3D Canvas Background Visualizer */}
      <EpicAudioVisualizerCanvas
        isPlaying={isPlaying}
        audioElement={audioRef.current}
        shapeIndex={currentShapeIdx}
        onShapeChange={setCurrentShapeIdx}
        onGlowTierChange={setGlowTier}
      />

      {/* Native audio element */}
      <audio
        ref={audioRef}
        data-testid="epic-audio-element"
        src={src}
        autoPlay={autoPlay}
        preload="metadata"
        aria-label={ariaLabel ?? `Audio preview for ${fileName}`}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          setIsPlaying(false);
          const el = audioRef.current;
          if (el && !el.ended && reportRef.current) {
            reportRef.current(el.currentTime, el.duration || 0, 'paused');
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          const el = audioRef.current;
          if (el && reportRef.current) {
            reportRef.current(el.duration || el.currentTime, el.duration || 0, 'ended');
          }
          if (!isLooping) {
            setCurrentTime(0);
          }
        }}
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (el) {
            setCurrentTime(el.currentTime);
            if (reportRef.current) {
              reportRef.current(el.currentTime, el.duration || 0, 'playing');
            }
          }
        }}
        onLoadedMetadata={() => {
          const el = audioRef.current;
          if (el) {
            const dur = el.duration || 0;
            setDuration(dur);
            if (resumeAt > 0 && resumeAt < (dur || Infinity)) {
              el.currentTime = resumeAt;
              setCurrentTime(resumeAt);
            }
            onLoadedMetadataDuration?.(dur);
          }
        }}
      />

      {/* Top Header Badge Overlay */}
      <div className="relative z-10 flex items-center justify-between p-4 sm:p-5">
        <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur-md">
          <LuMusic className="h-4 w-4 text-cyan-400" />
          <span className="max-w-[200px] truncate text-xs font-medium text-white/90 sm:max-w-xs">
            {fileName}
          </span>
          <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-cyan-300 uppercase">
            3D
          </span>
        </div>

        {/* Morphing 3D Shape Chip & Beat Level Indicator */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cycleShape}
            title="Click to cycle morph shape"
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur-md transition-colors hover:border-cyan-400/50 hover:bg-black/60 hover:text-white"
          >
            <LuSparkles className="h-3.5 w-3.5 text-fuchsia-400" />
            <span>{SHAPE_NAMES[currentShapeIdx]}</span>
          </button>

          {/* 3-tier Intensity Indicator */}
          <div
            title={`Beat Intensity Level ${glowTier}`}
            className="flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2 py-1 backdrop-blur-md"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full transition-all duration-150 ${
                glowTier >= 1 ? 'bg-cyan-400 shadow-[0_0_6px_#06b6d4]' : 'bg-white/20'
              }`}
            />
            <span
              className={`h-1.5 w-1.5 rounded-full transition-all duration-150 ${
                glowTier >= 2 ? 'bg-fuchsia-400 shadow-[0_0_8px_#d946ef]' : 'bg-white/20'
              }`}
            />
            <span
              className={`h-1.5 w-1.5 rounded-full transition-all duration-150 ${
                glowTier >= 3 ? 'bg-rose-400 scale-125 shadow-[0_0_10px_#f43f5e]' : 'bg-white/20'
              }`}
            />
          </div>
        </div>
      </div>

      <div className="flex-1" />

      {/* Floating Spotify-Style Bottom Control Bar */}
      <div className="relative z-20 m-3 sm:m-5">
        <div className="relative flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-black/65 p-3.5 shadow-2xl backdrop-blur-2xl sm:p-4">
          {/* Top Row: Track Seek Slider */}
          <div className="flex items-center gap-3">
            <span className="w-10 text-right text-[11px] font-mono text-white/60">
              {formatAudioTime(currentTime)}
            </span>

            <div className="relative flex flex-1 items-center">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                aria-label="Seek track"
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-cyan-400 transition-all hover:bg-white/25 focus:outline-none"
                style={{
                  background: `linear-gradient(to right, rgb(6, 182, 212) 0%, rgb(217, 70, 239) ${
                    duration ? (currentTime / duration) * 100 : 0
                  }%, rgba(255, 255, 255, 0.15) ${
                    duration ? (currentTime / duration) * 100 : 0
                  }%, rgba(255, 255, 255, 0.15) 100%)`,
                }}
              />
            </div>

            <span className="w-10 text-left text-[11px] font-mono text-white/60">
              {formatAudioTime(duration)}
            </span>
          </div>

          {/* Bottom Row: Control Buttons and Volume */}
          <div className="flex items-center justify-between pt-1">
            {/* Left status item */}
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full transition-all duration-300 ${
                  isPlaying ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-white/30'
                }`}
              />
              <span className="text-xs font-medium text-white/70">
                {isPlaying ? 'Playing' : 'Paused'}
              </span>
            </div>

            {/* Center Controls: Restart, Play/Pause, Repeat */}
            <div className="flex items-center gap-3 sm:gap-4">
              <button
                type="button"
                onClick={handleRestart}
                title="Restart track"
                aria-label="Restart track"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-all hover:bg-white/10 hover:text-white active:scale-95"
              >
                <LuRotateCcw className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                data-testid="epic-play-pause-btn"
                title={isPlaying ? 'Pause' : 'Play'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 via-fuchsia-500 to-rose-400 text-white shadow-lg shadow-fuchsia-500/25 transition-all hover:scale-105 hover:shadow-fuchsia-500/40 active:scale-95"
              >
                {isPlaying ? (
                  <LuPause className="h-5 w-5 fill-current" />
                ) : (
                  <LuPlay className="ml-0.5 h-5 w-5 fill-current" />
                )}
              </button>

              <button
                type="button"
                onClick={toggleLoop}
                title={isLooping ? 'Disable loop' : 'Enable loop'}
                aria-label="Toggle loop"
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-all active:scale-95 ${
                  isLooping
                    ? 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <LuRepeat className="h-4 w-4" />
              </button>
            </div>

            {/* Right: Volume slider */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label="Toggle mute"
                className="text-white/70 transition-colors hover:text-white"
              >
                {isMuted || volume === 0 ? (
                  <LuVolumeX className="h-4 w-4" />
                ) : volume < 0.5 ? (
                  <LuVolume1 className="h-4 w-4" />
                ) : (
                  <LuVolume2 className="h-4 w-4" />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Adjust volume"
                className="h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-white/20 accent-cyan-400 sm:w-20"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
