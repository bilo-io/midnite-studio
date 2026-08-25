import { useEffect, useMemo, useRef, useState } from 'react';

import type { Ref } from '@midnite/git-shared';
import { Check, ChevronDown, GitBranch, ListFilter } from 'lucide-react';

import { cascadeStyle } from '../../lib/cascade';

/**
 * The graph's branch filter.
 *
 * Multi-select rather than single: comparing two branches in one graph is the
 * question the picture is best at answering, and a single-select control makes
 * it impossible.
 *
 * Selecting nothing means "every ref" — the same state as `--all`, and the
 * default. Modelling "all" as the empty set rather than as every ref checked
 * means a newly-created branch is included automatically instead of silently
 * missing from a graph the user believed was unfiltered.
 */
export function RefFilter({
  refs,
  selected,
  onChange,
}: {
  refs: readonly Ref[];
  /** Fully-qualified refs; empty means every ref. */
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  const branches = useMemo(
    () =>
      refs
        .filter((r) => r.kind === 'localBranch' || r.kind === 'remoteBranch')
        .sort(
          (a, b) =>
            Number(b.isHead) - Number(a.isHead) ||
            // Local branches first: they are the ones you filter by.
            Number(a.kind === 'remoteBranch') - Number(b.kind === 'remoteBranch') ||
            a.name.localeCompare(b.name),
        ),
    [refs],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? branches.filter((r) => r.name.toLowerCase().includes(needle)) : branches;
  }, [branches, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = (fullName: string) =>
    onChange(
      selected.includes(fullName)
        ? selected.filter((r) => r !== fullName)
        : [...selected, fullName],
    );

  const label =
    selected.length === 0
      ? 'All branches'
      : selected.length === 1
        ? (branches.find((r) => r.fullName === selected[0])?.name ?? '1 branch')
        : `${selected.length} branches`;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs transition-colors hover:bg-accent hover:text-foreground ${
          selected.length > 0
            ? 'border-primary/40 bg-primary/10 text-foreground'
            : 'border-border text-muted-foreground'
        }`}
      >
        <ListFilter aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-[12rem] truncate">{label}</span>
        <ChevronDown
          aria-hidden
          className={`h-3 w-3 shrink-0 transition-transform duration-150 ease-in-out ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-multiselectable
          aria-label="Filter the graph by branch"
          className="absolute left-0 top-full z-50 mt-1 max-h-80 w-72 animate-fade-in overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="border-b border-border p-1.5">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter branches…"
              className="h-6 w-full rounded border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-primary"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              role="option"
              aria-selected={selected.length === 0}
              onClick={() => onChange([])}
              className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
            >
              <Check
                aria-hidden
                className={`h-3.5 w-3.5 shrink-0 ${selected.length === 0 ? '' : 'invisible'}`}
              />
              <span className="font-medium">All branches</span>
            </button>

            <hr className="my-1 border-border" />

            {visible.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">No branch matches.</p>
            ) : (
              visible.map((ref, index) => {
                const isOn = selected.includes(ref.fullName);
                return (
                  <button
                    key={ref.fullName}
                    type="button"
                    role="option"
                    aria-selected={isOn}
                    style={cascadeStyle(index)}
                    onClick={() => toggle(ref.fullName)}
                    className="flex w-full animate-fade-in-up cascade-delay items-center gap-2 px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
                  >
                    <Check aria-hidden className={`h-3.5 w-3.5 shrink-0 ${isOn ? '' : 'invisible'}`} />
                    <GitBranch
                      aria-hidden
                      className={`h-3 w-3 shrink-0 ${
                        ref.kind === 'remoteBranch' ? 'text-muted-foreground/60' : 'text-muted-foreground'
                      }`}
                    />
                    <span className="truncate">{ref.name}</span>
                    {ref.isHead ? (
                      <span aria-label="current branch" className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
