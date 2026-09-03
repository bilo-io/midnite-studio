import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The template's own name for the reserved marker `walkFiles` must not treat
 * as a copyable entry — a maintainer bumps its contents when
 * `templates/midnite/` changes materially, and that string is what lets the
 * Setup dialog say "kit v1 → v2". It carries no meaning for a target repo, so
 * it is never itself scaffolded there.
 */
export const TEMPLATE_VERSION_FILE = '.template-version';

/** `'0.0.0'` if the file is somehow missing — never throws, since a stale
 *  version string is a cosmetic problem and per-file hashes stay load-bearing. */
export async function readTemplateVersion(templateRoot: string): Promise<string> {
  try {
    return (await readFile(join(templateRoot, TEMPLATE_VERSION_FILE), 'utf8')).trim();
  } catch {
    return '0.0.0';
  }
}
