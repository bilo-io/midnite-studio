import { useMemo, useState } from 'react';

import { CHAT_COLUMN, InjectionBanner, useInjectionScans } from '@midnite/studio-frame';
import { isCouncilRunLive, type CouncilRun } from '@midnite/studio-shared';

import { useCouncilsHost } from './host';
import { useCancelCouncilRun, useContinueCouncilRun, useStartCouncilRun } from './use-council-run';

/**
 * The council's composer, docked under the thread in the centre pane (Phase 133
 * Theme C) — Chats' own `AiComposer`, installed through the host port. With no
 * thread open it starts one; on a settled thread it sends a follow-up turn
 * (Theme D); while a turn is live its Stop button cancels the turn.
 *
 * The prompt keeps Phase 121 Theme A's injection banner: a prompt that scores
 * above the threshold (typically pasted page or issue text) is flagged before
 * it is sent to every member.
 */
export function CouncilComposer({
  councilId,
  run,
  canStart,
  onRunStarted,
}: {
  councilId: string;
  /** The open thread, or `null` to start a new one. */
  run: CouncilRun | null;
  /** `false` while the council has no members. */
  canStart: boolean;
  onRunStarted: (runId: string) => void;
}) {
  const { AiComposer, composerBoxClassName } = useCouncilsHost();
  const start = useStartCouncilRun();
  const followUp = useContinueCouncilRun();
  const cancel = useCancelCouncilRun();
  const [prompt, setPrompt] = useState('');
  const scanItems = useMemo(() => [{ id: 'prompt', text: prompt }], [prompt]);
  const flagged = useInjectionScans(scanItems)['prompt'];
  const [proceededWith, setProceededWith] = useState<string | null>(null);

  const live = run !== null && isCouncilRunLive(run.status);
  const pending = start.isPending || followUp.isPending;
  const canSend = canStart && !live && !pending && prompt.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    const text = prompt.trim();
    if (run) {
      followUp.mutate({ runId: run.id, prompt: text });
    } else {
      start.mutate({ councilId, prompt: text }, { onSuccess: (result) => result.ok && onRunStarted(result.value.id) });
    }
    setPrompt('');
  };

  return (
    <div className="shrink-0 px-6 pb-4 pt-1">
      <div className={CHAT_COLUMN}>
        <AiComposer
          value={prompt}
          onChange={setPrompt}
          onSend={send}
          canSend={canSend}
          placeholder={run ? 'Follow up with the council…' : 'What should the council answer?'}
          ariaLabel="Council prompt"
          rows={2}
          streaming={live}
          onStop={() => run && cancel.mutate({ runId: run.id, councilId: run.councilId })}
          sendTooltip={
            !canStart ? 'Add a member first' : live ? 'Wait for this turn, or stop it' : run ? 'Send a follow-up' : 'Ask the council'
          }
          testIdPrefix="council-composer"
          boxClassName={composerBoxClassName}
          above={
            flagged !== undefined && proceededWith !== prompt ? (
              <InjectionBanner
                subject="This prompt"
                fenced={false}
                scan={flagged}
                onProceed={() => setProceededWith(prompt)}
                onStrip={() => flagged.stripped !== undefined && setPrompt(flagged.stripped)}
                onDrop={() => setPrompt('')}
              />
            ) : undefined
          }
        />
        <p className="mt-1.5 text-center text-[11px] leading-snug text-muted-foreground">
          Members answer on their own once you send — a council member only answers the prompt and changes no repository.
        </p>
      </div>
    </div>
  );
}
