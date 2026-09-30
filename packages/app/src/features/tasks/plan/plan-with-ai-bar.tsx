import { useState } from 'react';
import { LuSparkles } from 'react-icons/lu';

import { TextField } from '../../../components/form/field';
import { useUiStore } from '../../../store/ui-store';
import { PlanBlueprintSheet, type PlanSheetOrigin } from './plan-blueprint-sheet';

/**
 * The inline prompt input + "Plan with AI" button (Phase 95 Theme F),
 * mounted at all three entry points the phase doc names: the Projects
 * toolbar, the create-project dialog, and the issue detail pane. One
 * component rather than three near-copies — each caller only differs in
 * `origin` (where Confirm's writes land) and `repoName`/`worktreePath`.
 *
 * The input itself carries `TextField`'s `gradient` prop: `.gradient-border`
 * at rest, and its own `:focus-within` state — a spinning full-spectrum
 * conic border, no bespoke CSS — is exactly the "full glow when focused"
 * the phase doc asks for.
 */
export function PlanWithAiBar({
  repoId,
  repoName,
  worktreePath,
  origin,
  placeholder = 'Describe what to build…',
}: {
  repoId: string;
  repoName: string;
  worktreePath?: string | null | undefined;
  origin: PlanSheetOrigin;
  placeholder?: string;
}) {
  const agentId = useUiStore((s) => s.primaryAgent);
  const [prompt, setPrompt] = useState('');
  const [sheetPrompt, setSheetPrompt] = useState<string | null>(null);

  const submit = () => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    setSheetPrompt(trimmed);
  };

  return (
    <div className="flex items-center gap-1.5">
      <TextField
        value={prompt}
        onChange={setPrompt}
        label="Plan with AI prompt"
        placeholder={placeholder}
        gradient
        className="w-56"
      />
      <button
        type="button"
        onClick={submit}
        disabled={prompt.trim().length === 0}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        <LuSparkles className="h-3.5 w-3.5" />
        Plan with AI
      </button>

      {sheetPrompt !== null ? (
        <PlanBlueprintSheet
          open
          onClose={() => setSheetPrompt(null)}
          repoId={repoId}
          repoName={repoName}
          worktreePath={worktreePath}
          agentId={agentId}
          initialPrompt={sheetPrompt}
          origin={origin}
        />
      ) : null}
    </div>
  );
}
