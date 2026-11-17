import { describe, expect, it, vi } from 'vitest';

import { installMainCrashHooks } from './crash-hooks';
import type { Logger } from './log';

type Listener = (...args: never[]) => void;

function setup() {
  const listeners = new Map<string, Listener>();
  const source = {
    on(event: string, listener: Listener) {
      listeners.set(event, listener);
    },
  };
  const log = Object.assign(vi.fn(), {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }) as unknown as Logger & { error: ReturnType<typeof vi.fn> };
  installMainCrashHooks(log, source as never, source as never);
  const fire = (event: string, ...args: unknown[]) =>
    (listeners.get(event) as unknown as (...a: unknown[]) => void)(...args);
  return { log, fire };
}

describe('installMainCrashHooks (Phase 65 Theme D)', () => {
  it('records an uncaught exception without exiting', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { log, fire } = setup();
    const err = new Error('boom');
    fire('uncaughtException', err);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('[main] uncaughtException', err);
    expect(exit).not.toHaveBeenCalled();
    exit.mockRestore();
  });

  it('records an unhandled rejection', () => {
    const { log, fire } = setup();
    fire('unhandledRejection', 'nope');
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('[main] unhandledRejection', 'nope');
  });

  it('records a child process dying, with and without a name', () => {
    const { log, fire } = setup();
    fire('child-process-gone', {}, { type: 'GPU', reason: 'crashed', exitCode: 139 });
    expect(log.error).toHaveBeenLastCalledWith(
      '[main] child-process-gone type=GPU reason=crashed exit=139',
    );
    fire(
      'child-process-gone',
      {},
      { type: 'Utility', reason: 'crashed', exitCode: 1, name: 'Video Capture' },
    );
    expect(log.error).toHaveBeenLastCalledWith(
      '[main] child-process-gone type=Utility reason=crashed exit=1 name=Video Capture',
    );
  });
});
