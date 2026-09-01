import { Fragment, useEffect, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuBot, LuFolderTree, LuRefreshCw, LuRepeat } from 'react-icons/lu';

import { Accordion } from '@bilo-io/ui';

import { CLAUDE_COMMANDS, DEFAULT_LOOPS, type ClaudeInfo } from '@midnite/studio-shared';

import { IconButton } from '../../../components/icon-button';
import { resolveAgentIcon } from '../../../components/icons';
import { MidniteIcon } from '../../../components/icons/midnite-icon';
import { bridge, hasBridge } from '../../../services/bridge';
import { DEFAULT_AGENT_SKILLS, useUiStore } from '../../../store/ui-store';
import { AGENT_COMMANDS } from '../../agent/agent-commands';
import { loopIcon } from '../../loops/loop-icons';
import { useAgents } from '../../terminal/use-agents';
import { useTerminalStore } from '../../terminal/terminal-store';
import { FileTree } from '../../files/file-tree';
import { FilePreview } from '../../files/preview/file-preview';
import { Field } from './controls';

/**
 * The Agent page: what `~/.claude` holds, which Claude CLI is installed, where
 * the sidebar's midnite menu points, and the two maintenance actions with
 * deliberately different postures —
 *
 * - **Update** runs in main and streams its output here (low blast radius).
 * - **Uninstall** is only ever PASTED into the integrated terminal, without a
 *   newline. Pressing Enter is the confirmation — the app never removes an
 *   installation itself.
 */
export function AgentPage() {
  const queryClient = useQueryClient();
  const { data: info } = useQuery({
    queryKey: ['claude-info'],
    queryFn: async () => bridge()!.agent.claudeInfo(),
    enabled: hasBridge(),
  });

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Claude" icon={<LuBot className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-2 p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Detected through your login shell, the same way the terminal resolves it.
          </p>
          <ClaudeCard
            info={info}
            onRefresh={() => void queryClient.invalidateQueries({ queryKey: ['claude-info'] })}
          />
        </div>
      </Accordion>

      <Accordion title="midnite menu" icon={<MidniteIcon className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            What each entry of the sidebar&rsquo;s midnite menu types at a fresh session with the
            agent below. Point a skill field somewhere else and the menu follows — a skill is a
            file in your <code>~/.claude</code> (or its <code>.agents</code>/<code>.codex</code>{' '}
            siblings), not something this app ships, so it can be renamed or forked without the
            menu knowing. Anything the agent accepts works: a slash command, a slash command with
            arguments, or a plain sentence.
          </p>
          <PrimaryAgentPicker />
          <SkillFields />
        </div>
      </Accordion>

      <Accordion title="Loops" icon={<LuRepeat className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The four loops the quick-access panel runs. Each takes its base prompt from the{' '}
            <em>midnite menu</em> field above with the same name, so there is one place to
            change what a loop invokes. What you set here is which of a loop&rsquo;s prompt
            toggles a <em>fresh</em> run starts with — the boxes you tick in the panel itself
            apply to that run only, and are forgotten when the app closes.
          </p>
          <LoopDefaultFields />
        </div>
      </Accordion>

      <Accordion title="~/.claude" icon={<LuFolderTree className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-2 p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Your agent's home folder — skills, projects, plans, settings. Read-only here.
          </p>
          <ClaudeHomeTree />
        </div>
      </Accordion>
    </div>
  );
}

/**
 * Which roster agent the midnite menu launches.
 *
 * Reads the same roster (`useAgents`) and install status the `+` new-terminal
 * menu already does, so a row here and a row there can never disagree about
 * what's installed. Absent status = unknown = assume installed, matching that
 * menu's own rule — a probe that could not answer must not grey out a working
 * agent. Selecting a row is instant (no confirm): unlike the skill fields, this
 * choice has no destructive failure mode — worst case, the wrong binary name
 * shows up typed-but-not-run in a fresh terminal, exactly like a wrong skill
 * string does today.
 */
function PrimaryAgentPicker() {
  const { agents, status } = useAgents();
  const primaryAgent = useUiStore((s) => s.primaryAgent);
  const setPrimaryAgent = useUiStore((s) => s.setPrimaryAgent);
  const statusById = new Map(status.map((s) => [s.id, s]));

  return (
    <Field label="Primary agent" hint="Which agent the midnite menu opens a fresh session with.">
      <div className="flex flex-wrap gap-1.5">
        {agents.map((agent) => {
          const Icon = resolveAgentIcon(agent);
          const selected = agent.id === primaryAgent;
          const missing = statusById.get(agent.id)?.installed === false;
          return (
            <button
              key={agent.id}
              type="button"
              title={missing ? (agent.install ?? `${agent.command} was not found on your PATH`) : undefined}
              onClick={() => setPrimaryAgent(agent.id)}
              className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors ${
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              } ${missing ? 'opacity-60' : ''}`}
            >
              <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color: agent.accent }} />
              {agent.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/**
 * One text field per menu entry, in the menu's own order.
 *
 * Free text rather than a picker over the skills found on disk, and that is a
 * deliberate trade: enumerating `~/.claude/skills` would catch a typo, but it
 * would also refuse every legitimate value that is not a bare skill — a project
 * skill in a repo the app has not opened, a command with arguments, a plain
 * prompt. The failure mode of free text is visible and cheap: the menu opens a
 * terminal with the command typed but NOT run, so a wrong value is something you
 * read before pressing Return.
 *
 * The reset link appears only where the value has drifted from the default, so
 * the row stays quiet for anyone who never changed it.
 *
 * A divider falls between categories, echoing the menu's own separators, so
 * the two never disagree about where one group ends and the next begins.
 */
function SkillFields() {
  const skills = useUiStore((s) => s.agentSkills);
  const setSkill = useUiStore((s) => s.setAgentSkill);

  let lastCategory: string | undefined;

  return (
    <div className="flex flex-col gap-3">
      {AGENT_COMMANDS.map(({ id, label, icon: Icon, hint, category }) => {
        const showDivider = lastCategory !== undefined && category !== lastCategory;
        lastCategory = category;
        const value = skills[id];
        const dirty = value !== DEFAULT_AGENT_SKILLS[id];
        return (
          <Fragment key={id}>
            {showDivider ? <hr className="border-border" /> : null}
            <Field label={label} hint={hint}>
              <div className="flex items-center gap-2">
                {/* The menu's own glyph, so a field and its entry are the same thing. */}
                <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  value={value}
                  spellCheck={false}
                  placeholder={DEFAULT_AGENT_SKILLS[id]}
                  aria-label={`Skill for ${label}`}
                  onChange={(event) => setSkill(id, event.target.value)}
                  className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 font-mono text-xs outline-none focus-visible:border-primary"
                />
                {dirty ? (
                  <button
                    type="button"
                    onClick={() => setSkill(id, DEFAULT_AGENT_SKILLS[id])}
                    className="h-7 shrink-0 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </Field>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * Which of each loop's prompt toggles a fresh run starts with.
 *
 * Deliberately only the *defaults*: the base prompt is edited one accordion up
 * (a loop points at a midnite-menu entry by id, so the two cannot drift the
 * way the FAB's old hard-coded copies did), and the per-run boxes live in the
 * panel where you can see the run they apply to. A loop with no declared
 * modifiers says so rather than rendering an empty box.
 */
function LoopDefaultFields() {
  const defaults = useUiStore((s) => s.loopModifierDefaults);
  const setDefault = useUiStore((s) => s.setLoopModifierDefault);

  return (
    <div className="flex flex-col gap-3">
      {DEFAULT_LOOPS.map((loop, index) => {
        const Icon = loopIcon(loop.icon);
        return (
          <Fragment key={loop.id}>
            {index > 0 ? <hr className="border-border" /> : null}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <Icon aria-hidden className={`h-3.5 w-3.5 shrink-0 ${loop.color}`} />
                {loop.label}
              </div>
              {loop.modifiers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No toggles.</p>
              ) : (
                loop.modifiers.map((modifier) => (
                  <label
                    key={modifier.id}
                    title={modifier.promptFragment}
                    className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={defaults[loop.id]?.[modifier.id] ?? modifier.defaultOn}
                      onChange={(event) => setDefault(loop.id, modifier.id, event.target.checked)}
                      className="h-3 w-3 shrink-0 accent-primary"
                    />
                    <span>{modifier.label}</span>
                  </label>
                ))
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function ClaudeCard({ info, onRefresh }: { info: ClaudeInfo | undefined; onRefresh: () => void }) {
  const [log, setLog] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

  const update = useMutation({
    mutationFn: async () => {
      setLog('');
      const result = await bridge()!.agent.claudeUpdate();
      if (result.ok) {
        setLog((current) => `${current ?? ''}\n[exited ${result.exitCode}]`);
        onRefresh();
      } else {
        setLog((current) => `${current ?? ''}\n[failed: ${result.message}]`);
      }
      return result;
    },
  });

  // Output chunks stream on their own event channel while the update runs.
  useEffect(() => {
    const api = bridge();
    if (!api) return;
    return api.agent.onClaudeUpdateData(({ chunk }) => {
      setLog((current) => (current ?? '') + chunk);
    });
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const commands = CLAUDE_COMMANDS[info?.method ?? 'unknown'];

  return (
    <div className="flex flex-col gap-2 rounded border border-border p-3">
      <div className="flex items-center gap-2">
        {!info ? (
          <span className="text-xs text-muted-foreground">Checking…</span>
        ) : info.installed ? (
          <>
            <span className="text-sm font-medium">claude</span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs" data-selectable>
              v{info.version ?? '?'}
            </code>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              via {info.method}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            Not installed — paste the install command into the terminal below.
          </span>
        )}
        <span className="ml-auto">
          <IconButton
            icon={LuRefreshCw}
            label="Re-check Claude version"
            size="sm"
            onClick={onRefresh}
          />
        </span>
      </div>

      {info?.binPath ? (
        <code className="truncate font-mono text-[10px] text-muted-foreground" data-selectable>
          {info.binPath}
        </code>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {info?.installed ? (
          <>
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => update.mutate()}
              className="h-6 rounded-md border border-primary bg-primary/10 px-2 text-xs transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              {update.isPending ? 'Updating…' : 'Update'}
            </button>
            <button
              type="button"
              onClick={() => pasteCommand(commands.uninstall)}
              title="Opens the terminal with the command pasted — you press Enter"
              className="h-6 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent"
            >
              Uninstall…
            </button>
          </>
        ) : info ? (
          <button
            type="button"
            onClick={() => pasteCommand(commands.install)}
            className="h-6 rounded-md border border-primary bg-primary/10 px-2 text-xs transition-colors hover:bg-primary/20"
          >
            Install…
          </button>
        ) : null}
      </div>

      {log !== null ? (
        <pre
          ref={logRef}
          className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-[10px] leading-relaxed"
          data-selectable
        >
          {log || 'Starting…'}
        </pre>
      ) : null}
    </div>
  );
}

/**
 * Open the terminal panel with `command` typed at a fresh shell's prompt and
 * NOT executed — no trailing newline anywhere in this path. The session opens
 * in the selected worktree like any other new terminal.
 */
function pasteCommand(command: string): void {
  const ui = useUiStore.getState();
  ui.setTerminalOpen(true);
  // No checkout selected → no cwd to spawn a shell in. The panel opens and
  // says so, matching the + menu's own disabled state.
  if (!ui.selectedWorktreePath || !ui.selectedRepoId) return;
  const session = useTerminalStore.getState().openSession({
    kind: 'shell',
    title: 'claude setup',
    cwd: ui.selectedWorktreePath,
    repoId: ui.selectedRepoId,
  });
  useTerminalStore.getState().queueInput(session.id, command);
}

function ClaudeHomeTree() {
  // Local expansion state: the Agent page's browse is independent of the
  // Files view's per-repo store — different scope, different lifetime.
  const [expanded, setExpanded] = useState<Record<string, true>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-72 overflow-auto rounded border border-border">
        <FileTree
          scope={{ scope: 'claude-home' }}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggleDir={(relPath) =>
            setExpanded((current) => {
              const next = { ...current };
              if (next[relPath]) delete next[relPath];
              else next[relPath] = true;
              return next;
            })
          }
          onSelectFile={setSelectedPath}
        />
      </div>
      {selectedPath ? (
        <div className="flex max-h-96 min-h-0 flex-col overflow-hidden rounded border border-border">
          <FilePreview key={selectedPath} scope={{ scope: 'claude-home' }} relPath={selectedPath} />
        </div>
      ) : null}
    </div>
  );
}
