import { useCurrentFrame } from "remotion";

/**
 * The thing that makes the film read as drawn rather than tweened.
 *
 * **On twos.** The reference holds every drawing for two frames, so motion
 * advances twelve times a second on a 24fps timeline. `useDrawing` is the
 * drawing number; anything that should move like ink reads it instead of the
 * frame, and a smooth interpolation fed by it steps the way a hand-drawn one
 * does.
 *
 * **Boil.** A finished line is never still: each drawing is a fresh trace, so
 * its edges crawl. `Boil` displaces whatever it wraps with turbulence whose
 * seed cycles through three values on twos, the classic three-drawing loop. A
 * seed that never repeated would read as noise rather than as a line being
 * re-traced; one that never changed would read as vector art.
 */
export const ON = 2;

export const useDrawing = (): number => Math.floor(useCurrentFrame() / ON);

/** `frame` snapped to the drawing it belongs to. */
export const onTwos = (frame: number): number => frame - (frame % ON);

export const Boil: React.FC<{
  /** SVG filter ids are document-global: every Boil on a stage needs its own. */
  id: string;
  /** Displacement in pixels. 2–4 for line work, 6–10 for wet ink. */
  amount?: number;
  /** Turbulence frequency: lower gives broader, slower wobble. */
  grain?: number;
  children: React.ReactNode;
}> = ({ id, amount = 3, grain = 0.018, children }) => {
  const drawing = useDrawing();
  return (
    <>
      <defs>
        <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency={grain} numOctaves={2} seed={drawing % 3} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={amount} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#${id})`}>{children}</g>
    </>
  );
};
