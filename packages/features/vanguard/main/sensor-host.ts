import type {
  NewSecurityFinding,
  SecurityFinding,
  SensorStatus,
  VanguardSensorsResponse,
  VanguardSettings,
} from '@midnite/studio-shared';

/**
 * The sensor host (Phase 120 Theme B): where Vanguard's always-on sensors (themes C-F, G) register, are
 * started and stopped, and report their state to the Sensors tab. No `electron` here: the composer injects
 * everything a sensor touches, so a sensor is testable under bare vitest with a fake of each seam.
 *
 * **Lifecycle.** `register` records a definition (no side effects). `start()` — once the policy allows it
 * and for each sensor whose switch is on — calls the sensor's `start` (long-lived watchers such as
 * `fs.watch`; may return a disposer) and then schedules `run` per its `schedule`, with one immediate run.
 * `stop()` clears every timer, aborts `ctx.signal`, and runs the disposers. A sensor never overlaps itself:
 * a run still in flight when the timer fires is skipped. A sensor that throws is `error` for that run and
 * the host carries on; one sensor can never stop another.
 *
 * **Policy.** `autostart: 'always'` (Vanguard's own app: all sensors on once installed) starts at boot.
 * `'after-view-opened'` (Studio) starts nothing until `viewOpened()` has been called once — persisted, so
 * a user who has looked at Vanguard keeps their sensors across restarts, and one who never did never has
 * `lsof` polled in an app they opened to look at a git graph.
 */

export type SensorRunProcessResult =
  | { ok: true; stdout: string; stderr: string; exitCode: number | null }
  | { ok: false; reason: 'not-installed' | 'timed-out' | 'failed'; hint: string };

/** Runs one trusted command, no shell, never rejects. The composer binds the runtime's `runProcess`. */
export type SensorRunProcess = (
  command: string,
  args: readonly string[],
  options?: { cwd?: string; timeoutMs?: number },
) => Promise<SensorRunProcessResult>;

export type SensorLogLevel = 'info' | 'warn' | 'error';

/** What the host hands every sensor. */
export interface SensorContext {
  /** The app's userData directory (injected; a sensor keeps its own state beneath `<userData>/vanguard/`). */
  userData: string;
  homeDir: string | undefined;
  now(): number;
  runProcess: SensorRunProcess;
  /**
   * The findings ledger's writer. `source` is forced to `'vanguard'`; a repeat of one `fingerprint`
   * bumps the open finding's `count` rather than adding a row (ledger rule). Each call during a `run`
   * counts toward that run's `lastFindings`.
   */
  record(finding: Omit<NewSecurityFinding, 'source'>): Promise<SecurityFinding>;
  /** The current settings (cadence, retention). Read per run; never cached by a sensor. */
  settings(): VanguardSettings;
  /** Aborted when the sensor is stopped or disabled; pass it to anything long-running. */
  signal: AbortSignal;
  log(level: SensorLogLevel, message: string): void;
}

export type SensorSchedule =
  /** Re-run every `settings().cadenceSeconds`. */
  | { kind: 'cadence' }
  /** Re-run on a fixed interval. */
  | { kind: 'interval'; ms: number }
  /** Run once at start and on "Run now" only (a sensor driven by its own watcher). */
  | { kind: 'none' };

export interface SensorRunResult {
  /** Overrides the count of `ctx.record` calls this run made. */
  findings?: number;
}

export interface SensorDefinition {
  /** Stable id: the settings key and the Sensors tab row. */
  id: string;
  label: string;
  /** One line on what it watches. */
  description: string;
  /** Switch default when the user has not chosen one. Defaults to true. */
  defaultEnabled?: boolean;
  schedule: SensorSchedule;
  /** Long-lived setup (watchers). May return a disposer, called on stop. */
  start?(ctx: SensorContext): void | (() => void) | Promise<void | (() => void)>;
  /** One pass. Throwing marks this run `error`; it does not stop the sensor. */
  run?(ctx: SensorContext): Promise<SensorRunResult | void> | SensorRunResult | void;
}

export interface SensorTimers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface SensorHostOptions {
  userData: string;
  homeDir?: string;
  runProcess: SensorRunProcess;
  /** The ledger's `record`. */
  record: (finding: NewSecurityFinding) => Promise<SecurityFinding>;
  settings: () => VanguardSettings;
  autostart: 'always' | 'after-view-opened';
  /** The sensors' state changed: the composer emits `vanguardChanged`. */
  onChanged: () => void;
  log?: (level: SensorLogLevel, message: string) => void;
  now?: () => number;
  timers?: SensorTimers;
}

export interface SensorHost {
  register(definition: SensorDefinition): void;
  status(): VanguardSensorsResponse;
  /** Start every enabled sensor if the policy allows. Idempotent. */
  start(): Promise<void>;
  /** Stop everything (quit, or the app going away). Idempotent. */
  stop(): Promise<void>;
  /** The Vanguard view was opened. Returns true the first time (the caller persists `viewOpened`). */
  viewOpened(): Promise<boolean>;
  /** Re-read `settings()`: start sensors just switched on, stop those switched off, re-time the cadence. */
  applySettings(): Promise<void>;
  runNow(id: string): Promise<boolean>;
}

const realTimers: SensorTimers = {
  setInterval: (fn, ms) => {
    const handle = setInterval(fn, ms);
    (handle as { unref?: () => void }).unref?.();
    return handle;
  },
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

interface Slot {
  def: SensorDefinition;
  state: SensorStatus['state'];
  lastRunAt: number | null;
  lastDurationMs: number | null;
  lastFindings: number;
  error?: string;
  started: boolean;
  running: boolean;
  timer: unknown;
  /** The `cadenceSeconds` the timer was set with, to notice a change. */
  timerSeconds: number | null;
  abort: AbortController | null;
  dispose: (() => void) | null;
}

export function createSensorHost(options: SensorHostOptions): SensorHost {
  const timers = options.timers ?? realTimers;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);
  const slots = new Map<string, Slot>();
  let viewSeen = options.settings().viewOpened;
  let running = false;

  const allowed = (): boolean => options.autostart === 'always' || viewSeen;
  const enabledFor = (slot: Slot): boolean => options.settings().sensors[slot.def.id] ?? slot.def.defaultEnabled ?? true;
  const changed = (): void => options.onChanged();

  const contextFor = (slot: Slot, counter: { n: number }): SensorContext => ({
    userData: options.userData,
    homeDir: options.homeDir,
    now,
    runProcess: options.runProcess,
    record: async (finding) => {
      counter.n += 1;
      return options.record({ ...finding, source: 'vanguard' });
    },
    settings: options.settings,
    signal: (slot.abort ??= new AbortController()).signal,
    log: (level, message) => log(level, `[${slot.def.id}] ${message}`),
  });

  async function runOnce(slot: Slot): Promise<void> {
    if (slot.running || !slot.started || slot.def.run === undefined) return;
    slot.running = true;
    slot.state = 'running';
    changed();
    const began = now();
    const counter = { n: 0 };
    try {
      const result = await slot.def.run(contextFor(slot, counter));
      slot.lastFindings = result?.findings ?? counter.n;
      slot.state = 'idle';
      delete slot.error;
    } catch (error) {
      slot.state = 'error';
      slot.error = error instanceof Error ? error.message : String(error);
      slot.lastFindings = counter.n;
      log('warn', `[${slot.def.id}] run failed: ${slot.error}`);
    } finally {
      slot.running = false;
      slot.lastRunAt = now();
      slot.lastDurationMs = Math.max(0, slot.lastRunAt - began);
      if (slot.started) changed();
    }
  }

  const intervalMs = (slot: Slot): number | null => {
    const { schedule } = slot.def;
    if (schedule.kind === 'none') return null;
    return schedule.kind === 'interval' ? schedule.ms : options.settings().cadenceSeconds * 1000;
  };

  const retime = (slot: Slot): void => {
    if (slot.timer !== null) timers.clearInterval(slot.timer);
    slot.timer = null;
    const ms = intervalMs(slot);
    slot.timerSeconds = options.settings().cadenceSeconds;
    if (ms !== null) slot.timer = timers.setInterval(() => void runOnce(slot), ms);
  };

  async function startSlot(slot: Slot): Promise<void> {
    if (slot.started) return;
    slot.started = true;
    slot.abort = new AbortController();
    slot.state = 'idle';
    try {
      const disposer = await slot.def.start?.(contextFor(slot, { n: 0 }));
      slot.dispose = typeof disposer === 'function' ? disposer : null;
    } catch (error) {
      slot.state = 'error';
      slot.error = error instanceof Error ? error.message : String(error);
      log('warn', `[${slot.def.id}] start failed: ${slot.error}`);
    }
    retime(slot);
    changed();
    await runOnce(slot);
  }

  async function stopSlot(slot: Slot): Promise<void> {
    if (!slot.started) {
      slot.state = 'disabled';
      return;
    }
    slot.started = false;
    if (slot.timer !== null) timers.clearInterval(slot.timer);
    slot.timer = null;
    slot.abort?.abort();
    slot.abort = null;
    try {
      slot.dispose?.();
    } catch (error) {
      log('warn', `[${slot.def.id}] dispose failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    slot.dispose = null;
    slot.state = 'disabled';
  }

  async function reconcile(): Promise<void> {
    for (const slot of slots.values()) {
      const want = running && allowed() && enabledFor(slot);
      if (want && !slot.started) await startSlot(slot);
      else if (!want && slot.started) {
        await stopSlot(slot);
        changed();
      } else if (want && slot.timerSeconds !== options.settings().cadenceSeconds) retime(slot);
    }
    changed();
  }

  return {
    register(def) {
      if (slots.has(def.id)) throw new Error(`Sensor '${def.id}' is already registered`);
      const slot: Slot = {
        def,
        state: 'disabled',
        lastRunAt: null,
        lastDurationMs: null,
        lastFindings: 0,
        started: false,
        running: false,
        timer: null,
        timerSeconds: null,
        abort: null,
        dispose: null,
      };
      slots.set(def.id, slot);
      // A sensor registered after start() joins the running host.
      if (running && allowed() && enabledFor(slot)) void startSlot(slot);
    },
    status() {
      const sensors: SensorStatus[] = [...slots.values()].map((slot) => ({
        id: slot.def.id,
        label: slot.def.label,
        description: slot.def.description,
        state: slot.state,
        enabled: enabledFor(slot),
        lastRunAt: slot.lastRunAt,
        lastDurationMs: slot.lastDurationMs,
        lastFindings: slot.lastFindings,
        ...(slot.error !== undefined ? { error: slot.error } : {}),
      }));
      return { sensors, active: running && allowed() };
    },
    async start() {
      running = true;
      await reconcile();
    },
    async stop() {
      running = false;
      for (const slot of slots.values()) await stopSlot(slot);
      changed();
    },
    async viewOpened() {
      const first = !viewSeen;
      viewSeen = true;
      if (running) await reconcile();
      return first;
    },
    applySettings: reconcile,
    async runNow(id) {
      const slot = slots.get(id);
      if (slot === undefined || !slot.started) return false;
      await runOnce(slot);
      return true;
    },
  };
}
