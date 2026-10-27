/**
 * Custom loops — the FAB panel's user-authored tabs, beside the six built-ins.
 *
 * A custom loop IS a {@link LoopDefinition}: the schema below extends
 * `LoopDefinitionSchema` rather than standing beside it, so every consumer of
 * a loop — `composeLoopPrompt`, `useLoopSession`, the run ledger — takes one
 * unchanged. What it adds is only what a hand-built loop needs and a shipped
 * one does not:
 *
 * - **`sections`** — the named accordions above Model/Schedule. A built-in's
 *   sections are the three fixed {@link LOOP_GROUPS}; a custom loop's are
 *   whatever its author names, so each option carries a `section` id. The
 *   option's `group` still decides where its fragment lands in the composed
 *   line, which is why an option copied from a built-in keeps its own.
 * - **`hue`** — the loop's colour, as the anchor of a 120° arc of the app's
 *   rainbow. The renderer samples that arc into the same five `--fab-spec-*`
 *   stops the built-ins declare in `styles.css`; a built-in's palette pick is
 *   just its own anchor.
 * - **`fallbackPrompt`** is the base prompt, editable in place. A custom loop's
 *   `agentCommandId` is its own id, which names no entry in the renderer's
 *   `agentSkills` registry, so the fallback is always what runs.
 *
 * The run-wide switches ({@link COMMON_RUN_MODIFIERS}) and the autonomy radio
 * ({@link AUTONOMY_CHOICE}) carry no `section`: they are the shared Run section
 * every loop has, and a custom loop cannot restructure it.
 *
 * Persisted app-wide in the renderer's ui-store (never written into a repo),
 * so everything here is pure data in, data out.
 */
import { z } from 'zod';

import {
  AUTONOMY_CHOICE,
  COMMON_RUN_MODIFIERS,
  LOOP_GROUPS,
  LoopChoiceSchema,
  LoopDefinitionSchema,
  LoopModifierSchema,
  type LoopDefinition,
  type LoopGroup,
} from './loops';

/** Every custom loop id starts with this, so it can never collide with a built-in's. */
export const CUSTOM_LOOP_ID_PREFIX = 'custom-';

/**
 * The icon tokens a custom loop may wear — exactly the set the built-ins use,
 * resolved by the renderer's `loopIcon` map like theirs.
 */
export const CUSTOM_LOOP_ICONS = ['guard', 'brain', 'bot', 'watchdog', 'medic', 'overhaul'] as const;

/**
 * The tab glyph's colour class. One class for every custom loop: it reads the
 * loop's own `--fab-spec-3`, which the renderer sets inline from `hue`, so a
 * hue change recolours the tab with no class to regenerate. The literal is
 * repeated in the renderer's source, where Tailwind scans for it.
 */
export const CUSTOM_LOOP_COLOR = 'text-[rgb(var(--fab-spec-3))]' as const;

/**
 * Each built-in's anchor hue — the centre of the arc its `--fab-spec-*` stops
 * are sampled from (`styles.css`). The palette picker's presets.
 */
export const LOOP_SPECTRUM_HUES: Readonly<Record<string, number>> = {
  guard: 120,
  innovate: 150,
  automate: 180,
  watchdog: 240,
  medic: 0,
  overhaul: 30,
};

/** A blank loop's hue: violet-to-pink, the one stretch no built-in is centred on. */
export const DEFAULT_CUSTOM_LOOP_HUE = 270;

export const CustomLoopSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
});
export type CustomLoopSection = z.infer<typeof CustomLoopSectionSchema>;

/** A {@link LoopModifierSchema} that also says which custom section it sits in. */
export const CustomLoopModifierSchema = LoopModifierSchema.extend({
  /**
   * Absent on the shared Run switches. The authoring fields are relaxed to
   * allow an empty string while the author is still typing — an option with
   * an empty fragment simply contributes nothing (see {@link customLoopForRun}).
   */
  section: z.string().min(1).optional(),
  label: z.string(),
  promptFragment: z.string(),
});
export type CustomLoopModifier = z.infer<typeof CustomLoopModifierSchema>;

/** A radio group copied from a built-in. Editable only by removal. */
export const CustomLoopChoiceSchema = LoopChoiceSchema.extend({
  section: z.string().min(1).optional(),
});
export type CustomLoopChoice = z.infer<typeof CustomLoopChoiceSchema>;

export const CustomLoopSchema = LoopDefinitionSchema.extend({
  id: z.string().startsWith(CUSTOM_LOOP_ID_PREFIX),
  custom: z.literal(true),
  /** May be empty while being written; the tab falls back to "Untitled loop". */
  label: z.string(),
  /** The base prompt. May be empty — the options alone can carry the task. */
  fallbackPrompt: z.string(),
  /** 0–359: the centre of the loop's arc of the rainbow. */
  hue: z.number().min(0).max(360),
  sections: z.array(CustomLoopSectionSchema),
  modifiers: z.array(CustomLoopModifierSchema),
  choices: z.array(CustomLoopChoiceSchema).default([]),
  createdAt: z.number().int().nonnegative(),
});
export type CustomLoop = z.infer<typeof CustomLoopSchema>;

export const CustomLoopListSchema = z.array(CustomLoopSchema);

export function isCustomLoopId(id: string): boolean {
  return id.startsWith(CUSTOM_LOOP_ID_PREFIX);
}

export function isCustomLoop(loop: LoopDefinition): loop is CustomLoop {
  return (loop as Partial<CustomLoop>).custom === true;
}

/**
 * Parse a persisted list, keeping every entry that is still a valid loop and
 * dropping the rest — one hand-edited or truncated row must not cost the user
 * every other loop they built.
 */
export function parseCustomLoops(raw: unknown): CustomLoop[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomLoop[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const parsed = CustomLoopSchema.safeParse(entry);
    if (parsed.success && !seen.has(parsed.data.id)) {
      seen.add(parsed.data.id);
      out.push(parsed.data);
    }
  }
  return out;
}

/** Makes ids. Injected so tests are deterministic. */
export type IdFactory = (kind: 'loop' | 'section' | 'option') => string;

export const defaultIdFactory: IdFactory = (kind) => {
  const rand = Math.random().toString(36).slice(2, 8);
  const stamp = Date.now().toString(36);
  return kind === 'loop' ? `${CUSTOM_LOOP_ID_PREFIX}${stamp}${rand}` : `${kind}-${stamp}${rand}`;
};

/** The shared Run section, as data: switches and the autonomy radio, no `section`. */
function sharedRunControls(): Pick<CustomLoop, 'modifiers' | 'choices'> {
  return {
    modifiers: COMMON_RUN_MODIFIERS.map((m) => ({ ...m })),
    choices: [{ ...AUTONOMY_CHOICE, options: AUTONOMY_CHOICE.options.map((o) => ({ ...o })) }],
  };
}

/**
 * A blank loop: one empty "Tasks" section, a bare `/loop` base, the shared
 * Run controls. `color` is the one class every custom loop shares.
 */
export function createBlankCustomLoop(ids: IdFactory = defaultIdFactory, now = Date.now()): CustomLoop {
  const id = ids('loop');
  const shared = sharedRunControls();
  return {
    id,
    custom: true,
    label: 'New loop',
    icon: 'bot',
    color: CUSTOM_LOOP_COLOR,
    agentId: 'claude',
    agentCommandId: id,
    fallbackPrompt: '/loop',
    requiresModifier: false,
    reviewsPrs: false,
    hue: DEFAULT_CUSTOM_LOOP_HUE,
    sections: [{ id: ids('section'), label: 'Tasks' }],
    modifiers: shared.modifiers,
    choices: shared.choices,
    createdAt: now,
  };
}

/** What a duplicated built-in's run-group options are filed under. */
const DUPLICATE_SECTION_LABELS: Record<LoopGroup, string> = {
  tasks: 'Tasks',
  scope: 'Scope',
  run: 'Policies',
};

const COMMON_RUN_IDS = new Set(COMMON_RUN_MODIFIERS.map((m) => m.id));

/**
 * An editable custom copy of a built-in: its base prompt (as resolved by the
 * caller, so a Settings ▸ Agent edit is what gets copied), icon, hue and every
 * option of its own, filed into one section per group it uses. The run-wide
 * switches and the autonomy radio stay in the shared Run section; every other
 * radio group is copied into the section of its own group.
 *
 * Option ids are kept — they are unique within the source loop, and keeping
 * them keeps `providesTask`/`skillTemplate` pairings legible — but the loop
 * gets a fresh id, so none of the source's per-loop state (checks, skills,
 * sessions) is shared with the copy.
 */
export function duplicateLoopAsCustom(
  source: LoopDefinition,
  basePrompt: string,
  ids: IdFactory = defaultIdFactory,
  now = Date.now(),
): CustomLoop {
  const id = ids('loop');
  const own = source.modifiers.filter((m) => !COMMON_RUN_IDS.has(m.id));
  const ownChoices = source.choices.filter((c) => c.id !== AUTONOMY_CHOICE.id);
  const sections: CustomLoopSection[] = [];
  const sectionFor = new Map<LoopGroup, string>();
  for (const group of LOOP_GROUPS) {
    const used =
      own.some((m) => m.group === group.id) || ownChoices.some((c) => c.group === group.id);
    if (!used) continue;
    const sectionId = ids('section');
    sectionFor.set(group.id, sectionId);
    sections.push({ id: sectionId, label: DUPLICATE_SECTION_LABELS[group.id] });
  }
  if (sections.length === 0) sections.push({ id: ids('section'), label: 'Tasks' });
  const shared = sharedRunControls();

  return {
    id,
    custom: true,
    label: `${source.label} copy`,
    icon: source.icon,
    color: CUSTOM_LOOP_COLOR,
    agentId: source.agentId,
    agentCommandId: id,
    fallbackPrompt: basePrompt,
    // A custom loop's Start is gated on its own base and options instead —
    // see `customLoopNeedsOption`.
    requiresModifier: false,
    reviewsPrs: source.reviewsPrs,
    hue: LOOP_SPECTRUM_HUES[source.id] ?? DEFAULT_CUSTOM_LOOP_HUE,
    sections,
    modifiers: [
      ...own.map((m) => ({ ...m, section: sectionFor.get(m.group) ?? sections[0]!.id })),
      ...shared.modifiers,
    ],
    choices: [
      ...ownChoices.map((c) => ({
        ...c,
        options: c.options.map((o) => ({ ...o })),
        section: sectionFor.get(c.group) ?? sections[0]!.id,
      })),
      ...shared.choices,
    ],
    createdAt: now,
  };
}

/**
 * Swap a loop's content for a fresh start (blank or a duplicate) while
 * keeping its identity — the "Start from" picker on a just-created loop.
 */
export function restartCustomLoop(current: CustomLoop, template: CustomLoop): CustomLoop {
  return { ...template, id: current.id, agentCommandId: current.id, createdAt: current.createdAt };
}

/**
 * The base names nothing to do on its own (empty, or a bare `/loop`), so a run
 * with no option on would tell the agent nothing — Start waits for one. The
 * custom-loop counterpart of a built-in's declared `requiresModifier`.
 */
export function customLoopNeedsOption(loop: CustomLoop): boolean {
  return loop.fallbackPrompt.trim().replace(/^\/loop(?=\s|$)\s*/, '').length === 0;
}

/**
 * The loop as `composeLoopPrompt` should see it: options with no fragment yet
 * (an author mid-edit) dropped, so a half-written option can never put an
 * empty string or a stray space on the line.
 */
export function customLoopForRun(loop: CustomLoop): CustomLoop {
  return { ...loop, modifiers: loop.modifiers.filter((m) => m.promptFragment.trim().length > 0) };
}

// ── Structural edits — pure, so the store and its tests share one definition.

export function addCustomSection(loop: CustomLoop, label: string, ids: IdFactory = defaultIdFactory): CustomLoop {
  return { ...loop, sections: [...loop.sections, { id: ids('section'), label }] };
}

export function renameCustomSection(loop: CustomLoop, sectionId: string, label: string): CustomLoop {
  return {
    ...loop,
    sections: loop.sections.map((s) => (s.id === sectionId ? { ...s, label } : s)),
  };
}

/**
 * Move a section one place up (`-1`) or down (`+1`). The options are reordered
 * with it, so declaration order — which is the composed line's order within a
 * group — follows what the author sees.
 */
export function moveCustomSection(loop: CustomLoop, sectionId: string, delta: -1 | 1): CustomLoop {
  const from = loop.sections.findIndex((s) => s.id === sectionId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= loop.sections.length) return loop;
  const sections = [...loop.sections];
  [sections[from], sections[to]] = [sections[to]!, sections[from]!];
  const order = new Map(sections.map((s, i) => [s.id, i]));
  const rank = (section: string | undefined) =>
    section === undefined ? sections.length : (order.get(section) ?? sections.length);
  const modifiers = [...loop.modifiers].sort((a, b) => rank(a.section) - rank(b.section));
  return { ...loop, sections, modifiers };
}

/** Remove a section and every option and radio group in it. */
export function removeCustomSection(loop: CustomLoop, sectionId: string): CustomLoop {
  return {
    ...loop,
    sections: loop.sections.filter((s) => s.id !== sectionId),
    modifiers: loop.modifiers.filter((m) => m.section !== sectionId),
    choices: loop.choices.filter((c) => c.section !== sectionId),
  };
}

/** A fresh switch option at the end of a section — off, in the Tasks group. */
export function addCustomOption(
  loop: CustomLoop,
  sectionId: string,
  ids: IdFactory = defaultIdFactory,
): CustomLoop {
  const option: CustomLoopModifier = {
    id: ids('option'),
    label: 'New option',
    promptFragment: '',
    group: 'tasks',
    control: 'checkbox',
    defaultOn: false,
    section: sectionId,
  };
  // After the section's last option, so declaration order matches the screen.
  let at = -1;
  loop.modifiers.forEach((m, i) => {
    if (m.section === sectionId) at = i;
  });
  if (at < 0) {
    const sectionIndex = loop.sections.findIndex((s) => s.id === sectionId);
    loop.modifiers.forEach((m, i) => {
      const idx = loop.sections.findIndex((s) => s.id === m.section);
      if (idx >= 0 && idx < sectionIndex) at = i;
    });
  }
  const modifiers = [...loop.modifiers];
  modifiers.splice(at + 1, 0, option);
  return { ...loop, modifiers };
}

/** The editable fields of a custom option. */
export type CustomOptionPatch = Partial<
  Pick<CustomLoopModifier, 'label' | 'description' | 'promptFragment' | 'skillTemplate' | 'defaultSkill' | 'defaultOn'>
>;

/**
 * Patch one option. An empty description, default skill or skill template is
 * stored as absent; a skill template without its `{skill}` slot is dropped
 * rather than stored, because the schema (and so the next load) would reject
 * the whole loop over it.
 */
export function updateCustomOption(loop: CustomLoop, optionId: string, patch: CustomOptionPatch): CustomLoop {
  return {
    ...loop,
    modifiers: loop.modifiers.map((m) => {
      if (m.id !== optionId || m.section === undefined) return m;
      const next: CustomLoopModifier = { ...m, ...patch };
      for (const key of ['description', 'defaultSkill', 'skillTemplate'] as const) {
        if (key in patch && (patch[key] === undefined || patch[key]!.trim().length === 0)) delete next[key];
      }
      if (next.skillTemplate !== undefined && !next.skillTemplate.includes('{skill}')) delete next.skillTemplate;
      return next;
    }),
  };
}

export function removeCustomOption(loop: CustomLoop, optionId: string): CustomLoop {
  return { ...loop, modifiers: loop.modifiers.filter((m) => m.id !== optionId || m.section === undefined) };
}

export function removeCustomChoice(loop: CustomLoop, choiceId: string): CustomLoop {
  return { ...loop, choices: loop.choices.filter((c) => c.id !== choiceId || c.section === undefined) };
}
