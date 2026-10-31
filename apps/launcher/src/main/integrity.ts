import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export const CORRUPT_DOWNLOAD_MESSAGE = 'The download was corrupted. Nothing was installed — try again.';
export const UNPACK_FAILED_MESSAGE = 'The download could not be unpacked. Nothing was installed — try again.';

/**
 * SHA-256 of a file, read back from disk. The digest that matters is the one of the bytes the
 * extractor will read, not of the bytes that were handed to the write stream: those two have been
 * seen to differ (right size, ~489 KB of different bytes) under Electron 33.
 */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/** Runs an archive extraction; a failure is logged raw and rethrown as the friendly message. */
export async function unpack(extract: () => Promise<void>): Promise<void> {
  try {
    await extract();
  } catch (error) {
    // The launcher has no structured logger; the raw error belongs in the main-process log, not the UI.
    // eslint-disable-next-line no-console
    console.error('[launcher] extracting the downloaded archive failed:', error);
    throw new UnpackError();
  }
}

export class UnpackError extends Error {
  constructor() {
    super(UNPACK_FAILED_MESSAGE);
    this.name = 'UnpackError';
  }
}
