import type { z } from 'zod';

import type { FeatureMainContext, RuntimeWindow } from './feature-main';

type Handler = (raw?: unknown, sender?: RuntimeWindow | null) => Promise<unknown>;

/**
 * A {@link FeatureMainContext} that records instead of registering — what a
 * feature's main-half tests register against.
 *
 * `invoke` runs a handler the way the real composer would: through the
 * channel's zod schema first, answering a bad payload with `onInvalid`, so a
 * test exercises the same validation the renderer's calls meet.
 */
export interface RecordingContext extends FeatureMainContext {
  /** Every channel registered, in registration order. */
  readonly channels: string[];
  /** Every `emit`, in order. */
  readonly emitted: { channel: string; payload: unknown }[];
  /** Every `trashItem` path, in order. */
  readonly trashed: string[];
  /** `sender` stands in for the sending window of a `sendFromSender` channel (default `null`). */
  invoke(channel: string, payload?: unknown, sender?: RuntimeWindow | null): Promise<unknown>;
}

export function createRecordingContext(): RecordingContext {
  const handlers = new Map<string, Handler>();
  const channels: string[] = [];
  const emitted: { channel: string; payload: unknown }[] = [];
  const trashed: string[] = [];

  const register = (channel: string, handler: Handler) => {
    if (handlers.has(channel)) throw new Error(`channel registered twice: ${channel}`);
    handlers.set(channel, handler);
    channels.push(channel);
  };

  return {
    channels,
    emitted,
    trashed,
    ipc: {
      handle<S extends z.ZodTypeAny, R>(
        channel: string,
        schema: S,
        handler: (payload: z.output<S>) => Promise<R> | R,
        onInvalid: (issue: string) => R,
      ) {
        register(channel, async (raw) => {
          const parsed = schema.safeParse(raw);
          if (!parsed.success) return onInvalid(`${channel}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}`);
          return handler(parsed.data);
        });
      },
      handleBare<R>(channel: string, handler: () => Promise<R> | R) {
        register(channel, async () => handler());
      },
      send<S extends z.ZodTypeAny>(
        channel: string,
        schema: S,
        handler: (payload: z.output<S>) => void,
        onInvalid: (issue: string) => void,
      ) {
        register(channel, async (raw) => {
          const parsed = schema.safeParse(raw);
          if (!parsed.success) return onInvalid(`${channel}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}`);
          handler(parsed.data);
        });
      },
      sendFromSender<S extends z.ZodTypeAny>(
        channel: string,
        schema: S,
        handler: (payload: z.output<S>, window: RuntimeWindow | null) => void,
        onInvalid: (issue: string) => void,
      ) {
        register(channel, async (raw, sender) => {
          const parsed = schema.safeParse(raw);
          if (!parsed.success) return onInvalid(`${channel}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}`);
          handler(parsed.data, sender ?? null);
        });
      },
    },
    emit(channel, payload) {
      emitted.push({ channel, payload });
    },
    async trashItem(path) {
      trashed.push(path);
    },
    invoke(channel, payload, sender) {
      const handler = handlers.get(channel);
      if (!handler) return Promise.reject(new Error(`no handler for ${channel}`));
      return handler(payload, sender);
    },
  };
}
