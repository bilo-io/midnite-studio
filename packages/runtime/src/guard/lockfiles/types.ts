/** OSV ecosystem names (https://ospec.dev/ecosystems). */
export type LockEcosystem = 'npm' | 'PyPI' | 'crates.io' | 'Go' | 'RubyGems' | 'SwiftURL';

/** One resolved package out of a lockfile (Phase 122 Theme B). */
export interface LockedPackage {
  ecosystem: LockEcosystem;
  name: string;
  version: string;
  /** True when the project itself depends on it; false when it arrives transitively or is unknown. */
  direct: boolean;
  /** The lockfile it came from. */
  path: string;
}

export interface ParseOptions {
  /** The lockfile's path, copied onto every package. */
  path: string;
  /** Names the project's own manifest declares, for formats that do not say (yarn, Cargo, go.sum). */
  directNames?: ReadonlySet<string>;
}
