// Phase 113 Theme F item 3 — a public app bundle never ships Quick Kiss.
//
// Quick Kiss (`packages/app/src/fonts/quick-kiss.ttf`) is a personal-use face, fine inside the private
// Studio app, not in a binary handed out publicly. Public surfaces wear Damion (SIL OFL).
//
// `findQuickKiss(dir)` scans a BUILT bundle directory (an unpacked .app, an asar's extracted tree, a
// dist folder) for any file named like the font; the CLI exits 1 when one is found, so a release or
// dist path can call `node scripts/no-quick-kiss.mjs <bundle-dir>`. Not wired into CI yet (Theme F1).
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const QUICK_KISS_FILE = /quick[-_ ]?kiss/i;

/** Absolute paths of every file under `dir` whose name matches the Quick Kiss font. */
export async function findQuickKiss(dir) {
  const hits = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (QUICK_KISS_FILE.test(entry.name)) hits.push(full);
    }
  }
  await walk(dir);
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node scripts/no-quick-kiss.mjs <bundle-dir>');
    process.exit(2);
  }
  const hits = await findQuickKiss(dir);
  if (hits.length > 0) {
    console.error(`Quick Kiss (personal-use font) found in a public bundle:\n${hits.map((h) => `  ${h}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`no Quick Kiss font under ${dir}`);
}
