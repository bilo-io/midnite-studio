import {
  TRIGGER_SCHEDULER_SUBSCRIBER_ID,
  workflowsMain,
  type WorkflowsPorts,
} from '@midnite/studio-feature-workflows/main';
import {
  activeAccountFor,
  githubWhoami,
  listPulls,
  repoForge,
  resolveAdapter,
  type ForgePoller,
} from '@midnite/studio-feature-forge/main';
import { resolveOllamaBaseUrl } from '@midnite/studio-feature-models/main';
import { currentBranch, readStatusCounts, revParse } from '@midnite/studio-git-engine';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import { Notification, clipboard, type BrowserWindow } from 'electron';

import { runOllamaPrompt } from '../ai/ollama-headless';
import { defaultLogger } from '../log';
import { activityFor, killPty, offPty, onPty } from '../pty-service';
import { resolveWorkdir } from '../repo-registry';
import { currentSettings } from '../settings-mirror';
import { listAgents } from '../terminal-service';
import { configureWorkflowNodeSessions, startNodeSession } from '../workflow-node-sessions';
import { handle, handleBare, handleSend } from './handle';
import { readOllamaApiKey } from './secrets-handlers';

/**
 * Workflows (Phase 43) are the workflows feature's main half (Phase 113 Theme
 * N); this is Studio's composition of it. The stores stay under `userData`.
 * Everything a node reaches outside the engine — the pty service and terminal
 * sessions, the forge adapters and accounts, the repository registry, the
 * mirrored per-agent Ollama binding, the Ollama key (read here from the vault,
 * typed into one session's environment, never an answer to a channel) and
 * Electron's notification and clipboard — is handed over as
 * {@link WorkflowsPorts}.
 */
export function registerWorkflowHandlers(deps: {
  userData: string;
  forgePoller: ForgePoller;
  getMainWindow: () => BrowserWindow | null;
  /** The forge poller's cadence — the gate approval poll rides it. */
  gateApprovalPollMs: number;
}): void {
  // Phase 95 Theme J — where an `agent`/`script` node announces the terminal session it started.
  configureWorkflowNodeSessions(deps.getMainWindow);
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: (channel, payload) => {
      const win = deps.getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    },
    trashItem: () => Promise.reject(new Error('workflows never trashes')),
  };
  const ports: WorkflowsPorts = {
    log: defaultLogger,
    listAgents,
    agentBinding: (agentId) => currentSettings().agentBackends?.[agentId],
    ollamaBaseUrl: () => resolveOllamaBaseUrl(),
    ollamaApiKey: readOllamaApiKey,
    ollamaPrompt: (model, prompt, timeoutMs) => runOllamaPrompt(model, prompt, timeoutMs),
    pty: { onPty, offPty, killPty, activityFor, startNodeSession },
    repos: { resolveWorkdir, currentBranch, revParse, readStatusCounts },
    forge: {
      resolveAdapter,
      // An explicit account when one is active for the host; for GitHub with none (the
      // `gh`-delegated common case), whoever `gh` itself is authenticated as. `null` means "cannot
      // tell", which a gate reads as "decide nothing", never as "anyone may decide".
      commentOwnerLogin: async (forge) => {
        const account = await activeAccountFor(forge);
        if (account) return account.login;
        if (forge.kind === 'github') return (await githubWhoami(forge.host))?.login ?? null;
        return null;
      },
      // The identical GitHub-only data source the poller's own `pollOnce('pulls')` reads.
      fetchOpenPulls: async (repoId) => {
        const forge = await repoForge(repoId);
        if (!forge) return null;
        const result = await listPulls(forge, { limit: 100, state: 'open' });
        return result.error !== null ? null : result.pulls;
      },
      subscribePulls: (repoId) => deps.forgePoller.subscribe(repoId, 'pulls', TRIGGER_SCHEDULER_SUBSCRIBER_ID),
      unsubscribePulls: (repoId) => deps.forgePoller.unsubscribe(repoId, 'pulls', TRIGGER_SCHEDULER_SUBSCRIBER_ID),
      onChanged: (listener) => deps.forgePoller.onChanged(listener),
    },
    desktop: {
      notify: {
        isSupported: () => Notification.isSupported(),
        show: ({ title, body }) => new Notification({ title, body }).show(),
      },
      writeClipboard: (text) => clipboard.writeText(text),
    },
  };
  workflowsMain.register(ctx, {
    ports,
    dataDirectory: deps.userData,
    gateApprovalPollMs: deps.gateApprovalPollMs,
  });
}
