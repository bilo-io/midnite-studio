import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { LuCircleAlert, LuRotateCcw, LuSkipForward } from 'react-icons/lu';

import {
  CHAT_COLUMN,
  CopyButton,
  EmptyState,
  isNearBottom,
  RingSpinner as Spinner,
  scrollToBottom,
  useNow,
  type IconComponent,
} from '@midnite/studio-frame';
import {
  isCouncilRunLive,
  type CouncilMemberProvider,
  type CouncilRun,
  type CouncilRunMember,
  type CouncilSynthesisStatus,
  type CouncilTurn,
} from '@midnite/studio-shared';

import { councilModelLabel, PROVIDER_LABEL, useCouncilProviders } from './council-providers';
import { useCouncilsHost } from './host';
import { IconButton } from './ui';
import { useRetryCouncilMember, useSkipCouncilMember } from './use-council-run';

/**
 * A council run as a thread (Phase 133 Theme C): one tab per member plus the
 * Synthesis, and in each tab every turn of the thread — the user's prompt as a
 * bubble, that member's (or the synthesizer's) answer as an assistant turn with
 * its agent's mark, markdown, a copy action and a status line. A turn still
 * running shows a working row with the elapsed time instead of a raw pty dump:
 * the CLIs answer in JSON at the end, so there is nothing readable to stream.
 */

type MemberStatus = CouncilRunMember['status'];

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  running: 'Answering',
  succeeded: 'Answered',
  failed: 'Failed',
  timeout: 'Timed out',
  skipped: 'Skipped',
  cancelled: 'Stopped',
};

export const SYNTHESIS_STATUS_LABEL: Record<CouncilSynthesisStatus, string> = {
  running: 'Synthesizing',
  succeeded: 'Synthesized',
  failed: 'Failed',
  timeout: 'Timed out',
  cancelled: 'Stopped',
};

const TONE: Record<MemberStatus | CouncilSynthesisStatus, string> = {
  running: 'text-blue-500',
  succeeded: 'text-green-600 dark:text-green-500',
  failed: 'text-destructive',
  timeout: 'text-destructive',
  skipped: 'text-muted-foreground',
  cancelled: 'text-muted-foreground',
};

/** One turn as the thread draws it: an archived `CouncilTurn`, or the run's own latest fields. */
type TurnView = Omit<CouncilTurn, 'endedAt'> & { endedAt?: number; latest: boolean };

/** What the synthesis of the latest turn is, including runs written before `synthesisStatus` existed. */
export function latestSynthesisStatus(run: CouncilRun): CouncilSynthesisStatus | undefined {
  if (run.synthesisStatus) return run.synthesisStatus;
  switch (run.status) {
    case 'synthesizing':
      return 'running';
    case 'completed':
      return 'succeeded';
    case 'running':
      return undefined;
    default:
      return run.synthesisOutput || run.synthesisError ? 'failed' : undefined;
  }
}

export function turnsOf(run: CouncilRun): TurnView[] {
  const synthesisStatus = latestSynthesisStatus(run);
  const latest: TurnView = {
    prompt: run.prompt,
    status: run.status,
    members: run.members.map(({ ptyId: _ptyId, ...member }) => member),
    synthProvider: run.synthProvider,
    ...(run.synthModel === undefined ? {} : { synthModel: run.synthModel }),
    ...(synthesisStatus === undefined ? {} : { synthesisStatus }),
    ...(run.synthesisOutput === undefined ? {} : { synthesisOutput: run.synthesisOutput }),
    ...(run.synthesisError === undefined ? {} : { synthesisError: run.synthesisError }),
    createdAt: run.turnStartedAt ?? run.createdAt,
    latest: true,
  };
  return [...run.turns.map((turn) => ({ ...turn, latest: false })), latest];
}

const SYNTHESIS_TAB = 'synthesis';

export function CouncilRunView({ run }: { run: CouncilRun }) {
  const [tab, setTab] = useState<string>(SYNTHESIS_TAB);
  const { icon, accent } = useCouncilProviders();
  const activeTab = tab === SYNTHESIS_TAB || run.members.some((m) => m.memberId === tab) ? tab : SYNTHESIS_TAB;
  const synthesisStatus = latestSynthesisStatus(run);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Council members" className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 py-1">
        {run.members.map((member) => (
          <TabButton
            key={member.memberId}
            active={activeTab === member.memberId}
            onSelect={() => setTab(member.memberId)}
            icon={icon(member.provider)}
            color={accent(member.provider)}
            running={member.status === 'running'}
            tone={TONE[member.status]}
            testId={`council-tab-${member.memberId}`}
          >
            {member.name}
          </TabButton>
        ))}
        <TabButton
          active={activeTab === SYNTHESIS_TAB}
          onSelect={() => setTab(SYNTHESIS_TAB)}
          icon={icon(run.synthProvider)}
          color={accent(run.synthProvider)}
          running={synthesisStatus === 'running'}
          tone={synthesisStatus ? TONE[synthesisStatus] : 'text-muted-foreground'}
          className="ml-auto font-medium"
          testId="council-tab-synthesis"
        >
          Synthesis
        </TabButton>
      </div>
      <ThreadScroller key={activeTab} run={run} tab={activeTab} />
    </div>
  );
}

function TabButton({
  active,
  onSelect,
  icon: Icon,
  color,
  running,
  tone,
  className,
  testId,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  icon: IconComponent;
  color: string | undefined;
  running: boolean;
  tone: string;
  className?: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      data-testid={testId}
      className={`flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs ${
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
      } ${className ?? ''}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" style={color ? { color } : undefined} />
      <span className={active ? '' : tone}>{children}</span>
      {running ? <Spinner size="xs" tone="inherit" /> : null}
    </button>
  );
}

/** The scrolling thread for one tab, pinned to the bottom unless the reader scrolled up. */
function ThreadScroller({ run, tab }: { run: CouncilRun; tab: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const turns = turnsOf(run);
  const signature = `${turns.length}:${run.status}:${run.updatedAt}`;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stuck.current) scrollToBottom(el, false);
  }, [signature]);

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        stuck.current = isNearBottom(event.currentTarget);
      }}
      className="min-h-0 flex-1 overflow-y-auto"
      role="log"
      aria-live="polite"
      aria-busy={isCouncilRunLive(run.status)}
      data-testid="council-thread"
    >
      <div className={`${CHAT_COLUMN} flex flex-col gap-5 px-6 py-5`}>
        {turns.map((turn, index) => (
          <div key={`${index}-${turn.createdAt}`} className="flex flex-col gap-3">
            <UserBubble text={turn.prompt} />
            {tab === SYNTHESIS_TAB ? (
              <SynthesisTurn run={run} turn={turn} />
            ) : (
              <MemberTurn run={run} turn={turn} memberId={tab} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-foreground">
        {text}
      </div>
    </div>
  );
}

function MemberTurn({ run, turn, memberId }: { run: CouncilRun; turn: TurnView; memberId: string }) {
  const member = turn.members.find((m) => m.memberId === memberId);
  const skip = useSkipCouncilMember();
  const retry = useRetryCouncilMember();
  if (!member) {
    return <p className="pl-8 text-xs text-muted-foreground">Not on the council for this turn.</p>;
  }
  const live = turn.latest && member.status === 'running';
  return (
    <AssistantTurn
      provider={member.provider}
      name={member.name}
      model={councilModelLabel(member.provider, member.model)}
      status={member.status}
      statusLabel={MEMBER_STATUS_LABEL[member.status]}
      text={member.output}
      error={member.error}
      truncated={member.truncated}
      working={live ? <WorkingRow since={member.startedAt} label="Answering" /> : null}
      actions={
        turn.latest ? (
          live ? (
            <IconButton
              icon={LuSkipForward}
              label="Skip this member"
              size="sm"
              onClick={() => skip.mutate({ runId: run.id, memberId: member.memberId })}
            />
          ) : (
            <IconButton
              icon={LuRotateCcw}
              label="Retry this member"
              size="sm"
              onClick={() => retry.mutate({ runId: run.id, memberId: member.memberId })}
            />
          )
        ) : null
      }
    />
  );
}

function SynthesisTurn({ run, turn }: { run: CouncilRun; turn: TurnView }) {
  const status = turn.synthesisStatus;
  if (turn.latest && run.status === 'running') {
    const pending = turn.members.filter((m) => m.status === 'running');
    return (
      <AssistantTurn
        provider={turn.synthProvider}
        name="Synthesis"
        model={councilModelLabel(turn.synthProvider, turn.synthModel)}
        working={
          <WorkingRow
            since={turn.createdAt}
            label={pending.length > 0 ? `Waiting for ${pending.map((m) => m.name).join(', ')}` : 'Starting the synthesis'}
          />
        }
      />
    );
  }
  return (
    <AssistantTurn
      provider={turn.synthProvider}
      name="Synthesis"
      model={councilModelLabel(turn.synthProvider, turn.synthModel)}
      {...(status ? { status, statusLabel: SYNTHESIS_STATUS_LABEL[status] } : {})}
      text={turn.synthesisOutput ?? ''}
      error={turn.synthesisError}
      truncated={turn.latest ? run.synthesisTruncated === true : false}
      working={turn.latest && status === 'running' ? <WorkingRow since={run.updatedAt} label="Synthesizing" /> : null}
    />
  );
}

function AssistantTurn({
  provider,
  name,
  model,
  status,
  statusLabel,
  text = '',
  error,
  truncated = false,
  working,
  actions,
}: {
  provider: CouncilMemberProvider;
  name: string;
  model: string | null;
  status?: MemberStatus | CouncilSynthesisStatus;
  statusLabel?: string;
  text?: string;
  error?: string | undefined;
  truncated?: boolean;
  working?: ReactNode;
  actions?: ReactNode;
}) {
  const { MarkdownBody } = useCouncilsHost();
  const { icon, accent } = useCouncilProviders();
  const Icon = icon(provider);
  const color = accent(provider);
  const hasText = text.trim().length > 0;
  return (
    <div className="group flex gap-3" data-testid="council-turn">
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background"
        title={PROVIDER_LABEL[provider]}
      >
        <Icon className="h-3.5 w-3.5" style={color ? { color } : undefined} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-medium text-foreground">{name}</span>
          <span className="text-muted-foreground">
            {PROVIDER_LABEL[provider]}
            {model ? ` · ${model}` : ''}
          </span>
          {status && statusLabel && !working ? <span className={TONE[status]}>{statusLabel}</span> : null}
        </div>
        {working ?? null}
        {error ? (
          <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
            <LuCircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
          </p>
        ) : null}
        {hasText ? (
          <MarkdownBody content={text} className="mt-1.5 text-sm" />
        ) : !working && !error ? (
          <p className="mt-1.5 text-xs text-muted-foreground">No answer.</p>
        ) : null}
        {truncated ? <p className="mt-1 text-[11px] text-muted-foreground">Output truncated at the capture limit.</p> : null}
        {hasText || actions ? (
          <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            {hasText ? <CopyButton text={text} label="Copy answer" /> : null}
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WorkingRow({ since, label }: { since: number; label: string }) {
  const now = useNow();
  const seconds = Math.max(0, Math.floor((now.getTime() - since) / 1000));
  return (
    <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground" data-testid="council-working">
      <Spinner size="xs" tone="inherit" />
      <span>
        {label}… <span className="tabular-nums">{seconds} s</span>
      </span>
    </p>
  );
}

/** The centre pane before a council has any thread. */
export function CouncilThreadEmpty() {
  return (
    <EmptyState
      title="Start a thread"
      body="Ask the council below. Every member answers in parallel, then the synthesizer distills their answers."
    />
  );
}
