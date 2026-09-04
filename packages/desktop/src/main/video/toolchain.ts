import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { VideoToolBinary, VideoToolchain } from '@midnite/studio-shared';

import { parseWhichOutput, runInShell } from '../login-shell';

/**
 * Resolving `node`/`npx` the way `agent-probe.ts` resolves the agent roster:
 * through `login-shell.ts`'s `-lic` shell, never Electron's own bare PATH. A
 * `Midnite Studio.app` launched from Finder does not inherit the login shell
 * that put Homebrew's `node` on `~/.local/bin`-adjacent PATH entries, and the
 * pty will run the render command through that same shell later — the probe
 * and the launch have to agree about what "found" means.
 */

const PROBE_TIMEOUT_MS = 8_000;

const START = (name: string): string => `__MSTUDIO_VIDEO_${name}_START__`;
const END = (name: string): string => `__MSTUDIO_VIDEO_${name}_END__`;

/** One `command -v` per binary, framed so a shell banner cannot be misread as a path. */
export function buildToolchainProbeScript(): string {
  return ['node', 'npx']
    .map(
      (bin) =>
        `printf '\\n%s\\n' ${START(bin)}; command -v ${bin} 2>/dev/null || true; printf '\\n%s\\n' ${END(bin)}`,
    )
    .join('; ');
}

function extractFrame(output: string, name: string): string | null {
  const start = output.indexOf(START(name));
  if (start === -1) return null;
  const end = output.indexOf(END(name), start);
  if (end === -1) return null;
  return output.slice(start + START(name).length, end);
}

/** A binary whose frame never came back (a shell killed on the timeout) reads
 *  as missing with an honest reason, never as a crash. */
function parseBinary(output: string, name: string): VideoToolBinary {
  const frame = extractFrame(output, name);
  if (frame === null) return { found: false, reason: `Could not determine whether ${name} is installed.` };
  const path = parseWhichOutput(frame);
  if (path !== null) return { found: true, path };
  const answer = frame.trim();
  if (answer.length > 0) return { found: true, path: answer };
  return { found: false, reason: `${name} was not found on PATH.` };
}

/** Pure, so the interesting cases — a dead shell, an rc-file banner, a shell
 *  function rather than a file — are reviewable against captured output. */
export function parseToolchainProbeOutput(output: string): { node: VideoToolBinary; npx: VideoToolBinary } {
  return { node: parseBinary(output, 'node'), npx: parseBinary(output, 'npx') };
}

/** `dependencies` first: a project pins its Remotion version there in every
 *  `create-video` scaffold this app has seen; `devDependencies` is the fallback
 *  some hand-rolled setups use instead. */
export function parseRemotionVersion(packageJsonText: string): string | undefined {
  try {
    const pkg = JSON.parse(packageJsonText) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return pkg.dependencies?.remotion ?? pkg.devDependencies?.remotion ?? undefined;
  } catch {
    return undefined;
  }
}

export type ToolchainDeps = {
  run: (command: string, timeoutMs: number) => Promise<{ output: string }>;
  readFile: (path: string) => Promise<string>;
};

const REAL: ToolchainDeps = {
  run: runInShell,
  readFile: (path) => readFile(path, 'utf8'),
};

let cached: VideoToolchain | null = null;
let inFlight: Promise<VideoToolchain> | null = null;

/**
 * Resolve the toolchain, reusing the last answer.
 *
 * "Cache the result; re-probe on explicit request only" (Theme C) — unlike
 * `agent-probe.ts`'s TTL, there is no automatic expiry here: installing
 * `node`/`npx` mid-session is rare enough that a manual re-detect action is the
 * right cost, not a background poll on every render/studio start.
 *
 * `appDir`, when given, is the Remotion app's own directory — its
 * `package.json` is where `remotionVersion` is read from, per-project rather
 * than machine-wide, so passing a different `appDir` after a cache hit still
 * re-reads that one file rather than reusing a stale version.
 */
export async function probeVideoToolchain(
  appDir?: string,
  deps: Partial<ToolchainDeps> = {},
): Promise<VideoToolchain> {
  const { run, readFile: read } = { ...REAL, ...deps };

  if (!cached) {
    if (!inFlight) {
      inFlight = (async () => {
        const { output } = await run(buildToolchainProbeScript(), PROBE_TIMEOUT_MS);
        const { node, npx } = parseToolchainProbeOutput(output);
        return { node, npx };
      })().finally(() => {
        inFlight = null;
      });
    }
    cached = await inFlight;
  }

  if (appDir === undefined) return cached;

  const remotionVersion = await read(join(appDir, 'package.json'))
    .then(parseRemotionVersion)
    .catch(() => undefined);
  return remotionVersion === undefined ? cached : { ...cached, remotionVersion };
}

/** Tests only — production relies on the cache never expiring on its own. */
export function resetVideoToolchainCache(): void {
  cached = null;
  inFlight = null;
}
