/**
 * The write-side path jail moved into the runtime (Phase 113 Theme O) so the API client's main half,
 * a feature, confines its collection files the same way Studio's fs surface does. Kept so the
 * desktop's existing importers did not move.
 */
export {
  confineAllowlist,
  confineParent,
  confineTree,
  createDirectory,
  createFile,
  describeFsError,
  ensureConfinedDirs,
  isSymlinkTarget,
  openForOverwrite,
  targetExists,
  targetPath,
  type ConfinedTarget,
} from '@midnite/studio-runtime';
