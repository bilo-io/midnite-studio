// vitest/jsdom: pure store + bridge logic, no browser capability needed.
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { migrateLegacyAgentApiKeys } from './migrate-agent-api-keys';
import { useUiStore } from './ui-store';

type FakeSecrets = {
  set: Mock;
  has: Mock;
};

function install(secrets: FakeSecrets) {
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { secrets };
}

/** A vault that stores what it is given, or drops writes when `drop` is set (no keychain). */
function fakeVault(drop = false) {
  const stored = new Map<string, string>();
  const secrets: FakeSecrets = {
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      if (!drop) stored.set(key, value);
    }),
    has: vi.fn(async ({ key }: { key: string }) => ({ hasKey: stored.has(key) })),
  };
  return { secrets, stored };
}

describe('migrateLegacyAgentApiKeys', () => {
  beforeEach(() => {
    useUiStore.setState({ agentApiKeys: {} });
  });
  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    vi.restoreAllMocks();
  });

  it('moves each key into the vault and removes it from the store', async () => {
    const { secrets, stored } = fakeVault();
    install(secrets);
    useUiStore.setState({ agentApiKeys: { claude: ' sk-a ', codex: 'sk-b' } });
    await migrateLegacyAgentApiKeys();
    expect(stored.get('agent.claude.apiKey')).toBe('sk-a');
    expect(stored.get('agent.codex.apiKey')).toBe('sk-b');
    expect(useUiStore.getState().agentApiKeys).toEqual({});
  });

  it('is idempotent', async () => {
    const { secrets } = fakeVault();
    install(secrets);
    useUiStore.setState({ agentApiKeys: { claude: 'sk-a' } });
    await migrateLegacyAgentApiKeys();
    await migrateLegacyAgentApiKeys();
    expect(secrets.set).toHaveBeenCalledTimes(1);
  });

  it('keeps a key whose write did not land', async () => {
    const { secrets } = fakeVault(true);
    install(secrets);
    useUiStore.setState({ agentApiKeys: { claude: 'sk-a' } });
    await migrateLegacyAgentApiKeys();
    expect(useUiStore.getState().agentApiKeys).toEqual({ claude: 'sk-a' });
  });

  it('keeps a key when the write throws', async () => {
    const { secrets } = fakeVault();
    secrets.set.mockRejectedValue(new Error('boom'));
    install(secrets);
    useUiStore.setState({ agentApiKeys: { claude: 'sk-a' } });
    await migrateLegacyAgentApiKeys();
    expect(useUiStore.getState().agentApiKeys).toEqual({ claude: 'sk-a' });
  });

  it('leaves agents with no vault slot (github) alone', async () => {
    const { secrets } = fakeVault();
    install(secrets);
    useUiStore.setState({ agentApiKeys: { github: 'ghp_x', mystery: 'k' } });
    await migrateLegacyAgentApiKeys();
    expect(secrets.set).not.toHaveBeenCalled();
    expect(useUiStore.getState().agentApiKeys).toEqual({ github: 'ghp_x', mystery: 'k' });
  });

  it('never logs a value', async () => {
    const { secrets } = fakeVault(true);
    install(secrets);
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) => vi.spyOn(console, m));
    useUiStore.setState({ agentApiKeys: { claude: 'sk-secret' } });
    await migrateLegacyAgentApiKeys();
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain('sk-secret');
  });
});
