// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { bindMetricsToWindow, type PausableWindow } from './bind-metrics';

function fake() {
  const handlers = new Map<string, () => void>();
  const win: PausableWindow = { on: (event, fn) => void handlers.set(event, fn) };
  const service = { pause: vi.fn(), resume: vi.fn(), stop: vi.fn() };
  bindMetricsToWindow(win, service);
  const emit = (event: string) => handlers.get(event)?.();
  return { service, emit, handlers };
}

describe('bindMetricsToWindow', () => {
  it.each(['blur', 'hide', 'minimize'])('%s pauses sampling', (event) => {
    const { service, emit } = fake();
    emit(event);
    expect(service.pause).toHaveBeenCalledTimes(1);
    expect(service.resume).not.toHaveBeenCalled();
    expect(service.stop).not.toHaveBeenCalled();
  });

  it.each(['focus', 'show', 'restore'])('%s resumes sampling', (event) => {
    const { service, emit } = fake();
    emit(event);
    expect(service.resume).toHaveBeenCalledTimes(1);
    expect(service.pause).not.toHaveBeenCalled();
  });

  it('closed stops sampling', () => {
    const { service, emit } = fake();
    emit('closed');
    expect(service.stop).toHaveBeenCalledTimes(1);
  });

  it('listens for exactly the seven events', () => {
    expect([...fake().handlers.keys()].sort()).toEqual(
      ['blur', 'closed', 'focus', 'hide', 'minimize', 'restore', 'show'],
    );
  });
});
