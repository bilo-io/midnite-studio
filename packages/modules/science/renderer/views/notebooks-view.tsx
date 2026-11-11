import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { LuLayoutTemplate, LuPlus } from 'react-icons/lu';
import { PiFlaskFill } from 'react-icons/pi';

import { bridge, noBridge, useFrameChrome } from '@midnite/studio-frame';
import { SCIENCE_DISCIPLINES, type ScienceDiscipline, type ScienceNotebook, type ScienceNotebookSummary } from '@midnite/studio-shared';

import { blankCell } from '../notebook-draft';
import { relativeTime } from '../relative-time';
import { scienceUiStore } from '../science-ui-store';
import { NotebookEditor } from './notebook-editor';

const LIST_KEY = ['science', 'list'] as const;

/** The notebook list on the left, the editor on the right (Phase 126 Theme C.1). */
export function NotebooksView({ onView }: { onView: (view: string) => void }) {
  const client = useQueryClient();
  const dialogs = useFrameChrome().useDialogs();
  const ui = scienceUiStore();
  const lastId = useStore(ui, (s) => s.lastNotebookId);
  const [filter, setFilter] = useState<ScienceDiscipline | 'all'>('all');
  const [renaming, setRenaming] = useState<string | null>(null);

  const list = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => (await bridge()?.science?.list()) ?? noBridge(),
  });
  const refresh = () => void client.invalidateQueries({ queryKey: LIST_KEY });

  const result = list.data;
  const notebooks: ScienceNotebookSummary[] = result?.ok ? result.value.notebooks : [];
  const quarantined = result?.ok ? result.value.quarantined : 0;
  const visible = filter === 'all' ? notebooks : notebooks.filter((n) => n.discipline === filter);
  // A stored id that no longer lists falls back to none.
  const selectedId = lastId !== null && notebooks.some((n) => n.id === lastId) ? lastId : null;

  const open = useQuery({
    queryKey: ['science', 'notebook', selectedId],
    enabled: selectedId !== null,
    // Always the file on disk when a notebook is opened; the editor's own draft is the live copy.
    gcTime: 0,
    queryFn: async () => (await bridge()?.science?.read({ id: selectedId! })) ?? noBridge(),
  });

  useEffect(() => {
    if (lastId !== null && result?.ok && selectedId === null) ui.getState().setLastNotebookId(null);
  }, [lastId, result, selectedId, ui]);

  const create = async () => {
    const res =
      (await bridge()?.science?.create({ title: 'Untitled notebook', discipline: 'general', cells: [blankCell('markdown')] })) ?? noBridge();
    if (res.ok) {
      ui.getState().setLastNotebookId(res.value.notebook.id);
      refresh();
    }
  };

  const remove = (n: ScienceNotebookSummary) =>
    dialogs.confirm({
      title: `Move '${n.title}' to the Trash?`,
      body: 'You can restore it from the Trash in Finder.',
      confirmLabel: 'Move to Trash',
      danger: true,
      blastRadius: { count: 1, sample: [] },
      blastRadiusKind: 'trash',
      onConfirm: () => {
        void (async () => {
          const res = (await bridge()?.science?.remove({ id: n.id })) ?? noBridge();
          if (res.ok) {
            if (ui.getState().lastNotebookId === n.id) ui.getState().setLastNotebookId(null);
            refresh();
          }
        })();
      },
    });

  const commitRename = async (n: ScienceNotebookSummary, title: string) => {
    setRenaming(null);
    const next = title.trim();
    if (next === '' || next === n.title) return;
    const res = (await bridge()?.science?.rename({ id: n.id, title: next })) ?? noBridge();
    if (res.ok) refresh();
  };

  const empty = result?.ok === true && notebooks.length === 0;

  return (
    <div className="flex h-full" data-testid="notebooks-view">
      <aside className="flex w-[280px] shrink-0 flex-col gap-2 border-r border-border p-3">
        <button
          type="button"
          onClick={() => void create()}
          className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm"
        >
          <LuPlus aria-hidden /> New notebook
        </button>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Discipline filter">
          {(['all', ...SCIENCE_DISCIPLINES] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={filter === d}
              onClick={() => setFilter(d)}
              className={`rounded-full border border-border px-2 py-0.5 text-xs capitalize ${filter === d ? 'bg-muted' : ''}`}
            >
              {d === 'all' ? 'All' : d}
            </button>
          ))}
        </div>
        {result && !result.ok ? (
          <div role="alert" className="rounded-md border border-red-500/40 p-2 text-xs">
            {result.kind === 'error' ? result.message : 'Could not list notebooks.'}
            <button type="button" className="ml-2 underline" onClick={() => void list.refetch()}>
              Retry
            </button>
          </div>
        ) : null}
        {quarantined > 0 ? (
          <p className="text-xs opacity-60">{quarantined} notebook files could not be read and were set aside</p>
        ) : null}
        <ul className="min-h-0 flex-1 space-y-1 overflow-auto">
          {visible.map((n) => (
            <li key={n.id}>
              {renaming === n.id ? (
                <input
                  aria-label="Rename notebook"
                  autoFocus
                  defaultValue={n.title}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitRename(n, e.currentTarget.value);
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  onBlur={() => setRenaming(null)}
                />
              ) : (
                <button
                  type="button"
                  aria-current={selectedId === n.id}
                  onClick={() => ui.getState().setLastNotebookId(n.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    dialogs.openMenu?.({ clientX: e.clientX, clientY: e.clientY }, [
                      { label: 'Rename', onSelect: () => setRenaming(n.id) },
                      { label: 'Delete', danger: true, onSelect: () => remove(n) },
                    ]);
                  }}
                  className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${selectedId === n.id ? 'bg-muted' : ''}`}
                >
                  <span className="w-full truncate font-medium">{n.title}</span>
                  <span className="text-xs opacity-60">
                    <span className="capitalize">{n.discipline}</span> · {relativeTime(n.updatedAt)}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </aside>
      <section className="min-w-0 flex-1">
        {selectedId !== null && open.data?.ok ? (
          <NotebookEditor key={selectedId} notebook={open.data.value.notebook as ScienceNotebook} onSaved={refresh} />
        ) : selectedId !== null && open.data && !open.data.ok ? (
          <p role="alert" className="p-6 text-sm">
            {open.data.kind === 'error' ? open.data.message : 'Could not open the notebook.'}
          </p>
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" data-testid="notebooks-empty">
            <PiFlaskFill size={48} className="text-[#06b6d4]" aria-hidden />
            <h2 className="text-lg font-semibold">No notebooks yet</h2>
            <p className="text-sm opacity-70">Start from a template or a blank page.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void create()} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm">
                <LuPlus aria-hidden /> New notebook
              </button>
              <button type="button" onClick={() => onView('templates')} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm">
                <LuLayoutTemplate aria-hidden /> Browse templates
              </button>
            </div>
          </div>
        ) : (
          <p className="p-6 text-sm opacity-60">Select a notebook</p>
        )}
      </section>
    </div>
  );
}
