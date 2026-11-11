import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { bridge, noBridge } from '@midnite/studio-frame';
import { SCIENCE_DISCIPLINES, type ScienceDiscipline } from '@midnite/studio-shared';

import { newCellId } from '../notebook-draft';
import { scienceUiStore } from '../science-ui-store';
import { SCIENCE_TEMPLATES, type ScienceTemplate } from '../templates';

/** The template shelf (Phase 126 Theme G.2): cards filtered by discipline; "Use template" creates a copy and opens it. */
export function TemplatesView({ onView }: { onView: (view: string) => void }) {
  const client = useQueryClient();
  const [filter, setFilter] = useState<ScienceDiscipline | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const visible = filter === 'all' ? SCIENCE_TEMPLATES : SCIENCE_TEMPLATES.filter((t) => t.discipline === filter);

  const use = async (t: ScienceTemplate) => {
    setBusy(t.id);
    setError(null);
    // Fresh cell ids: two notebooks made from one template must not share them.
    const cells = t.cells.map((c) => ({ ...c, id: newCellId() }));
    const res = (await bridge()?.science?.create({ title: t.title, discipline: t.discipline, cells })) ?? noBridge();
    setBusy(null);
    if (!res.ok) {
      setError(res.kind === 'error' ? res.message : 'Could not create the notebook.');
      return;
    }
    scienceUiStore().getState().setLastNotebookId(res.value.notebook.id);
    void client.invalidateQueries({ queryKey: ['science', 'list'] });
    onView('notebooks');
  };

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 overflow-auto p-4" data-testid="templates-view">
      <h2 className="text-lg font-semibold">Templates</h2>
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
      {error !== null ? (
        <div role="alert" className="rounded-md border border-red-500/40 p-2 text-xs">
          {error}
        </div>
      ) : null}
      {visible.length === 0 ? <p className="text-sm opacity-70">No templates for this discipline yet.</p> : null}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {visible.map((t) => (
          <article key={t.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <header className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t.title}</h3>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize">{t.discipline}</span>
            </header>
            <p className="flex-1 text-xs opacity-70">{t.blurb}</p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void use(t)}
              className="self-start rounded-md border border-border px-3 py-1 text-sm"
            >
              Use template
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
