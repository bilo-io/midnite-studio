import { lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, sep } from 'node:path';

import type { Ecosystem, ReclaimCost } from '@midnite/studio-shared';

import { defaultLogger, type Logger } from '../log';
import { runProcess, type ProcessSink } from '../process-runner';

/**
 * Phase 73's system-cache registry — a completely separate, allowlist-only
 * confinement primitive. It never takes a root from `listRepos()`, never
 * takes a user-picked `extraRoot`, and never descends into a directory
 * looking for evidence the way Phase 72's `childAny`/`siblingAny` detectors
 * do. Every candidate this module can ever produce is one of a fixed,
 * reviewed, hand-written list of absolute paths below — a registry entry,
 * not a discovery.
 *
 * `knownRoots()` (`scan-service.ts`) is not reused and not widened: it trusts
 * anything strictly under a registered worktree, because opening a repo in
 * this app is itself the user's consent to that repo's tree. There is no
 * equivalent consent for `~/.cargo/registry` or `~/Library/Caches/Homebrew`
 * — the user never "opened" their home directory here — so this registry
 * earns its own, stricter confinement (`confineAllowlist`, in
 * `fs-scope-write.ts`) rather than extending that trust downward.
 */

/**
 * Every id in `DEFAULT_SYSTEM_CACHE_ENTRIES`, as a closed union. Adding an
 * entry is two edits in this file: a member here, an object in the default
 * catalogue below.
 */
export type SystemCacheEntryId =
  | 'cargo-registry'
  | 'go-build-cache'
  | 'go-mod-cache'
  | 'gradle-caches'
  | 'maven-repository'
  | 'nuget-packages'
  | 'xcode-deriveddata'
  | 'cocoapods-cache'
  | 'pip-cache'
  | 'npm-cache'
  | 'pnpm-store'
  | 'yarn-cache'
  | 'homebrew-cache'
  | 'plex-transcode-cache'
  | 'plex-plugin-http-cache';

/**
 * How a registry entry's real path is obtained.
 *
 * `fixed` is only for a location the tool has never made configurable,
 * expressed RELATIVE TO THE HOME DIRECTORY — no leading `~`, no leading `/`.
 * `queryTool` is preferred whenever the tool exposes a way to ask, read-only,
 * via the existing `runProcess`/`realSpawn` primitive: hardcoding a
 * configurable path is how this registry drifts out of date the day someone
 * customises their `CARGO_HOME`.
 */
export type PathResolver =
  | { kind: 'fixed'; path: string }
  | {
      kind: 'queryTool';
      command: string;
      args: readonly string[];
      timeoutMs?: number;
      parse: (stdout: string) => string | null;
    };

export type SystemCacheEntry = {
  /** Stable, kebab, never reused — settings key, test name, and the wire's `entryId`. */
  id: SystemCacheEntryId;
  label: string;
  ecosystem: Ecosystem;
  producer: string;
  reclaim: ReclaimCost;
  resolve: PathResolver;
};

/** A hung `go env`/`brew --cache` probe must not stall a scan for two minutes
 *  — a probe this slow is indistinguishable from a broken one. */
const QUERY_TOOL_TIMEOUT_MS = 5_000;

const singleLine = (out: string): string | null => out.trim() || null;

export const DEFAULT_SYSTEM_CACHE_ENTRIES: readonly SystemCacheEntry[] = [
  {
    id: 'cargo-registry',
    label: 'Cargo registry',
    ecosystem: 'rust',
    producer: 'cargo build / cargo install',
    reclaim: 'costly', // a full re-download, not a rebuild
    resolve: { kind: 'fixed', path: '.cargo/registry' },
  },
  {
    id: 'go-build-cache',
    label: 'Go build cache',
    ecosystem: 'go',
    producer: 'go build',
    reclaim: 'cheap', // a local recompile
    resolve: {
      kind: 'queryTool',
      command: 'go',
      args: ['env', 'GOCACHE'],
      timeoutMs: QUERY_TOOL_TIMEOUT_MS,
      parse: singleLine,
    },
  },
  {
    id: 'go-mod-cache',
    label: 'Go module cache',
    ecosystem: 'go',
    producer: 'go build / go mod download',
    reclaim: 'costly',
    resolve: {
      kind: 'queryTool',
      command: 'go',
      args: ['env', 'GOMODCACHE'],
      timeoutMs: QUERY_TOOL_TIMEOUT_MS,
      parse: singleLine,
    },
  },
  {
    id: 'gradle-caches',
    label: 'Gradle caches',
    ecosystem: 'java',
    producer: 'gradle build',
    reclaim: 'costly',
    resolve: { kind: 'fixed', path: '.gradle/caches' },
  },
  {
    id: 'maven-repository',
    label: 'Maven repository',
    ecosystem: 'java',
    producer: 'mvn package',
    reclaim: 'costly',
    resolve: { kind: 'fixed', path: '.m2/repository' },
  },
  {
    id: 'nuget-packages',
    label: 'NuGet packages',
    ecosystem: 'dotnet',
    producer: 'dotnet build / dotnet restore',
    reclaim: 'costly',
    resolve: { kind: 'fixed', path: '.nuget/packages' },
  },
  {
    id: 'xcode-deriveddata',
    label: 'Xcode DerivedData',
    ecosystem: 'swift',
    producer: 'xcodebuild',
    reclaim: 'cheap', // the shared counterpart to Phase 72's project-local override
    resolve: { kind: 'fixed', path: 'Library/Developer/Xcode/DerivedData' },
  },
  {
    id: 'cocoapods-cache',
    label: 'CocoaPods cache',
    ecosystem: 'swift',
    producer: 'pod install',
    reclaim: 'costly',
    resolve: { kind: 'fixed', path: 'Library/Caches/CocoaPods' },
  },
  {
    id: 'pip-cache',
    label: 'pip cache',
    ecosystem: 'python',
    producer: 'pip install',
    reclaim: 'costly',
    resolve: { kind: 'fixed', path: 'Library/Caches/pip' },
  },
  {
    id: 'npm-cache',
    label: 'npm cache',
    ecosystem: 'node',
    producer: 'npm install',
    reclaim: 'costly',
    resolve: { kind: 'fixed', path: '.npm' },
  },
  {
    id: 'pnpm-store',
    label: 'pnpm store',
    ecosystem: 'node',
    // The single most consequential `costly` entry: pnpm's content-addressable
    // store is shared across every project on the machine.
    producer: 'pnpm install',
    reclaim: 'costly',
    resolve: {
      kind: 'queryTool',
      command: 'pnpm',
      args: ['store', 'path'],
      timeoutMs: QUERY_TOOL_TIMEOUT_MS,
      parse: singleLine,
    },
  },
  {
    id: 'yarn-cache',
    label: 'Yarn cache',
    ecosystem: 'node',
    producer: 'yarn install',
    reclaim: 'costly',
    resolve: { kind: 'fixed', path: 'Library/Caches/Yarn' },
  },
  {
    id: 'homebrew-cache',
    label: 'Homebrew cache',
    ecosystem: 'multi',
    producer: 'brew install / brew upgrade',
    reclaim: 'costly',
    resolve: {
      // Prints the cache DIRECTORY with no argument, not a package path.
      kind: 'queryTool',
      command: 'brew',
      args: ['--cache'],
      timeoutMs: QUERY_TOOL_TIMEOUT_MS,
      parse: singleLine,
    },
  },
  // Phase 74 Theme A — Plex, the first media-tool entries in this registry.
  // Both paths are `fixed`: Plex exposes no `queryTool`-style command to ask
  // for its own data directory the way `go env`/`brew --cache` do, so Phase
  // 73's Decision 2 ("prefer `queryTool` whenever the tool exposes one")
  // correctly falls through to `fixed` here. Verified against a second,
  // independent source (plexopedia.com, quoting Plex's own support wording)
  // rather than trusted from one search snippet alone — see Phase 74's
  // Decision 3 for the full chain of custody.
  {
    id: 'plex-transcode-cache',
    label: 'Plex transcode cache',
    ecosystem: 'media',
    producer: 'Plex Media Server (regenerates on next transcode or thumbnail request)',
    reclaim: 'cheap', // recomputed from the original media file on this machine
    resolve: { kind: 'fixed', path: 'Library/Application Support/Plex Media Server/Cache' },
  },
  {
    id: 'plex-plugin-http-cache',
    label: 'Plex metadata agent cache',
    ecosystem: 'media',
    producer: "Plex Media Server's metadata agents (re-fetch over the network on next library scan)",
    reclaim: 'costly', // re-fetched from Plex's remote agents, not rebuilt locally
    resolve: {
      kind: 'fixed',
      path: 'Library/Application Support/Plex Media Server/Plug-in Support/Caches',
    },
  },
];

export type ResolvedSystemCacheEntry = { entry: SystemCacheEntry; path: string };

/** A trivial sink: these read-only probes just need stdout whole, and never
 *  fail to "parse" it — `reason: 'parse-failed'` is unreachable here. */
function collectStdout(): ProcessSink<string> {
  let buf = '';
  return {
    push: (chunk) => {
      buf += chunk;
    },
    finish: () => ({ ok: true, data: buf }),
  };
}

/**
 * The **only** place a `queryTool` command is ever run, and the only place a
 * registry entry becomes a real path. Per entry, in order, dropping the
 * entry (and logging one line) at the first failure — never throws. A
 * `queryTool` result is untrusted input (a user-controlled environment
 * variable can produce it, e.g. `GOCACHE`/`CARGO_HOME`/`PNPM_HOME`), so it is
 * bounded strictly to `os.homedir()` exactly like a `fixed` entry.
 */
export async function resolveSystemCacheEntries(
  entries: readonly SystemCacheEntry[],
  log: Logger = defaultLogger,
): Promise<ResolvedSystemCacheEntry[]> {
  const home = homedir();
  const resolved: ResolvedSystemCacheEntry[] = [];
  const claimed = new Set<string>();

  for (const entry of entries) {
    const drop = (reason: string): void => {
      log(`[optimizer] system-cache "${entry.id}": ${reason}`);
    };

    let candidate: string | null;
    if (entry.resolve.kind === 'fixed') {
      candidate = join(home, entry.resolve.path);
    } else {
      const { command, args, parse, timeoutMs } = entry.resolve;
      const outcome = await runProcess<string>(command, args, home, {
        sink: collectStdout(),
        timeoutMs: timeoutMs ?? QUERY_TOOL_TIMEOUT_MS,
      });
      if (!outcome.ok) {
        drop(`${outcome.reason} — ${outcome.hint}`);
        continue;
      }
      if (outcome.exitCode !== 0) {
        drop(`"${command} ${args.join(' ')}" exited ${outcome.exitCode}`);
        continue;
      }
      candidate = parse(outcome.data);
      if (candidate === null) {
        drop('query tool produced no usable path');
        continue;
      }
      if (!isAbsolute(candidate)) {
        drop(`query tool result "${candidate}" is not absolute`);
        continue;
      }
    }

    if (candidate === home) {
      drop('resolves to the home directory itself — never a valid entry');
      continue;
    }
    if (!candidate.startsWith(home + sep)) {
      drop(`"${candidate}" does not resolve under the home directory`);
      continue;
    }

    let stat;
    try {
      stat = await lstat(candidate);
    } catch {
      drop('not present on this machine — nothing cached'); // not installed, or never run
      continue;
    }
    if (stat.isSymbolicLink()) {
      drop('is now a symlink — the real target was never reviewed, refusing');
      continue;
    }
    if (!stat.isDirectory()) {
      drop('is not a directory');
      continue;
    }

    if (claimed.has(candidate)) {
      drop(`duplicate of an earlier entry resolving to "${candidate}" — keeping the first`);
      continue;
    }
    claimed.add(candidate);
    resolved.push({ entry, path: candidate });
  }

  return resolved;
}
