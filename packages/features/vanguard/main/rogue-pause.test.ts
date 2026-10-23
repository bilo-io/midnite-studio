import { describe, expect, it, vi } from 'vitest';

import { createAutoPause } from './rogue-pause';

const finding = (severity: 'critical' | 'high', sessionId = 's1') => ({ sessionId, severity, title: 'T', detail: 'D', findingId: 'f1' });

function build(severities: ('critical' | 'high')[] = ['critical']) {
  const interrupt = vi.fn(async () => true);
  const kill = vi.fn(async () => true);
  const announce = vi.fn();
  const pause = createAutoPause({ severities: () => severities, interrupt, kill, announce, now: () => 42 });
  return { interrupt, kill, announce, pause };
}

describe('auto-pause', () => {
  it('a critical finding writes the interrupt and announces, and does nothing else', async () => {
    const { interrupt, kill, announce, pause } = build();
    const prompt = await pause.onFinding(finding('critical'));
    expect(interrupt).toHaveBeenCalledExactlyOnceWith('s1');
    expect(kill).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sessionId: 's1', severity: 'critical', findingId: 'f1', at: 42 }));
    expect(prompt?.id).toBeTruthy();
  });

  it('a severity that is not opted in changes nothing', async () => {
    const { interrupt, announce, pause } = build();
    expect(await pause.onFinding(finding('high'))).toBeNull();
    expect(interrupt).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it('opting high in pauses on high', async () => {
    const { interrupt, pause } = build(['critical', 'high']);
    await pause.onFinding(finding('high'));
    expect(interrupt).toHaveBeenCalledOnce();
  });

  it('holds one open prompt per session', async () => {
    const { interrupt, announce, pause } = build();
    await pause.onFinding(finding('critical'));
    await pause.onFinding(finding('critical'));
    expect(interrupt).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledOnce();
    await pause.onFinding(finding('critical', 's2'));
    expect(interrupt).toHaveBeenCalledTimes(2);
  });

  it('resume ends nothing and re-arms the session; kill kills; a stale answer is false', async () => {
    const { interrupt, kill, pause } = build();
    const first = await pause.onFinding(finding('critical'));
    expect(await pause.resolve(first!.id, 'resume')).toBe(true);
    expect(kill).not.toHaveBeenCalled();
    expect(await pause.resolve(first!.id, 'resume')).toBe(false);
    const second = await pause.onFinding(finding('critical'));
    expect(interrupt).toHaveBeenCalledTimes(2);
    expect(await pause.resolve(second!.id, 'kill')).toBe(true);
    expect(kill).toHaveBeenCalledExactlyOnceWith('s1');
  });

  it('says so when the session could not be reached', async () => {
    const announce = vi.fn();
    const pause = createAutoPause({ severities: () => ['critical'], interrupt: async () => false, announce });
    const prompt = await pause.onFinding(finding('critical'));
    expect(prompt?.detail).toContain('could not be reached');
  });
});
