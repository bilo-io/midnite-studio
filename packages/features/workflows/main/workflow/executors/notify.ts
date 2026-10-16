import { CLIPBOARD_MAX_LENGTH } from '@midnite/studio-shared';

import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { interpolate } from '../interpolate';

/**
 * `notify` and `clipboard` — the two output kinds that reach the desktop
 * itself rather than a file or a forge. Both are factories over a tiny
 * injected seam, so the executors stay testable under bare vitest: the real
 * seam (Electron's `Notification`/`clipboard`) is bound once, in
 * `executors/index.ts`, and nowhere else in this directory imports
 * `electron`.
 */

/** Notification bodies past this are cut — macOS truncates long ones anyway. */
export const NOTIFY_BODY_CAP = 1000;

export type NotifyDeps = {
  isSupported: () => boolean;
  show: (notification: { title: string; body: string }) => void;
};

export type ClipboardDeps = { writeText: (text: string) => void };

export function createNotifyExecutor(deps: NotifyDeps): NodeExecutor {
  return async (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'notify') return { ok: false, error: 'Not a notify node.' };
    const title = interpolate(node.config.title, context.upstream);
    if (!title.ok) return title;
    if (title.value.trim() === '') return { ok: false, error: 'The notification has no title.' };
    const body = interpolate(node.config.body, context.upstream);
    if (!body.ok) return body;
    if (!deps.isSupported()) return { ok: false, error: 'This system does not support notifications.' };

    const shown = { title: title.value.trim(), body: body.value.slice(0, NOTIFY_BODY_CAP) };
    try {
      deps.show(shown);
    } catch (err) {
      return { ok: false, error: `Could not show the notification: ${err instanceof Error ? err.message : String(err)}` };
    }
    return { ok: true, output: shown };
  };
}

export function createClipboardExecutor(deps: ClipboardDeps): NodeExecutor {
  return async (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'clipboard') return { ok: false, error: 'Not a clipboard node.' };
    const text = interpolate(node.config.text, context.upstream);
    if (!text.ok) return text;
    if (text.value === '') return { ok: false, error: 'There is nothing to copy.' };
    // The same ceiling the renderer's clipboard channel enforces: the write is
    // synchronous in main, and a multi-megabyte one stalls the UI.
    if (text.value.length > CLIPBOARD_MAX_LENGTH) {
      return { ok: false, error: `The text is ${text.value.length} characters — over the ${CLIPBOARD_MAX_LENGTH} limit.` };
    }
    try {
      deps.writeText(text.value);
    } catch (err) {
      return { ok: false, error: `Could not write the clipboard: ${err instanceof Error ? err.message : String(err)}` };
    }
    return { ok: true, output: { length: text.value.length } };
  };
}
