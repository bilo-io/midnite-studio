import { BUILTIN_AGENTS, VIDEO_SKILLS } from '@midnite/studio-shared';
import type { VideoSkillActionsProps } from '@midnite/studio-feature-media-video/renderer';
import { LuFilePen, LuPlay } from 'react-icons/lu';

import { useUiStore } from '../../../store/ui-store';
import { startAgent } from '../../terminal/start-agent';
import { useAgents } from '../../terminal/use-agents';

/** Resolves the agent that would actually run — the same fallback chain `midnite-menu.tsx` uses. */
export function useResolvedAgent() {
  const primaryAgentId = useUiStore((s) => s.primaryAgent);
  const { agents } = useAgents();
  return (
    agents.find((a) => a.id === primaryAgentId) ??
    agents.find((a) => a.id === 'claude') ??
    (BUILTIN_AGENTS[0] as (typeof BUILTIN_AGENTS)[number])
  );
}

/**
 * The two fixed skills `ekko-videos` carries (Phase 44 Theme F), run through Studio's agent
 * roster — Studio's half of the Video host port (Phase 113 Theme Q). The buttons were the Brief
 * panel's own; they moved here because an agent is Studio's, and the feature renders this slot
 * only for an app that provides one.
 *
 * Deliberately **not** routed through `AgentCommandId`/`DEFAULT_AGENT_SKILLS` (`ui-store.ts`): its
 * exhaustiveness test requires every entry to also be a row in `AGENT_COMMANDS`, the midnite
 * menu's own render list — and that menu launches with the *currently open repo's* `cwd`, never
 * a video project's. Putting these two ids there would make them appear to work from any repo
 * while actually running in the wrong directory. `VIDEO_SKILLS` lives in `@midnite/studio-shared`
 * because Theme F's presence probe needs the identical identifiers to derive each skill's
 * `.claude/skills/<name>/` directory.
 *
 * **Both the skills and the assets sync need a real `repoId`** — `start-agent.ts`'s terminal
 * sessions are repo-scoped everywhere else in this app, and Video Studio is the first *global*
 * caller. Gated on `selectedRepoId` rather than widening that boundary: the session is bound to
 * whichever repo happens to be open (bookkeeping only — its actual shell `cwd` is always the
 * video project's own directory), and the buttons disable with an honest reason when none is.
 */
export function VideoSkillActions({ title, cwd, skills }: VideoSkillActionsProps) {
  const repoId = useUiStore((s) => s.selectedRepoId);
  const agent = useResolvedAgent();

  const runSkill = (id: keyof typeof VIDEO_SKILLS, skillTitle: string) => {
    if (!repoId || !cwd) return;
    startAgent({ repoId, cwd, title: skillTitle, prompt: VIDEO_SKILLS[id], agentId: agent.id, command: agent.command });
  };

  const disabledReason = !repoId ? 'Open a repository first — agent sessions need one' : undefined;

  /**
   * Theme F's presence check: a skill known missing from this video root's own `.claude/skills/`
   * blocks its button the same way a missing repo does, rather than firing the `/command`
   * regardless. `skills` is `undefined` while the toolchain probe is still in flight — treated as
   * "not yet proven missing" (enabled), the same optimistic default the rest of the pane gives a
   * loading query.
   */
  const skillReasonFor = (id: keyof typeof VIDEO_SKILLS): string | undefined => {
    if (disabledReason) return disabledReason;
    const status = skills?.[id];
    return status && !status.found ? status.reason : undefined;
  };
  const skillBlockedFor = (id: keyof typeof VIDEO_SKILLS): boolean => !repoId || skills?.[id]?.found === false;

  return (
    <section className="mt-4 space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{agent.label}</h3>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={skillBlockedFor('videoWriteScript')}
          title={skillReasonFor('videoWriteScript')}
          onClick={() => runSkill('videoWriteScript', `${title} — write script`)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 hover:bg-accent disabled:opacity-50"
        >
          <LuFilePen aria-hidden className="h-3.5 w-3.5" />
          Write editorial script
        </button>
        <button
          type="button"
          disabled={skillBlockedFor('videoExecuteScript')}
          title={skillReasonFor('videoExecuteScript')}
          onClick={() => runSkill('videoExecuteScript', `${title} — execute script`)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 hover:bg-accent disabled:opacity-50"
        >
          <LuPlay aria-hidden className="h-3.5 w-3.5" />
          Execute editorial script
        </button>
      </div>
    </section>
  );
}
