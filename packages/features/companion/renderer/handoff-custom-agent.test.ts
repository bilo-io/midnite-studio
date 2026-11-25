import { createBlankAgentProfile } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setCustomAgentsForTests } from './custom-agents';
import { useUiStore } from './ext';
import { resetHandoffState, submitInput } from './handoff';
import { fakeHandoffDeps, fakeStore, vocabularyFixture } from './test-doubles';

/** Phase 154 Theme H — "use Reviewer": a custom agent as the companion's, by voice, with read-back and undo. */

const reviewer = { ...createBlankAgentProfile(), id: 'profile-rev', name: 'Reviewer', baseAgentId: 'claude' };
const vocabulary = vocabularyFixture({ customAgents: [{ id: 'profile-rev', name: 'Reviewer' }] });

beforeEach(() => {
  setCustomAgentsForTests([reviewer]);
  useUiStore.setState({ primaryAgent: 'codex', primaryModelByAgent: {}, primaryAgentProfileId: null });
});
afterEach(() => {
  resetHandoffState();
  setCustomAgentsForTests([]);
});

describe('switching the companion to a custom agent', () => {
  it('reads back the name and leaves the primary agent alone', async () => {
    const store = fakeStore();
    await submitInput('use Reviewer', fakeHandoffDeps({ store, vocabulary: () => vocabulary }));
    expect(useUiStore.getState().primaryAgentProfileId).toBe('profile-rev');
    expect(useUiStore.getState().primaryAgent).toBe('codex');
    expect(store.lines().at(-1)).toBe('companion: Switched the companion to Reviewer.');
  });

  it('"undo that" goes back to the built-in agent', async () => {
    const store = fakeStore();
    const deps = fakeHandoffDeps({ store, vocabulary: () => vocabulary });
    await submitInput('switch to reviewer', deps);
    await submitInput('undo that', deps);
    expect(useUiStore.getState().primaryAgentProfileId).toBeNull();
    expect(useUiStore.getState().primaryAgent).toBe('codex');
    expect(store.lines().at(-1)).toBe('companion: Put it back. Switched primary agent to Codex.');
  });

  it('switching to a built-in and undoing restores the custom agent', async () => {
    useUiStore.setState({ primaryAgentProfileId: 'profile-rev' });
    const store = fakeStore();
    const deps = fakeHandoffDeps({ store, vocabulary: () => vocabulary });
    await submitInput('switch to claude', deps);
    expect(useUiStore.getState().primaryAgentProfileId).toBeNull();
    await submitInput('undo that', deps);
    expect(useUiStore.getState().primaryAgentProfileId).toBe('profile-rev');
    expect(store.lines().at(-1)).toBe('companion: Put it back. Switched the companion to Reviewer.');
  });

  it('a routed switch to an unknown profile id changes nothing', async () => {
    const store = fakeStore();
    await submitInput(
      'think with the nonexistent one',
      fakeHandoffDeps({
        store,
        ask: async () => ({ ok: true, value: { say: 'Switching.', intent: { kind: 'switchAgent', agentId: 'profile-gone' } } }),
      }),
    );
    expect(useUiStore.getState().primaryAgentProfileId).toBeNull();
    expect(store.lines().at(-1)).toBe("companion: I don't know that custom agent. It may have been deleted.");
  });
});

describe('a skill hand-off under a custom agent', () => {
  it('awaits an async launch and says the fallback notice when the agent was deleted', async () => {
    const store = fakeStore();
    const startSkill = async () => ({ id: 'session-9', notice: "Your custom agent was deleted, so I'm using Claude again." });
    await submitInput('start a swarm', fakeHandoffDeps({ store, startSkill }));
    const lines = store.lines();
    expect(lines.some((line) => line.includes("Your custom agent was deleted, so I'm using Claude again."))).toBe(true);
    expect(lines.at(-1)).toContain('I have typed');
  });

  it('says it could not start when the async launch fails', async () => {
    const store = fakeStore();
    await submitInput('start a swarm', fakeHandoffDeps({ store, startSkill: async () => null }));
    expect(store.lines().at(-1)).toBe('companion: I could not start that one — check the agent and skill settings.');
  });
});
