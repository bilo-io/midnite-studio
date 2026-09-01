import { useMemo } from 'react';

import type { GraphRow } from '@midnite/studio-shared';
import { LuUsers } from 'react-icons/lu';

import { MultiSelectMenu, type MultiSelectOption } from '../../components/multi-select-menu';
import { normaliseEmail } from '../../services/avatars';

export type AuthorSummary = {
  email: string;
  name: string;
  commits: number;
};

/**
 * The distinct authors in the loaded graph, most prolific first.
 *
 * Derived from the rows rather than from a new `git shortlog` channel: the
 * authors offered are then exactly the authors present in the graph you are
 * looking at, so the menu can never list someone whose commits are all beyond
 * the row cap or excluded by the branch filter.
 *
 * Keyed on the lowercased email, because one person routinely commits as
 * "Bilo" and "bilo lwabona" from the same address, and splitting them would
 * make the filter miss half their work.
 */
export function summariseAuthors(rows: readonly GraphRow[]): AuthorSummary[] {
  const byEmail = new Map<string, AuthorSummary>();

  for (const row of rows) {
    const email = normaliseEmail(row.commit.authorEmail);
    const found = byEmail.get(email);
    if (found) found.commits += 1;
    else byEmail.set(email, { email, name: row.commit.authorName, commits: 1 });
  }

  return [...byEmail.values()].sort(
    (a, b) => b.commits - a.commits || a.name.localeCompare(b.name),
  );
}

/**
 * The graph's author filter.
 *
 * Selecting authors DIMS the rest; it never removes them. `git log --author`
 * omits commits without rewriting `%P`, so the lane engine — which opens a lane
 * per parent and holds it until that parent arrives — would leave a dangling
 * lane for every filtered-out parent. Dimming keeps the topology honest, and
 * answers the more useful question anyway: where in history does this person's
 * work sit.
 */
export function AuthorFilter({
  authors,
  selected,
  onChange,
}: {
  authors: readonly AuthorSummary[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  /**
   * Selected authors survive even when they leave the graph.
   *
   * The list is derived from the streamed rows, so narrowing the BRANCH filter
   * to a branch this author never touched drops them out of it — every row then
   * renders dimmed, and the one control that could undo it no longer offers
   * them. Keeping the selection pinned means a filter is always reversible by
   * the same gesture that set it.
   */
  const options = useMemo<MultiSelectOption[]>(() => {
    const present = new Set(authors.map((a) => a.email));
    const stranded = selected
      .filter((email) => !present.has(email))
      .map((email) => ({ email, name: email, commits: 0 }));

    return [...authors, ...stranded].map((author) => ({
      value: author.email,
      label: author.name,
      keywords: author.email,
      meta: (
        <span className="tabular-nums text-[10px] text-muted-foreground">
          {author.commits === 0 ? 'none here' : author.commits}
        </span>
      ),
    }));
  }, [authors, selected]);

  return (
    <MultiSelectMenu
      options={options}
      selected={selected}
      onChange={onChange}
      icon={<LuUsers aria-hidden className="h-3.5 w-3.5 shrink-0" />}
      allLabel="All authors"
      searchPlaceholder="Filter authors…"
      emptyLabel="No author matches."
      label="Highlight commits by author"
      summarise={(n) => `${n} authors`}
    />
  );
}
