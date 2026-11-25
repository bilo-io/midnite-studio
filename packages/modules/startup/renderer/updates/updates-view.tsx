import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { LuCopy, LuFileDown, LuFileText, LuMail, LuNewspaper, LuPlus, LuSparkles, LuTrash2 } from 'react-icons/lu';

import { copyText } from '@midnite/studio-frame';
import type { InvestorUpdate } from '@midnite/studio-shared';

import { STARTUP_CHROME } from '../compose/startup-chrome';
import { startupBridge, unwrap, useStartupWrite } from '../data/use-startup';
import { ALERT, BUTTON, BUTTON_PRIMARY, FIELD, LABEL, PANE } from '../projections/styles';
import { defaultTitle, lastMonth, lineDiff, monthLabel, newestFirst } from './update-model';

const UpdatePreview = lazy(() => import('./update-preview'));

/** Edits are saved this long after the last keystroke. */
export const SAVE_DELAY_MS = 400;

type Draft = { markdown: string; model: string };

/**
 * Updates: the investor update for each month. Left, the months newest first and New update (last month by default);
 * right, the selected update as a markdown editor with a Preview, Draft with AI, and the ways out (Copy, Save as
 * .md or PDF, Email draft). A draft is shown for review and saved only on Accept. A read-only workspace disables
 * every control, as Projections does.
 */
export function UpdatesView({ updates, readOnly }: { updates: readonly InvestorUpdate[]; readOnly: boolean }) {
  const sorted = newestFirst(updates);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = sorted.find((u) => u.id === selectedId) ?? sorted[0] ?? null;
  return (
    <main className="flex h-full min-h-0" aria-label="Updates">
      <aside className="flex w-60 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border p-4" aria-label="Updates by month">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Updates</h1>
        </div>
        <button type="button" disabled={readOnly} onClick={() => setCreating(true)} className={`${BUTTON_PRIMARY} flex items-center justify-center gap-1`}>
          <LuPlus aria-hidden /> New update
        </button>
        {creating ? (
          <NewUpdateForm
            onCancel={() => setCreating(false)}
            onCreated={(id) => {
              setSelectedId(id);
              setCreating(false);
            }}
          />
        ) : null}
        {sorted.length === 0 && !creating ? <p className="text-xs text-muted-foreground">No updates yet. Start with last month, or let your model draft it.</p> : null}
        <ul className="flex flex-col">
          {sorted.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                aria-current={selected?.id === u.id ? 'true' : undefined}
                onClick={() => setSelectedId(u.id)}
                className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60 ${selected?.id === u.id ? 'bg-accent' : ''}`}
              >
                <span className="truncate">{monthLabel(u.period)}</span>
                <span className="truncate text-xs text-muted-foreground">{u.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6">
        {selected === null ? (
          <div className="flex flex-col items-start gap-2 py-8">
            <LuNewspaper aria-hidden className="text-muted-foreground" />
            <p className="text-sm font-medium">Nothing selected</p>
            <p className="text-xs text-muted-foreground">Choose a month on the left, or start a new update.</p>
          </div>
        ) : (
          <Editor key={selected.id} update={selected} readOnly={readOnly} onRemoved={() => setSelectedId(null)} />
        )}
      </section>
    </main>
  );
}

/** The New update form: a month (last month by default) and a title; a month that already has one is refused inline. */
function NewUpdateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [period, setPeriod] = useState(() => lastMonth(new Date()));
  const [problem, setProblem] = useState<string | null>(null);
  const create = useStartupWrite((bridge, update: InvestorUpdate) => bridge.upsertInvestorUpdate({ update }));
  function submit(): void {
    setProblem(null);
    const now = new Date().toISOString();
    const update: InvestorUpdate = { id: crypto.randomUUID(), period, title: defaultTitle(period), markdown: '', createdAt: now, updatedAt: now, drafts: [] };
    create.mutate(update, { onSuccess: () => onCreated(update.id), onError: (e) => setProblem(e.message) });
  }
  return (
    <div className={`${PANE} flex flex-col gap-2 p-3`} role="group" aria-label="New update">
      <label className={`${LABEL} flex flex-col gap-1`}>
        Month
        <input type="month" aria-label="Month" className={FIELD} value={period} onChange={(e) => setPeriod(e.target.value)} />
      </label>
      {problem !== null ? (
        <p role="alert" className={ALERT}>
          {problem}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" className={BUTTON_PRIMARY} disabled={create.isPending || !/^\d{4}-\d{2}$/.test(period)} onClick={submit}>
          Create
        </button>
        <button type="button" className={BUTTON} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Editor({ update, readOnly, onRemoved }: { update: InvestorUpdate; readOnly: boolean; onRemoved: () => void }) {
  const dialogs = STARTUP_CHROME.useDialogs();
  const [title, setTitle] = useState(update.title);
  const [text, setText] = useState(update.markdown);
  const [preview, setPreview] = useState(false);
  const [notes, setNotes] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const save = useStartupWrite((bridge, next: InvestorUpdate) => bridge.upsertInvestorUpdate({ update: next }));
  const remove = useStartupWrite((bridge, id: string) => bridge.removeInvestorUpdate({ id }));
  // What a save would write, kept in a ref so the timer and the flush always see the latest edit and the latest stored copy.
  const latest = useRef({ update, title, text });
  latest.current = { update, title, text };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const run = useRef(0);

  const persist = (): Promise<unknown> => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return Promise.resolve();
    dirty.current = false;
    const { update: base, title: t, text: m } = latest.current;
    const cleanTitle = t.trim() === '' ? base.title : t.trim();
    return save.mutateAsync({ ...base, title: cleanTitle, markdown: m, updatedAt: new Date().toISOString() }).catch((e: Error) => setProblem(e.message));
  };
  const edit = (next: { title?: string; text?: string }): void => {
    if (next.title !== undefined) setTitle(next.title);
    if (next.text !== undefined) setText(next.text);
    latest.current = { update: latest.current.update, title: next.title ?? latest.current.title, text: next.text ?? latest.current.text };
    dirty.current = true;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), SAVE_DELAY_MS);
  };
  // Leaving the update (another month, another view) writes what is pending rather than dropping it.
  useEffect(() => () => void persist(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const draftNow = async (): Promise<void> => {
    const bridge = startupBridge();
    setProblem(null);
    setInfo(null);
    const ticket = ++run.current;
    setDrafting(true);
    try {
      if (bridge === undefined) throw new Error('Midnite Startup is not available here.');
      const value = unwrap(await bridge.draftInvestorUpdate({ period: update.period, notes: notes.trim() }));
      if (ticket === run.current) setDraft(value);
    } catch (e) {
      if (ticket === run.current) setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      if (ticket === run.current) setDrafting(false);
    }
  };
  /** Cancel: the model may still answer, but its reply is ignored. */
  const cancel = (): void => {
    run.current++;
    setDrafting(false);
  };
  const accept = (): void => {
    if (draft === null) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    dirty.current = false;
    const base = latest.current.update;
    const now = new Date().toISOString();
    const next: InvestorUpdate = { ...base, title: latest.current.title.trim() === '' ? base.title : latest.current.title.trim(), markdown: draft.markdown, updatedAt: now, drafts: [...base.drafts, { at: now, model: draft.model }].slice(-50) };
    save.mutate(next, {
      onSuccess: () => {
        setText(draft.markdown);
        setDraft(null);
      },
      onError: (e) => setProblem(e.message),
    });
  };

  const out = async (label: string, op: () => Promise<{ ok: boolean; kind?: string; message?: string; value?: unknown }>): Promise<void> => {
    setProblem(null);
    setInfo(null);
    await persist();
    const r = await op();
    if (!r.ok) setProblem(r.message ?? `Could not ${label}.`);
    if (r.ok && r.value !== undefined) afterOut(label, r.value);
  };
  const afterOut = (label: string, value: unknown): void => {
    if (label === 'email' && (value as { truncated?: boolean }).truncated === true) setInfo('The email body was shortened; the full update is on your clipboard.');
    if ((label === 'save the file' || label === 'export the PDF') && (value as { saved?: boolean }).saved === true) setInfo('Saved.');
  };
  const bridgeOp = <K extends 'exportInvestorUpdateMd' | 'exportInvestorUpdatePdf' | 'emailInvestorUpdate'>(k: K, label: string): void => {
    const bridge = startupBridge();
    if (bridge === undefined) return setProblem('Midnite Startup is not available here.');
    void out(label, () => bridge[k]({ id: update.id }) as Promise<{ ok: boolean; message?: string; value?: unknown }>);
  };
  const copy = (): void => {
    setProblem(null);
    void copyText(text).then((ok) => setInfo(ok ? 'Copied.' : null));
  };
  const confirmRemove = (): void =>
    dialogs.confirm({
      title: `Delete the ${monthLabel(update.period)} update?`,
      body: 'The text and its draft history are removed. This cannot be undone.',
      confirmLabel: 'Delete update',
      danger: true,
      onConfirm: () => {
        // A pending edit must not be flushed on unmount: it would write the deleted update straight back.
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
        dirty.current = false;
        remove.mutate(update.id, { onSuccess: onRemoved, onError: (e) => setProblem(e.message) });
      },
    });
  const IconButton = STARTUP_CHROME.IconButton;
  const empty = text.trim() === '';

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Title" className={`${FIELD} min-w-0 flex-1 text-sm font-medium`} value={title} maxLength={120} disabled={readOnly} onChange={(e) => edit({ title: e.target.value })} />
        <span className="flex items-center gap-1">
          <IconButton icon={LuCopy} label="Copy markdown" disabled={empty} onClick={copy} />
          <IconButton icon={LuFileText} label="Save as .md" disabled={readOnly || empty} onClick={() => bridgeOp('exportInvestorUpdateMd', 'save the file')} />
          <IconButton icon={LuFileDown} label="Save as PDF" disabled={readOnly || empty} onClick={() => bridgeOp('exportInvestorUpdatePdf', 'export the PDF')} />
          <IconButton icon={LuMail} label="Email draft" disabled={readOnly || empty} onClick={() => bridgeOp('emailInvestorUpdate', 'email')} />
          <IconButton icon={LuTrash2} label="Delete update" disabled={readOnly} onClick={confirmRemove} />
        </span>
      </div>

      <div className={`${PANE} flex flex-col gap-2 p-3`}>
        <label className={`${LABEL} flex flex-col gap-1`}>
          Anything to mention?
          <textarea aria-label="Notes for the draft" rows={2} maxLength={2000} className={FIELD} value={notes} disabled={readOnly || drafting} onChange={(e) => setNotes(e.target.value)} placeholder="A hire, a launch, a worry" />
        </label>
        <div className="flex items-center gap-2">
          <button type="button" className={`${BUTTON_PRIMARY} flex items-center gap-1`} disabled={readOnly || drafting} onClick={() => void draftNow()}>
            <LuSparkles aria-hidden /> {drafting ? 'Drafting…' : 'Draft with AI'}
          </button>
          {drafting ? (
            <button type="button" className={BUTTON} onClick={cancel}>
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      {draft !== null ? <ReviewCard current={text} draft={draft} onAccept={accept} onDiscard={() => setDraft(null)} disabled={save.isPending} /> : null}

      {problem !== null ? (
        <p role="alert" className={ALERT}>
          {problem}
        </p>
      ) : null}
      {info !== null ? (
        <p role="status" className="text-xs text-muted-foreground">
          {info}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Editor or preview" className="flex overflow-hidden rounded-md border border-border text-xs">
          {([false, true] as const).map((isPreview) => (
            <button key={String(isPreview)} type="button" role="tab" aria-selected={preview === isPreview} onClick={() => setPreview(isPreview)} className={`px-3 py-1 ${preview === isPreview ? 'bg-accent' : 'text-muted-foreground'}`}>
              {isPreview ? 'Preview' : 'Edit'}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{update.drafts.length === 0 ? 'No AI drafts yet' : `${update.drafts.length} AI draft${update.drafts.length === 1 ? '' : 's'}`}</span>
      </div>
      {preview ? (
        <Suspense fallback={<p className="text-xs text-muted-foreground">Loading…</p>}>
          {empty ? <p className="text-xs text-muted-foreground">Nothing to preview yet.</p> : <UpdatePreview markdown={text} />}
        </Suspense>
      ) : (
        <textarea aria-label="Update markdown" spellCheck className={`${FIELD} min-h-80 flex-1 font-mono leading-relaxed`} value={text} disabled={readOnly} onChange={(e) => edit({ text: e.target.value })} />
      )}
    </div>
  );
}

/** A draft awaiting a decision: a line diff against the current text when there is one, the plain text otherwise. */
function ReviewCard({ current, draft, onAccept, onDiscard, disabled }: { current: string; draft: Draft; onAccept: () => void; onDiscard: () => void; disabled: boolean }) {
  const diff = current.trim() === '' ? null : lineDiff(current, draft.markdown);
  return (
    <section aria-label="Draft for review" className={`${PANE} flex flex-col gap-2 p-3`}>
      <h2 className="text-sm font-medium">
        Draft from {draft.model} <span className="text-xs font-normal text-muted-foreground">{diff === null ? 'review before saving' : 'changes against your text'}</span>
      </h2>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-mono text-xs">
        {diff === null
          ? draft.markdown
          : diff.map((l, i) => (
              <span key={i} data-diff={l.kind} className={`block ${l.kind === 'add' ? 'bg-emerald-500/15' : l.kind === 'del' ? 'bg-red-500/15 line-through opacity-70' : ''}`}>
                {l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  '}
                {l.text}
              </span>
            ))}
      </pre>
      <div className="flex gap-2">
        <button type="button" className={BUTTON_PRIMARY} disabled={disabled} onClick={onAccept}>
          Accept
        </button>
        <button type="button" className={BUTTON} onClick={onDiscard}>
          Discard
        </button>
      </div>
    </section>
  );
}
