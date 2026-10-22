import {
  AgentRunHandoffSchema,
  agentRunPrompt,
  BUILTIN_AGENTS,
  parseAgentRunIssueUrl,
  pickForgeRemote,
  type AgentRunIssue,
} from '@midnite/studio-shared';
import { resolveMostRecentAgentId } from '@midnite/studio-feature-tasks/renderer/state';

import type { ConfirmRequest } from '../components/confirm-dialog';
import { agentInvocationArgs, shellQuote, startAgent, toAgentPrompt } from '../features/terminal/start-agent';
import { revealSession } from '../features/terminal/reveal-session';
import { useTerminalStore } from '../features/terminal/terminal-store';
import { useUiStore } from '../store/ui-store';
import { bridge } from './bridge';
import { forgeRegistryKey, lookupRepoIdByForge } from './repo-forge-registry';

/**
 * Studio's end of the agent-run hand-off (Phase 113 Theme O): `midnite-studio://run?req=…`, sent by an
 * app with no terminal (Coder's card Play) through the launcher's router.
 *
 * A link is remote-triggerable — any web page can open one — so arriving here proves nothing. In order:
 *
 * 1. **Re-validate.** Main already decoded it against `AgentRunHandoffSchema`; it is checked again,
 *    because this is the last stop before a terminal. Anything that fails is refused with a toast.
 * 2. **Known repositories only.** The issue's `host/owner/repo` must be a repository the user already
 *    has open here. An unknown one is refused with a toast — never resolved, cloned or opened.
 * 3. **Always confirm.** The dialog shows the exact command and the checkout it runs in. Nothing
 *    starts until the user presses the button.
 * 4. **Send only with Launch and run.** Confirmed, the agent starts with the prompt typed; it is sent
 *    (Return appended) only when Settings ▸ Projects ▸ Launch and run is on — the same switch Studio's
 *    own card composer obeys. Off, the user presses Return in the terminal themselves.
 *
 * 5. **A page's run is never sent** (Phase 117 Theme G). A link a web page inside Studio's browser
 *    asked for arrives with that page's origin. The confirm names the page, and the prompt is only
 *    ever typed, whatever Launch and run says: a page does not get to press Return for the user.
 *
 * The command is Studio's own: the repository's most recent agent (else the roster's first), its
 * invocation flags and the `<skill> <url>` prompt Studio's Play sends. Nothing in the link picks an
 * agent, a flag, a path or a prompt.
 */

export type AgentRunRepo = { id: string; path: string };

export type AgentRunAgent = { id: string; command: string };

export type AgentRunStart = {
  repoId: string;
  cwd: string;
  title: string;
  prompt: string;
  agentId: string;
  command: string;
  autoSend: boolean;
};

export type AgentRunReceiverDeps = {
  /** The open repository whose forge remote is `host/owner/repo`, or null. Never opens or clones one. */
  findRepo: (issue: AgentRunIssue) => Promise<AgentRunRepo | null>;
  locked: () => boolean;
  launchAndRunEnabled: () => boolean;
  agentFor: (repoId: string) => AgentRunAgent;
  /** The exact command line the confirm shows. */
  preview: (agent: AgentRunAgent, prompt: string) => string;
  confirm: (request: ConfirmRequest) => void;
  refuse: (message: string) => void;
  start: (input: AgentRunStart) => void;
};

export type AgentRunOutcome = 'refused' | 'confirming';

export const AGENT_RUN_REFUSED = "That agent-run link isn't one Midnite can start, so nothing was run.";

export async function receiveAgentRun(
  raw: unknown,
  deps: AgentRunReceiverDeps,
  from: { pageOrigin?: string } = {},
): Promise<AgentRunOutcome> {
  const parsed = AgentRunHandoffSchema.safeParse(raw);
  const issue = parsed.success ? parseAgentRunIssueUrl(parsed.data.issueUrl) : null;
  if (!parsed.success || issue === null) {
    deps.refuse(AGENT_RUN_REFUSED);
    return 'refused';
  }
  if (deps.locked()) {
    deps.refuse('The screen is locked — unlock it first.');
    return 'refused';
  }

  let repo: AgentRunRepo | null = null;
  try {
    repo = await deps.findRepo(issue);
  } catch {
    repo = null;
  }
  if (repo === null) {
    deps.refuse(`${issue.owner}/${issue.repo} isn't open in Midnite Studio, so nothing was run. Open it here first, then send the task again.`);
    return 'refused';
  }

  const run = parsed.data;
  const prompt = agentRunPrompt(run);
  const agent = deps.agentFor(repo.id);
  const fromPage = from.pageOrigin !== undefined;
  const autoSend = !fromPage && deps.launchAndRunEnabled();
  const found = repo;
  deps.confirm({
    title: fromPage ? 'A web page wants to run a task in an agent' : 'Run this task in an agent?',
    body: [
      ...(fromPage ? [`Asked for by ${from.pageOrigin || 'a web page'}. Only go on if you started this yourself.`, ''] : []),
      deps.preview(agent, prompt),
      '',
      `In ${found.path}`,
      '',
      autoSend
        ? 'It runs as soon as you confirm (Launch and run is on).'
        : fromPage
          ? 'It is typed into a new terminal, never sent — a page cannot press Return for you.'
          : 'It is typed into a new terminal, not sent — press Return there to run it.',
    ].join('\n'),
    confirmLabel: autoSend ? 'Launch and run' : 'Start',
    onConfirm: () =>
      deps.start({
        repoId: found.id,
        cwd: found.path,
        title: `${issue.owner}/${issue.repo}#${issue.number}`,
        prompt,
        agentId: agent.id,
        command: agent.command,
        autoSend,
      }),
  });
  return 'confirming';
}

/** Every open repository, checked against the issue's `host/owner/repo` — the registry first, then each repo's remotes. */
async function findOpenRepo(issue: AgentRunIssue): Promise<AgentRunRepo | null> {
  const api = bridge();
  if (!api) return null;
  const repos = await api.repos.list();
  const known = lookupRepoIdByForge(issue.host, issue.owner, issue.repo);
  const hit = known === null ? undefined : repos.find((repo) => repo.id === known);
  if (hit) return { id: hit.id, path: hit.path };
  // The registry fills after the first render; a link that arrives at a cold start asks the remotes directly.
  const wanted = forgeRegistryKey(issue.host, issue.owner, issue.repo);
  for (const repo of repos) {
    const forge = pickForgeRemote((await api.remotes.list({ repoId: repo.id })) ?? [])?.forge;
    if (forge && forgeRegistryKey(forge.host, forge.owner, forge.repo) === wanted) return { id: repo.id, path: repo.path };
  }
  return null;
}

export function liveAgentRunDeps(ui: {
  confirm: (request: ConfirmRequest) => void;
  refuse: (message: string) => void;
}): AgentRunReceiverDeps {
  return {
    findRepo: findOpenRepo,
    locked: () => useUiStore.getState().screensaverLocked,
    launchAndRunEnabled: () => useUiStore.getState().launchAndRunEnabled,
    agentFor: (repoId) => {
      const id = resolveMostRecentAgentId(useTerminalStore.getState().sessions, repoId);
      const agent = BUILTIN_AGENTS.find((a) => a.id === id) ?? BUILTIN_AGENTS[0]!;
      return { id: agent.id, command: agent.command };
    },
    preview: (agent, prompt) =>
      [
        agent.command,
        ...agentInvocationArgs(agent.id, useUiStore.getState().skillExecutionMode),
        shellQuote(toAgentPrompt(prompt, agent.id)),
      ].join(' '),
    confirm: ui.confirm,
    refuse: ui.refuse,
    start: (input) => {
      const session = startAgent(input);
      revealSession(session.id);
    },
  };
}
