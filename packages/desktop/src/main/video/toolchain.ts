import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { VIDEO_SKILLS, type VideoToolBinary, type VideoToolchain } from '@midnite/studio-shared';

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

/**
 * `VideoToolchain` minus `skills` — this module's own cached answer never
 * carries that field. `probeVideoSkills` below computes it separately
 * (it is a property of the *video root*, not the machine-wide `node`/`npx`
 * answer this cache exists for), and `video-service.ts`'s `videoToolchain()`
 * is what merges the two into a full `VideoToolchain` for callers.
 */
type NodeNpxToolchain = Omit<VideoToolchain, 'skills'>;

let cached: NodeNpxToolchain | null = null;
let inFlight: Promise<NodeNpxToolchain> | null = null;

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
): Promise<NodeNpxToolchain> {
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

/**
 * Theme F's recorded follow-up: whether each of `VIDEO_SKILLS` actually
 * exists in this video root's own `.claude/skills/` — the two actions on
 * `video-project-detail.tsx` fire their `/command` unconditionally today,
 * which is exactly the gap this closes. A skill's directory name is always
 * its slash command with the leading `/` stripped (this repo's own
 * `.claude/skills/` follows the identical convention), and "exists" means
 * that directory has a `SKILL.md` — the one file every skill here carries.
 *
 * Styled as the same found/reason `VideoToolBinary` shape as `node`/`npx`
 * above, so a caller treats a missing skill exactly like a missing binary,
 * and reuses the same injectable `readFile` rather than adding a second
 * filesystem dependency: a failed read is "not found," never a crash.
 *
 * Not folded into the cached `probeVideoToolchain` above — that cache keys
 * on the machine-wide `node`/`npx` answer and deliberately never expires on
 * its own (Theme C); a skill's presence is a property of the *video root*,
 * which can change (a different root chosen in Settings) far more often
 * than the machine's own PATH does, so this re-checks on every call.
 */
export async function probeVideoSkills(
  root: string | undefined,
  deps: Partial<Pick<ToolchainDeps, 'readFile'>> = {},
): Promise<VideoToolchain['skills']> {
  const { readFile: read } = { ...REAL, ...deps };

  const check = async (id: keyof typeof VIDEO_SKILLS): Promise<VideoToolBinary> => {
    const dirName = VIDEO_SKILLS[id].slice(1);
    if (root === undefined) {
      return { found: false, reason: 'Configure a video root in Settings first.' };
    }
    const path = join(root, '.claude', 'skills', dirName, 'SKILL.md');
    try {
      await read(path);
      return { found: true, path };
    } catch {
      return {
        found: false,
        reason:
          `Not found at .claude/skills/${dirName}/SKILL.md in this video root. ` +
          'See ~/Dev/ekko-videos for the reference skill.',
      };
    }
  };

  const [videoWriteScript, videoExecuteScript] = await Promise.all([
    check('videoWriteScript'),
    check('videoExecuteScript'),
  ]);
  return { videoWriteScript, videoExecuteScript };
}
