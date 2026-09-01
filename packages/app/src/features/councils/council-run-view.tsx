import type { CouncilRun, CouncilRunMember } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuCircleAlert, LuLoader, LuSkipForward } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { CouncilLiveOutput } from './council-live-output';
import { useCouncilRun, useRetryCouncilMember, useSkipCouncilMember } from './use-council-run';

const STATUS_LABEL: Record<CouncilRunMember['status'], string> = {
  running: 'Running',
  succeeded: 'Done',
  failed: 'Failed',
  timeout: 'Timed out',
  skipped: 'Skipped',
};

const STATUS_TONE: Record<CouncilRunMember['status'], string> = {
  running: 'text-blue-500',
  succeeded: 'text-green-500',
  failed: 'text-destructive',
  timeout: 'text-destructive',
  skipped: 'text-muted-foreground',
};

export function CouncilRunView({
  runs,
  activeRunId,
  onSelectRun,
}: {
  councilId: string;
  runs: CouncilRun[];
  activeRunId: string | null;
  onSelectRun: (runId: string) => void;
}) {
  const { data: run } = useCouncilRun(activeRunId);
  const [tab, setTab] = useState<string>('synthesis');

  if (runs.length === 0) {
    return (
      <EmptyState
        title="No runs yet"
        body="Type a prompt on the left and hit Run to start this council's first consultation."
      />
    );
  }

  if (!run) {
    return <EmptyState title="Loading run…" />;
  }

  const memberTabs = run.members.map((m) => m.memberId);
  const activeTab = tab === 'synthesis' || memberTabs.includes(tab) ? tab : 'synthesis';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 py-1">
        {runs
          .slice()
          .reverse()
          .map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelectRun(r.id)}
              title={r.prompt}
              className={`shrink-0 truncate rounded px-2 py-1 text-xs ${
                r.id === run.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
              }`}
              style={{ maxWidth: 180 }}
            >
              {r.prompt}
            </button>
          ))}
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        {run.members.map((member) => (
          <button
            key={member.memberId}
            type="button"
            onClick={() => setTab(member.memberId)}
            className={`flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs ${
              activeTab === member.memberId ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
            }`}
          >
            {member.status === 'running' ? <LuLoader className="h-3 w-3 animate-spin" /> : null}
            <span className={STATUS_TONE[member.status]}>{member.name}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTab('synthesis')}
          className={`ml-auto shrink-0 rounded px-2 py-1 text-xs font-medium ${
            activeTab === 'synthesis' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
          }`}
        >
          Synthesis
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {activeTab === 'synthesis' ? (
          <SynthesisPanel run={run} />
        ) : (
          <MemberPanel run={run} member={run.members.find((m) => m.memberId === activeTab)!} />
        )}
      </div>
    </div>
  );
}

function MemberPanel({ run, member }: { run: CouncilRun; member: CouncilRunMember }) {
  const skip = useSkipCouncilMember();
  const retry = useRetryCouncilMember();

  if (member.status === 'running' && member.ptyId) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-xs text-muted-foreground">{member.role}</span>
          <IconButton
            icon={LuSkipForward}
            label="Skip this member"
            size="sm"
            onClick={() => skip.mutate({ runId: run.id, memberId: member.memberId })}
          />
        </div>
        <CouncilLiveOutput ptyId={member.ptyId} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          {member.role} · <span className={STATUS_TONE[member.status]}>{STATUS_LABEL[member.status]}</span>
        </span>
        {member.status !== 'running' ? (
          <IconButton
            icon={LuLoader}
            label="Retry this member"
            size="sm"
            onClick={() => retry.mutate({ runId: run.id, memberId: member.memberId })}
          />
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-xs">
        {member.error ? (
          <p className="mb-2 flex items-center gap-1.5 text-destructive">
            <LuCircleAlert className="h-3.5 w-3.5" /> {member.error}
          </p>
        ) : null}
        {member.output.length > 0 ? (
          <p className="whitespace-pre-wrap leading-relaxed">{member.output}</p>
        ) : (
          <p className="text-muted-foreground">No output.</p>
        )}
        {member.truncated ? (
          <p className="mt-2 text-[11px] text-muted-foreground">Output truncated at the capture limit.</p>
        ) : null}
      </div>
    </div>
  );
}

function SynthesisPanel({ run }: { run: CouncilRun }) {
  if (run.status === 'running') {
    const pending = run.members.filter((m) => m.status === 'running');
    return (
      <EmptyState
        icon={LuLoader}
        title="Waiting for the panel"
        body={
          pending.length > 0
            ? `Still running: ${pending.map((m) => m.name).join(', ')}`
            : 'Every member has answered — synthesis starts next.'
        }
      />
    );
  }

  if (run.status === 'synthesizing' && run.synthesisPtyId) {
    return <CouncilLiveOutput ptyId={run.synthesisPtyId} />;
  }

  return (
    <div className="h-full min-h-0 overflow-auto p-3 text-xs">
      {run.synthesisError ? (
        <p className="mb-2 flex items-center gap-1.5 text-destructive">
          <LuCircleAlert className="h-3.5 w-3.5" /> {run.synthesisError}
        </p>
      ) : null}
      {run.synthesisOutput ? (
        <p className="whitespace-pre-wrap leading-relaxed">{run.synthesisOutput}</p>
      ) : (
        <p className="text-muted-foreground">No synthesis yet.</p>
      )}
      {run.synthesisTruncated ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Output truncated at the capture limit.</p>
      ) : null}
    </div>
  );
}
