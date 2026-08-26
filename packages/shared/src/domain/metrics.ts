import { z } from 'zod';

/**
 * A reading of what the machine is doing, sampled in main and pushed to the
 * renderer's footer.
 *
 * **Every metric is optional, and that is the whole design.** A machine whose
 * GPU counter cannot be read and a GPU sitting at 0% are different answers, and
 * they have to stay different all the way to the chart: a flat zero line is a
 * lie about a working GPU, and a missing dot is the honest rendering of "we
 * could not tell". Omission is how "not readable here" crosses the wire —
 * never a sentinel, never a zero.
 *
 * The percentages are pre-normalised to 0–100 in main, so the chart has no
 * y-scaling pass to run. The byte figures beside them are not a second source
 * of truth for the percentage; they exist because a legend reading
 * "12.4 / 32 GB" says something the percentage cannot.
 */

/** The metrics a sample can carry, in the order the footer renders them. */
export const METRIC_IDS = ['cpu', 'memory', 'gpu', 'disk'] as const;
export type MetricId = (typeof METRIC_IDS)[number];

/** A percentage, already normalised in main. Clamped rather than trusted. */
const Percent = z.number().min(0).max(100);
const Bytes = z.number().nonnegative();

/** Used-of-total, for the readouts a bare percentage under-describes. */
const ByteUsage = z.object({ used: Bytes, total: Bytes });

export const MetricSampleSchema = z.object({
  /** Unix millis the sample was taken. */
  at: z.number().int().nonnegative(),
  cpu: Percent.optional(),
  memory: Percent.optional(),
  gpu: Percent.optional(),
  disk: Percent.optional(),
  /** Physical memory behind `memory`, for the flyout legend. */
  memoryBytes: ByteUsage.optional(),
  /** Filesystem capacity behind `disk`, for the gauge. */
  diskBytes: ByteUsage.optional(),
  /** Core count and 1-minute load average, for the CPU legend. */
  cpuInfo: z
    .object({
      cores: z.number().int().positive(),
      /**
       * Omitted on win32, where libuv hard-codes `os.loadavg()` to zeros — a
       * reported 0.00 there would be indistinguishable from a genuinely idle
       * machine.
       */
      load1: z.number().nonnegative().optional(),
    })
    .optional(),
});
export type MetricSample = z.infer<typeof MetricSampleSchema>;

/** Which of the four a sample actually carries a percentage for. */
export const metricsPresent = (sample: MetricSample): MetricId[] =>
  METRIC_IDS.filter((id) => typeof sample[id] === 'number');

/**
 * Sampling cadence, in milliseconds.
 *
 * The renderer picks one of the two and main enforces the bounds. Cadence is a
 * consequence of what is on screen rather than a setting anyone has to think
 * about: the flyout is a chart and wants points, the sparklines are 24px wide
 * and do not.
 *
 * The floor exists because the GPU probe spawns a subprocess per tick — a
 * renderer bug asking for 10ms would fork-bomb the machine. The ceiling exists
 * so a mistyped value cannot leave the footer looking frozen.
 */
export const METRICS_MIN_INTERVAL_MS = 1_000;
export const METRICS_MAX_INTERVAL_MS = 60_000;
/** With the flyout open. */
export const METRICS_ACTIVE_INTERVAL_MS = 2_000;
/** With only the footer sparklines on screen. */
export const METRICS_IDLE_INTERVAL_MS = 5_000;
