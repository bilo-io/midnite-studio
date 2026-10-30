import {
  connectRuntimeVault,
  createIpcContext,
  mountModuleMains,
  vaultHostSocketPath,
  type ClipboardAdapter,
  type IpcContextElectron,
  type ModuleMount,
  type PairingIdentity,
} from '@midnite/studio-runtime';

import { vaultModuleMain } from './module';

/** The electron pieces Vault's main needs, injected so registration is testable under bare vitest. */
export type VaultElectron = IpcContextElectron & {
  /** The runtime's data directory (`vaultDirectory`), where the runtime host serves the vault. */
  directory: string;
  /** Vault's pairing key (`pairing.ts`): unpaired, the host lets it list and unpair nothing. */
  pairing: () => PairingIdentity | null;
  /** Injected clipboard adapter for copy-once operations (Phase 118 Theme C). */
  clipboard?: ClipboardAdapter;
};

/**
 * Registers the only channels Vault's renderer can call, over the runtime host's vault (Studio's,
 * on its socket — `docs/APPS.md`, "The shared data plane") as the `vault` app: names, `has`,
 * one-way writes, the grants and the pairings, which the host keeps. Vault holds no vault cipher,
 * and nothing here reads a stored value — the host refuses a `get` from `vault` even if asked.
 */
export function registerVaultHandlers(el: VaultElectron): { close(): void } {
  const { mount, close } = prepareVault(el);
  mountModuleMains(createIpcContext(el), [mount]);
  return { close };
}

/**
 * Connects to the runtime host's vault and builds the module mount over it, registering nothing: a host that
 * mounts more modules than its own (Phase 124 Theme E.3) passes `mount` to `mountModuleMains` beside theirs.
 * {@link registerVaultHandlers} is the one-module path.
 */
export function prepareVault(el: Pick<VaultElectron, 'directory' | 'pairing' | 'clipboard'>): { mount: ModuleMount; close(): void } {
  const vault = connectRuntimeVault({ socketPath: vaultHostSocketPath(el.directory), appId: 'vault', identity: el.pairing });
  return {
    mount: { module: vaultModuleMain, services: { vault, grants: vault.grants, pairings: vault.pairing, clipboard: el.clipboard } },
    close: () => vault.close(),
  };
}
