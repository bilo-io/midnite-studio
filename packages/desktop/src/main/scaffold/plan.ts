import { failure, ok, type GitOpResult, type ScaffoldPlan } from '@midnite/studio-shared';

import { joinWithin } from '../fs-scope';
import { classifyEntry } from './classify';
import { readManifest } from './manifest';
import { TEMPLATE_VERSION_FILE, readTemplateVersion } from './version';
import { walkFiles } from './walk';

/**
 * Compare the template tree against `targetRoot` and classify every entry.
 * Reads only — nothing here writes, which is what lets the Setup leaf call
 * this unprompted, the same posture `diag.detect` has.
 *
 * A template entry whose relative path would resolve outside `targetRoot` —
 * never possible from `walkFiles`'s own output, but checked anyway, the same
 * defence-in-depth `fs-scope.ts` applies everywhere else — fails the WHOLE
 * plan rather than silently dropping the one bad entry: a plan the dialog
 * shows must be a plan Apply can execute exactly as shown.
 *
 * `walk` is injectable (defaulting to the real `walkFiles`) purely so the
 * escape check above is testable at all — a real directory walk cannot
 * produce a traversal segment, so exercising this branch means supplying a
 * fake list of paths, not a fake directory tree.
 */
export async function planScaffold(
  templateRoot: string,
  targetRoot: string,
  walk: (root: string) => Promise<string[]> = walkFiles,
): Promise<GitOpResult<ScaffoldPlan>> {
  const [relPaths, manifest, templateVersion] = await Promise.all([
    walk(templateRoot),
    readManifest(targetRoot),
    readTemplateVersion(templateRoot),
  ]);

  const copyable = relPaths.filter((relPath) => relPath !== TEMPLATE_VERSION_FILE);

  for (const relPath of copyable) {
    if (joinWithin(targetRoot, relPath) === null) {
      return failure(`Template entry "${relPath}" resolves outside the target repository.`);
    }
  }

  const entries = await Promise.all(
    copyable.map((relPath) => classifyEntry(templateRoot, targetRoot, relPath, manifest)),
  );

  return ok({ targetRoot, templateVersion, entries });
}
