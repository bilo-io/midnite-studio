import { spawnGit } from '../exec/git-exec';

/**
 * Read one blob's raw bytes out of the object database.
 *
 * Exists for the image diff: the pre-image of a changed PNG is not on disk
 * anywhere, so the only way to show "before" is to ask git for the object. The
 * `mstudio-file://` protocol handler streams the result to an `<img>`; nothing here
 * knows about Electron, which is why it lives in the engine.
 *
 * `spawnGit` rather than `execGit`: dugite hands stdout back as a *string*,
 * which mangles every byte outside the encoding it assumed. Binary has to be
 * collected as Buffers.
 */
export type BlobRead =
  | { ok: true; bytes: Buffer }
  /** No such object/path at that revision, or git refused it. */
  | { ok: false; reason: 'missing' }
  /** Bigger than `maxBytes`; the child is killed rather than read to the end. */
  | { ok: false; reason: 'too-large' };

export async function readBlob(
  repoPath: string,
  /** A git revision. `':'` means the index — `git cat-file blob :path` is stage 0. */
  rev: string,
  relPath: string,
  opts: { maxBytes: number },
): Promise<BlobRead> {
  // `<rev>:<path>` is git's own object syntax, and a rev that already ends in
  // `:` is the index form — appending a second colon would address nothing.
  const spec = rev.endsWith(':') ? `${rev}${relPath}` : `${rev}:${relPath}`;
  // `cat-file` takes its object as a bare argument with no `--` terminator, so
  // anything flag-shaped is refused here rather than handed to git.
  if (spec.startsWith('-')) return { ok: false, reason: 'missing' };

  const child = spawnGit(repoPath, ['cat-file', 'blob', spec]);

  return new Promise<BlobRead>((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const settle = (result: BlobRead) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > opts.maxBytes) {
        child.kill();
        settle({ ok: false, reason: 'too-large' });
        return;
      }
      chunks.push(chunk);
    });
    // stderr is drained but not read: a missing object is an ordinary outcome
    // here, and an unread pipe would eventually stall the child.
    child.stderr?.resume();
    child.on('error', () => settle({ ok: false, reason: 'missing' }));
    child.on('close', (code) => {
      if (code !== 0) return settle({ ok: false, reason: 'missing' });
      settle({ ok: true, bytes: Buffer.concat(chunks) });
    });
  });
}
