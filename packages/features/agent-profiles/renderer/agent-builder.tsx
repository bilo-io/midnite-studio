import { useEffect, useMemo, useRef, useState } from 'react';
import { LuCheck, LuCornerDownRight, LuLoaderCircle, LuTriangleAlert, LuX, LuInfo } from 'react-icons/lu';

import { FrameModal } from '@midnite/studio-frame';
import {
  AGENT_LIMIT_KEYS,
  AGENT_LIMIT_LABELS,
  AgentProfileSchema,
  DEFAULT_AGENT_LIMITS,
  enforcementFor,
  promptDeliveryFor,
  type AgentLimitKey,
  type AgentProfile,
} from '@midnite/studio-shared';

import { BlueprintEditor } from './blueprint-editor';
import { Checklist, type ChecklistItem } from './checklist';
import { controlClass, Field } from './field';
import { useAgentProfilesHost } from './host';
import { FIELD_INFO } from './info-copy';
import { FOCUS_RING, PRIMARY_BUTTON, SECONDARY_BUTTON } from './ui';
import { useSaveAgentProfile } from './use-agent-profiles';
import { usePanelWidth } from './use-panel-width';

/** Below this the section index becomes a chip row and the blueprint pipeline goes horizontal. */
const NARROW_WIDTH = 720;
const PROMPT_MAX = 20_000;
const SAVED_FADE_MS = 2_000;

const SECTIONS = [
  { id: 'identity', label: 'Identity' },
  { id: 'base', label: 'Base' },
  { id: 'prompt', label: 'Prompt' },
  { id: 'tools', label: 'Tools' },
  { id: 'skills', label: 'Skills' },
  { id: 'limits', label: 'Limits' },
  { id: 'blueprint', label: 'Blueprint' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

/** Structural equality for plain JSON data (a profile). Key order does not matter. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const limitLabel = (key: AgentLimitKey): string => AGENT_LIMIT_LABELS[key].replace(/^./, (c) => c.toUpperCase());

type Errors = Record<string, string>;

/** Maps a schema failure onto field ids and the copy the Builder shows under each. */
function validate(draft: AgentProfile): { ok: true; profile: AgentProfile } | { ok: false; errors: Errors } {
  const parsed = AgentProfileSchema.safeParse(draft);
  if (parsed.success) return { ok: true, profile: parsed.data };
  const errors: Errors = {};
  for (const issue of parsed.error.issues) {
    const [head, sub] = issue.path;
    const key = head === 'limits' && typeof sub === 'string' ? sub : String(head);
    if (errors[key]) continue;
    if (key === 'name' && issue.code === 'too_small') errors[key] = 'Give the agent a name.';
    else if (key === 'accent') errors[key] = 'Pick a colour.';
    else if (issue.code === 'too_big') errors[key] = `Keep this under ${(issue as { maximum?: number | bigint }).maximum ?? 'the limit'} characters.`;
    else if (head === 'limits') errors[key] = 'Enter a whole number of 1 or more.';
    else errors[key] = 'This value is not valid.';
  }
  return { ok: false, errors };
}

const sectionHeading = 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground scroll-mt-4 focus:outline-none';

function Note({ warning = false, children }: { warning?: boolean; children: React.ReactNode }) {
  const Icon = warning ? LuTriangleAlert : LuCornerDownRight;
  return (
    <p className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
      <Icon aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Counter({ n, max }: { n: number; max: number }) {
  return (
    <span className={`text-[11px] tabular-nums ${n > max * 0.95 ? 'text-destructive' : 'text-muted-foreground'}`} data-testid="prompt-counter">
      {n.toLocaleString('en-US')} / {max.toLocaleString('en-US')}
    </span>
  );
}

export interface AgentBuilderProps {
  /** The profile to edit: the stored copy, or an unsaved draft when `isNew`. */
  profile: AgentProfile;
  isNew: boolean;
  /** Called with the draft's name while it differs from what is saved, and `null` once it does not. */
  onDirtyChange: (dirtyName: string | null) => void;
  /** Called after a save, with the saved profile. */
  onSaved: (profile: AgentProfile) => void;
  /** Called when Discard leaves an unsaved new agent: the page returns to the list. */
  onDone: () => void;
}

/**
 * The Builder form (Phase 154 Theme D): an explicit-Save editor over a draft copy of one profile, with
 * a section index, per-field info popovers, the blueprint, a conflict prompt and a sticky footer.
 * Remount it (key by profile id) to edit a different agent.
 */
export function AgentBuilder({ profile, isNew, onDirtyChange, onSaved, onDone }: AgentBuilderProps) {
  const host = useAgentProfilesHost();
  const { agents, status } = host.useAgentRoster();
  const save = useSaveAgentProfile();
  const useLive = host.useLiveSessionCount ?? (() => 0);
  const live = useLive(profile.id);

  const initial = useRef(profile).current;
  const [stored, setStored] = useState<AgentProfile | null>(isNew ? null : profile);
  const [draft, setDraft] = useState<AgentProfile>(profile);
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<{ current: AgentProfile; attempt: AgentProfile } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [notice, setNotice] = useState(false);
  const [modelNote, setModelNote] = useState('');
  const [current, setCurrent] = useState<SectionId>('identity');

  const root = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const headings = useRef<Partial<Record<SectionId, HTMLHeadingElement | null>>>({});
  const baseChanged = useRef(false);
  const toolsMemo = useRef<string[]>([]);
  const width = usePanelWidth(root);
  const narrow = width < NARROW_WIDTH;

  const baseline = stored ?? initial;
  const dirty = !deepEqual(draft, baseline);
  const canSave = stored === null || dirty;
  const patch = (next: Partial<AgentProfile>): void => {
    setDraft((d) => ({ ...d, ...next }));
    setJustSaved(false);
  };

  // Tell the page when there is something to lose, and that there is not once this unmounts.
  useEffect(() => {
    onDirtyChange(dirty ? draft.name : null);
  }, [dirty, draft.name, onDirtyChange]);
  useEffect(() => () => onDirtyChange(null), [onDirtyChange]);

  useEffect(() => {
    nameInput.current?.focus();
  }, []);

  // The footer's height is what the blueprint's stack bar sticks above.
  useEffect(() => {
    const el = footer.current;
    const host = root.current;
    if (!el || !host) return undefined;
    const apply = (h: number): void => host.style.setProperty('--builder-footer-h', `${h}px`);
    apply(el.getBoundingClientRect().height || 49);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (typeof h === 'number') apply(h);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Scroll-spy: the heading nearest the top of the panel is the current section.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = SECTIONS.find((s) => headings.current[s.id] === entry.target)?.id;
          if (id) setCurrent(id);
        }
      },
      { rootMargin: '0px 0px -70% 0px' },
    );
    for (const s of SECTIONS) {
      const el = headings.current[s.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  // A saved flag fades after a moment.
  useEffect(() => {
    if (!justSaved) return undefined;
    const t = setTimeout(() => setJustSaved(false), SAVED_FADE_MS);
    return () => clearTimeout(t);
  }, [justSaved]);

  const goTo = (id: SectionId): void => {
    const el = headings.current[id];
    if (!el) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    el.focus();
    setCurrent(id);
  };

  // --- base and model ---------------------------------------------------------
  const baseAgent = agents.find((a) => a.id === draft.baseAgentId);
  const baseLabel = baseAgent?.label ?? draft.baseAgentId;
  const models = host.useModelsFor(draft.baseAgentId);
  const modelIds = models.map((m) => m.id).join('\n');
  useEffect(() => {
    if (!baseChanged.current) return;
    baseChanged.current = false;
    if (draft.model !== 'default' && !models.some((m) => m.id === draft.model)) {
      setDraft((d) => ({ ...d, model: 'default' }));
      setModelNote(`Model reset to Default for ${baseLabel}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the new base's model list only
  }, [draft.baseAgentId, modelIds]);

  const installedIds = new Set(status.filter((s) => s.installed).map((s) => s.id));
  const rosterOrdered = useMemo(
    () => [...agents].sort((a, b) => Number(installedIds.has(b.id)) - Number(installedIds.has(a.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agents, status],
  );

  // --- tools and skills -------------------------------------------------------
  const mcpTools = host.useMcpTools();
  const toolItems: ChecklistItem[] = [
    ...mcpTools.map((t) => ({ key: t.id, title: t.title, id: t.id, info: t.description })),
    ...(draft.mcpTools ?? []).filter((id) => !mcpTools.some((t) => t.id === id)).map((id) => ({ key: id, title: id, missing: true })),
  ];
  const restricted = draft.mcpTools !== null;
  const enforcement = enforcementFor(draft.baseAgentId);
  const skillsState = host.useSkills(draft.baseAgentId);
  const skillItems: ChecklistItem[] = [
    ...skillsState.skills.map((s) => ({ key: s.name, title: s.name, badge: s.scope, ...(s.description ? { info: s.description } : {}) })),
    ...draft.skills.filter((n) => !skillsState.skills.some((s) => s.name === n)).map((n) => ({ key: n, title: n, missing: true })),
  ];

  const delivery = promptDeliveryFor(draft.baseAgentId);
  const deliveryLine =
    delivery === 'flag'
      ? `Passed to ${baseLabel} as a system prompt.`
      : delivery === 'argument'
        ? `Sent to ${baseLabel} as the first message of each new session.`
        : `${baseLabel} can't take a prompt from Midnite; this text is saved but not sent.`;

  // --- save -------------------------------------------------------------------
  const send = async (attempt: AgentProfile, expectedUpdatedAt: number | null): Promise<void> => {
    const outcome = await save.mutateAsync({ profile: attempt, expectedUpdatedAt });
    if (outcome.status === 'saved') {
      setStored(outcome.profile);
      setDraft(outcome.profile);
      setJustSaved(true);
      setNotice(live > 0);
      setConflict(null);
      onSaved(outcome.profile);
    } else if (outcome.status === 'conflict') {
      setConflict({ current: outcome.current, attempt });
    }
  };
  const onSave = (): void => {
    const result = validate(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    void send(result.profile, stored?.updatedAt ?? null);
  };
  const onDiscard = (): void => {
    if (stored === null) {
      onDone();
      return;
    }
    setDraft(stored);
    setErrors({});
    setModelNote('');
  };

  const err = (key: string): { 'aria-invalid'?: true; 'aria-describedby'?: string } =>
    errors[key] ? { 'aria-invalid': true, 'aria-describedby': `builder-${key}-error` } : {};
  const fieldError = (key: string): string | undefined => errors[key];

  const blueprintCount = Object.values(draft.blueprint).reduce((n, c) => n + (c?.options.length ?? 0), 0);
  const counts: Partial<Record<SectionId, number>> = {
    tools: draft.mcpTools?.length ?? 0,
    skills: draft.skills.length,
    blueprint: blueprintCount,
  };

  const setLimit = (key: AgentLimitKey, raw: string): void => {
    const limits = { ...draft.limits };
    if (raw.trim() === '') delete limits[key];
    else {
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      limits[key] = Math.trunc(n);
    }
    patch({ limits });
  };

  const accentValid = /^#[0-9a-fA-F]{6}$/.test(draft.accent);
  const iconKey = (a: { id: string; icon?: string }): string => a.icon ?? a.id;
  const PreviewIcon = host.resolveAgentIcon({ id: draft.baseAgentId, icon: draft.icon });

  const indexItems = SECTIONS.map(({ id, label }) => (
    <button
      key={id}
      type="button"
      data-testid={`builder-index-${id}`}
      aria-current={current === id ? 'true' : undefined}
      onClick={() => goTo(id)}
      className={`flex shrink-0 items-center gap-2 rounded px-2 py-1 text-xs ${FOCUS_RING} ${
        current === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      {counts[id] ? <span className="ml-auto text-[10px] tabular-nums">{counts[id]}</span> : null}
    </button>
  ));

  return (
    <div ref={root} data-testid="agents-builder" className="relative">
      <div className={narrow ? 'flex flex-col gap-3' : 'grid grid-cols-[160px_1fr] gap-4'}>
        <nav
          aria-label="Builder sections"
          className={narrow ? 'sticky top-0 z-10 flex gap-1 overflow-x-auto bg-background/95 py-1' : 'sticky top-0 flex flex-col gap-0.5 self-start'}
        >
          {indexItems}
        </nav>

        <form
          className="min-w-0 space-y-6 pb-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <section aria-labelledby="builder-h-identity" className="space-y-3">
            <h2
              id="builder-h-identity"
              tabIndex={-1}
              ref={(el) => {
                headings.current.identity = el;
              }}
              className={sectionHeading}
            >
              Identity
            </h2>
            <Field id="builder-name" label="Name" info={FIELD_INFO.name} error={fieldError('name')}>
              <input
                ref={nameInput}
                id="builder-name"
                data-testid="builder-name"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                className={controlClass(Boolean(errors['name']))}
                {...err('name')}
              />
            </Field>
            <Field id="builder-description" label="Description" info={FIELD_INFO.description} error={fieldError('description')}>
              <input
                id="builder-description"
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
                className={controlClass(Boolean(errors['description']))}
                {...err('description')}
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 min-[720px]:grid-cols-2">
              <Field id="builder-accent" label="Colour" info={FIELD_INFO.accent} error={fieldError('accent')}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Colour picker"
                    value={accentValid ? draft.accent : '#000000'}
                    onChange={(e) => patch({ accent: e.target.value })}
                    className={`h-7 w-9 shrink-0 cursor-pointer rounded border border-input bg-background p-0.5 ${FOCUS_RING}`}
                  />
                  <input
                    id="builder-accent"
                    value={draft.accent}
                    onChange={(e) => patch({ accent: e.target.value })}
                    className={`${controlClass(Boolean(errors['accent']))} font-mono`}
                    {...err('accent')}
                  />
                </div>
              </Field>
              <Field id="builder-icon" label="Icon" info={FIELD_INFO.icon}>
                <div className="flex items-center gap-2">
                  <PreviewIcon aria-hidden className="h-4 w-4 shrink-0" style={{ color: accentValid ? draft.accent : undefined }} />
                  <select
                    id="builder-icon"
                    value={draft.icon ?? ''}
                    onChange={(e) => patch(e.target.value === '' ? { icon: undefined } : { icon: e.target.value })}
                    className={controlClass(false)}
                  >
                    <option value="">Same as base CLI</option>
                    {agents.map((a) => (
                      <option key={a.id} value={iconKey(a)}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
            </div>
          </section>

          <section aria-labelledby="builder-h-base" className="space-y-3">
            <h2
              id="builder-h-base"
              tabIndex={-1}
              ref={(el) => {
                headings.current.base = el;
              }}
              className={sectionHeading}
            >
              Base
            </h2>
            <div className="grid grid-cols-1 gap-3 min-[720px]:grid-cols-2">
              <Field id="builder-base" label="Base CLI" info={FIELD_INFO.baseAgent}>
                <select
                  id="builder-base"
                  value={draft.baseAgentId}
                  onChange={(e) => {
                    baseChanged.current = true;
                    setModelNote('');
                    patch({ baseAgentId: e.target.value });
                  }}
                  className={controlClass(false)}
                >
                  {!agents.some((a) => a.id === draft.baseAgentId) ? <option value={draft.baseAgentId}>{draft.baseAgentId} (not in roster)</option> : null}
                  {rosterOrdered.map((a) => {
                    const installed = installedIds.has(a.id);
                    return (
                      <option key={a.id} value={a.id} disabled={!installed && a.id !== draft.baseAgentId}>
                        {installed ? a.label : `${a.label} (not installed${a.install ? `: ${a.install}` : ''})`}
                      </option>
                    );
                  })}
                </select>
              </Field>
              <Field id="builder-model" label="Model" info={FIELD_INFO.model}>
                <select id="builder-model" value={draft.model} onChange={(e) => patch({ model: e.target.value })} className={controlClass(false)}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  {!models.some((m) => m.id === draft.model) ? <option value={draft.model}>{draft.model} (not offered)</option> : null}
                </select>
              </Field>
            </div>
            <p aria-live="polite" className="text-[11px] text-muted-foreground" data-testid="model-note">
              {modelNote}
            </p>
          </section>

          <section aria-labelledby="builder-h-prompt" className="space-y-3">
            <h2
              id="builder-h-prompt"
              tabIndex={-1}
              ref={(el) => {
                headings.current.prompt = el;
              }}
              className={sectionHeading}
            >
              System prompt
            </h2>
            <Field id="builder-prompt" label="System prompt" info={FIELD_INFO.systemPrompt} error={fieldError('systemPrompt')}>
              <textarea
                id="builder-prompt"
                data-testid="builder-prompt"
                rows={8}
                value={draft.systemPrompt}
                onChange={(e) => patch({ systemPrompt: e.target.value })}
                className={`${controlClass(Boolean(errors['systemPrompt']))} resize-y`}
                {...err('systemPrompt')}
              />
              <div className="flex items-start justify-between gap-2">
                <Note warning={delivery === 'none'}>
                  <span data-testid="delivery-line">{deliveryLine}</span>
                </Note>
                <Counter n={draft.systemPrompt.length} max={PROMPT_MAX} />
              </div>
            </Field>
          </section>

          <section aria-labelledby="builder-h-tools" className="space-y-3">
            <h2
              id="builder-h-tools"
              tabIndex={-1}
              ref={(el) => {
                headings.current.tools = el;
              }}
              className={sectionHeading}
            >
              Tools
            </h2>
            <Field id="builder-restrict" label="Restrict midnite tools" info={FIELD_INFO.restrictTools}>
              <input
                id="builder-restrict"
                type="checkbox"
                role="switch"
                checked={restricted}
                onChange={(e) => {
                  if (e.target.checked) patch({ mcpTools: toolsMemo.current });
                  else {
                    toolsMemo.current = draft.mcpTools ?? [];
                    patch({ mcpTools: null });
                  }
                }}
                className={`h-4 w-4 accent-[hsl(var(--primary))] ${FOCUS_RING}`}
              />
              {restricted && draft.mcpTools?.length === 0 ? <Note>This agent can't use any midnite tools.</Note> : null}
              {!enforcement.tools ? (
                <Note warning>{`${baseLabel} can't be restricted to these tools yet; the list is saved for when it can.`}</Note>
              ) : restricted ? (
                <Note>Sessions of this agent see only these midnite tools, and no other MCP servers you have set up.</Note>
              ) : null}
            </Field>
            <Field id="builder-tools" label="Allowed tools" info={FIELD_INFO.mcpTools}>
              <Checklist
                label="Tools"
                items={toolItems}
                selected={draft.mcpTools ?? []}
                onChange={(next) => patch({ mcpTools: next })}
                disabled={!restricted}
              />
            </Field>
          </section>

          <section aria-labelledby="builder-h-skills" className="space-y-3">
            <h2
              id="builder-h-skills"
              tabIndex={-1}
              ref={(el) => {
                headings.current.skills = el;
              }}
              className={sectionHeading}
            >
              Skills
            </h2>
            <Field id="builder-skills" label="Skills" info={FIELD_INFO.skills}>
              {skillsState.loading ? (
                <p className="text-xs text-muted-foreground">Loading skills…</p>
              ) : skillsState.error !== null ? (
                <p className="text-xs text-destructive">{`Couldn't list skills: ${skillsState.error}`}</p>
              ) : skillItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">{`No skills found for ${baseLabel}.`}</p>
              ) : (
                <Checklist label="Skills" items={skillItems} selected={draft.skills} onChange={(next) => patch({ skills: next })} />
              )}
              <Note>Skills are suggested in the prompt, not enforced.</Note>
            </Field>
          </section>

          <section aria-labelledby="builder-h-limits" className="space-y-3">
            <h2
              id="builder-h-limits"
              tabIndex={-1}
              ref={(el) => {
                headings.current.limits = el;
              }}
              className={sectionHeading}
            >
              Limits
            </h2>
            {AGENT_LIMIT_KEYS.map((key) => {
              const value = draft.limits[key];
              const noCap = key === 'spendTokensPerSession' && value === null;
              return (
                <Field key={key} id={`builder-${key}`} label={limitLabel(key)} info={FIELD_INFO[key]} error={fieldError(key)}>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id={`builder-${key}`}
                      type="number"
                      min={1}
                      step={1}
                      disabled={noCap}
                      value={noCap || value == null ? '' : value}
                      placeholder={noCap ? 'No cap' : String(DEFAULT_AGENT_LIMITS[key] ?? '')}
                      onChange={(e) => setLimit(key, e.target.value)}
                      className={`${controlClass(Boolean(errors[key]))} max-w-[10rem]`}
                      {...err(key)}
                    />
                    {key === 'spendTokensPerSession' ? (
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={noCap}
                          onChange={(e) => {
                            const limits = { ...draft.limits };
                            if (e.target.checked) limits.spendTokensPerSession = null;
                            else delete limits.spendTokensPerSession;
                            patch({ limits });
                          }}
                          className={`accent-[hsl(var(--primary))] ${FOCUS_RING}`}
                        />
                        No cap
                      </label>
                    ) : null}
                    {key === 'toolCallsPerMinute' && !enforcement.toolCallLimit ? (
                      <span className="text-[11px] text-muted-foreground">{`Not enforced for ${baseLabel}`}</span>
                    ) : null}
                  </div>
                </Field>
              );
            })}
            <Note>Empty means the repo's limit applies.</Note>
          </section>

          <section aria-labelledby="builder-h-blueprint" className="space-y-3">
            <h2
              id="builder-h-blueprint"
              tabIndex={-1}
              ref={(el) => {
                headings.current.blueprint = el;
              }}
              className={`${sectionHeading} flex items-center gap-1`}
            >
              Blueprint
            </h2>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {FIELD_INFO.blueprint}
            </p>
            <BlueprintEditor value={draft.blueprint} onChange={(blueprint) => patch({ blueprint })} compact={narrow} />
          </section>
        </form>
      </div>

      {notice ? (
        <div role="status" className="mb-2 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
          <LuInfo aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">Saved. Running sessions keep their model, prompt and tools until relaunched; limits apply within a few seconds.</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(false)} className={`rounded ${FOCUS_RING}`}>
            <LuX aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div
        ref={footer}
        data-testid="builder-footer"
        className="sticky bottom-0 z-[2] flex items-center gap-2 border-t border-border bg-background/95 px-1 py-2 backdrop-blur-sm"
      >
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite" data-testid="builder-status">
          {save.isPending ? (
            <>
              <LuLoaderCircle aria-hidden className="h-3 w-3 animate-spin motion-reduce:animate-none" />
              Saving…
            </>
          ) : dirty ? (
            <>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
              Unsaved changes
            </>
          ) : justSaved ? (
            <span className="flex items-center gap-1.5 text-success">
              <LuCheck aria-hidden className="h-3.5 w-3.5" />
              Saved
            </span>
          ) : stored === null ? (
            'This agent is not saved yet.'
          ) : null}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" className={SECONDARY_BUTTON} onClick={onDiscard} disabled={save.isPending || (stored !== null && !dirty)}>
            Discard
          </button>
          <button type="button" data-testid="builder-save" className={`${PRIMARY_BUTTON} disabled:opacity-40`} onClick={onSave} disabled={!canSave || save.isPending}>
            Save
          </button>
        </span>
      </div>

      <FrameModal open={conflict !== null} onClose={() => setConflict(null)} title="This agent changed elsewhere." size="sm" role="alertdialog">
        <div className="space-y-3 p-4 text-xs">
          <h2 className="text-sm font-semibold">This agent changed elsewhere.</h2>
          <p>
            Another window saved a different version of {draft.name}. Reload to take that version and lose your edits, or Overwrite to
            save yours over it.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={SECONDARY_BUTTON}
              onClick={() => {
                if (!conflict) return;
                setStored(conflict.current);
                setDraft(conflict.current);
                setErrors({});
                setConflict(null);
              }}
            >
              Reload
            </button>
            <button type="button" className={PRIMARY_BUTTON} onClick={() => conflict && void send(conflict.attempt, conflict.current.updatedAt)}>
              Overwrite
            </button>
          </div>
        </div>
      </FrameModal>
    </div>
  );
}
