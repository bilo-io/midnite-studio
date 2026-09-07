import vm from 'node:vm';

import { COUNCIL_OUTPUT_CAP_BYTES, type AssertionResult, type ScriptContext, type ScriptRun } from '@midnite/studio-shared';

import { appendCapped } from '../council-output';

/**
 * Phase 70 Theme B — the sandboxed `pm.*` runner.
 *
 * **This is the one file in the whole app that executes arbitrary
 * user-supplied JavaScript.** A Postman collection is a file a colleague
 * sends you; the only thing distinguishing its `event[].script.exec` from a
 * shell script they send you is that it looks like data.
 * `workflow/executors/transform.ts` declined to do this once, in writing,
 * on the grounds that it "would drag a security review into a phase that
 * otherwise has none" (Phase 43). This phase accepts that cost
 * deliberately, in this one reviewable place.
 *
 * **Departure from the phase doc, made explicitly by the user requesting
 * this theme:** the doc specifies this `vm` sandbox running in Electron's
 * *main* process and never considers the alternative. It instead runs
 * inside a spawned `utilityProcess` (`script-runner-worker.ts`, managed by
 * `script-runner-broker.ts`) — its own OS process, its own memory space, no
 * Electron APIs, no main-process privileges. This function itself is the
 * pure sandbox logic, run identically whichever process calls it (which is
 * also why it is what `script-runner.test.ts` exercises directly, with no
 * utilityProcess in the loop); the worker file is a thin wrapper that calls
 * it in response to one message and posts the result back.
 *
 * **`vm` is not a security boundary, and nothing here should be read as
 * treating it as one.** Node's own documentation is explicit that the `vm`
 * module does not provide true isolation — a sufficiently determined script
 * can still reach the host's global scope through shared object prototypes
 * (`(() => {}).constructor` is `Function`, `[].constructor` is `Array`,
 * every constructor's own `constructor` chain eventually reaches something
 * defined outside the context). The actual boundary is three things
 * stacked, in order of how much they are trusted to hold alone:
 *
 * 1. **The allow-list.** The sandbox object below is every global a script
 *    can see, built by hand rather than inherited from anything — no
 *    `require`, no `process`, no `Buffer`, no `globalThis`, no `module`. A
 *    script that cannot reach a constructor with genuine host power (`Buffer`,
 *    a `require` function, a live `process`) cannot do anything a `vm`
 *    context's own prototype-chain leakiness alone would exploit.
 * 2. **The utilityProcess.** Even a full escape past (1) — a script that
 *    somehow synthesises a `Function` and calls it — lands in a process
 *    with no Electron APIs, no filesystem access this app's own code wired
 *    up, and no window handles. It is a bare Node process a webpage-shaped
 *    input got to run code in, which is bad, but it is not this user's
 *    repository, their other open tabs, or their OS keychain.
 * 3. **The consent gate.** Nothing above runs at all until the user has
 *    said yes to the specific collection — see `collection-trust.ts` and
 *    the IPC handler that checks it before ever calling `runScript`.
 *
 * `codeGeneration: {strings: false, wasm: false}` on the context kills
 * `eval` and `new Function` from *inside* the context outright — the first
 * thing an escape attempt reaches for — and `timeout` bounds synchronous
 * execution. Neither stops an `await`-shaped hang, which is why the sandbox
 * exposes no async primitive at all (see the sandbox builder below); a
 * script that cannot start an async operation cannot hang one past the
 * timeout.
 */

/** `pm.expect(...).to.X` where `X` was not one of the pinned methods. Always
 *  thrown, never returned — "unsupported" is a named failure the author can
 *  act on, not `undefined is not a function`. */
class UnsupportedExpectation extends TypeError {
  constructor(path: string) {
    super(`pm.expect(...).${path} is not supported`);
    this.name = 'TypeError';
  }
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Structural deep equality — arrays and plain objects only, which is every
 *  shape a `pm.test` actually compares (JSON bodies, header maps, arrays of
 *  ids). `Object.is` first so `NaN`/`-0` compare the way `.eql` should. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

function typeOf(value: unknown, type: string): boolean {
  if (type === 'array') return Array.isArray(value);
  if (type === 'null') return value === null;
  return typeof value === type;
}

/**
 * A property-access proxy that throws {@link UnsupportedExpectation} for any
 * key not present in `target` — the mechanism behind "anything else throws
 * a named TypeError" for the whole `pm.expect` surface, applied uniformly
 * at every level of the chain (`.to`, `.be`, `.have`) rather than only at
 * the top.
 */
function pinnedProxy<T extends object>(target: T, pathPrefix: string): T {
  return new Proxy(target, {
    get(obj, prop) {
      if (typeof prop === 'symbol') return (obj as Record<PropertyKey, unknown>)[prop];
      if (Object.prototype.hasOwnProperty.call(obj, prop) || prop in obj) {
        return (obj as Record<string, unknown>)[prop];
      }
      throw new UnsupportedExpectation(`${pathPrefix}${prop}`);
    },
  });
}

/**
 * `pm.expect(actual)` — a fixed, small chai-like subset. `.to`/`.not` are
 * plain accessors (getters) that either no-op or flip the shared `negate`
 * flag and hand back the same chain; every method call below is where an
 * assertion actually runs, throwing a plain `Error` (never a bespoke type)
 * on failure so a caller's `try/catch` around `pm.test`'s body needs no
 * special-casing.
 */
function makeExpect(actual: unknown): unknown {
  let negate = false;

  function assert(pass: boolean, message: string): void {
    const ok = negate ? !pass : pass;
    negate = false; // one assertion consumes the flag, same as chai
    if (!ok) throw new Error(message);
  }

  const beTarget = {
    get to() {
      return chain;
    },
    get not() {
      negate = !negate;
      return be;
    },
    get true(): undefined {
      assert(actual === true, `expected ${stringify(actual)} to be true`);
      return undefined;
    },
    get false(): undefined {
      assert(actual === false, `expected ${stringify(actual)} to be false`);
      return undefined;
    },
    get null(): undefined {
      assert(actual === null, `expected ${stringify(actual)} to be null`);
      return undefined;
    },
    get undefined(): undefined {
      assert(actual === undefined, `expected ${stringify(actual)} to be undefined`);
      return undefined;
    },
    a(type: string) {
      assert(typeOf(actual, type), `expected ${stringify(actual)} to be a ${type}`);
    },
    above(n: number) {
      assert(
        typeof actual === 'number' && actual > n,
        `expected ${stringify(actual)} to be above ${n}`,
      );
    },
    below(n: number) {
      assert(
        typeof actual === 'number' && actual < n,
        `expected ${stringify(actual)} to be below ${n}`,
      );
    },
  };
  const be = pinnedProxy(beTarget, 'to.be.');

  const haveTarget = {
    get to() {
      return chain;
    },
    get not() {
      negate = !negate;
      return have;
    },
    property(key: string) {
      assert(
        actual !== null && typeof actual === 'object' && key in (actual as object),
        `expected ${stringify(actual)} to have property "${key}"`,
      );
    },
    status(n: number) {
      const code =
        actual !== null && typeof actual === 'object' && 'code' in (actual as object)
          ? (actual as { code: unknown }).code
          : actual;
      assert(code === n, `expected status ${stringify(code)} to be ${n}`);
    },
  };
  const have = pinnedProxy(haveTarget, 'to.have.');

  const chainTarget = {
    get to() {
      return chain;
    },
    get not() {
      negate = !negate;
      return chain;
    },
    get be() {
      return be;
    },
    get have() {
      return have;
    },
    equal(expected: unknown) {
      assert(actual === expected, `expected ${stringify(actual)} to equal ${stringify(expected)}`);
    },
    eql(expected: unknown) {
      assert(deepEqual(actual, expected), `expected ${stringify(actual)} to eql ${stringify(expected)}`);
    },
    include(expected: unknown) {
      const pass =
        (typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected)) ||
        (Array.isArray(actual) && actual.some((item) => deepEqual(item, expected))) ||
        (actual !== null &&
          typeof actual === 'object' &&
          !Array.isArray(actual) &&
          Object.values(actual as object).some((item) => deepEqual(item, expected)));
      assert(pass, `expected ${stringify(actual)} to include ${stringify(expected)}`);
    },
  };
  const chain = pinnedProxy(chainTarget, 'to.');

  return chain;
}

/** Case-insensitive `{name: value}` lookup — `pm.request.headers.get(...)`
 *  and `pm.response.headers.get(...)` both read through this. */
function headerGetter(headers: Readonly<Record<string, string>>): { get(name: string): string | undefined } {
  return {
    get(name: string): string | undefined {
      const lower = name.toLowerCase();
      const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === lower);
      return key === undefined ? undefined : headers[key];
    },
  };
}

/** Builds the one `pm` object a run's sandbox exposes, closed over
 *  `context` for reads and over `mutations` (returned to the caller
 *  untouched by anything else in this module) for `.set` calls — the
 *  entire implementation of "a mutation never touches disk": there is no
 *  file descriptor, no path, nothing but two plain objects in memory. */
function buildPm(
  context: ScriptContext,
  mutations: ScriptRun['mutations'],
  results: AssertionResult[],
): unknown {
  const merged: Record<string, string> = { ...context.collectionVariables, ...context.environment };

  const environmentScope = {
    get(key: string): string | undefined {
      return Object.prototype.hasOwnProperty.call(mutations.environment, key)
        ? mutations.environment[key]
        : context.environment[key];
    },
    set(key: string, value: string): void {
      mutations.environment[key] = String(value);
    },
  };
  const collectionVariablesScope = {
    get(key: string): string | undefined {
      return Object.prototype.hasOwnProperty.call(mutations.collectionVariables, key)
        ? mutations.collectionVariables[key]
        : context.collectionVariables[key];
    },
    set(key: string, value: string): void {
      mutations.collectionVariables[key] = String(value);
    },
  };

  const response = context.response
    ? {
        code: context.response.code,
        status: context.response.status,
        headers: headerGetter(context.response.headers),
        json(): unknown {
          return JSON.parse(context.response!.body);
        },
        text(): string {
          return context.response!.body;
        },
      }
    : null;

  return {
    test(name: string, fn: () => void): void {
      try {
        fn();
        results.push({ name, passed: true });
      } catch (error) {
        results.push({
          name,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    expect: makeExpect,
    variables: { get: (key: string): string | undefined => merged[key] },
    environment: environmentScope,
    collectionVariables: collectionVariablesScope,
    request: {
      method: context.request.method,
      url: context.request.url,
      headers: headerGetter(context.request.headers),
    },
    response,
  };
}

/** `console.log`/`.warn`/`.error` — every argument stringified and joined
 *  with a space (matching `console.log`'s own separator), appended into
 *  `logs` through `appendCapped` (`council-output.ts`), the same function
 *  and the same {@link COUNCIL_OUTPUT_CAP_BYTES} budget `http.ts` already
 *  caps a response body with, rather than a second budget invented for
 *  this one. Once the running byte total (tracked as an internal
 *  `Uint8Array`, never itself returned) would exceed the cap, every further
 *  call is silently dropped and one truncation marker is appended in its
 *  place — a script logging in a tight loop cannot grow `ScriptRun.logs`
 *  without bound. */
function buildConsole(logs: string[]): {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
} {
  let buffer: Uint8Array = new Uint8Array(0);
  let truncated = false;

  const append = (level: string, args: unknown[]): void => {
    if (truncated) return;
    const text = args.map((arg) => (typeof arg === 'string' ? arg : stringify(arg))).join(' ');
    const line = level === 'log' ? text : `[${level}] ${text}`;
    const result = appendCapped(buffer, Buffer.from(`${line}\n`, 'utf8'), COUNCIL_OUTPUT_CAP_BYTES);
    buffer = result.buffer;
    if (result.truncated) {
      truncated = true;
      logs.push('… log output truncated …');
      return;
    }
    logs.push(line);
  };

  return {
    log: (...args: unknown[]) => append('log', args),
    warn: (...args: unknown[]) => append('warn', args),
    error: (...args: unknown[]) => append('error', args),
  };
}

/**
 * Run one `pm.*` script against `context`, bounded at `timeoutMs`.
 *
 * **Never throws and never returns a rejected promise-shaped value** — every
 * failure mode the phase doc pins is folded into the return value:
 * - a throw *outside* any `pm.test` → `error` is set, `results` is empty.
 * - a throw *inside* `pm.test(name, fn)` → that test's own
 *   `{passed:false, error}`; every other `pm.test` call in the script still
 *   runs, because `buildPm`'s `test` catches per-call, not for the script.
 * - `vm`'s own `timeout` firing (a `while(true){}`, or any other
 *   synchronous hang) → `error: 'Script timed out after {n} ms.'`.
 *
 * `codeGeneration: {strings:false, wasm:false}` is what makes `eval('1')` and
 * `new Function('return 1')()` throw `EvalError`/`TypeError` *inside* the
 * context before user code can do anything with the result — see this
 * file's header for why that is necessary but not sufficient on its own.
 */
export function runScript(source: string, context: ScriptContext, timeoutMs: number): ScriptRun {
  const results: AssertionResult[] = [];
  const logs: string[] = [];
  const mutations: ScriptRun['mutations'] = { environment: {}, collectionVariables: {} };

  const sandbox: Record<string, unknown> = {
    pm: buildPm(context, mutations, results),
    console: buildConsole(logs),
    JSON,
    Math,
    Date,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
  };

  let error: string | null = null;
  try {
    const ctx = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
    const script = new vm.Script(source, { filename: 'pm-script.js' });
    script.runInContext(ctx, { timeout: timeoutMs, breakOnSigint: true });
  } catch (err) {
    // Node's own wording for a `vm` timeout has shifted across versions
    // ("Script execution timed out after Xms" is the current one); matching
    // on "timed out" rather than the whole sentence is what keeps this
    // resilient to that, without risking a false match on a script's own
    // thrown message (vanishingly unlikely to contain this exact phrase,
    // and this module's own budget for being wrong about that is zero
    // either way — the fallback branch below still reports *some* string).
    if (err instanceof Error && /timed out/i.test(err.message)) {
      error = `Script timed out after ${timeoutMs} ms.`;
    } else {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  return { results, logs, mutations, error };
}
