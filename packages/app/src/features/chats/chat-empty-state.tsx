import { LuBug, LuFileSearch, LuFlaskConical, LuMessagesSquare, LuScanEye } from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';

/**
 * The new-chat screen: a greeting and a few starting points. A suggestion fills
 * the composer rather than sending — the user edits it (name the file, the
 * function) before it goes anywhere.
 */

export type ChatSuggestion = { id: string; icon: IconComponent; title: string; prompt: string; needsRepo: boolean };

export const CHAT_SUGGESTIONS: readonly ChatSuggestion[] = [
  {
    id: 'explain',
    icon: LuFileSearch,
    title: 'Explain this codebase',
    prompt: 'Give me a tour of this repository: the main pieces, how they fit together, and where I should start reading.',
    needsRepo: true,
  },
  {
    id: 'review',
    icon: LuScanEye,
    title: 'Review my uncommitted changes',
    prompt: 'Review my uncommitted changes. Point out bugs, risky edits and anything that is missing a test.',
    needsRepo: true,
  },
  {
    id: 'bug',
    icon: LuBug,
    title: 'Find and fix a bug',
    prompt: 'There is a bug where ',
    needsRepo: true,
  },
  {
    id: 'tests',
    icon: LuFlaskConical,
    title: 'Write tests',
    prompt: 'Write tests for ',
    needsRepo: true,
  },
];

export function ChatEmptyState({
  hasRepo,
  engineLabel,
  onPick,
}: {
  hasRepo: boolean;
  engineLabel: string | null;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto px-4 py-8" data-testid="chat-empty-state">
      <div className="w-full max-w-2xl text-center">
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground">
          <LuMessagesSquare aria-hidden className="h-5 w-5" />
        </span>
        <h2 className="text-lg font-semibold">What would you like to work on?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {engineLabel ? `Talking to ${engineLabel}. ` : ''}
          {hasRepo
            ? 'In Edit mode it works in its own worktree and branch, and you review every change before it lands in yours.'
            : 'Pick a repository below to let it read and change files, or just ask a question.'}
        </p>
        <ul className="mt-5 grid gap-2 text-left sm:grid-cols-2" aria-label="Suggestions">
          {CHAT_SUGGESTIONS.map((suggestion) => {
            const Icon = suggestion.icon;
            const disabled = suggestion.needsRepo && !hasRepo;
            return (
              <li key={suggestion.id}>
                <button
                  type="button"
                  disabled={disabled}
                  title={disabled ? 'Choose a repository first' : undefined}
                  onClick={() => onPick(suggestion.prompt)}
                  data-testid={`chat-suggestion-${suggestion.id}`}
                  className="flex w-full items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{suggestion.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{suggestion.prompt.trim()}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
