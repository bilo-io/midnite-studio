import type { AgentDefinition, AgentStatus } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createAgentProbeService, type AgentProbeSnapshot } from './agent-probe-service';

const roster = [{ id: 'claude', command: 'claude' }] as unknown as AgentDefinition[];
const claude: AgentStatus = { id: 'claude', installed: true, resolvedPath: '/bin/claude' };

function setup(probe: (force: boolean) => Promise<AgentStatus[]>) {
  const emitted: AgentProbeSnapshot[] = [];
  const probeFn = vi.fn(async (_a: readonly AgentDefinition[], o: { force: boolean }) =>
    probe(o.force),
  );
  const service = createAgentProbeService({
    getRoster: async () => roster,
    emit: (s) => emitted.push(s),
    probe: probeFn,
  });
  return { service, emitted, probeFn };
}

describe('agent probe service', () => {
  it('starts in the checking state with nothing claimed', () => {
    const { service } = setup(async () => [claude]);
    expect(service.snapshot()).toEqual({ status: [], probe: 'checking' });
    expect(service.started()).toBe(false);
  });

  it('eager start probes once and pushes the result', async () => {
    const { service, emitted, probeFn } = setup(async () => [claude]);
    await service.start();
    expect(probeFn).toHaveBeenCalledOnce();
    expect(probeFn.mock.calls[0]?.[1]).toEqual({ force: false });
    expect(emitted).toEqual([{ status: [claude], probe: 'ready' }]);
    expect(service.started()).toBe(true);
  });

  it('a forced start passes force through to the probe (TTL bypass)', async () => {
    const { service, probeFn } = setup(async () => [claude]);
    await service.start();
    await service.start({ force: true });
    expect(probeFn.mock.calls[1]?.[1]).toEqual({ force: true });
  });

  it('concurrent starts share one probe (startup + first did-finish-load)', async () => {
    let release: (s: AgentStatus[]) => void = () => undefined;
    const { service, probeFn } = setup(() => new Promise((r) => (release = r)));
    const a = service.start();
    const b = service.start({ force: true });
    await Promise.resolve();
    release([claude]);
    await Promise.all([a, b]);
    expect(probeFn).toHaveBeenCalledOnce();
  });

  it('an empty answer for a non-empty roster is unknown, not missing', async () => {
    const { service, emitted } = setup(async () => []);
    await service.start();
    expect(emitted).toEqual([{ status: [], probe: 'unknown' }]);
  });

  it('a throwing probe is unknown and keeps the previous answer', async () => {
    let fail = false;
    const { service } = setup(async () => {
      if (fail) throw new Error('boom');
      return [claude];
    });
    await service.start();
    fail = true;
    await service.start({ force: true });
    expect(service.snapshot()).toEqual({ status: [claude], probe: 'unknown' });
  });

  it('a re-probe with an answer in hand does not flicker back to checking', async () => {
    const { service, emitted } = setup(async () => [claude]);
    await service.start();
    await service.start({ force: true });
    expect(emitted.every((e) => e.probe !== 'checking')).toBe(true);
  });
});
