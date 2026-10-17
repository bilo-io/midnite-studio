import {
  configureForgeAccounts,
  createForgeAccountsStore,
  createForgeAccountVault,
  createForgePoller,
  forgeMain,
  readGitConfigRemotes,
  type ForgeFetch,
  type ForgePollerWindows,
} from '@midnite/studio-feature-forge/main';
import { configureTests, createTestTrustStore, testsMain } from '@midnite/studio-feature-tests/main';
import {
  createIpcContext,
  createVaultGrants,
  createVaultService,
  type IpcContextElectron,
  type VaultAuthorize,
  type VaultCipher,
} from '@midnite/studio-runtime';
import { CHANNELS, schemas } from '@midnite/studio-shared';

import { createCoderRepos, type CoderRepos } from './repos';

/** The electron pieces Coder's main needs, injected so registration is testable under bare vitest. */
export type CoderElectron = IpcContextElectron & {
  /** Coder's own userData: its repository list, forge account records and test trust live under it. */
  userData: string;
  /** The runtime's data directory, where the vault's namespace files live. */
  vaultDirectory: string;
  /** `safeStorage` in the app, a fake in tests — never the real keychain under test. */
  cipher: VaultCipher;
  /**
   * Who may read what. Absent, the grants file the Vault app edits decides — so Coder is denied the
   * forge-account tokens until the user grants it, never handed them by the runtime's allow-all default.
   */
  authorize?: VaultAuthorize;
  /** The native folder picker. Resolves to null when the user cancels. */
  pickDirectory: () => Promise<string | null>;
  /** The window that sent an `ipcMain.on` message, by id (null when unknown). */
  senderWindowId: (event: unknown) => number | null;
  onWindowClosed: (windowId: number, fn: () => void) => void;
  /** Visibility and idle state for the forge poller's gate. */
  windows: Omit<ForgePollerWindows, 'broadcastOnRepo'>;
  /** The forge's HTTP transport; the global `fetch` when absent. */
  fetch?: ForgeFetch;
  warn?: (message: string) => void;
};

/**
 * Registers every channel Coder's renderer can call: the forge feature's (listings, writes, accounts,
 * projects, poll subscriptions), the tests feature's, and Coder's own small repository list
 * (`repos.list`/`pickDirectory`/`open`/`close`) plus `remotes.list` read from `.git/config`.
 *
 * **Forge tokens never leave main.** The account registry's vault is the runtime vault as `coder`,
 * behind the grants: without a grant to `forge-accounts`, a token-backed account reads as having no
 * token (requests go unauthenticated, and a `gh`-delegated GitHub account still works through `gh`),
 * and adding one fails with a sentence instead of storing anything. No channel here answers a token.
 */
export function registerCoderHandlers(el: CoderElectron): { repos: CoderRepos } {
  const vault = createVaultService({
    directory: el.vaultDirectory,
    cipher: el.cipher,
    authorize: el.authorize ?? createVaultGrants({ directory: el.vaultDirectory }).authorize,
  }).forApp('coder');
  const ctx = createIpcContext(el);
  const warn = el.warn ?? (() => undefined);
  const repos = createCoderRepos({ userData: el.userData });

  const remotesOf = async (repoId: string) => {
    const path = repos.pathOf(repoId);
    return path === null ? null : readGitConfigRemotes(path);
  };

  // Forge — providers, accounts, projects; remotes read from `.git/config`, never by running git.
  configureForgeAccounts(createForgeAccountsStore(el.userData), createForgeAccountVault(vault));
  const poller = createForgePoller(
    { info: () => undefined, error: (message) => warn(message) },
    { ...el.windows, broadcastOnRepo: (_repoId, channel, payload) => el.send(channel, payload) },
  );
  forgeMain.register(ctx, {
    remotes: remotesOf,
    syncGhAuthSwitch: () => true,
    ...(el.fetch ? { fetch: el.fetch } : {}),
    poll: {
      poller,
      subscriptions: {
        sendFromSender: (channel, schema, handler, onInvalid) =>
          el.ipcMain.on(channel, (event, raw) => {
            const parsed = schema.safeParse(raw);
            if (!parsed.success) {
              onInvalid(`${channel}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}`);
              return;
            }
            handler(parsed.data, el.senderWindowId(event));
          }),
        onWindowClosed: el.onWindowClosed,
        warn,
      },
    },
  });

  // Tests — discovery, trust and the runner, in the checkout main resolves from the repo id.
  configureTests(createTestTrustStore(el.userData));
  testsMain.register(ctx, { workdir: async (repoId) => repos.pathOf(repoId), warn });

  // Coder's repositories.
  ctx.ipc.handleBare(CHANNELS.repoList, () => repos.list());
  ctx.ipc.handleBare(CHANNELS.repoPickDirectory, async () => {
    const path = await el.pickDirectory();
    if (path !== null) repos.offer(path);
    return path;
  });
  ctx.ipc.handle(
    CHANNELS.repoOpen,
    schemas.RepoOpenRequest,
    ({ path }) => repos.admit(path),
    (issue) => ({ ok: false as const, message: issue }),
  );
  ctx.ipc.handle(
    CHANNELS.repoClose,
    schemas.RepoCloseRequest,
    ({ repoId }) => repos.remove(repoId),
    () => undefined,
  );
  ctx.ipc.handle(
    CHANNELS.remotesList,
    schemas.RemotesListRequest,
    async ({ repoId }) => (await remotesOf(repoId)) ?? [],
    () => [],
  );

  return { repos };
}
