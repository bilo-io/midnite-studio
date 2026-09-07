import { useEffect, useRef, useState } from 'react';

import type { PostmanEnvironment, PostmanEnvironmentValue } from '@midnite/studio-shared';
import { LuEye, LuPlus, LuTrash, LuTriangleAlert, LuX } from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { useDismiss } from '../../components/use-dismiss';
import { useFocusTrap } from '../../components/use-focus-trap';
import { useApiClientStore } from '../../store/api-client-store';
import { useUiStore } from '../../store/ui-store';

/**
 * Environments, two-tier `{{var}}`, and the secret overlay (Phase 70 Theme
 * A). A modal of its own rather than a builder tab — the environment editor
 * is not a request, and nothing in the API Client's tab strip is shaped to
 * hold one.
 *
 * `environmentId: null` is the "New environment" flow: nothing has been
 * saved yet, `existing` stays `null`, and the first `Save` click is what
 * turns a blank name and an empty row list into a real file. Every other
 * value is "edit this one" — `existing` is read from the store's own
 * `environments` list (already the merged, secret-overlay-included shape
 * `listEnvironments` returns), exactly the way `collection-tree.tsx` never
 * issues a second fetch to open a collection it already has in memory.
 *
 * The editor is unaware of the base/overlay split — see `environment-io.ts`'s
 * module header. It reads a merged environment and writes a whole one;
 * `saveEnvironment` does the partitioning, and this component's only job
 * around it is showing the blast-radius confirm when the save comes back
 * `needs-confirm` and resending with `confirmed: true` once accepted.
 */
export function EnvironmentEditor({
  repoId,
  environmentId,
  onClose,
}: {
  repoId: string;
  /** `null` creates a new environment; any other string edits that one. */
  environmentId: string | null;
  onClose: () => void;
}) {
  const dialogs = useDialogs();
  const containerRef = useRef<HTMLDivElement>(null);
  const summaries = useApiClientStore((s) => s.environments);
  const saveEnvironmentAction = useApiClientStore((s) => s.saveEnvironment);
  const removeEnvironmentAction = useApiClientStore((s) => s.removeEnvironment);
  const activeEnvironmentByRepo = useUiStore((s) => s.activeEnvironmentByRepo);
  const setActiveEnvironment = useUiStore((s) => s.setActiveEnvironment);

  const existing = environmentId
    ? (summaries.find((summary) => summary.id === environmentId)?.environment ?? null)
    : null;

  const [name, setName] = useState(existing?.name ?? 'New Environment');
  const [rows, setRows] = useState<PostmanEnvironmentValue[]>(existing?.values ?? []);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different environment (or the "New environment" slot) was opened —
  // start the form over from whatever that one actually holds, rather than
  // carrying the previous edit across.
  useEffect(() => {
    setName(existing?.name ?? 'New Environment');
    setRows(existing?.values ?? []);
    setRevealed(new Set());
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `existing` is derived from `environmentId`; re-running on it too would reset the form on every unrelated store update.
  }, [environmentId]);

  useDismiss(true, onClose, { layer: 'dialog' });
  useFocusTrap(containerRef, true);

  function updateRow(index: number, patch: Partial<PostmanEnvironmentValue>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function addRow() {
    setRows((current) => [...current, { key: '', value: '', type: 'default', enabled: true }]);
  }

  function toggleRevealed(index: number) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function doSave(confirmed: boolean) {
    setSaving(true);
    setError(null);
    const environment: PostmanEnvironment = {
      id: existing?.id ?? `env-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: name.trim().length > 0 ? name.trim() : 'Untitled Environment',
      values: rows.filter((row) => row.key.trim().length > 0),
    };

    const result = await saveEnvironmentAction(repoId, environmentId, environment, confirmed);
    setSaving(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    if (result.value.status === 'needs-confirm') {
      const { secretCount, gitignorePath } = result.value;
      dialogs.confirm({
        title: 'Write secret values to this repository?',
        body: `${gitignorePath} will be created so this file — and every future secret overlay in this repo — never reaches a commit.`,
        confirmLabel: 'Write secrets',
        danger: true,
        blastRadius: { count: secretCount, sample: [] },
        blastRadiusKind: 'secrets',
        onConfirm: () => void doSave(true),
      });
      return;
    }

    // `status === 'saved'`. A brand-new environment gets selected as the
    // repo's active one immediately — otherwise it exists but nothing points
    // at it until the user opens the switcher and picks it a second time.
    if (environmentId === null) setActiveEnvironment(repoId, result.value.fileName);
    onClose();
  }

  function confirmDelete() {
    if (!environmentId) return;
    const targetId = environmentId;
    dialogs.confirm({
      title: `Delete "${existing?.name ?? name}"?`,
      confirmLabel: 'Delete',
      danger: true,
      blastRadius: null,
      onConfirm: () => {
        void removeEnvironmentAction(repoId, targetId).then(() => {
          if (activeEnvironmentByRepo[repoId] === targetId) setActiveEnvironment(repoId, null);
          onClose();
        });
      },
    });
  }

  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={environmentId ? `Edit environment "${name}"` : 'New environment'}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <input
            aria-label="Environment name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Environment name"
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-sm font-semibold outline-none hover:border-border focus:border-border focus:bg-background"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LuX className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-6 pb-1.5 font-normal" />
                <th className="pb-1.5 pr-2 font-normal">Key</th>
                <th className="pb-1.5 pr-2 font-normal">Value</th>
                <th className="w-20 pb-1.5 pr-2 font-normal">Type</th>
                <th className="w-8 pb-1.5 font-normal" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isSecret = row.type === 'secret';
                const isRevealed = revealed.has(index);
                return (
                  <tr key={index} className="border-b border-border/50 last:border-b-0">
                    <td className="py-1 pr-1 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`Enable ${row.key || 'row'}`}
                        checked={row.enabled !== false}
                        onChange={(event) => updateRow(index, { enabled: event.target.checked })}
                        className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                      />
                    </td>
                    <td className="py-1 pr-2 align-middle">
                      <input
                        aria-label="Key"
                        value={row.key}
                        onChange={(event) => updateRow(index, { key: event.target.value })}
                        placeholder="key"
                        className="h-7 w-full rounded-md border border-border bg-background px-1.5 font-mono text-xs"
                      />
                    </td>
                    <td className="py-1 pr-2 align-middle">
                      <div className="relative">
                        <input
                          aria-label="Value"
                          type={isSecret && !isRevealed ? 'password' : 'text'}
                          value={row.value ?? ''}
                          onChange={(event) => updateRow(index, { value: event.target.value })}
                          placeholder={isSecret ? '••••••••' : 'value'}
                          className={`h-7 w-full rounded-md border border-border bg-background px-1.5 font-mono text-xs ${isSecret ? 'pr-7' : ''}`}
                        />
                        {isSecret ? (
                          <button
                            type="button"
                            aria-label="Hold to reveal"
                            title="Hold to reveal — this only hides the value from a shoulder-surfer, not a security control."
                            onMouseDown={() => toggleRevealed(index)}
                            onMouseUp={() => toggleRevealed(index)}
                            onMouseLeave={() => revealed.has(index) && toggleRevealed(index)}
                            className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            <LuEye className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-1 pr-2 align-middle">
                      <button
                        type="button"
                        onClick={() =>
                          updateRow(index, { type: row.type === 'secret' ? 'default' : 'secret' })
                        }
                        className={`h-7 w-full rounded-md border px-1.5 text-[11px] font-medium transition-colors ${
                          isSecret
                            ? 'border-destructive/40 bg-destructive/10 text-destructive'
                            : 'border-border text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {isSecret ? 'Secret' : 'Default'}
                      </button>
                    </td>
                    <td className="py-1 align-middle">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        aria-label="Remove row"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                      >
                        <LuTrash className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button
            type="button"
            onClick={addRow}
            className="mt-2 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LuPlus className="h-3.5 w-3.5" aria-hidden />
            Add variable
          </button>

          {error ? (
            <p role="alert" className="mt-3 flex items-center gap-1.5 text-xs text-destructive">
              <LuTriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-2.5">
          {environmentId ? (
            <button
              type="button"
              onClick={confirmDelete}
              className="rounded-md px-2.5 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void doSave(false)}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-xs transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
