import type { Plugin } from 'vite';

/**
 * The dead enum initialiser at the top of xterm 6.0.0's `InputHandler.requestMode`,
 * as it appears in the package's own ESM build (`lib/xterm.mjs`).
 *
 * Tolerant of the minifier's identifier choices — every name in there is
 * generated — but pinned to the `NOT_RECOGNIZED` member, which comes from
 * xterm's source and is what makes this `requestMode`'s DECRPM enum and not
 * some other `let x; (…)(x ||= {})` in the bundle.
 */
const DEAD_ENUM =
  /(requestMode\(\w+,\w+\)\{)let (\w+);\(\w+=>\([^;]*?NOT_RECOGNIZED[^;]*?\)\)\(\2\|\|=\{\}\);/;

/** Where the corruption lands, and the one module worth rewriting. */
const XTERM_ESM = '@xterm/xterm/lib/xterm.mjs';

/**
 * Deletes a dead line from xterm's ESM build that the production minifier
 * turns into a crash.
 *
 * `InputHandler.requestMode` — the DECRQM handler, `CSI ? Ps $ p` — opens with
 * a `const enum V` that TypeScript emits as a runtime enum object even though
 * every read of it was already inlined to a numeric literal. xterm ships that
 * as `let r; ((P) => (P[P.NOT_RECOGNIZED = 0] = …))(r ||= {});`, which is
 * harmless: `r` is written once and never read.
 *
 * Rollup and esbuild together disagree. Rollup rewrites `r ||= {}` to
 * `r || (r = {})` and knows `r` is `undefined` at that point, so esbuild's
 * minifier substitutes `void 0` for the read, concludes nothing reads `r` any
 * more and drops `let r` — but keeps the write, and renames it into a name
 * that is declared nowhere:
 *
 *     ((g) => (g[g.NOT_RECOGNIZED = 0] = "NOT_RECOGNIZED", …))(void 0 || (i = {}))
 *
 * A bundled ES module is strict-mode code, so that assignment throws
 * `ReferenceError: i is not defined` — on **every** DECRQM the terminal
 * receives. The throw escapes `WriteBuffer._innerWrite`, which never schedules
 * itself again, so the first mode query a program sends freezes that pane
 * permanently: bytes keep arriving, the buffer stops advancing, nothing paints.
 *
 * `agy` (Bubble Tea v2) asks for modes 2026 and 2027 within the first hundred
 * bytes it writes, which is why launching it looked like the CLI hanging rather
 * than like the terminal dying. Neither the unit suite nor the e2e suite can
 * see it: both run unminified, where the line is exactly as inert as it looks.
 *
 * Deleting the initialiser is safe precisely because it is dead — nothing in
 * the shipped `requestMode` reads the object it builds. Throwing when the shape
 * no longer matches is the point: an xterm bump that changes this code must be
 * re-checked against the minifier rather than silently shipping the freeze back.
 */
export function xtermDecrqmFixPlugin(): Plugin {
  let applied = false;

  return {
    name: 'midnite-xterm-decrqm-fix',
    apply: 'build',
    enforce: 'pre',

    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith(XTERM_ESM)) return null;
      if (!DEAD_ENUM.test(code)) {
        throw new Error(
          `${XTERM_ESM}: requestMode's dead DECRPM enum initialiser was not found. ` +
            'Either xterm fixed it upstream — delete vite-xterm-decrqm-plugin.ts and its ' +
            'test — or the code moved, in which case re-check the built chunk for ' +
            '`void 0 || (x = {})` before removing this plugin.',
        );
      }
      applied = true;
      return { code: code.replace(DEAD_ENUM, '$1'), map: null };
    },

    /**
     * A build that never loaded xterm is fine (nothing to fix); a build that
     * loaded it and somehow skipped the rewrite is not, and would ship the
     * freeze.
     */
    generateBundle(_options, bundle) {
      const loadedXterm = Object.values(bundle).some(
        (chunk) => chunk.type === 'chunk' && chunk.code.includes('requestMode'),
      );
      if (loadedXterm && !applied) {
        throw new Error('midnite-xterm-decrqm-fix: xterm was bundled but the rewrite never ran.');
      }
    },
  };
}

/**
 * The corruption this build must never emit, in any chunk, from any dependency.
 *
 * `void 0 || (x = {})` is the fingerprint of the minifier bug above: a write to
 * an identifier whose declaration was optimised away. It is not xterm-specific
 * — the same `let x; … (x ||= {})` shape appears wherever TypeScript's
 * `const enum` downlevelling survives into a published ESM build — so this
 * guard scans everything rather than just the one module the plugin rewrites.
 *
 * Kept separate from the rewrite so the failure reads as what it is: not "the
 * xterm workaround broke" but "this bundle contains code that throws the
 * instant it runs".
 */
const UNDECLARED_WRITE = /void 0\s*\|\|\s*\(([A-Za-z_$][\w$]*)\s*=\s*\{\}\)/g;

export function undeclaredWriteGuardPlugin(): Plugin {
  return {
    name: 'midnite-undeclared-write-guard',
    apply: 'build',

    generateBundle(_options, bundle) {
      const hits: string[] = [];
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const match of chunk.code.matchAll(UNDECLARED_WRITE)) {
          hits.push(`${name}: ${match[0]}`);
        }
      }
      if (hits.length > 0) {
        throw new Error(
          'Minifier emitted a write to an undeclared identifier — strict-mode ES ' +
            `modules throw ReferenceError on these at runtime:\n  ${hits.join('\n  ')}`,
        );
      }
    },
  };
}
