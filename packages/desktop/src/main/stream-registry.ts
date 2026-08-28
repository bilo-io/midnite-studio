import type { BrowserWindow } from 'electron';

export const BATCH_SIZE = 500;

export type StreamKind = 'log' | 'search';

export type RegisteredStream = {
  requestId: string;
  kind: StreamKind;
  cancel(): void;
};

export const POLICY: Record<StreamKind, 'supersede' | 'concurrent'> = {
  log: 'supersede',
  search: 'concurrent',
};

const windowStreams = new WeakMap<BrowserWindow, Map<string, RegisteredStream>>();

function getWindowMap(win: BrowserWindow): Map<string, RegisteredStream> {
  let map = windowStreams.get(win);
  if (!map) {
    map = new Map<string, RegisteredStream>();
    windowStreams.set(win, map);
    win.once('closed', () => {
      cancelAll(win);
    });
  }
  return map;
}

export function register(win: BrowserWindow, stream: RegisteredStream): void {
  const map = getWindowMap(win);
  if (POLICY[stream.kind] === 'supersede') {
    cancelKind(win, stream.kind);
  }
  map.set(stream.requestId, stream);
}

export function cancel(win: BrowserWindow, requestId: string): void {
  const map = windowStreams.get(win);
  if (!map) return;
  const stream = map.get(requestId);
  if (stream) {
    map.delete(requestId);
    stream.cancel();
  }
}

export function cancelKind(win: BrowserWindow, kind: StreamKind): void {
  const map = windowStreams.get(win);
  if (!map) return;
  for (const [id, stream] of map.entries()) {
    if (stream.kind === kind) {
      map.delete(id);
      stream.cancel();
    }
  }
}

export function cancelAll(win: BrowserWindow): void {
  const map = windowStreams.get(win);
  if (!map) return;
  for (const [id, stream] of map.entries()) {
    map.delete(id);
    stream.cancel();
  }
}

export function countOf(win: BrowserWindow, kind: StreamKind): number {
  const map = windowStreams.get(win);
  if (!map) return 0;
  let count = 0;
  for (const stream of map.values()) {
    if (stream.kind === kind) count += 1;
  }
  return count;
}

export function release(win: BrowserWindow, requestId: string): void {
  const map = windowStreams.get(win);
  if (!map) return;
  map.delete(requestId);
}
