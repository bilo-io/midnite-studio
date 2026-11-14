/**
 * Folders macOS guards with TCC (Transparency, Consent and Control). Entering one from a process with no
 * prior grant raises a system prompt, and a prompt nobody asked for reads as the app spying. Code that can
 * run at boot, on a timer or in the background must stay out of them; code a user started may enter one.
 * Plain constants, no zod: the main process and the `scripts/tcc-guard.mjs` check both read them.
 */

/** Top-level home folders that prompt on first entry. */
export const PROTECTED_HOME_FOLDERS = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Movies'] as const;

/**
 * Paths below home that prompt even for an app that holds a grant for their parent: the Photos and Music
 * libraries (`kTCCServicePhotos`, `kTCCServiceMediaLibrary`) and the private app stores that need Full Disk Access.
 */
export const PROTECTED_LIBRARY_PATHS = [
  'Pictures/Photos Library.photoslibrary',
  'Music/Music',
  'Library/Mail',
  'Library/Messages',
  'Library/Safari',
] as const;

const trimSlash = (p: string): string => (p.length > 1 ? p.replace(/\/+$/, '') : p);

const within = (path: string, root: string): boolean => path === root || path.startsWith(`${root}/`);

/** True when `path` is, or is inside, a protected home folder or library path of `home`. */
export function isProtectedPath(path: string, home: string): boolean {
  const h = trimSlash(home);
  const p = trimSlash(path);
  if (!within(p, h) || p === h) return false;
  const rel = p.slice(h.length + 1);
  return (
    PROTECTED_HOME_FOLDERS.some((folder) => within(rel, folder)) ||
    PROTECTED_LIBRARY_PATHS.some((lib) => within(rel, lib))
  );
}

/** The protected library paths under `home`, absolute. */
export function protectedLibraryPaths(home: string): string[] {
  const h = trimSlash(home);
  return PROTECTED_LIBRARY_PATHS.map((rel) => `${h}/${rel}`);
}
