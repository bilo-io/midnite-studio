import { describe, expect, it, vi } from 'vitest';

import { CLIPBOARD_MAX_LENGTH, type WorkflowNode } from '@midnite/studio-shared';

import type { ExecutorContext } from '../executor-registry';
import { NOTIFY_BODY_CAP, createClipboardExecutor, createNotifyExecutor } from './notify';

function context(upstream: Record<string, unknown> = {}): ExecutorContext {
  return {
    upstream,
    signal: { cancelled: () => false },
    timeoutMs: 5_000,
    workflowId: 'w',
    runId: 'r',
    reportSessionId: async () => {},
    reportWaiting: async () => {},
  };
}

function notifyNode(title: string, body = ''): WorkflowNode {
  return { id: 'n', label: 'Notify', x: 0, y: 0, kind: 'notify', config: { title, body } };
}

function clipboardNode(text: string): WorkflowNode {
  return { id: 'c', label: 'Copy', x: 0, y: 0, kind: 'clipboard', config: { text } };
}

describe('the notify executor', () => {
  it('shows an interpolated notification through the injected seam', async () => {
    const show = vi.fn();
    const run = createNotifyExecutor({ isSupported: () => true, show });
    const outcome = await run(notifyNode('{{r.name}} finished', 'Took {{r.ms}}ms'), context({ r: { name: 'Build', ms: 12 } }));
    expect(outcome).toEqual({ ok: true, output: { title: 'Build finished', body: 'Took 12ms' } });
    expect(show).toHaveBeenCalledWith({ title: 'Build finished', body: 'Took 12ms' });
  });

  it('caps a long body', async () => {
    const show = vi.fn();
    await createNotifyExecutor({ isSupported: () => true, show })(notifyNode('t', 'x'.repeat(NOTIFY_BODY_CAP + 50)), context());
    expect(show.mock.calls[0]?.[0].body).toHaveLength(NOTIFY_BODY_CAP);
  });

  it('fails when notifications are unsupported, the title is empty, or showing throws', async () => {
    const show = vi.fn();
    expect(await createNotifyExecutor({ isSupported: () => false, show })(notifyNode('t'), context())).toEqual({
      ok: false,
      error: 'This system does not support notifications.',
    });
    expect(await createNotifyExecutor({ isSupported: () => true, show })(notifyNode('  '), context())).toEqual({
      ok: false,
      error: 'The notification has no title.',
    });
    expect(show).not.toHaveBeenCalled();
    const throwing = createNotifyExecutor({
      isSupported: () => true,
      show: () => {
        throw new Error('denied');
      },
    });
    expect(await throwing(notifyNode('t'), context())).toEqual({ ok: false, error: 'Could not show the notification: denied' });
  });
});

describe('the clipboard executor', () => {
  it('writes interpolated text', async () => {
    const writeText = vi.fn();
    expect(await createClipboardExecutor({ writeText })(clipboardNode('PR {{p.url}}'), context({ p: { url: 'u' } }))).toEqual({
      ok: true,
      output: { length: 4 },
    });
    expect(writeText).toHaveBeenCalledWith('PR u');
  });

  it('refuses empty and over-long text without touching the clipboard', async () => {
    const writeText = vi.fn();
    const run = createClipboardExecutor({ writeText });
    expect(await run(clipboardNode(''), context())).toEqual({ ok: false, error: 'There is nothing to copy.' });
    const long = await run(clipboardNode('x'.repeat(CLIPBOARD_MAX_LENGTH + 1)), context());
    expect(!long.ok && long.error).toContain('over the');
    expect(writeText).not.toHaveBeenCalled();
  });
});
