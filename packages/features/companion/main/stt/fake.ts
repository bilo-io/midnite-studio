import type { SttProviderId } from '@midnite/studio-shared';

import { SttError, type SttProvider } from './types';

/**
 * The provider the tests use (Phase 79 Theme F).
 *
 * It exists so `transcribe`'s own logic — the byte cap, the missing-key
 * branch, the timeout, the error mapping, the envelope — is testable without
 * a network, a key or a stubbed global `fetch`. The phase's verification
 * section asks for exactly that: "`transcribe` with the fake provider".
 *
 * Shipped in `src/`, not in a `__fixtures__` directory, for the reason the
 * seam exists at all: it is the second implementation that proves the
 * interface is not shaped around OpenAI's request. It is never registered in
 * {@link ../index.ts}'s factory table, so no product path can reach it.
 */
export type FakeSttOptions = {
  /** What it transcribes to. Ignored when `failWith` is set. */
  text?: string;
  /** How long it takes. With fake timers, the thing the timeout test advances past. */
  delayMs?: number;
  /** Fail instead of answering. A string becomes an `SttError` with no recovery step. */
  failWith?: string | Error;
  id?: SttProviderId;
};

export type FakeSttProvider = SttProvider & {
  /** Every call it received, for asserting the bytes and mime arrived intact. */
  readonly calls: { audio: Uint8Array; mime: string }[];
};

export function createFakeSttProvider(options: FakeSttOptions = {}): FakeSttProvider {
  const calls: { audio: Uint8Array; mime: string }[] = [];

  return {
    id: options.id ?? 'openai-whisper',
    calls,
    transcribe: async (audio, mime, signal) => {
      calls.push({ audio, mime });

      const delay = options.delayMs ?? 0;
      if (delay > 0) {
        /*
          Honours the signal rather than merely resolving late — a provider
          that ignores it is the bug the real one is written not to have, and a
          fake that ignores it would let the timeout test pass against a broken
          caller.
        */
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
          }, delay);
          const onAbort = (): void => {
            clearTimeout(timer);
            reject(new SttError('aborted'));
          };
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener('abort', onAbort, { once: true });
        });
      }

      if (options.failWith !== undefined) {
        throw typeof options.failWith === 'string'
          ? new SttError(options.failWith)
          : options.failWith;
      }
      return options.text ?? '';
    },
  };
}
