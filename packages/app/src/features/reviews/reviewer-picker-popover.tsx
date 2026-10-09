import type { KeyboardEvent } from 'react';
import { LuCheck, LuSearch } from 'react-icons/lu';
import { Spinner } from '../../components/skeleton';
import { UserAvatar } from '../../components/user-avatar';
import { REVIEWER_CONFIG, type ReviewerCandidate } from './reviewer-status';

export function ReviewerPickerDropdown({
  candidates,
  search,
  onSearchChange,
  pending,
  pendingLogin,
  onSelectReviewer,
  onRequestTyped,
}: {
  candidates: ReviewerCandidate[];
  search: string;
  onSearchChange: (value: string) => void;
  pending: boolean;
  pendingLogin: string | null;
  onSelectReviewer: (login: string) => void;
  onRequestTyped: (logins: string[]) => void;
}) {
  const query = search.trim().toLowerCase();
  const filtered = candidates.filter((c) => c.login.toLowerCase().includes(query));
  const hasExactMatch = candidates.some((c) => c.login.toLowerCase() === query);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && search.trim().length > 0) {
      event.preventDefault();
      const logins = search
        .split(/[\s,]+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (logins.length > 0) {
        onRequestTyped(logins);
      }
    }
  };

  const handleRequestSearch = () => {
    const logins = search
      .split(/[\s,]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (logins.length > 0) {
      onRequestTyped(logins);
    }
  };

  return (
    <div
      data-testid="reviewer-picker-dropdown"
      className="flex w-72 flex-col overflow-hidden text-xs"
    >
      {/* Search Header */}
      <div className="flex items-center gap-1.5 border-b border-border p-2">
        <LuSearch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Filter reviewers..."
          aria-label="GitHub usernames to request a review from"
          autoFocus
          className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-xs outline-none placeholder:text-muted-foreground"
        />
        {search.trim().length > 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={handleRequestSearch}
            className="inline-flex shrink-0 items-center gap-1 rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending && pendingLogin === null ? (
              <Spinner className="size-2.5 border-primary-foreground/30 border-r-primary-foreground border-t-primary-foreground" />
            ) : null}
            Request
          </button>
        ) : null}
      </div>

      {/* Reviewers List */}
      <div className="max-h-64 overflow-y-auto py-1">
        {/* Support typing a new GitHub username directly */}
        {query.length > 0 && !hasExactMatch ? (
          <button
            type="button"
            aria-label={`Request a review from ${search.trim()}`}
            title={`Request a review from ${search.trim()}`}
            disabled={pending}
            onClick={() => onRequestTyped([search.trim()])}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50"
          >
            <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-muted-foreground/40" />
            <UserAvatar login={search.trim()} size={20} withTooltip={false} />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {search.trim()}
            </span>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Add reviewer
            </span>
          </button>
        ) : null}

        {filtered.map((candidate) => {
          const config = candidate.state !== 'none' ? REVIEWER_CONFIG[candidate.state] : null;
          const isPending = pending && pendingLogin === candidate.login;
          const actionLabel = `Request review from ${candidate.login}`;

          return (
            <button
              key={candidate.login}
              type="button"
              data-testid={`candidate-${candidate.login}`}
              aria-label={actionLabel}
              title={actionLabel}
              disabled={pending}
              onClick={() => onSelectReviewer(candidate.login)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50"
            >
              <div
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                  candidate.isRequested
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/40 bg-transparent'
                }`}
              >
                {candidate.isRequested ? <LuCheck className="h-2.5 w-2.5 stroke-[2.5]" /> : null}
              </div>

              <UserAvatar login={candidate.login} size={20} withTooltip={false} />

              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {candidate.login}
              </span>

              {config ? (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${config.pillClass}`}
                >
                  {candidate.stateLabel}
                </span>
              ) : null}

              {isPending ? (
                <Spinner className="ml-1 size-3 border-primary/30 border-r-primary border-t-primary" />
              ) : null}
            </button>
          );
        })}

        {filtered.length === 0 && (query.length === 0 || hasExactMatch) ? (
          <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">
            No suggested reviewers.
            <br />
            Type a GitHub username above.
          </p>
        ) : null}
      </div>
    </div>
  );
}
