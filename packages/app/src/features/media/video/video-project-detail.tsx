import { BUILTIN_AGENTS, VIDEO_SKILLS } from '@midnite/studio-shared';
import { useRef, useState, type KeyboardEvent } from 'react';
import { LuFilePen, LuFolderCog, LuPlay, LuPlus, LuX } from 'react-icons/lu';

import { useUiStore, VIDEO_PANEL_TABS, type VideoPanelTab } from '../../../store/ui-store';
import { MarkdownPreview } from '../../files/preview/markdown-preview';
import { startAgent } from '../../terminal/start-agent';
import { useAgents } from '../../terminal/use-agents';
import { useTerminalStore } from '../../terminal/terminal-store';
import { VideoEditThread } from './video-edit-thread';
import { VideoVersions } from './video-versions';
import { VideoFileList } from './video-file-list';
import { VideoRenderDialog } from './video-render-dialog';
import {
  useCancelVideoRender,
  useStartVideoRender,
  useVideoProject,
  useVideoProjectFile,
  useVideoRenderProgress,
  useVideoRenders,
  useVideoRoot,
  useVideoToolchain,
} from './use-video';

/** Resolves the agent that would actually run — the same fallback chain `midnite-menu.tsx` uses. */
function useResolvedAgent() {
  const primaryAgentId = useUiStore((s) => s.primaryAgent);
  const { agents } = useAgents();
  return (
    agents.find((a) => a.id === primaryAgentId) ??
    agents.find((a) => a.id === 'claude') ??
    (BUILTIN_AGENTS[0] as (typeof BUILTIN_AGENTS)[number])
  );
}

/**
 * The two fixed skills `ekko-videos` carries, per the phase doc — deliberately
 * **not** routed through `AgentCommandId`/`DEFAULT_AGENT_SKILLS`
 * (`ui-store.ts`), even though the doc's own text suggests reusing that
 * store. Its exhaustiveness test (`agent-commands.test.ts`) requires every
 * entry to also be a row in `AGENT_COMMANDS`, the midnite menu's own render
 * list — and that menu's `toMenuItem` launches with the *currently open
 * repo's* `cwd` (`midnite-menu.tsx`), never a video project's. Putting these
 * two ids there would make them appear to work from any repo while actually
 * running in the wrong directory. `VIDEO_SKILLS` itself now lives in
 * `@midnite/studio-shared` rather than as a constant local to this file —
 * Theme F's presence probe (`toolchain.ts`'s `probeVideoSkills`) needs the
 * identical two identifiers to derive each skill's `.claude/skills/<name>/`
 * directory, so one shared source is what keeps the slash command and the
 * directory it is checked against from drifting apart. Still not a second
 * remap store: nothing needs these two names to be user-remappable, and
 * adding one earns its keep only when something does.
 */

/**
 * The right pane (Phase 44 Themes D/E/F/G) — one project's composition,
 * brief and script (read-only markdown; Theme F's own "opens in the existing
 * editor" sub-bullet is a known, recorded gap — see the phase doc's
 * correction note), Claude actions, its assets/input tree, and its renders.
 *
 * **Both the Claude actions (F) and the assets sync (G) need a real
 * `repoId`** — `start-agent.ts`'s terminal sessions are repo-scoped
 * everywhere else in this app, and Video Studio is the first *global*
 * caller. Gated on `selectedRepoId` rather than widening that boundary in
 * this batch: the session is bound to whichever repo happens to be open
 * (bookkeeping only — its actual shell `cwd` is always the video project's
 * own directory), and the buttons disable with an honest reason when none
 * is. A cleaner fix — an optional `repoId`, or a synthetic video pseudo-repo
 * — is future work, not a silent workaround here.
 */
export function VideoProjectDetail({ projectId }: { projectId: string | null }) {
  const project = useVideoProject(projectId);
  const root = useVideoRoot();
  const repoId = useUiStore((s) => s.selectedRepoId);
  const agent = useResolvedAgent();
  const renders = useVideoRenders(projectId);
  const startRender = useStartVideoRender();
  const cancelRender = useCancelVideoRender();
  const toolchain = useVideoToolchain(projectId);
  const [renderOpen, setRenderOpen] = useState(false);
  const tab = useUiStore((s) => s.mediaVideoPanelTab);
  const setTab = useUiStore((s) => s.setMediaVideoPanelTab);

  const valid = project.data?.valid ? project.data : null;
  const brief = useVideoProjectFile(projectId, valid?.brief ?? null);
  const script = useVideoProjectFile(projectId, valid?.script ?? null);
  const changelog = useVideoProjectFile(projectId, 'output/CHANGELOG.md');

  if (!projectId || !project.data) return null;
  if (!project.data.valid) {
    return (
      <div className="p-3 text-xs text-destructive">
        <p className="font-medium">This project's `project.json` is invalid.</p>
        <p className="mt-1 text-muted-foreground">{project.data.error}</p>
      </div>
    );
  }
  // Re-bound, not just `valid` reused — `project.data.valid` narrowed THIS
  // expression via the guard above, and TS does not carry that narrowing
  // over to `valid`, a separate binding computed before the guard ran.
  const data = project.data;

  const cwd = root.data ? `${root.data}/projects/${projectId}` : null;

  const runSkill = (id: keyof typeof VIDEO_SKILLS, title: string) => {
    if (!repoId || !cwd) return;
    startAgent({ repoId, cwd, title, prompt: VIDEO_SKILLS[id], agentId: agent.id, command: agent.command });
  };

  const disabledReason = !repoId ? 'Open a repository first — agent sessions need one' : undefined;

  /**
   * Theme F's presence check: a skill known missing from this video root's
   * own `.claude/skills/` blocks its button the same way a missing repo
   * does, rather than the pre-existing behaviour of firing the `/command`
   * regardless. `skills` is `undefined` while the toolchain probe is still
   * in flight — treated as "not yet proven missing" (enabled), not blocked,
   * the same optimistic default the rest of this pane already gives a
   * loading query.
   */
  const skillReasonFor = (id: keyof typeof VIDEO_SKILLS): string | undefined => {
    if (disabledReason) return disabledReason;
    const status = toolchain.data?.skills?.[id];
    return status && !status.found ? status.reason : undefined;
  };
  const skillBlockedFor = (id: keyof typeof VIDEO_SKILLS): boolean =>
    !repoId || toolchain.data?.skills?.[id]?.found === false;

  const syncAssets = () => {
    if (!repoId || !cwd) return;
    useUiStore.getState().setTerminalOpen(true);
    // Run from the root, not the project folder: a Phase 99 project id is a
    // path (`brand/category/NNN`), so `../../scripts` no longer reaches it.
    const session = useTerminalStore
      .getState()
      .openSession({ kind: 'shell', title: data.title, cwd: root.data ?? cwd, repoId });
    useTerminalStore.getState().queueInput(session.id, 'node scripts/sync-assets.mjs ' + projectId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className="shrink-0 px-3 pt-3">
        <h2 className="text-sm font-semibold text-foreground">{data.title}</h2>
        <p className="mt-0.5 text-muted-foreground">{data.composition}</p>
      </div>
      <VideoPanelTabs active={tab} onSelect={setTab} />
      {tab === 'edit' ? (
        <div role="tabpanel" id="video-panel-edit" aria-labelledby="video-tab-edit" className="min-h-0 flex-1">
          <VideoEditThread projectId={projectId} title={data.title} cwd={cwd} repoId={repoId} agent={agent} />
        </div>
      ) : null}
      {tab === 'versions' ? (
        <div
          role="tabpanel"
          id="video-panel-versions"
          aria-labelledby="video-tab-versions"
          className="hide-scrollbar min-h-0 flex-1 overflow-auto p-3"
        >
          <VideoVersions projectId={projectId} />
        </div>
      ) : null}
      {tab === 'brief' ? (
        <div
          role="tabpanel"
          id="video-panel-brief"
          aria-labelledby="video-tab-brief"
          className="hide-scrollbar min-h-0 flex-1 overflow-auto p-3"
        >

      <section className="mt-4 space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{agent.label}</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={skillBlockedFor('videoWriteScript')}
            title={skillReasonFor('videoWriteScript')}
            onClick={() => runSkill('videoWriteScript', `${data.title} — write script`)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 hover:bg-accent disabled:opacity-50"
          >
            <LuFilePen aria-hidden className="h-3.5 w-3.5" />
            Write editorial script
          </button>
          <button
            type="button"
            disabled={skillBlockedFor('videoExecuteScript')}
            title={skillReasonFor('videoExecuteScript')}
            onClick={() => runSkill('videoExecuteScript', `${data.title} — execute script`)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 hover:bg-accent disabled:opacity-50"
          >
            <LuPlay aria-hidden className="h-3.5 w-3.5" />
            Execute editorial script
          </button>
        </div>
      </section>

      <section className="mt-4 space-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Brief</h3>
        {brief.data ? (
          <MarkdownPreview content={brief.data} />
        ) : (
          <p className="text-muted-foreground">Nothing written yet.</p>
        )}
      </section>

      <section className="mt-4 space-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Editorial script
        </h3>
        {script.data ? (
          <MarkdownPreview content={script.data} />
        ) : (
          <p className="text-muted-foreground">Nothing written yet.</p>
        )}
      </section>

      <section className="mt-4 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Assets</h3>
          <button
            type="button"
            disabled={!repoId}
            title={disabledReason}
            onClick={syncAssets}
            className="ml-auto flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
          >
            <LuFolderCog aria-hidden className="h-3 w-3" />
            Sync
          </button>
        </div>
        <VideoFileList projectId={projectId} area="assets" emptyLabel="No shared assets yet." />
        <VideoFileList projectId={projectId} area="input" emptyLabel="No input files yet." />
      </section>

      <section className="mt-4 space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Renders</h3>
          <button
            type="button"
            onClick={() => startRender.mutate({ projectId, compositionId: data.composition })}
            disabled={startRender.isPending}
            className="ml-auto flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
          >
            <LuPlay aria-hidden className="h-3 w-3" />
            Render
          </button>
          {/* Phase 99 Theme D — the next free vN, with codec/quality/scale. */}
          <button
            type="button"
            onClick={() => setRenderOpen(true)}
            disabled={startRender.isPending}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
          >
            <LuPlus aria-hidden className="h-3 w-3" />
            New iteration
          </button>
        </div>
        <VideoRenderDialog
          open={renderOpen}
          onClose={() => setRenderOpen(false)}
          compositionId={data.composition}
          onRender={(options) => startRender.mutate({ projectId, compositionId: data.composition, options })}
        />
        {renders.data.length === 0 ? (
          <p className="text-muted-foreground">No renders yet.</p>
        ) : (
          <ul role="list" className="flex flex-col gap-1">
            {renders.data.map((render) => (
              <RenderRow key={render.id} projectId={projectId} render={render} onCancel={cancelRender.mutate} />
            ))}
          </ul>
        )}
        <VideoFileList projectId={projectId} area="output" emptyLabel="No output files yet." />
        {changelog.data ? (
          <div className="mt-3 space-y-1">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Changelog</h4>
            <MarkdownPreview content={changelog.data} />
          </div>
        ) : null}
      </section>
        </div>
      ) : null}
    </div>
  );
}

const PANEL_TAB_LABEL: Record<VideoPanelTab, string> = { edit: 'Edit', brief: 'Brief', versions: 'Versions' };

/** Edit / Brief / Versions — a WAI-ARIA tablist with roving focus (←/→, Home/End). */
function VideoPanelTabs({ active, onSelect }: { active: VideoPanelTab; onSelect: (tab: VideoPanelTab) => void }) {
  const refs = useRef<Partial<Record<VideoPanelTab, HTMLButtonElement | null>>>({});
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = VIDEO_PANEL_TABS.indexOf(active);
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % VIDEO_PANEL_TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + VIDEO_PANEL_TABS.length) % VIDEO_PANEL_TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = VIDEO_PANEL_TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const tab = VIDEO_PANEL_TABS[next]!;
    onSelect(tab);
    refs.current[tab]?.focus();
  };
  return (
    <div role="tablist" aria-label="Video panel" className="flex shrink-0 items-center gap-1 px-3 pt-2" onKeyDown={move}>
      {VIDEO_PANEL_TABS.map((tab) => (
        <button
          key={tab}
          ref={(node) => {
            refs.current[tab] = node;
          }}
          type="button"
          role="tab"
          id={`video-tab-${tab}`}
          aria-selected={tab === active}
          aria-controls={`video-panel-${tab}`}
          tabIndex={tab === active ? 0 : -1}
          onClick={() => onSelect(tab)}
          className={`h-7 rounded-md px-2.5 text-xs transition-colors ${
            tab === active
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
          }`}
        >
          {PANEL_TAB_LABEL[tab]}
        </button>
      ))}
    </div>
  );
}

function RenderRow({
  projectId,
  render,
  onCancel,
}: {
  projectId: string;
  render: { id: string; status: string };
  onCancel: (input: { renderId: string; projectId: string }) => void;
}) {
  const progress = useVideoRenderProgress(render.status === 'rendering' ? render.id : null);
  const cancellable = render.status === 'queued' || render.status === 'rendering';

  return (
    <li className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1">
      <span className="flex-1 capitalize text-foreground">
        {render.status}
        {progress !== undefined ? ` — ${Math.round(progress * 100)}%` : ''}
      </span>
      {cancellable ? (
        <button
          type="button"
          onClick={() => onCancel({ renderId: render.id, projectId })}
          aria-label="Cancel render"
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LuX aria-hidden className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </li>
  );
}
