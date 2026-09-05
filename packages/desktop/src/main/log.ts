import type { LogLevel, LogSink } from './log-sink';

/**
 * The main process's one log seam.
 *
 * Main has no logger framework and does not want one: eight files import this
 * module directly and roughly thirty-four more take it as an injected
 * `log: Logger` parameter, and every one of them already produces a good line.
 * What they lacked until Phase 65 was anywhere for those lines to go.
 *
 * **The header that used to sit here was wrong**, and worth naming because it
 * is the reason a reader would assume this work already existed: it claimed the
 * broker "redirects this seam to `<userData>/broker/<version>.log`". It does
 * not. `broker-client.ts` hands a file descriptor to the detached *child's*
 * `stdio`, redirecting the broker process's own stdout — this seam has never
 * reached disk. It does now, through {@link setLogSink}, which `index.ts` wires
 * to `<userData>/logs/main.log` beside every other `userData` writer.
 *
 * The type is **callable with methods**, not an interface replacing the call
 * signature. That is deliberate (phase Decision 1): a plain `{info, warn,
 * error}` interface is cleaner on paper and costs a diff across ~40 call sites
 * in a phase whose entire point is that those call sites are fine. The bare
 * call stays exactly what `defaultLogger` always did — `warn` — so nothing
 * silently changes level, and a caller opts into `error` when it has a reason.
 */
export type Logger = ((message: string) => void) & {
  info(message: string): void;
  warn(message: string): void;
  /** `err` is appended, formatted; a thrown non-`Error` is stringified rather than dropped. */
  error(message: string, err?: unknown): void;
};

/**
 * Where records go in addition to the console.
 *
 * Module state rather than a constructor argument because the sink cannot exist
 * until `userData` is resolved (`app.getPath` needs `whenReady`), while
 * `defaultLogger` is imported at module-evaluation time by files that log
 * during boot. Lines produced before the sink is installed reach the console
 * and are lost — which is the pre-Phase-65 behaviour for every line, and is why
 * the wiring in `index.ts` happens as early as it does.
 */
let sink: LogSink | null = null;

/** Install (or, with `null`, remove) the file sink. `index.ts` calls this once. */
export function setLogSink(next: LogSink | null): void {
  sink = next;
}

/** The installed sink, for the handlers that need its path or its tail. */
export function getLogSink(): LogSink | null {
  return sink;
}

/**
 * An unknown thrown value as one line of text.
 *
 * `unknown` and not `Error` because `throw 'string'` and a rejected promise
 * carrying an object both reach here, and a record saying `[object Object]` is
 * the record that wastes the bug report.
 */
export function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack && err.stack.length > 0 ? err.stack : `${err.name}: ${err.message}`;
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

function emit(level: LogLevel, message: string): void {
  /* eslint-disable no-console */
  // The console stays, unconditionally: it is what a `moon run desktop:start`
  // session reads, and it is the fallback the sink degrades to.
  if (level === 'error') console.error(message);
  else console.warn(message);
  /* eslint-enable no-console */
  try {
    sink?.write(level, message);
  } catch {
    // The sink promises not to throw; this is the belt to that braces. A logger
    // that can crash its caller is worse than no logger.
  }
}

/** Build a logger over the module-level sink. One is enough, but tests want their own. */
export function createLogger(): Logger {
  const logger = ((message: string) => emit('warn', message)) as Logger;
  logger.info = (message) => emit('info', message);
  logger.warn = (message) => emit('warn', message);
  logger.error = (message, err) =>
    emit('error', err === undefined ? message : `${message}\n${formatError(err)}`);
  return logger;
}

export const defaultLogger: Logger = createLogger();

/**
 * Lift a plain `(message) => void` into a full {@link Logger}, every level
 * routed to the same function.
 *
 * The one thing Decision 1's callable-with-methods type does NOT give for free:
 * a `Logger` is assignable where a bare function is wanted, but not the other
 * way round, so a test or a caller that already has a collector function needs
 * this to hand it to a module that takes a `Logger`. Levels are flattened
 * deliberately — a collector that cared about levels would take a `LogSink`.
 */
export function loggerFrom(write: (message: string) => void): Logger {
  const logger = ((message: string) => write(message)) as Logger;
  logger.info = write;
  logger.warn = write;
  logger.error = (message, err) =>
    write(err === undefined ? message : `${message}\n${formatError(err)}`);
  return logger;
}
