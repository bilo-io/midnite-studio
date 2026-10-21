import { THEME, type Theme } from "./brand";

/**
 * A spectrum ring around the mark, and motes riding it.
 *
 * Spokes standing off the crescent's edge, each as long as one band of the
 * track is loud on this frame — the music made into a shape rather than into a
 * brightness. It sits inside the mark's glow and is drawn from the same ramp, so
 * what it reads as is the *glow* having structure, which is what the brief asked
 * for by calling it a waveform in the gradient.
 *
 * ── Why the bands have to be normalised against themselves ─────────────────
 *
 * A mix is thirty-odd decibels louder at 110Hz than at 7kHz. Scaled against one
 * common maximum, the low spokes swing the full radius and the rest are a flat
 * stub that never moves — a ring that is really a two-spoke meter. Each band in
 * `energy.ts` is therefore scaled against its own 99th percentile, so every
 * spoke has a full range to move in. See `scripts/make-track-envelope.mjs`.
 *
 * ── The ring is symmetric, and that is a decision ──────────────────────────
 *
 * The bands are mapped out from the top and mirrored back, so bass is at twelve
 * o'clock, treble at the sides, and the left half is the right half reflected.
 * Wrapping them once around the circle instead puts the loudest band next to the
 * quietest at the seam, which reads as a notch cut out of the ring — and a ring
 * with a notch in it reads as broken rather than as asymmetric. A mirrored ring
 * is what every hardware analyser does, for the same reason.
 *
 * ── Deterministic in the frame, like everything else ───────────────────────
 *
 * `bands` and `frame` are props: the caller reads them out of the baked
 * envelope. Nothing here samples audio, holds state or runs an effect, so a
 * re-render of any single frame is identical and scrubbing backwards works.
 */

/** Spokes in the ring. Enough to read as continuous at the size a logo is. */
const SPOKES = 72;
/** Motes riding the ring. */
const MOTES = 16;
/** Golden-ratio conjugate — the classic low-discrepancy angular spacing. */
const PHI = 0.6180339887;

export const MarkWaveform: React.FC<{
  /** The mark's own height in px; everything here is relative to it. */
  size: number;
  /** One value per band, 0…1 — `bandsAt(frame)` from a project's `energy.ts`. */
  bands: readonly number[];
  frame: number;
  theme?: Theme;
  /**
   * Overall strength, 0…1. Scale it with how big the mark is: at a 46px caption
   * bullet a spectrum ring is a smudge, and drawing one there costs the same as
   * drawing one worth looking at.
   */
  strength?: number;
}> = ({ size, bands, frame, theme = "dark", strength = 1 }) => {
  if (strength <= 0 || bands.length === 0) return null;

  const ramp = THEME[theme].RAINBOW;
  /** The box the ring is drawn in — generous, because the motes travel. */
  const box = size * 3;
  const mid = box / 2;

  /** Where the spokes start: just clear of the crescent. */
  const inner = size * 0.62;
  /** How far the longest spoke reaches past that. */
  const reach = size * 0.46;

  /* The whole ring turns, slowly and against the glow's own rotation. */
  const spin = (frame * -0.55) % 360;

  /** The band at fraction `t` of the way from the top of the ring to the bottom. */
  const at = (t: number): number => {
    const x = t * (bands.length - 1);
    const i = Math.min(bands.length - 2, Math.floor(x));
    return bands[i] + (bands[i + 1] - bands[i]) * (x - i);
  };

  /** How loud the whole frame is — what the motes ride out on. */
  const level = bands.reduce((a, b) => a + b, 0) / bands.length;

  const spokes = [];
  for (let i = 0; i < SPOKES; i++) {
    const turn = i / SPOKES;
    /* Mirrored: 0 at the top, 1 at the bottom, back to 0 — see the note above. */
    const v = at(Math.abs(turn * 2 - 1));
    const angle = turn * Math.PI * 2 - Math.PI / 2;
    const from = inner;
    const to = inner + size * 0.05 + v * reach;
    spokes.push({
      key: i,
      x1: mid + Math.cos(angle) * from,
      y1: mid + Math.sin(angle) * from,
      x2: mid + Math.cos(angle) * to,
      y2: mid + Math.sin(angle) * to,
      colour: ramp[Math.floor(turn * ramp.length) % ramp.length],
      opacity: 0.38 + v * 0.58,
    });
  }

  const motes = [];
  for (let i = 0; i < MOTES; i++) {
    /*
      Placed by the golden-ratio conjugate rather than evenly, so the ring never
      shows a rank of dots lining up with a rank of spokes — and drifting on an
      incommensurable period, so the pattern does not repeat inside a cut.
    */
    const turn = (i * PHI) % 1;
    const angle = turn * Math.PI * 2 + frame * 0.006 * (i % 2 ? 1 : -1);
    const v = at(Math.abs(((turn + 0.5) % 1) * 2 - 1));
    const r = inner + size * (0.22 + 0.5 * level) + v * reach * 0.7;
    motes.push({
      key: i,
      cx: mid + Math.cos(angle) * r,
      cy: mid + Math.sin(angle) * r,
      radius: size * (0.008 + v * 0.016),
      colour: ramp[i % ramp.length],
      opacity: 0.40 + v * 0.54,
    });
  }

  return (
    <svg
      aria-hidden
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      style={{
        position: "absolute",
        left: (size - box) / 2,
        top: (size - box) / 2,
        opacity: strength,
        /*
          A little blur, so the ring sits *in* the glow rather than on top of it
          as a diagram. Small enough that the spokes keep their ends.
        */
        filter: `blur(${(size * 0.012).toFixed(2)}px)`,
        pointerEvents: "none",
      }}
    >
      <g transform={`rotate(${spin} ${mid} ${mid})`}>
        {spokes.map((s) => (
          <line
            key={s.key}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={s.colour}
            strokeWidth={size * 0.018}
            strokeLinecap="round"
            opacity={s.opacity}
          />
        ))}
        {motes.map((m) => (
          <circle key={m.key} cx={m.cx} cy={m.cy} r={m.radius} fill={m.colour} opacity={m.opacity} />
        ))}
      </g>
    </svg>
  );
};
