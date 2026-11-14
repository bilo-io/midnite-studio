import { access } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Whether the app holds macOS Full Disk Access, probed without raising a prompt: `access()` on a path that only
 * Full Disk Access can reach answers EPERM without it and succeeds with it, and a denied probe never shows the
 * TCC dialog (only opening a protected folder's contents does). The first path that exists decides; a machine
 * with none of them answers false, the safe side.
 *
 * Cached for the session. `refresh()` re-probes (call it when the window regains focus: the user may have just
 * flipped the switch in System Settings) and is cheap, one `access()` per path.
 */
const PROBE_PATHS = ['Library/Safari/Bookmarks.plist', 'Library/Application Support/com.apple.TCC/TCC.db'] as const;

export interface FullDiskAccessProbe {
  /** The cached answer; probes once on first call. */
  (): Promise<boolean>;
  /** Probe again and update the cache. */
  refresh(): Promise<boolean>;
}

export function createFullDiskAccessProbe(
  home: string,
  accessFn: (path: string) => Promise<void> = (p) => access(p),
): FullDiskAccessProbe {
  let cached: Promise<boolean> | null = null;
  const probe = async (): Promise<boolean> => {
    for (const rel of PROBE_PATHS) {
      try {
        await accessFn(join(home, rel));
        return true;
      } catch {
        // EPERM (no grant) and ENOENT (no such file) both read as "not proven"
      }
    }
    return false;
  };
  const read = (() => (cached ??= probe())) as FullDiskAccessProbe;
  read.refresh = () => (cached = probe());
  return read;
}
