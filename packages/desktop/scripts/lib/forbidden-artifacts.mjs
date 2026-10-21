import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Phase 91 Theme D: build metadata that must never ship to users — sourcemaps (hand the original
 * source to anyone who opens the bundle), Vite's `.vite/` manifest, and the bundle visualiser's
 * `stats.html`. `electron-builder.yml`'s exclusions are the fix; this is what proves it every
 * release. Pure over a directory so it is unit-testable.
 */
export function isForbiddenArtifact(relPath) {
  const parts = relPath.split(/[\\/]/);
  const name = parts[parts.length - 1] ?? '';
  return name.endsWith('.map') || name === 'stats.html' || parts.includes('.vite');
}

/** Relative paths under `root` that are forbidden. Missing root yields `[]`. */
export function findForbiddenArtifacts(root) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative(root, full);
      if (isForbiddenArtifact(rel)) found.push(rel);
      else if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
  return found;
}
