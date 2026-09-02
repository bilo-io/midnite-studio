/**
 * A flag-gated heap sampler — Phase 45 Theme A.
 *
 * Shaped like the two existing `MSTUDIO_PERF` closures this phase's doc names —
 * `agent-process.ts`'s ps-probe counter, `broker/server.ts`'s broadcast
 * counter — reporting on an `unref()`'d interval rather than per call, and a
 * true no-op (nothing scheduled) when the flag is unset.
 *
 * This is the one place the phase *amends* the "measure from outside" rule the
 * rest of `scripts/perf/` follows rather than honouring it: `ps -o rss=` sees
 * total resident memory but cannot separate V8 heap from RSS, and that
 * distinction is what tells a leak from allocator fragmentation. Gated behind
 * the existing flag, a no-op otherwise, and nothing in the product build reads
 * it — the same standing `createBootMark` already has.
 *
 * Lives at the package root, not under `main/` or `broker/`, because both
 * processes need the identical closure and main already reaches into `broker/`
 * for `protocol.ts` — a cross-import between the two is established, not new.
 */
export type MemorySample = Pick<
  NodeJS.MemoryUsage,
  'rss' | 'heapUsed' | 'heapTotal' | 'external' | 'arrayBuffers'
>;

const toMb = (bytes: number): number => Math.round(bytes / (1024 * 1024));

/**
 * The pure half: one sample in, one log line out. Exported separately so a
 * test can drive it without waiting on a real interval.
 */
export function createHeapReport(opts: {
  processName: 'main' | 'broker';
  log: (message: string) => void;
  sample: () => MemorySample;
}): () => void {
  return () => {
    const mem = opts.sample();
    opts.log(
      `[perf] ${opts.processName} heap rss=${toMb(mem.rss)} heapUsed=${toMb(mem.heapUsed)} ` +
        `heapTotal=${toMb(mem.heapTotal)} external=${toMb(mem.external)} ` +
        `arrayBuffers=${toMb(mem.arrayBuffers)}`,
    );
  };
}

/**
 * Wires the report onto an `unref()`'d interval, or schedules nothing at all.
 *
 * `intervalMs` defaults to 10s, matching the other two counters' reporting
 * cadence — frequent enough that `memory-report.mjs`'s cycles land inside it,
 * infrequent enough that the log line is never the cost being measured.
 */
export function startHeapSampler(opts: {
  enabled: boolean;
  processName: 'main' | 'broker';
  log: (message: string) => void;
  sample?: () => MemorySample;
  intervalMs?: number;
}): void {
  if (!opts.enabled) return;
  const report = createHeapReport({
    processName: opts.processName,
    log: opts.log,
    sample: opts.sample ?? (() => process.memoryUsage()),
  });
  const timer = setInterval(report, opts.intervalMs ?? 10_000);
  timer.unref?.();
}
