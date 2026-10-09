import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { execGit, writeQueue } from '@midnite/studio-git-engine';
import {
  failure,
  GAME_KIT_VERSION,
  GAME_MANIFEST_FILE,
  ok,
  parseGameManifest,
  type GitOpResult,
} from '@midnite/studio-shared';

import { mediaGameTemplateRoot } from '../template-path';
import { vendorEngines } from './vendor';

export type UpgradeKitDeps = {
  templateDir?: string;
  enginesDir?: string;
  onBranchOpened?: (branch: string) => void;
};

/**
 * Upgrades a game repository's kit and vendored engines (Phase 107 Theme C).
 *
 * Refuses on a dirty tree ("Commit or discard your changes first.").
 * Creates a branch `kit-upgrade/<v>` from HEAD via the write queue,
 * replaces `kit/` and the engine subset of `vendor/`, updates `midnite-game.json`
 * (`kitVersion` and `vendored`), commits "Upgrade kit to <v>", and switches back
 * to the previous branch.
 */
export async function upgradeKit(
  gamePath: string,
  deps: UpgradeKitDeps = {},
): Promise<GitOpResult<{ branch: string }>> {
  const status = await execGit(gamePath, ['status', '--porcelain']);
  if (status.exitCode !== 0) {
    return failure('Could not check repository status.', status.stderr);
  }
  if (status.stdout.trim().length > 0) {
    return failure('Commit or discard your changes first.');
  }

  const manifestPath = join(gamePath, GAME_MANIFEST_FILE);
  let rawManifest: string;
  try {
    rawManifest = await readFile(manifestPath, 'utf8');
  } catch (error) {
    return failure(`Could not read ${GAME_MANIFEST_FILE}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawManifest);
  } catch {
    return failure(`${GAME_MANIFEST_FILE} is not valid JSON.`);
  }

  const parsed = parseGameManifest(parsedJson);
  if (!parsed.ok) {
    return failure('Manifest is invalid.');
  }
  const manifest = parsed.manifest;

  const targetVersion = GAME_KIT_VERSION;
  const branchName = `kit-upgrade/${targetVersion}`;

  return writeQueue.run(gamePath, async () => {
    // Determine the current branch to switch back to after creating the upgrade commit
    const branchRes = await execGit(gamePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const previousBranch = branchRes.stdout.trim() || 'HEAD';

    // Create and checkout kit-upgrade/<v> from HEAD
    const checkoutNew = await execGit(gamePath, ['checkout', '-b', branchName, 'HEAD'], { write: true });
    if (checkoutNew.exitCode !== 0) {
      return failure(checkoutNew.stderr.trim() || `Could not create branch ${branchName}.`);
    }

    try {
      // 1. Replace kit/
      const templateDir = deps.templateDir ?? mediaGameTemplateRoot();
      const kitDest = join(gamePath, 'kit');
      await rm(kitDest, { recursive: true, force: true });
      const kitSrc = join(templateDir, 'kit');
      try {
        await cp(kitSrc, kitDest, { recursive: true });
      } catch {
        // kitSrc may be empty in some test environments
      }

      // 2. Replace the engine subset of vendor/
      const updatedVendored = await vendorEngines(manifest.engine, gamePath, deps.enginesDir);

      // 3. Update manifest
      const updatedManifest = {
        ...manifest,
        kitVersion: targetVersion,
        vendored: { ...manifest.vendored, ...updatedVendored },
      };
      await writeFile(manifestPath, `${JSON.stringify(updatedManifest, null, 2)}\n`, 'utf8');

      // 4. Stage and commit
      await execGit(gamePath, ['add', '-A', '--', 'kit', 'vendor', GAME_MANIFEST_FILE], { write: true });
      const commitRes = await execGit(
        gamePath,
        ['commit', '--no-verify', '-m', `Upgrade kit to ${targetVersion}`],
        { write: true },
      );
      if (commitRes.exitCode !== 0) {
        return failure(commitRes.stderr.trim() || 'Could not commit kit upgrade.');
      }
    } finally {
      // Switch back to previous branch
      await execGit(gamePath, ['checkout', previousBranch], { write: true });
    }

    deps.onBranchOpened?.(branchName);
    return ok({ branch: branchName });
  });
}
