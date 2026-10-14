import { useEffect, useRef } from 'react';

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

type OrbitPhase = 'orbit' | 'ellipsis' | 'pulse' | 'ring' | 'juggle' | 'bounce' | 'conveyor';

export type SpinnerMode = 'active' | 'waiting' | 'idle';

const SEQUENCES: Record<'default' | SpinnerMode, OrbitPhase[]> = {
  default: ['orbit', 'ellipsis', 'orbit', 'ring', 'orbit', 'juggle', 'orbit', 'bounce', 'orbit', 'conveyor'],
  active: ['orbit', 'ring', 'orbit', 'juggle', 'orbit', 'bounce'],
  waiting: ['ellipsis', 'pulse', 'ellipsis', 'conveyor'],
  idle: ['pulse', 'ellipsis', 'pulse', 'conveyor'],
};

const DWELL_MS = { orbit: 2200, other: 3600 } as const;
const BLEND_MS = 900;
const DOT_SIZE = 9;

type DotState = { x: number; y: number; o: number; s: number };

function dotPosition(variant: OrbitPhase, i: number, tSec: number): DotState {
  if (variant === 'ellipsis') {
    const period = 1.3;
    const angle = ((tSec - i * 0.16) / period) * Math.PI * 2;
    const bounce = Math.max(0, Math.sin(angle));
    return { x: (i - 1) * 15, y: -11 * bounce, o: 0.4 + 0.6 * bounce, s: 0.9 + 0.25 * bounce };
  }
  if (variant === 'pulse') {
    const wave = 0.5 + 0.5 * Math.sin(tSec * ((Math.PI * 2) / 2.6) - i * 0.9);
    return { x: (i - 1) * 15, y: 0, o: 0.3 + 0.7 * wave, s: 0.72 + 0.48 * wave };
  }
  if (variant === 'juggle') {
    const period = 1.4;
    const bottomShare = 0.68;
    const span = 16;
    const arc = 17;
    const p = (((tSec / period + i / 3) % 1) + 1) % 1;
    if (p < bottomShare) {
      const f = p / bottomShare;
      return { x: -span + 2 * span * f, y: 0, o: 1, s: 1 };
    }
    const pp = (p - bottomShare) / (1 - bottomShare);
    return { x: span * Math.cos(Math.PI * pp), y: -arc * Math.sin(Math.PI * pp), o: 1, s: 1.12 };
  }
  if (variant === 'bounce') {
    const period = 1.4;
    const spacing = 16;
    const arc = 20;
    const x = (i - 1) * spacing;
    const local = (((tSec / period - i / 3) % 1) + 1) % 1;
    const hopWindow = 1 / 3;
    const hop = local < hopWindow ? Math.sin((local / hopWindow) * Math.PI) : 0;
    return { x, y: -arc * hop, o: 1, s: 1 + 0.15 * hop };
  }
  if (variant === 'conveyor') {
    const period = 1.3;
    const S = 18;
    const OFF = 44;
    const tracks: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
      [[0, -OFF], [0.3333, -OFF], [0.4, -S], [0.8333, -S], [1, OFF]],
      [[0, -OFF], [0.1667, -OFF], [0.3333, 0], [0.6667, 0], [0.8333, OFF], [1, OFF]],
      [[0, -OFF], [0.1667, S], [0.6, S], [0.6667, OFF], [1, OFF]],
    ];
    const track = tracks[i] ?? tracks[0]!;
    const u = (((tSec / period) % 1) + 1) % 1;
    let x = track[track.length - 1]?.[1] ?? OFF;
    for (let k = 0; k < track.length - 1; k += 1) {
      const a = track[k];
      const b = track[k + 1];
      if (!a || !b) continue;
      const [u0, x0] = a;
      const [u1, x1] = b;
      if (u >= u0 && u <= u1) {
        const f = u1 === u0 ? 0 : (u - u0) / (u1 - u0);
        x = x0 + (x1 - x0) * f;
        break;
      }
    }
    return { x, y: 0, o: clamp((OFF - Math.abs(x)) / (OFF - S), 0, 1), s: 1 };
  }
  const angle = (tSec / 1.5) * Math.PI * 2 + i * ((Math.PI * 2) / 3);
  const radius = variant === 'ring' ? 20 : 15 + 6 * Math.sin((tSec / 1.5) * Math.PI * 2);
  const s = variant === 'ring' ? 1 : 0.95 + 0.15 * ((radius - 9) / 12);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, o: 1, s };
}

function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
}

export type SpinnerVariant = 'orbit' | 'breathe' | 'jitter' | 'tumble';

export function Spinner({
  variant = 'orbit',
  mode,
  label = 'Working...',
}: { variant?: SpinnerVariant; mode?: SpinnerMode; label?: string } = {}) {
  const dotsRef = useRef<Array<HTMLSpanElement | null>>([null, null, null]);
  const modeRef = useRef<SpinnerMode | undefined>(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (variant !== 'orbit') return;
    const dots = dotsRef.current;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dots.forEach((el, i) => {
        if (!el) return;
        const a = i * ((Math.PI * 2) / 3);
        el.style.transform = `translate(${Math.cos(a) * 18}px, ${Math.sin(a) * 18}px)`;
        el.style.opacity = '1';
      });
      return;
    }

    const t0 = performance.now();
    let raf = 0;
    let seq = SEQUENCES[modeRef.current ?? 'default'];
    let stepIdx = 0;
    let prev: OrbitPhase = seq[0] ?? 'orbit';
    let target: OrbitPhase = seq[0] ?? 'orbit';
    let blendStart = -Infinity;
    let nextSwitchAt = t0 + (target === 'orbit' ? DWELL_MS.orbit : DWELL_MS.other);

    const frame = (now: number) => {
      const tSec = (now - t0) / 1000;

      const nextSeq = SEQUENCES[modeRef.current ?? 'default'];
      if (nextSeq !== seq) {
        seq = nextSeq;
        stepIdx = 0;
        prev = target;
        target = seq[0] ?? 'orbit';
        blendStart = now;
        nextSwitchAt = now + (target === 'orbit' ? DWELL_MS.orbit : DWELL_MS.other);
      } else if (now >= nextSwitchAt) {
        stepIdx = (stepIdx + 1) % seq.length;
        prev = target;
        target = seq[stepIdx] ?? 'orbit';
        blendStart = now;
        nextSwitchAt = now + (target === 'orbit' ? DWELL_MS.orbit : DWELL_MS.other);
      }

      const k = easeInOut(clamp((now - blendStart) / BLEND_MS, 0, 1));
      for (let i = 0; i < 3; i += 1) {
        const el = dots[i];
        if (!el) continue;
        const a = dotPosition(prev, i, tSec);
        const b = dotPosition(target, i, tSec);
        const x = a.x + (b.x - a.x) * k;
        const y = a.y + (b.y - a.y) * k;
        const o = a.o + (b.o - a.o) * k;
        const s = a.s + (b.s - a.s) * k;
        el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(3)})`;
        el.style.opacity = o.toFixed(3);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [variant]);

  if (variant !== 'orbit') {
    return <div className={`spinner-${variant}`} role="status" aria-label={label} />;
  }

  return (
    <div className="relative h-14 w-14" role="status" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          ref={(el) => {
            dotsRef.current[i] = el;
          }}
          className="absolute rounded-full bg-foreground"
          style={{
            height: DOT_SIZE,
            width: DOT_SIZE,
            left: '50%',
            top: '50%',
            marginLeft: -DOT_SIZE / 2,
            marginTop: -DOT_SIZE / 2,
            opacity: 0,
            boxShadow: [
              `0 0 ${DOT_SIZE * 1.5}px hsl(var(--sv-tint, var(--foreground)) / 0.45)`,
              `0 0 ${DOT_SIZE * 3.5}px hsl(var(--sv-tint, var(--foreground)) / 0.2)`,
            ].join(', '),
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  );
}

export function WidgetLoader({ variant }: { variant?: SpinnerVariant } = {}) {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner variant={variant} />
    </div>
  );
}
