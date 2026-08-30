import { useMemo } from 'react';

import type { Ref } from '@midnite/studio-shared';
import { GitBranch, ListFilter } from 'lucide-react';

import { MultiSelectMenu, type MultiSelectOption } from '../../components/multi-select-menu';

/**
 * The graph's branch filter.
 *
 * Multi-select rather than single: comparing two branches in one graph is the
 * question the picture is best at answering, and a single-select control makes
 * it impossible.
 *
 * Refs travel fully-qualified — `main` and `origin/main` are different commits
 * with the same short name, and `git log main` would resolve one of them
 * silently.
 */
export function RefFilter({
  refs,
  selected,
  onChange,
}: {
  refs: readonly Ref[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const options = useMemo<MultiSelectOption[]>(
    () =>
      refs
        .filter((r) => r.kind === 'localBranch' || r.kind === 'remoteBranch')
        .sort(
          (a, b) =>
            Number(b.isHead) - Number(a.isHead) ||
            // Local branches first: they are the ones you filter by.
            Number(a.kind === 'remoteBranch') - Number(b.kind === 'remoteBranch') ||
            a.name.localeCompare(b.name),
        )
        .map((ref) => ({
          value: ref.fullName,
          label: ref.name,
          icon: (
            <GitBranch
              aria-hidden
              className={`h-3 w-3 shrink-0 ${
                ref.kind === 'remoteBranch' ? 'text-muted-foreground/60' : 'text-muted-foreground'
              }`}
            />
          ),
          meta: ref.isHead ? (
            <span aria-label="current branch" className="h-1.5 w-1.5 rounded-full bg-primary" />
          ) : undefined,
        })),
    [refs],
  );

  return (
    <MultiSelectMenu
      options={options}
      selected={selected}
      onChange={onChange}
      icon={<ListFilter aria-hidden className="h-3.5 w-3.5 shrink-0" />}
      allLabel="All branches"
      searchPlaceholder="Filter branches…"
      emptyLabel="No branch matches."
      label="Filter the graph by branch"
      summarise={(n) => `${n} branches`}
    />
  );
}
