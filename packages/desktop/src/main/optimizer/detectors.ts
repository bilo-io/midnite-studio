import { sep } from 'node:path';

import type { Ecosystem, ReclaimCost, ScanCategory } from '@midnite/studio-shared';

/**
 * The Optimizer's detector catalogue (Phase 72 Themes A & B) — replaces the
 * basename-only `BuildArtifactPattern` list `scan-service.ts` used to seed
 * `classify` with. The scanner (`scan-service.ts`) and this catalogue change
 * for different reasons and at different rates: the walker is
 * security-critical machinery, the catalogue is a list that grows every time
 * someone uses a new build tool. This module imports nothing from
 * `scan-service.ts` — the dependency points one way, so a catalogue edit can
 * never change walker behaviour by accident.
 *
 * Every entry below must satisfy three rules:
 *   1. A named `producer` — the tool that recreates it. If you cannot name
 *      one, the directory does not belong here (the phase's regenerable-cache
 *      guardrail).
 *   2. Evidence, unless Decision 1's rule admits the bare name: *a leading
 *      dot plus a tool-namespaced name is not a name a human gives a source
 *      directory* (`.next`, `.turbo`, …), plus the two grandfathered
 *      exceptions `node_modules` and `__pycache__`. Any undotted or
 *      non-namespaced basename needs sibling/child evidence.
 *   3. A place in `DEFAULT_DETECTORS`'s order that respects the ordering
 *      invariant below.
 *
 * Two things are deliberately absent, and this paragraph exists so a future
 * reader does not "fix" either gap:
 *   - **No Go detector, and no `'go'` member on `EcosystemSchema`** (Decision
 *     7). Go's in-repo candidate is `vendor/`, which is checked in on purpose
 *     and changes build behaviour when absent; its actual caches
 *     (`GOCACHE`/`GOMODCACHE`) live under the home directory, out of scope
 *     for this phase. Phase 73 Decision 8 adds the member alongside them.
 *   - **No per-detector exclusion list** (Decision 9). `.moon/cache` and
 *     `.moon/docker` are handled by making `match` a two-segment suffix,
 *     which is sufficient for every case in this catalogue; build one only
 *     if a tool appears that writes regenerable output *and* checked-in
 *     config into the same directory with no clean split.
 */

export type DetectorId = string; // kebab, e.g. 'rust-target', 'dotnet-obj'

export type ArtifactDetector = {
  /** Stable, kebab, never reused — it is the test name and the `detectorId` on the wire. */
  id: DetectorId;
  label: string; // "Cargo target/", shown in the item list
  category: ScanCategory; // the coarse axis
  ecosystem: Ecosystem; // the grouping axis
  /** What recreates this. Prose, one clause. Required: see the regenerable-cache guardrail. */
  producer: string; // "cargo build"
  /** `sep`-joined path suffixes; one segment is the common basename case. */
  match: readonly string[]; // ['target'] | ['vendor/bundle']
  evidence: EvidenceRule;
  reclaim: ReclaimCost; // 'cheap' | 'costly'
};

export type EvidenceRule =
  /** The name alone is proof. Admitted only by Decision 1's rule. */
  | { kind: 'none' }
  /** A name in the candidate's PARENT directory. Free — walk already has that readdir. */
  | { kind: 'siblingAny'; names: readonly string[] }
  /** A filename extension in the candidate's PARENT. Free, same readdir. */
  | { kind: 'siblingSuffix'; suffixes: readonly string[] }
  /** A name INSIDE the candidate. One readdir per candidate, and only for candidates. */
  | { kind: 'childAny'; names: readonly string[] };

/**
 * Splits `path` on the platform separator and `suffix` on `'/'`, and compares
 * the trailing segments pairwise. Case-sensitive on purpose: macOS's default
 * volume is case-insensitive but case-preserving, so `Build/` and `build/`
 * both exist as spellings on disk, and a case-insensitive compare would make
 * `Bin/` — an ordinary source folder name — match the .NET detector. Never
 * allocates a regex.
 */
export function matchesPathSuffix(path: string, suffix: string): boolean {
  const pathSegments = path.split(sep);
  const suffixSegments = suffix.split('/');
  if (suffixSegments.length > pathSegments.length) return false;

  const offset = pathSegments.length - suffixSegments.length;
  for (let i = 0; i < suffixSegments.length; i += 1) {
    if (pathSegments[offset + i] !== suffixSegments[i]) return false;
  }
  return true;
}

/**
 * The `siblingSuffix` helper — a plain `endsWith` scan over a set of sibling
 * names. Kept separate from `matchesPathSuffix` on purpose: one compares
 * *path segments*, the other compares *filename tails*, and collapsing them
 * into one "suffix" function is how a `.csproj` rule ends up matching a
 * directory literally named `foo.csproj`.
 */
export function matchesFileSuffix(
  names: ReadonlySet<string>,
  suffixes: readonly string[],
): boolean {
  for (const name of names) {
    for (const suffix of suffixes) {
      if (name.endsWith(suffix)) return true;
    }
  }
  return false;
}

/**
 * The stale-worktree item is synthesised directly by `scanWorkspace`,
 * bypassing `classify` entirely — it has no `match` a directory walk could
 * find. Exported so it still has a stable `detectorId`/`label`/`producer`
 * triple for `ScanItem`/`ScanResult.detectors` to carry. **Excluded from
 * `DEFAULT_DETECTORS`**: an empty `match` can never fire in `classify`, and
 * including it would trip the ordering invariant's shared-suffix check.
 */
export const STALE_WORKTREE_DETECTOR: ArtifactDetector = {
  id: 'git-stale-worktree',
  label: 'Stale worktree',
  category: 'staleWorktree',
  ecosystem: 'git',
  producer: 'git worktree add',
  match: [],
  evidence: { kind: 'none' },
  reclaim: 'cheap',
};

/**
 * Twenty-eight entries, Node first, Ruby last, in the order they fire:
 * `classify` returns the **first** matching detector, so a detector with
 * `evidence: {kind:'none'}` must never sit above one whose `match` shares a
 * suffix with it (asserted in `detectors.test.ts`). Two detectors legitimately
 * claim `target/` (Rust, Maven) and two claim `build/` (CMake, Gradle); their
 * evidence rules disambiguate at the point of matching.
 *
 * The phase doc's own prose miscounts this catalogue as "twenty-four" while
 * naming all twenty-eight entries below it (8 Node + 2 moon + 1 Rust + 1
 * CMake + 2 .NET + 5 Python tool caches + 1 venv + 4 Java + 3 Swift + 1 Ruby
 * = 28) — every named entry ships, since the guardrail is "no detector ships
 * without a named producer and evidence," not a fixed count. `DETECTOR_COUNT`
 * below reflects the real length.
 */
export const DEFAULT_DETECTORS: readonly ArtifactDetector[] = [
  // --- Node / web ------------------------------------------------------
  {
    id: 'node-modules',
    label: 'node_modules',
    category: 'dependencies',
    ecosystem: 'node',
    producer: 'npm/pnpm/yarn install',
    match: ['node_modules'],
    evidence: { kind: 'none' }, // grandfathered — Decision 1
    reclaim: 'costly',
  },
  {
    id: 'node-dist',
    label: 'dist/',
    category: 'buildOutput',
    ecosystem: 'node',
    producer: 'npm run build',
    match: ['dist'],
    // `dist/` is also a perfectly ordinary hand-written folder name in a
    // non-Node repo — must keep sibling evidence.
    evidence: { kind: 'siblingAny', names: ['package.json'] },
    reclaim: 'cheap',
  },
  {
    id: 'node-next',
    label: '.next/',
    category: 'buildOutput',
    ecosystem: 'node',
    producer: 'next build',
    match: ['.next'],
    evidence: { kind: 'none' },
    reclaim: 'cheap',
  },
  {
    id: 'node-turbo',
    label: '.turbo/',
    category: 'toolCache',
    ecosystem: 'node',
    producer: 'turbo',
    match: ['.turbo'],
    evidence: { kind: 'none' },
    reclaim: 'cheap',
  },
  {
    id: 'node-parcel-cache',
    label: '.parcel-cache/',
    category: 'toolCache',
    ecosystem: 'node',
    producer: 'parcel',
    match: ['.parcel-cache'],
    evidence: { kind: 'none' },
    reclaim: 'cheap',
  },
  {
    id: 'node-svelte-kit',
    label: '.svelte-kit/',
    category: 'buildOutput',
    ecosystem: 'node',
    producer: 'svelte-kit build',
    match: ['.svelte-kit'],
    evidence: { kind: 'none' },
    reclaim: 'cheap',
  },
  {
    id: 'node-nuxt',
    label: '.nuxt/',
    category: 'buildOutput',
    ecosystem: 'node',
    producer: 'nuxt build',
    match: ['.nuxt'],
    evidence: { kind: 'none' },
    reclaim: 'cheap',
  },
  {
    id: 'node-vite',
    label: '.vite/',
    category: 'buildOutput',
    ecosystem: 'node',
    producer: 'vite',
    match: ['.vite'],
    evidence: { kind: 'none' },
    reclaim: 'cheap',
  },

  // --- moon --------------------------------------------------------------
  // Two-segment `match` suffixes, never a bare `.moon` — `.moon/workspace.yml`,
  // `.moon/toolchain.yml` and `.moon/tasks/` are checked-in configuration
  // (`.gitignore:5-6` only ignores `.moon/cache` and `.moon/docker`).
  {
    id: 'moon-cache',
    label: '.moon/cache/',
    category: 'toolCache',
    ecosystem: 'multi',
    producer: 'moon run',
    match: ['.moon/cache'],
    evidence: { kind: 'none' },
    reclaim: 'cheap',
  },
  {
    id: 'moon-docker',
    label: '.moon/docker/',
    category: 'toolCache',
    ecosystem: 'multi',
    producer: 'moon run',
    match: ['.moon/docker'],
    evidence: { kind: 'none' },
    reclaim: 'cheap',
  },

  // --- Rust ----------------------------------------------------------------
  {
    id: 'rust-target',
    label: 'target/ (Cargo)',
    category: 'buildOutput',
    ecosystem: 'rust',
    producer: 'cargo build',
    match: ['target'],
    evidence: { kind: 'siblingAny', names: ['Cargo.toml'] },
    reclaim: 'cheap',
  },

  // --- C/C++ (CMake) ---------------------------------------------------
  {
    id: 'cmake-build',
    label: 'build/ (CMake)',
    category: 'buildOutput',
    ecosystem: 'cpp',
    producer: 'cmake --build',
    match: ['build', '_build', 'cmake-build-debug', 'cmake-build-release'],
    // CMake writes `CMakeCache.txt` INTO the build directory — a bare
    // `build/` with nothing inside it is somebody's source tree.
    evidence: { kind: 'childAny', names: ['CMakeCache.txt', 'CMakeFiles'] },
    reclaim: 'cheap',
  },

  // --- .NET / C# -----------------------------------------------------------
  {
    id: 'dotnet-obj',
    label: 'obj/ (.NET)',
    category: 'buildOutput',
    ecosystem: 'dotnet',
    producer: 'dotnet build',
    match: ['obj'],
    evidence: {
      kind: 'siblingSuffix',
      suffixes: ['.csproj', '.fsproj', '.vbproj', '.vcxproj'],
    },
    reclaim: 'cheap',
  },
  {
    id: 'dotnet-bin',
    label: 'bin/ (.NET)',
    category: 'buildOutput',
    ecosystem: 'dotnet',
    producer: 'dotnet build',
    // `bin/` is the single most dangerous basename in this catalogue — a
    // script folder in half the repos on any machine — so it ships only
    // with project-file evidence.
    match: ['bin'],
    evidence: {
      kind: 'siblingSuffix',
      suffixes: ['.csproj', '.fsproj', '.vbproj', '.vcxproj'],
    },
    reclaim: 'cheap',
  },

  // --- Python (tool caches) ------------------------------------------------
  {
    id: 'py-pycache',
    label: '__pycache__/',
    category: 'toolCache',
    ecosystem: 'python',
    producer: 'python import',
    match: ['__pycache__'],
    evidence: { kind: 'none' }, // grandfathered — Decision 1
    reclaim: 'cheap',
  },
  {
    id: 'py-pytest-cache',
    label: '.pytest_cache/',
    category: 'toolCache',
    ecosystem: 'python',
    producer: 'pytest',
    match: ['.pytest_cache'],
    evidence: { kind: 'none' },
    reclaim: 'cheap',
  },
  {
    id: 'py-mypy-cache',
    label: '.mypy_cache/',
    category: 'toolCache',
    ecosystem: 'python',
    producer: 'mypy',
    match: ['.mypy_cache'],
    evidence: { kind: 'none' },
    reclaim: 'cheap',
  },
  {
    id: 'py-ruff-cache',
    label: '.ruff_cache/',
    category: 'toolCache',
    ecosystem: 'python',
    producer: 'ruff',
    match: ['.ruff_cache'],
    evidence: { kind: 'none' },
    reclaim: 'cheap',
  },
  {
    id: 'py-tox',
    label: '.tox/',
    category: 'toolCache',
    ecosystem: 'python',
    producer: 'tox',
    match: ['.tox'],
    evidence: { kind: 'none' },
    reclaim: 'cheap',
  },

  // --- Python (environments) -----------------------------------------------
  {
    id: 'py-venv',
    label: 'Virtualenv',
    category: 'dependencies',
    ecosystem: 'python',
    producer: 'python -m venv',
    // `pyvenv.cfg` is written by venv/virtualenv and nothing else, which is
    // what makes `env` — otherwise an unacceptable basename — safe to list.
    match: ['.venv', 'venv', 'env'],
    evidence: { kind: 'childAny', names: ['pyvenv.cfg'] },
    reclaim: 'costly',
  },

  // --- Java / Kotlin / Gradle / Maven --------------------------------------
  {
    id: 'gradle-build',
    label: 'build/ (Gradle)',
    category: 'buildOutput',
    ecosystem: 'java',
    producer: 'gradle build',
    match: ['build'],
    evidence: {
      kind: 'siblingAny',
      names: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
    },
    reclaim: 'cheap',
  },
  {
    id: 'gradle-project-cache',
    label: '.gradle/ (project)',
    category: 'toolCache',
    ecosystem: 'java',
    producer: 'gradle',
    match: ['.gradle'],
    evidence: {
      kind: 'siblingAny',
      names: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
    },
    reclaim: 'cheap',
  },
  {
    id: 'maven-target',
    label: 'target/ (Maven)',
    category: 'buildOutput',
    ecosystem: 'java',
    producer: 'mvn package',
    match: ['target'],
    evidence: { kind: 'siblingAny', names: ['pom.xml'] },
    reclaim: 'cheap',
  },
  {
    id: 'idea-out',
    label: 'out/ (IntelliJ)',
    category: 'buildOutput',
    // IntelliJ's `out/` is a JVM compile output; putting it under `multi`
    // would hide it from a Java user's group even though `.idea` is IDE-wide.
    ecosystem: 'java',
    producer: 'IntelliJ IDEA build',
    match: ['out'],
    evidence: { kind: 'siblingAny', names: ['.idea'] },
    reclaim: 'cheap',
  },

  // --- Swift / Xcode (project-local) ---------------------------------------
  {
    id: 'swiftpm-build',
    label: '.build/ (SwiftPM)',
    category: 'buildOutput',
    ecosystem: 'swift',
    producer: 'swift build',
    // Dotted but NOT tool-namespaced — `.build` is a plausible hand-made
    // directory name, so it is gated on sibling evidence like any undotted
    // name (Decision 1).
    match: ['.build'],
    evidence: { kind: 'siblingAny', names: ['Package.swift'] },
    reclaim: 'cheap',
  },
  {
    id: 'cocoapods-pods',
    label: 'Pods/',
    category: 'dependencies',
    ecosystem: 'swift',
    producer: 'pod install',
    match: ['Pods'],
    evidence: { kind: 'siblingAny', names: ['Podfile'] },
    reclaim: 'costly',
  },
  {
    id: 'xcode-deriveddata',
    label: 'DerivedData/ (project-local)',
    category: 'buildOutput',
    ecosystem: 'swift',
    producer: 'xcodebuild',
    match: ['DerivedData'],
    evidence: { kind: 'siblingSuffix', suffixes: ['.xcodeproj', '.xcworkspace'] },
    reclaim: 'cheap',
  },

  // --- Ruby ------------------------------------------------------------
  {
    id: 'ruby-vendor-bundle',
    label: 'vendor/bundle/',
    category: 'dependencies',
    ecosystem: 'ruby',
    producer: 'bundle install --path vendor/bundle',
    // Never a bare `vendor/` — in a Ruby repo `vendor/` also holds checked-in
    // assets and forked gems.
    match: ['vendor/bundle'],
    evidence: { kind: 'childAny', names: ['ruby'] },
    reclaim: 'costly',
  },
];

export const DETECTOR_COUNT = DEFAULT_DETECTORS.length;
