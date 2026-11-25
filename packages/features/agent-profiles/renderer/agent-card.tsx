import { LuCopy, LuDownload, LuPencil, LuPlay, LuTrash2, LuTriangleAlert } from 'react-icons/lu';

import { AGENT_BLUEPRINT_STAGES, blueprintSummary, type AgentProfile } from '@midnite/studio-shared';

import { optionIcon } from './blueprint-icons';
import { useAgentProfilesHost } from './host';
import { FOCUS_RING, IconButton } from './ui';

const MAX_CHIPS = 6;

/** No host hook for live sessions: nothing is counted. */
const useNoLiveSessions = (): number => 0;

type Chip = { key: string; id: string; label: string };

/** The blueprint's chosen options as flat chips, in stage order. */
function chipsFor(profile: AgentProfile): Chip[] {
  const chips: Chip[] = [];
  for (const row of blueprintSummary(profile.blueprint)) {
    const stage = AGENT_BLUEPRINT_STAGES.find((s) => s.id === row.stageId);
    for (const label of row.optionLabels) {
      const option = stage?.options.find((o) => o.label === label);
      chips.push({ key: `${row.stageId}:${label}`, id: option?.id ?? label, label });
    }
  }
  return chips;
}

function LaunchButton({ profile, blockedReason }: { profile: AgentProfile; blockedReason: string | null }) {
  const host = useAgentProfilesHost();
  // Present only when the host provides it (the parent renders this component only then).
  const useLaunchProfile = host.useLaunchProfile as NonNullable<typeof host.useLaunchProfile>;
  const { launch, disabledReason } = useLaunchProfile();
  const reason = blockedReason ?? disabledReason;
  const describedBy = `agent-launch-why-${profile.id}`;
  return (
    <>
      <button
        type="button"
        data-testid={`agent-launch-${profile.id}`}
        aria-disabled={reason !== null}
        aria-describedby={reason !== null ? describedBy : undefined}
        title={reason ?? `Launch ${profile.name}`}
        className={`inline-flex items-center gap-1 rounded-md border border-border bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground ${FOCUS_RING} ${reason !== null ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'}`}
        onClick={() => {
          if (reason === null) void launch(profile);
        }}
      >
        <LuPlay aria-hidden className="h-3 w-3" />
        Launch
      </button>
      {reason !== null ? (
        <span id={describedBy} className="sr-only">
          {reason}
        </span>
      ) : null}
    </>
  );
}

export type AgentCardProps = {
  profile: AgentProfile;
  onEdit: (profile: AgentProfile) => void;
  onDuplicate: (profile: AgentProfile) => void;
  onExport: (profile: AgentProfile) => void;
  /** `liveSessions` is how many sessions of this profile are running now. */
  onDelete: (profile: AgentProfile, liveSessions: number) => void;
};

/** One agent as a card: accent stripe, icon, name, description, base and model, blueprint chips, actions. */
export function AgentCard({ profile, onEdit, onDuplicate, onExport, onDelete }: AgentCardProps) {
  const host = useAgentProfilesHost();
  const { agents, status } = host.useAgentRoster();
  const models = host.useModelsFor(profile.baseAgentId);
  const useLiveCount = host.useLiveSessionCount ?? useNoLiveSessions;
  const liveSessions = useLiveCount(profile.id);

  const base = agents.find((a) => a.id === profile.baseAgentId);
  const baseLabel = base?.label ?? profile.baseAgentId;
  const modelLabel = models.find((m) => m.id === profile.model)?.label ?? (profile.model === 'default' ? 'Default' : profile.model);
  const baseMissing = base === undefined;
  const notInstalled = !baseMissing && status.find((s) => s.id === profile.baseAgentId)?.installed === false;
  const blockedReason = baseMissing ? 'Base CLI not found' : notInstalled ? `${baseLabel} is not installed` : null;

  const Icon = host.resolveAgentIcon({ id: profile.baseAgentId, icon: profile.icon });
  const chips = chipsFor(profile);
  const shown = chips.slice(0, MAX_CHIPS);
  const rest = chips.slice(MAX_CHIPS);
  const nameId = `agent-name-${profile.id}`;

  return (
    <article
      aria-labelledby={nameId}
      data-testid={`agent-profile-${profile.id}`}
      className="relative flex flex-col gap-2 overflow-hidden rounded-md border border-border bg-card p-3 pl-4 transition-colors hover:border-foreground/20 focus-within:border-foreground/30"
    >
      <span aria-hidden data-testid="agent-stripe" className="absolute inset-y-0 left-0 w-[3px]" style={{ background: profile.accent }} />
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5 shrink-0">
          <Icon className="h-[18px] w-[18px]" style={{ color: profile.accent }} />
        </span>
        <div className="min-w-0 flex-1">
          <button
            id={nameId}
            type="button"
            data-profile-name={profile.id}
            className={`block max-w-full truncate rounded text-sm font-medium hover:underline ${FOCUS_RING}`}
            onClick={() => onEdit(profile)}
          >
            {profile.name}
          </button>
          {profile.description !== '' ? <p className="line-clamp-2 text-xs text-muted-foreground">{profile.description}</p> : null}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {baseLabel} · {modelLabel}
          </p>
          {baseMissing ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              <LuTriangleAlert aria-hidden className="h-3 w-3" />
              Base CLI not found
            </span>
          ) : null}
        </div>
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {shown.map((chip) => {
            const ChipIcon = optionIcon(chip.id);
            return (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px]"
              >
                <ChipIcon className="h-3 w-3" />
                {chip.label}
              </span>
            );
          })}
          {rest.length > 0 ? (
            <span
              data-testid="agent-chips-more"
              title={rest.map((chip) => chip.label).join(', ')}
              className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px]"
            >
              +{rest.length}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-auto flex items-center gap-1 border-t border-border/60 pt-2">
        {host.useLaunchProfile ? <LaunchButton profile={profile} blockedReason={blockedReason} /> : null}
        <div className="ml-auto flex items-center gap-1">
          <IconButton icon={LuPencil} label={`Edit ${profile.name}`} onClick={() => onEdit(profile)} />
          <IconButton icon={LuCopy} label={`Duplicate ${profile.name}`} onClick={() => onDuplicate(profile)} />
          <IconButton icon={LuDownload} label={`Export ${profile.name}`} onClick={() => onExport(profile)} />
          <IconButton icon={LuTrash2} label={`Delete ${profile.name}`} tone="danger" onClick={() => onDelete(profile, liveSessions)} />
        </div>
      </div>
    </article>
  );
}
