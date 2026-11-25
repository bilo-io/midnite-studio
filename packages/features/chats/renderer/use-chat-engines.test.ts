import { BUILTIN_AGENTS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { agentEngine, engineWire, pickEngine, profileEngine } from './use-chat-engines';

/** Pure logic over the engine list, so vitest. */

const icon = () => null;
const claude = agentEngine(BUILTIN_AGENTS.find((a) => a.id === 'claude')!, [], icon);
const profile = { id: 'profile-rev', name: 'Reviewer', baseAgentId: 'claude', accent: '#112233', description: '' };

describe('custom agents as chat engines', () => {
  it('is as available as its base CLI and carries no model list of its own', () => {
    const engine = profileEngine(profile, claude);
    expect(engine).toMatchObject({ id: 'profile-rev', label: 'Reviewer', available: true, models: [], profile: { baseAgentId: 'claude' } });
    const down = profileEngine(profile, { ...claude, available: false, reason: 'Claude Code is not installed' });
    expect(down).toMatchObject({ available: false, reason: 'Claude Code is not installed' });
    expect(profileEngine(profile, undefined).available).toBe(false);
  });

  it('goes over the wire as its base CLI plus its id; a roster engine carries no id', () => {
    expect(engineWire(profileEngine(profile, claude))).toEqual({ engine: 'claude', agentProfileId: 'profile-rev' });
    expect(engineWire(claude)).toEqual({ engine: 'claude', agentProfileId: null });
  });

  it('lands on a remembered or primary custom agent, and passes over an unavailable one', () => {
    const mine = profileEngine(profile, claude);
    expect(pickEngine([mine, claude], 'profile-rev', 'claude')?.id).toBe('profile-rev');
    expect(pickEngine([mine, claude], null, 'profile-rev')?.id).toBe('profile-rev');
    expect(pickEngine([profileEngine(profile, undefined), claude], 'profile-rev', 'claude')?.id).toBe('claude');
  });
});
