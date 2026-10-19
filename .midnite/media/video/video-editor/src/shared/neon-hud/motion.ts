import { Easing, interpolate } from "remotion";

/**
 * The kit's one easing. Everything in the reference arrives fast and settles
 * long — an expo-out — and nothing overshoots: a spring's bounce reads as
 * playful, which this look is not.
 */
export const OUT = Easing.bezier(0.16, 1, 0.3, 1);

/** 0→1 over `[from, from + dur]`, eased, clamped both ends. */
export const ramp = (frame: number, from: number, dur: number, easing = OUT): number =>
  interpolate(frame, [from, from + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

/** Linear count from 0 to `to`, for readouts that tick up. */
export const countUp = (frame: number, from: number, dur: number, to: number): number =>
  to * ramp(frame, from, dur, Easing.out(Easing.quad));
