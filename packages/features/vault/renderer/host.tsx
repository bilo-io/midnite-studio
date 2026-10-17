import { createContext, useContext, type ReactNode } from 'react';

import type { IconComponent } from '@midnite/studio-frame';
import type { ForgeAccountAddResult, ForgeKind, WebAppId } from '@midnite/studio-shared';

/**
 * The vault feature's host port (Phase 113 Theme J slice 3) — what the vault's components need from the
 * app that composes them, beyond the frame.
 *
 * Two things only the app knows:
 *
 * - **How to open a web app** so its user can sign in (`openWebApp`). Studio does what its rail does —
 *   enable the app, open its flyout, activate it (or focus its window when detached). The standalone
 *   Vault has no web apps, and passes `null`: its sign-ins answer "needs Studio" anyway.
 * - **Studio's forge-account kit** (`forge`) for the credential half of Settings ▸ Accounts, which moved
 *   into this feature (`forge-account-credentials.tsx`): the provider list Studio's forge surfaces share
 *   (labels, hosts, token hints, brand marks and colours) and its react-query add/remove mutations, so a
 *   change refreshes every forge query exactly as before. Null in the standalone Vault, whose own Forge
 *   accounts section talks to the bridge directly.
 *
 * **No value ever crosses this port.** A token goes *in* through `useAddAccount().mutate`; the result is
 * `ForgeAccountAddResult` (an account's metadata, `hasToken`, or an error sentence).
 */

/** A forge provider as Settings ▸ Accounts offers it — Studio's `forge-providers.ts`, one row per kind. */
export type VaultForgeProvider = {
  kind: Exclude<ForgeKind, 'unknown'>;
  label: string;
  /** The one real host for the kind (no self-hosted picker). */
  host: string;
  /** The exact scopes the provider needs, spelled out under the token field. */
  tokenHint: string;
  Icon: IconComponent;
  /** `--brand-light`/`--brand-dark` — Studio's `.forge-provider-option` rule picks one per theme. */
  brand: { light: string; dark: string };
};

export type VaultAddForgeAccountInput = { kind: VaultForgeProvider['kind']; host: string; token?: string };

/** Studio's `useAddForgeAccount()`, the members the add form reads. */
export type VaultAddForgeAccount = {
  mutate: (input: VaultAddForgeAccountInput, options?: { onSuccess?: (result: ForgeAccountAddResult) => void }) => void;
  isPending: boolean;
  data: ForgeAccountAddResult | undefined;
};

/** Studio's `useRemoveForgeAccount()`, the member the remove button calls. */
export type VaultRemoveForgeAccount = { mutate: (id: string) => void };

export type VaultForgeKit = {
  /** In the picker's display order. */
  providers: readonly VaultForgeProvider[];
  /** Hooks. */
  useAddAccount: () => VaultAddForgeAccount;
  useRemoveAccount: () => VaultRemoveForgeAccount;
};

export type VaultHost = {
  openWebApp: ((id: WebAppId) => void) | null;
  forge: VaultForgeKit | null;
};

const VaultHostContext = createContext<VaultHost | null>(null);

export function VaultHostProvider({ host, children }: { host: VaultHost; children: ReactNode }) {
  return <VaultHostContext.Provider value={host}>{children}</VaultHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the vault would not know how to open an app. */
export function useVaultHost(): VaultHost {
  const host = useContext(VaultHostContext);
  if (!host) throw new Error('The vault feature must be rendered inside <VaultHostProvider>');
  return host;
}

/** The forge kit. Throws where the app composed none — a forge credential component needs Studio's. */
export function useVaultForgeKit(): VaultForgeKit {
  const { forge } = useVaultHost();
  if (!forge) throw new Error('This vault component needs a host with a forge kit (Studio composes one)');
  return forge;
}
