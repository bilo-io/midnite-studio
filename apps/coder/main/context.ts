import {
  apiClientMain,
  createScriptRunnerBroker,
  shutdownApiClient,
  type ApiClientDialogs,
  type ScriptWorkerHandle,
} from '@midnite/studio-feature-api-client/main';
import { createConnectionsStore, createCredentialVault, databaseMain, shutdownDb } from '@midnite/studio-feature-database/main';
import {
  configureForgeAccounts,
  createForgeAccountsStore,
  createForgeAccountVault,
  createForgePoller,
  forgeMain,
  readGitConfigRemotes,
  withVaultForgeAccounts,
  type ForgeFetch,
  type ForgePollerWindows,
} from '@midnite/studio-feature-forge/main';
import { readHostSessions, sessionsGuestMain, shutdownGuestSessions } from '@midnite/studio-feature-sessions/main';
import { configureTests, createTestTrustStore, testsMain } from '@midnite/studio-feature-tests/main';
import {
  connectRuntimeVault,
  createIpcContext,
  createSharedBroker,
  readRuntimeHostRecord,
  vaultHostSocketPath,
  type IpcContextElectron,
  type PairingIdentity,
} from '@midnite/studio-runtime';
import { CHANNELS, schemas } from '@midnite/studio-shared';

import { registerCoderGit } from './git';
import { createCoderRepos, type CoderRepos } from './repos';

/** The electron pieces Coder's main needs, injected so registration is testable under bare vitest. */
export type CoderElectron = IpcContextElectron & {
  /** Coder's own userData: its repository list, forge account records and test trust live under it. */
  userData: string;
  /**
   * The runtime's data directory, where the runtime host (Studio) serves the vault on a socket.
   * Coder holds no cipher: the host decrypts, and the host's grants decide — so Coder is denied the
   * forge-account tokens until the user grants it in Vault (docs/APPS.md, "The shared data plane").
   */
  vaultDirectory: string;
  /** Coder's pairing key (`pairing.ts`): the host serves nothing to a connection that has not proved it. */
  pairing: () => PairingIdentity | null;
  /** The native folder picker. Resolves to null when the user cancels. */
  pickDirectory: () => Promise<string | null>;
  /** The window that sent an `ipcMain.on` message, by id (null when unknown). */
  senderWindowId: (event: unknown) => number | null;
  onWindowClosed: (windowId: number, fn: () => void) => void;
  /** Visibility and idle state for the forge poller's gate. */
  windows: Omit<ForgePollerWindows, 'broadcastOnRepo'>;
  /** The forge's HTTP transport; the global `fetch` when absent. */
  fetch?: ForgeFetch;
  /** The API client's HTTP transport; the global `fetch` when absent. Tests hand a fake. */
  apiFetch?: typeof fetch;
  /** The native open and save dialogs the API client's import, export and file pickers open. */
  dialogs: ApiClientDialogs;
  /**
   * Forks the sandboxed script worker as its own OS process (Electron's `utilityProcess` at
   * `script-runner-worker.cjs`, beside the main bundle). Absent, scripts answer "cannot run in this
   * app" and nothing runs. The child is killed on a cancelled run, a timeout and quit.
   */
  scriptWorker?: () => ScriptWorkerHandle;
  warn?: (message: string) => void;
};

/**
 * Registers every channel Coder's renderer can call: the forge feature's (listings, writes, accounts,
 * projects, poll subscriptions), the tests feature's, the API client's, the Database tool's, the sessions
 * feature's guest channels (the runtime host's terminal sessions, attach-only), and Coder's own small
 * repository list (`repos.list`/`pickDirectory`/`open`/`close`) plus `remotes.list` read from `.git/config`.
 *
 * **Forge tokens and database passwords never leave main.** The account registry's vault and the
 * database credential vault are the runtime vault as `coder`, behind the grants: without a grant to
 * `forge-accounts`, a token-backed account reads as having no token (requests go unauthenticated, and a
 * `gh`-delegated GitHub account still works through `gh`), and adding one fails with a sentence instead
 * of storing anything; without a grant to `db-credentials`, a connection opens with no password and saving
 * a password fails with a sentence, the connection itself saved. No channel here answers a token or a
 * password. The API client's collection files are read and written in main, confined to a checkout
 * Coder's own list holds; its script worker is a separate process, killed on quit (`shutdown`).
 */
export function registerCoderHandlers(el: CoderElectron): { repos: CoderRepos; shutdown: () => Promise<void> } {
  const vault = connectRuntimeVault({ socketPath: vaultHostSocketPath(el.vaultDirectory), appId: 'coder', identity: el.pairing });
  const ctx = createIpcContext(el);
  const warn = el.warn ?? (() => undefined);
  const repos = createCoderRepos({ userData: el.userData });

  const remotesOf = async (repoId: string) => {
    const path = repos.pathOf(repoId);
    return path === null ? null : readGitConfigRemotes(path);
  };

  // Forge — providers, accounts, projects; remotes read from `.git/config`, never by running git.
  // One login: a token-backed account Studio stored shows up here once the user grants Coder it.
  configureForgeAccounts(
    withVaultForgeAccounts(createForgeAccountsStore(el.userData), () => vault.keys('forge-accounts')),
    createForgeAccountVault(vault),
  );
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

  // The API client — collections under `.midnite/api/` in a checkout Coder's list holds; scripts run
  // only in the forked worker, and only once the user has trusted the collection.
  apiClientMain.register(ctx, {
    workdir: async (repoId) => repos.pathOf(repoId),
    dialogs: el.dialogs,
    ...(el.scriptWorker ? { scriptRunner: createScriptRunnerBroker({ spawn: el.scriptWorker }) } : {}),
    ...(el.apiFetch ? { fetch: el.apiFetch } : {}),
  });

  // The Database tool — connections in Coder's own userData, passwords in the runtime vault behind the grants.
  databaseMain.register(ctx, {
    connections: createConnectionsStore(el.userData),
    credentials: createCredentialVault(vault),
  });

  // The git graph and diff — read-only, in the checkouts Coder's own list holds (`main/git.ts`).
  registerCoderGit(ctx, { pathOf: (repoId) => repos.pathOf(repoId) });

  // Sessions — the runtime host's sessions (Studio's, and those another app such as Agents started), as a
  // broker guest named in the host record: listed, attached, written to and resized. Coder starts no
  // session and kills none; the broker would refuse a guest's kill of one it did not create anyway.
  // Titles come from the host's own terminal records; a broker session's environment never reaches here.
  sessionsGuestMain.register(ctx, {
    broker: createSharedBroker({ runtimeDirectory: el.vaultDirectory, appId: 'coder' }),
    hostSessions: () => readHostSessions(readRuntimeHostRecord(el.vaultDirectory)?.sessionsFile),
  });

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

  return {
    repos,
    // Quit: abort running collection runs, kill the script worker, disconnect every pooled database
    // connection, and detach from the host's broker (its sessions keep running — they are not Coder's).
    shutdown: async () => {
      shutdownApiClient();
      await shutdownDb();
      await shutdownGuestSessions();
    },
  };
}
