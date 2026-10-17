import { COUNCIL_OUTPUT_CAP_BYTES } from '@midnite/studio-shared';

import { appendCapped } from './capture-output';

/**
 * Same cap as a council member's captured output, reused rather than a second
 * number invented for the same job: bound what a run stores, and tell the user
 * when it bit.
 */
export const HTTP_RESPONSE_CAP_BYTES = COUNCIL_OUTPUT_CAP_BYTES;

/**
 * Reads the whole body, stopping at the cap rather than buffering the lot.
 *
 * Moved here from the workflows feature's `http` executor (Phase 113 Theme O)
 * so the workflows feature and the API client feature — which may not import
 * each other — share the one stop-at-the-cap implementation and the byte count
 * that goes with it; a second copy would be the one place the
 * truncation-stops-reading contract could drift.
 */
export async function readCapped(
  response: Response,
): Promise<{ text: string; truncated: boolean; bytes: number }> {
  if (!response.body) return { text: '', truncated: false, bytes: 0 };

  let buffer: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let truncated = false;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const capped = appendCapped(buffer, value, HTTP_RESPONSE_CAP_BYTES);
      buffer = capped.buffer as Uint8Array<ArrayBuffer>;
      truncated = truncated || capped.truncated;
      // Nothing more can be kept, so stop pulling bytes off the wire rather
      // than reading a 40 MB body to throw it away.
      if (truncated) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return { text: new TextDecoder().decode(buffer), truncated, bytes: buffer.byteLength };
}
