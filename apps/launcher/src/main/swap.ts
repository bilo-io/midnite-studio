import { rename, rm } from 'node:fs/promises';

/**
 * Verify-then-swap — the one way the launcher replaces anything on disk.
 *
 * Lifted out of `install.ts` (Studio's install) so per-app bundles and their
 * Dock stubs (`bundles/`) take the same guarantees rather than a second copy of
 * them:
 *
 *   1. the new copy is already *staged* on the destination volume and verified
 *      (the caller's job — a `rename` across volumes is not atomic);
 *   2. the current copy is moved aside to `backup`, never deleted first;
 *   3. the staged copy is renamed into place and verified *again* there;
 *   4. on any failure the backup is moved back, so the previous install keeps
 *      working.
 *
 * The backup is **not** removed here. A caller swapping one thing calls
 * `commit()` straight away; a caller swapping two (a bundle and its stub) swaps
 * both, then commits both — or reverts the first when the second fails, so the
 * pair never ends up half old and half new.
 */

export type SwapHandle = {
  /** The swap is final: drop the backup. */
  commit(): Promise<void>;
  /** Undo a swap that succeeded: remove the new copy, restore the previous one (if there was one). */
  revert(): Promise<void>;
};

export type SwapResult = ({ ok: true } & SwapHandle) | { ok: false; message: string };

export type SwapPaths = {
  /** The verified new copy, on the same volume as `dest`. */
  staged: string;
  dest: string;
  /** Where the current copy waits until `commit`/`revert`. */
  backup: string;
};

/** `verify` answers `null` for a good copy, or a reason. */
export async function swapIntoPlace(
  { staged, dest, backup }: SwapPaths,
  verify: (path: string) => Promise<string | null>,
): Promise<SwapResult> {
  await rm(backup, { recursive: true, force: true });

  let hadPrevious = true;
  try {
    await rename(dest, backup);
  } catch {
    hadPrevious = false;
  }
  const restore = async (): Promise<void> => {
    await rm(dest, { recursive: true, force: true });
    if (hadPrevious) await rename(backup, dest);
  };

  try {
    await rename(staged, dest);
  } catch {
    if (hadPrevious) await rename(backup, dest);
    return { ok: false, message: 'Could not move the new copy into place — the previous copy was restored.' };
  }
  if ((await verify(dest)) !== null) {
    await restore();
    return { ok: false, message: 'The installed copy failed verification — the previous copy was restored.' };
  }
  return {
    ok: true,
    commit: () => rm(backup, { recursive: true, force: true }),
    revert: restore,
  };
}
