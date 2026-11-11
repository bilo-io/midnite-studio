import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { LuArrowDown, LuArrowUp, LuPlus, LuTrash2 } from 'react-icons/lu';

import { bridge, noBridge } from '@midnite/studio-frame';
import type { ScienceCell, ScienceNotebook } from '@midnite/studio-shared';

import { blankCell, createNotebookDraft, moveCell, type CellKind } from '../notebook-draft';
import { useCompute } from '../compute/compute-worker-factory';
import { ComputeResult } from './compute-cell';
import { MarkdownCell } from './markdown-cell';

const KINDS: { kind: CellKind; label: string }[] = [
  { kind: 'markdown', label: 'Text' },
  { kind: 'compute', label: 'Compute' },
  { kind: 'plot', label: 'Plot' },
  { kind: 'molecule', label: 'Molecule' },
];

type Props = {
  notebook: ScienceNotebook;
  /** A write or rename landed: the list refreshes. */
  onSaved: () => void;
};

/**
 * One notebook's editor (Phase 126 Theme C.2): title, cells with a hover toolbar, an Add cell menu, and an
 * autosaving draft. Keyed by notebook id by its parent, so switching notebooks remounts it and the old
 * draft flushes on unmount.
 */
export function NotebookEditor({ notebook, onSaved }: Props) {
  const draft = useMemo(
    () =>
      createNotebookDraft({
        notebook,
        write: async (nb) => (await bridge()?.science?.write({ notebook: nb })) ?? noBridge(),
        onSaved,
      }),
    // A draft lives for one notebook id; the parent remounts this component for another.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notebook.id],
  );
  useEffect(
    () => () => {
      void draft.flush().finally(() => draft.dispose());
    },
    [draft],
  );

  const state = useStore(draft);
  const cells = state.notebook.cells;
  const compute = useCompute(cells);
  const [title, setTitle] = useState(state.notebook.title);
  const [adding, setAdding] = useState(false);

  const commitTitle = async () => {
    const next = title.trim();
    if (next === '' || next === state.notebook.title) {
      setTitle(state.notebook.title);
      return;
    }
    await draft.flush();
    const res = (await bridge()?.science?.rename({ id: notebook.id, title: next })) ?? noBridge();
    if (res.ok) {
      draft.setSavedTitle(next);
      onSaved();
    }
  };

  const setCell = (id: string, next: ScienceCell) => draft.setCells((cs) => cs.map((c) => (c.id === id ? next : c)));

  return (
    <div className="flex h-full min-w-0 flex-col" data-testid="notebook-editor">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <input
          aria-label="Notebook title"
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void commitTitle()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        {state.error !== null ? (
          <span role="alert" className="text-xs text-red-400">
            Not saved — {state.error}
          </span>
        ) : state.dirty ? (
          <span className="text-xs opacity-60">Saving…</span>
        ) : null}
      </header>
      <div className="flex-1 space-y-3 overflow-auto p-4">
        {cells.map((cell, index) => (
          <section key={cell.id} data-cell-kind={cell.kind} className="group relative rounded-md border border-transparent p-1 hover:border-border">
            <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
              <button type="button" aria-label="Move cell up" disabled={index === 0} onClick={() => draft.setCells((cs) => moveCell(cs, index, -1))}>
                <LuArrowUp aria-hidden />
              </button>
              <button type="button" aria-label="Move cell down" disabled={index === cells.length - 1} onClick={() => draft.setCells((cs) => moveCell(cs, index, 1))}>
                <LuArrowDown aria-hidden />
              </button>
              <button type="button" aria-label="Delete cell" onClick={() => draft.setCells((cs) => cs.filter((c) => c.id !== cell.id))}>
                <LuTrash2 aria-hidden />
              </button>
            </div>
            <CellBody cell={cell} onChange={(next) => setCell(cell.id, next)} />
            {cell.kind === 'compute' ? <ComputeResult result={compute.results[cell.id]} pending={compute.pending} /> : null}
          </section>
        ))}
        <div className="relative">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm"
            aria-haspopup="menu"
            aria-expanded={adding}
            onClick={() => setAdding((v) => !v)}
          >
            <LuPlus aria-hidden /> Add cell
          </button>
          {adding ? (
            <div role="menu" className="mt-1 inline-flex gap-1 rounded-md border border-border bg-background p-1">
              {KINDS.map(({ kind, label }) => (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  className="rounded px-2 py-1 text-sm hover:bg-muted"
                  onClick={() => {
                    draft.setCells((cs) => [...cs, blankCell(kind)]);
                    setAdding(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The body of one cell. The compute cell's result row is drawn by the parent; plot and molecule cells get their real bodies in Themes E and F. */
function CellBody({ cell, onChange }: { cell: ScienceCell; onChange: (cell: ScienceCell) => void }) {
  switch (cell.kind) {
    case 'markdown':
      return <MarkdownCell source={cell.source} onChange={(source) => onChange({ ...cell, source })} />;
    case 'compute':
      return (
        <textarea
          aria-label="Compute cell"
          value={cell.source}
          rows={3}
          spellCheck={false}
          className="w-full resize-none rounded-md border border-border bg-background p-2 font-mono text-sm outline-none focus:border-ring"
          onChange={(e) => onChange({ ...cell, source: e.target.value })}
        />
      );
    case 'plot':
      return <p className="p-2 text-sm opacity-60">Plot cell: {cell.series.map((s) => s.expr).join(', ')}</p>;
    case 'molecule':
      return <p className="p-2 text-sm opacity-60">Molecule cell{cell.name ? `: ${cell.name}` : ''}</p>;
  }
}
