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
};

/**
 * Available morphing geometries for the central visualizer.
 * Automatically cycles every 8 to 16 beats.
 */
export const SHAPE_NAMES = ['Cosmic Ring', 'Hex Shield', 'Starburst', 'Lotus Wave', 'Hyper-Octagon'] as const;
export type ShapeKind = (typeof SHAPE_NAMES)[number];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  angle: number;
  distance: number;
  speed: number;
  hueOffset: number;
  size: number;
  alpha: number;
};

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Calculates radial profile for a given shape type at angle theta (0..2*PI).
 * Returns a normalized multiplier (typically 0.6..1.4) around the base radius.
 */
function getShapeRadiusMultiplier(shapeIndex: number, theta: number): number {
  switch (shapeIndex) {
    case 0: // Cosmic Ring - smooth with subtle harmonic ripple
      return 1.0 + 0.08 * Math.sin(theta * 6);
    case 1: { // Hex Shield - 6-sided beveled polygon
      const n = 6;
      const r = Math.cos(Math.PI / n) / Math.cos(((theta % ((2 * Math.PI) / n)) + (2 * Math.PI) / n) % ((2 * Math.PI) / n) - Math.PI / n);
      return Math.min(Math.max(r, 0.8), 1.25);
    }
    case 2: { // Starburst - 12-point alternating star
      const points = 12;
      const star = Math.abs(Math.sin(theta * (points / 2)));
      return 0.72 + 0.45 * star;
    }
    case 3: { // Lotus Wave - 8 curved floral lobes
      const petals = 8;
      const lotus = Math.pow(Math.sin(theta * (petals / 2)), 2);
      return 0.75 + 0.38 * lotus;
    }
    case 4: { // Hyper-Octagon - 8-sided faceted diamond
      const n = 8;
      const r = Math.cos(Math.PI / n) / Math.cos(((theta % ((2 * Math.PI) / n)) + (2 * Math.PI) / n) % ((2 * Math.PI) / n) - Math.PI / n);
      return Math.min(Math.max(r, 0.82), 1.22);
    }
    default:
      return 1.0;
  }
}

/**
 * Epic Audio Player: Spotify-style floating controls, real-time reactive Web Audio canvas visualizer,
 * multi-stage shape morphing every 8-16 beats, complementary particle field, dynamic spectrum color cycling,
 * and 3 distinct beat-responsive container border glow tiers.
 */
export function EpicAudioPlayer({ src, fileName }: EpicAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [glowTier, setGlowTier] = useState<1 | 2 | 3>(1);
  const [currentShapeIdx, setCurrentShapeIdx] = useState(0);

  // Audio Context and Visualizer references
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Beat tracking & morph state
  const beatStateRef = useRef({
    energyHistory: [] as number[],
    lastBeatTime: 0,
    beatCount: 0,
    currentShape: 0,
    targetShape: 0,
    morphProgress: 1, // 0..1
    beatPulse: 0, // 0..1 decays on frame
    baseHue: 270, // Start in vibrant violet/magenta
  });

  const particlesRef = useRef<Particle[]>([]);

  // Initialize particles
  useEffect(() => {
    const particles: Particle[] = [];
    const count = 75;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 90 + Math.random() * 180;
      particles.push({
        x: 0,
        y: 0,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        baseRadius: distance,
        angle,
        distance,
        speed: (0.004 + Math.random() * 0.008) * (Math.random() > 0.5 ? 1 : -1),
        hueOffset: (Math.random() - 0.5) * 70,
        size: 1.5 + Math.random() * 2.5,
        alpha: 0.3 + Math.random() * 0.6,
      });
    }
    particlesRef.current = particles;
  }, []);

  // Initialize Web Audio API on interaction / play
  const ensureAudioContext = useCallback(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

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
          analyser.smoothingTimeConstant = 0.8;
          analyserRef.current = analyser;

          if (!sourceNodeRef.current) {
            try {
              const source = ctx.createMediaElementSource(audioEl);
              sourceNodeRef.current = source;
              source.connect(analyser);
              analyser.connect(ctx.destination);
            } catch {
              // Elements can only be connected once or may throw if restricted
            }
          }
        } catch {
          // AudioContext unavailable or restricted
        }
      }
    }

    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    ensureAudioContext();

    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [ensureAudioContext]);

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
    beatStateRef.current.targetShape = next;
    beatStateRef.current.morphProgress = 0;
  };

  // Main visualizer render loop
  useEffect(() => {
    let active = true;

    const render = () => {
      if (!active) return;

      const canvas = canvasRef.current;
      const audio = audioRef.current;
      const state = beatStateRef.current;
      const particles = particlesRef.current;

      if (!canvas) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      // Handle High-DPI canvas resolution
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth || 600;
      const displayHeight = canvas.clientHeight || 450;

      if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const width = displayWidth;
      const height = displayHeight;
      const centerX = width / 2;
      const centerY = height / 2 - 25; // slightly above center to leave room for bottom bar

      // Read audio analysis or simulate if not playing/available
      const analyser = analyserRef.current;
      const freqData = new Uint8Array(128);
      const isAudible = Boolean(audio && !audio.paused);

      let bassEnergy = 0;
      let midEnergy = 0;
      let trebleEnergy = 0;

      if (analyser && isAudible) {
        analyser.getByteFrequencyData(freqData);

        // Sub-bass & bass: bins 0 to 6
        let bassSum = 0;
        for (let i = 0; i < 7; i++) bassSum += freqData[i] ?? 0;
        bassEnergy = bassSum / (7 * 255);

        // Mids: bins 7 to 25
        let midSum = 0;
        for (let i = 7; i < 26; i++) midSum += freqData[i] ?? 0;
        midEnergy = midSum / (19 * 255);

        // Highs: bins 26 to 64
        let trebleSum = 0;
        for (let i = 26; i < 65; i++) trebleSum += freqData[i] ?? 0;
        trebleEnergy = trebleSum / (39 * 255);
      } else if (isAudible) {
        // Dynamic synthetic harmonics fallback for test environments or muted analyser
        const t = performance.now() * 0.003;
        bassEnergy = 0.35 + 0.3 * Math.sin(t * 2.2);
        midEnergy = 0.3 + 0.25 * Math.sin(t * 3.7 + 1);
        trebleEnergy = 0.25 + 0.2 * Math.sin(t * 5.1 + 2);
        for (let i = 0; i < freqData.length; i++) {
          freqData[i] = Math.floor(
            (Math.sin(t * 3 + i * 0.2) * 0.5 + 0.5) * (bassEnergy * 200 + 40),
          );
        }
      } else {
        // Idle gentle breathing
        const t = performance.now() * 0.001;
        bassEnergy = 0.06 + 0.04 * Math.sin(t * 1.5);
        midEnergy = 0.05 + 0.03 * Math.sin(t * 2.1);
        trebleEnergy = 0.04;
      }

      const totalEnergy = bassEnergy * 0.55 + midEnergy * 0.3 + trebleEnergy * 0.15;

      // Dynamic Beat Detection: Compare instant bass to rolling history
      const now = performance.now();
      state.energyHistory.push(bassEnergy);
      if (state.energyHistory.length > 30) state.energyHistory.shift();

      const avgEnergy =
        state.energyHistory.reduce((a, b) => a + b, 0) / state.energyHistory.length || 0.1;

      // Beat hit trigger
      if (isAudible && bassEnergy > avgEnergy * 1.32 && bassEnergy > 0.28 && now - state.lastBeatTime > 240) {
        state.lastBeatTime = now;
        state.beatCount++;
        state.beatPulse = 1.0;

        // Shape morph every 12 beats (in 8-16 beat range)
        if (state.beatCount % 12 === 0) {
          state.currentShape = state.targetShape;
          state.targetShape = (state.targetShape + 1) % SHAPE_NAMES.length;
          state.morphProgress = 0;
          setCurrentShapeIdx(state.targetShape);
        }
      }

      // Decay beat pulse
      state.beatPulse *= 0.92;
      if (state.beatPulse < 0.01) state.beatPulse = 0;

      // Advance morph progress smoothly
      if (state.morphProgress < 1) {
        state.morphProgress = Math.min(1, state.morphProgress + 0.025);
      }

      // Cycle hue gradually through spectrums
      state.baseHue = (state.baseHue + 0.18 + totalEnergy * 0.4) % 360;
      const hue = state.baseHue;
      const primaryColor = `hsl(${hue}, 95%, 62%)`;
      const secondaryColor = `hsl(${(hue + 55) % 360}, 92%, 58%)`;
      const accentColor = `hsl(${(hue + 140) % 360}, 100%, 68%)`;

      // Determine 3 distinct border glow intensity tiers
      let currentTier: 1 | 2 | 3 = 1;
      if (totalEnergy >= 0.52 || state.beatPulse > 0.6) {
        currentTier = 3; // Peak / Drop
      } else if (totalEnergy >= 0.24 || state.beatPulse > 0.25) {
        currentTier = 2; // Groove / Moderate
      } else {
        currentTier = 1; // Subtle / Ambient
      }
      setGlowTier(currentTier);

      // ─── 1. Background Clear & Subtle Shifting Pattern ───
      // Clear with slight trailing fade for motion blur
      ctx.fillStyle = 'rgba(10, 10, 15, 0.45)';
      ctx.fillRect(0, 0, width, height);

      // Deep ambient glow in center
      const bgGlow = ctx.createRadialGradient(
        centerX,
        centerY,
        10,
        centerX,
        centerY,
        Math.max(width, height) * 0.65,
      );
      bgGlow.addColorStop(0, `hsla(${hue}, 80%, 25%, ${0.15 + totalEnergy * 0.25})`);
      bgGlow.addColorStop(0.5, `hsla(${(hue + 60) % 360}, 75%, 15%, ${0.08 + totalEnergy * 0.15})`);
      bgGlow.addColorStop(1, 'rgba(5, 5, 10, 0)');
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, width, height);

      // Subtle shifting concentric radar / sacred geometry grid
      const timeSec = now * 0.001;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(timeSec * 0.05);
      ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${0.05 + totalEnergy * 0.09})`;
      ctx.lineWidth = 1;

      // Concentric rings pulsing with bass
      const maxRingRadius = Math.min(width, height) * 0.45;
      for (let r = 50; r <= maxRingRadius; r += 45) {
        const ringPulse = r + bassEnergy * 20 * Math.sin(timeSec * 2 + r);
        ctx.beginPath();
        ctx.arc(0, 0, ringPulse, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Cross spokes
      const spokeCount = 12;
      for (let s = 0; s < spokeCount; s++) {
        const spokeAngle = (s * Math.PI * 2) / spokeCount;
        ctx.beginPath();
        ctx.moveTo(Math.cos(spokeAngle) * 40, Math.sin(spokeAngle) * 40);
        ctx.lineTo(Math.cos(spokeAngle) * maxRingRadius, Math.sin(spokeAngle) * maxRingRadius);
        ctx.stroke();
      }
      ctx.restore();

      // ─── 2. Complementary Particle Field ───
      // Particles morph and flow in an opposite/fitting pattern
      const currentShape = state.currentShape;
      const targetShape = state.targetShape;
      const morphT = 0.5 - 0.5 * Math.cos(state.morphProgress * Math.PI); // easeInOutSine

      particles.forEach((p, idx) => {
        // Orbit and radial response
        p.angle += p.speed * (1 + totalEnergy * 2.2);

        // Opposite reaction: when central shape expands inward/outward,
        // particles modulate in contrary harmonic phase
        const pAngleMod = p.angle + timeSec * 0.2;
        const multA = getShapeRadiusMultiplier(currentShape, pAngleMod);
        const multB = getShapeRadiusMultiplier(targetShape, pAngleMod);
        const shapeMod = multA * (1 - morphT) + multB * morphT;

        // Complementary radial orbit
        const targetDist = p.baseRadius * (1.1 + (1.5 - shapeMod) * 0.4) + state.beatPulse * 28;
        p.distance += (targetDist - p.distance) * 0.08;

        const px = centerX + Math.cos(p.angle) * p.distance;
        const py = centerY + Math.sin(p.angle) * p.distance;

        // Particle rendering with glowing halo
        const pSize = p.size * (1 + bassEnergy * 0.9);
        const pHue = (hue + p.hueOffset + 360) % 360;

        ctx.fillStyle = `hsla(${pHue}, 95%, 75%, ${p.alpha * (0.4 + totalEnergy * 0.6)})`;
        ctx.beginPath();
        ctx.arc(px, py, pSize, 0, Math.PI * 2);
        ctx.fill();

        // Connect nearby particles for constellation web effect
        const next = particles[idx + 1];
        if (idx % 3 === 0 && next) {
          const nx = centerX + Math.cos(next.angle) * next.distance;
          const ny = centerY + Math.sin(next.angle) * next.distance;
          const dx = px - nx;
          const dy = py - ny;
          const distSq = dx * dx + dy * dy;
          if (distSq < 2800) {
            ctx.strokeStyle = `hsla(${pHue}, 90%, 65%, ${(1 - distSq / 2800) * 0.15})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(nx, ny);
            ctx.stroke();
          }
        }
      });

      // ─── 3. Central Morphing Shape ───
      const baseRadius = Math.min(width, height) * 0.22 * (1 + state.beatPulse * 0.12);
      const vertexCount = 100;
      const vertices: [number, number][] = [];

      for (let i = 0; i < vertexCount; i++) {
        const theta = (i * Math.PI * 2) / vertexCount;

        // Sample shape multiplier from shape A and shape B, interpolated
        const multA = getShapeRadiusMultiplier(currentShape, theta);
        const multB = getShapeRadiusMultiplier(targetShape, theta);
        const shapeFactor = multA * (1 - morphT) + multB * morphT;

        // Displace with audio frequency bins
        const binIndex = Math.floor((i / vertexCount) * (freqData.length / 2));
        const freqVal = (freqData[binIndex] || 0) / 255;
        const freqDisplacement = freqVal * (45 * (1 + bassEnergy));

        const r = baseRadius * shapeFactor + freqDisplacement;
        const vx = centerX + Math.cos(theta) * r;
        const vy = centerY + Math.sin(theta) * r;
        vertices.push([vx, vy]);
      }

      // Draw filled central glowing aura
      ctx.save();
      const firstVertex = vertices[0];
      if (firstVertex) {
        ctx.beginPath();
        ctx.moveTo(firstVertex[0], firstVertex[1]);
        for (let i = 1; i < vertices.length; i++) {
          const v = vertices[i];
          if (v) ctx.lineTo(v[0], v[1]);
        }
        ctx.closePath();
      }

      const shapeGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.2,
        centerX,
        centerY,
        baseRadius * 1.4,
      );
      shapeGrad.addColorStop(0, `hsla(${hue}, 95%, 65%, ${0.35 + bassEnergy * 0.35})`);
      shapeGrad.addColorStop(0.7, `hsla(${(hue + 45) % 360}, 90%, 55%, ${0.15 + midEnergy * 0.25})`);
      shapeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = shapeGrad;
      ctx.fill();

      // Draw neon stroke with dynamic shadow bloom
      ctx.shadowColor = primaryColor;
      ctx.shadowBlur = 12 + state.beatPulse * 28 + bassEnergy * 16;
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 2.5 + state.beatPulse * 2.5;
      ctx.stroke();

      // Inner energetic counter-harmonic ring
      ctx.beginPath();
      const innerRadius = baseRadius * 0.48 * (1 - state.beatPulse * 0.08);
      for (let i = 0; i < vertexCount; i += 2) {
        const theta = (i * Math.PI * 2) / vertexCount + timeSec * 0.4;
        const bin = (vertexCount - i) % 32;
        const f = (freqData[bin] || 0) / 255;
        const ir = innerRadius * (1 + f * 0.35);
        const ix = centerX + Math.cos(theta) * ir;
        const iy = centerY + Math.sin(theta) * ir;
        if (i === 0) ctx.moveTo(ix, iy);
        else ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.strokeStyle = secondaryColor;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 10;
      ctx.stroke();

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
  }, []);

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
      }`}
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

      {/* Full Canvas Background Visualizer */}
      <canvas
        ref={canvasRef}
        data-testid="epic-audio-canvas"
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Hidden native audio element */}
      <audio
        ref={audioRef}
        data-testid="epic-audio-element"
        src={src}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          if (!isLooping) {
            setCurrentTime(0);
          }
        }}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration || 0);
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
        </div>

        {/* Morphing Shape Chip & Beat Level Indicator */}
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
              {formatTime(currentTime)}
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
              {formatTime(duration)}
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
