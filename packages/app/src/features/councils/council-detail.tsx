import {
  COUNCIL_MEMBER_PROVIDERS,
  type CouncilMember,
  type CouncilMemberProvider,
} from '@midnite/studio-shared';
import { useEffect, useRef, useState } from 'react';
import { LuPlus, LuTrash2, LuUsers } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { CouncilRunView } from './council-run-view';
import { useCouncil, useRemoveCouncil, useUpdateCouncilMembers } from './use-council';
import { useCouncilRuns, useStartCouncilRun } from './use-council-run';

const PROVIDER_LABEL: Record<CouncilMemberProvider, string> = {
  agy: 'Antigravity',
  codex: 'Codex',
  opencode: 'OpenCode',
};

/** Debounce for the members panel's auto-save, mirroring upstream's own. */
const SAVE_DEBOUNCE_MS = 500;

export function CouncilDetail({
  councilId,
  onDeleted,
}: {
  councilId: string;
  onDeleted: () => void;
}) {
  const { data: council } = useCouncil(councilId);
  const updateMembers = useUpdateCouncilMembers();
  const remove = useRemoveCouncil();
  const startRun = useStartCouncilRun();
  const runs = useCouncilRuns(councilId);

  const [members, setMembers] = useState<CouncilMember[]>([]);
  const [synthProvider, setSynthProvider] = useState<CouncilMemberProvider>('agy');
  const [prompt, setPrompt] = useState('');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Reset local editing state only when the *council itself* changes — not on
  // every refetch of the one we're already editing, which would clobber an
  // in-flight debounced edit with whatever the server last had.
  useEffect(() => {
    if (council) {
      setMembers(council.members);
      setSynthProvider(council.synthProvider);
    }
  }, [council?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = (nextMembers: CouncilMember[], nextSynthProvider: CouncilMemberProvider) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateMembers.mutate({ id: councilId, members: nextMembers, synthProvider: nextSynthProvider });
    }, SAVE_DEBOUNCE_MS);
  };
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const runsData = runs.data ?? [];
  const activeRunId =
    (selectedRunId !== null && runsData.some((r) => r.id === selectedRunId) ? selectedRunId : null) ??
    runsData[runsData.length - 1]?.id ??
    null;

  if (!council) {
    return <EmptyState icon={LuUsers} title="Loading council…" />;
  }

  const updateMember = (index: number, patch: Partial<CouncilMember>) => {
    const next = members.map((m, i) => (i === index ? { ...m, ...patch } : m));
    setMembers(next);
    scheduleSave(next, synthProvider);
  };

  const addMember = () => {
    const next: CouncilMember[] = [
      ...members,
      { id: crypto.randomUUID(), name: 'New member', provider: 'agy', role: 'Describe this member\'s perspective.' },
    ];
    setMembers(next);
    scheduleSave(next, synthProvider);
  };

  const removeMember = (index: number) => {
    const next = members.filter((_, i) => i !== index);
    setMembers(next);
    scheduleSave(next, synthProvider);
  };

  const changeSynthProvider = (value: CouncilMemberProvider) => {
    setSynthProvider(value);
    scheduleSave(members, value);
  };

  const canRun = members.length > 0 && prompt.trim().length > 0 && startRun.isPending === false;

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="flex w-80 shrink-0 flex-col border-r border-border">
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{council.name}</h2>
            {council.description ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{council.description}</p>
            ) : null}
          </div>
          <IconButton
            icon={LuTrash2}
            label="Delete council"
            size="sm"
            tone="danger"
            onClick={() => remove.mutate(councilId, { onSuccess: (result) => result.ok && onDeleted() })}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Members
            </h3>
            <IconButton icon={LuPlus} label="Add member" size="sm" onClick={addMember} />
          </div>

          <div className="mt-2 flex flex-col gap-2">
            {members.map((member, index) => (
              <div key={member.id} className="rounded-md border border-border p-2">
                <div className="flex items-center gap-1.5">
                  <input
                    value={member.name}
                    onChange={(event) => updateMember(index, { name: event.target.value })}
                    aria-label="Member name"
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium outline-none focus:border-input focus:bg-background"
                  />
                  <IconButton
                    icon={LuTrash2}
                    label="Remove member"
                    size="sm"
                    onClick={() => removeMember(index)}
                  />
                </div>
                <select
                  value={member.provider}
                  onChange={(event) => updateMember(index, { provider: event.target.value as CouncilMemberProvider })}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                >
                  {COUNCIL_MEMBER_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {PROVIDER_LABEL[provider]}
                    </option>
                  ))}
                </select>
                <textarea
                  value={member.role}
                  rows={2}
                  onChange={(event) => updateMember(index, { role: event.target.value })}
                  className="mt-1.5 w-full resize-none rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Synthesize with
            </h3>
            <select
              value={synthProvider}
              onChange={(event) => changeSynthProvider(event.target.value as CouncilMemberProvider)}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
            >
              {COUNCIL_MEMBER_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {PROVIDER_LABEL[provider]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="shrink-0 border-t border-border p-3">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="What should the council answer?"
            rows={3}
            className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            Members run automatically once you hit Run — unlike a regular agent session, a council
            member only answers this prompt and makes no changes to any repository.
          </p>
          <button
            type="button"
            disabled={!canRun}
            onClick={() => {
              startRun.mutate(
                { councilId, prompt: prompt.trim() },
                { onSuccess: (result) => result.ok && setSelectedRunId(result.value.id) },
              );
              setPrompt('');
            }}
            className="mt-2 w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            Run
          </button>
        </div>
      </div>

      <CouncilRunView
        councilId={councilId}
        runs={runsData}
        activeRunId={activeRunId}
        onSelectRun={setSelectedRunId}
      />
    </div>
  );
}
