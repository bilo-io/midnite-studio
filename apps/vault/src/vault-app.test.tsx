// vitest/jsdom: composition and the home view over a mock bridge — none of it needs a real browser.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { vaultManifest } from '@midnite/studio-feature-vault/renderer';
import { FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners } from '@midnite/studio-shared';

import { VaultApp } from './vault-app';
import { VAULT_APP } from './vault-manifest';

beforeEach(() => {
  window.midniteStudio = {
    secrets: { has: vi.fn(async () => ({ hasKey: false })), set: vi.fn() },
    forgeAccounts: { list: vi.fn(async () => []), add: vi.fn(), remove: vi.fn() },
    db: { listConnections: vi.fn(async () => []), deleteConnection: vi.fn() },
  } as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('Vault composition', () => {
  it('is the owner the placement map names for the vault feature', () => {
    expect(placementOwners(FEATURE_PLACEMENT.vault)[0]).toBe(VAULT_APP.id);
    expect(VAULT_APP.features).toEqual([vaultManifest.feature]);
  });

  it('opens on a view the vault feature registers', () => {
    expect([...FEATURE_VIEWS.vault]).toContain(VAULT_APP.home);
  });

  it("wears the launcher catalog's accent", () => {
    expect(VAULT_APP.accent).toBe('#6366f1');
  });
});

describe('Vault home view', () => {
  it('renders the vault view framed as Vault, with an honest empty state', async () => {
    render(<VaultApp />);
    expect(screen.getByText('Midnite Vault')).toBeDefined();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Secrets' })).toBeDefined());
    for (const name of ['Forge accounts', 'Database logins']) {
      expect(screen.getByRole('heading', { name })).toBeDefined();
    }
    await waitFor(() => expect(screen.getAllByText(/runtime migration is switched on/).length).toBe(2));
  });
});
