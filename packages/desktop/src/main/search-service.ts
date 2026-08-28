import {
  readBlame,
  streamCommitSearch,
  streamGrep,
  type CommitSearchOptions,
  type GrepOptions,
} from '@midnite/git-engine';
import {
  EVENT_CHANNELS,
  failure,
  type Commit,
  type GitOpResult,
  type GrepHit,
} from '@midnite/git-shared';
import type { BrowserWindow } from 'electron';

import {
  BATCH_SIZE,
  cancel as cancelStream,
  cancelKind,
  countOf,
  register,
  release,
} from './stream-registry';

const SEARCH_CEILING = 4;
export const CAP_DEFAULT = 5000;

export type StartCommitSearchOptions = {
  requestId: string;
  repoPath: string;
  cap?: number;
  query: CommitSearchOptions;
};

export type StartGrepOptions = {
  requestId: string;
  repoPath: string;
  cap?: number;
  query: GrepOptions;
};

/**
 * Start a streaming commit search.
 */
export function startCommitSearch(
  win: BrowserWindow,
  options: StartCommitSearchOptions,
): GitOpResult<{ started: true }> {
  if (countOf(win, 'search') >= SEARCH_CEILING) {
    return failure('Too many searches running — cancel one first.');
  }


  const cap = options.cap ?? CAP_DEFAULT;
  let forwarded = 0;
  let finished = false;

  const send = (channel: string, payload: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  };

  const stream = streamCommitSearch(
    options.repoPath,
    options.query,
    (commits: Commit[]) => {
      if (finished) return;
      const remaining = cap - forwarded;
      if (remaining <= 0) return;

      const toSend = commits.length <= remaining ? commits : commits.slice(0, remaining);
      forwarded += toSend.length;

      send(EVENT_CHANNELS.searchBatch, {
        requestId: options.requestId,
        mode: 'commits',
        commits: toSend,
      });

      if (forwarded >= cap) {
        finishStream(true);
      }
    },
    BATCH_SIZE,
  );

  const finishStream = (truncated: boolean, error?: string): void => {
    if (finished) return;
    finished = true;
    stream.cancel();
    release(win, options.requestId);

    send(EVENT_CHANNELS.searchDone, {
      requestId: options.requestId,
      mode: 'commits',
      total: forwarded,
      truncated,
      ...(error === undefined ? {} : { error }),
    });
  };

  register(win, {
    requestId: options.requestId,
    kind: 'search',
    cancel: () => {
      finished = true;
      stream.cancel();
    },
  });

  void stream.done.then((result) => {
    if (finished) return;
    finishStream(forwarded >= cap, result.error);
  });

  return { ok: true, value: { started: true } };
}

/**
 * Start a streaming grep content search.
 */
export function startGrep(
  win: BrowserWindow,
  options: StartGrepOptions,
): GitOpResult<{ started: true }> {
  if (countOf(win, 'search') >= SEARCH_CEILING) {
    return failure('Too many searches running — cancel one first.');
  }


  const cap = options.cap ?? CAP_DEFAULT;
  let forwarded = 0;
  let finished = false;

  const send = (channel: string, payload: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  };

  const stream = streamGrep(
    options.repoPath,
    options.query,
    (hits: GrepHit[]) => {
      if (finished) return;
      const remaining = cap - forwarded;
      if (remaining <= 0) return;

      const toSend = hits.length <= remaining ? hits : hits.slice(0, remaining);
      forwarded += toSend.length;

      send(EVENT_CHANNELS.searchBatch, {
        requestId: options.requestId,
        mode: 'content',
        hits: toSend,
      });

      if (forwarded >= cap) {
        finishStream(true);
      }
    },
    BATCH_SIZE,
  );

  const finishStream = (truncated: boolean, error?: string): void => {
    if (finished) return;
    finished = true;
    stream.cancel();
    release(win, options.requestId);

    send(EVENT_CHANNELS.searchDone, {
      requestId: options.requestId,
      mode: 'content',
      total: forwarded,
      truncated,
      ...(error === undefined ? {} : { error }),
    });
  };

  register(win, {
    requestId: options.requestId,
    kind: 'search',
    cancel: () => {
      finished = true;
      stream.cancel();
    },
  });

  void stream.done.then((result) => {
    if (finished) return;
    finishStream(forwarded >= cap, result.error);
  });

  return { ok: true, value: { started: true } };
}

/**
 * Cancel search stream(s).
 */
export function cancelSearch(win: BrowserWindow, requestId?: string): void {
  if (requestId !== undefined) {
    cancelStream(win, requestId);
  } else {
    cancelKind(win, 'search');
  }
}

export { readBlame };
