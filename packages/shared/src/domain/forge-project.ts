import { z } from 'zod';

import { ForgeCliStatusSchema, ForgeIssueStateSchema, ForgePullStateSchema } from './forge';

/**
 * GitHub Projects (ProjectV2), read and lightly written through the same `gh`
 * CLI escape hatch as everything else in `forge.ts`.
 *
 * Its own module rather than a section appended to `forge.ts` (already ~750
 * lines) because ProjectV2 is GraphQL-only and a genuinely distinct API: no
 * REST endpoint answers any of these shapes, and nothing here reuses a
 * `ForgeRun`/`ForgePull`/`ForgeIssue` field beyond the two enums a project
 * item's content borrows below. Phase 40 (Theme A) lands this contract;
 * `gh-project.ts` (Theme B) is the only thing that ever produces one of these
 * from a real API response.
 */

/** One ProjectV2 board attached to a repository's owner. */
export const ForgeProjectSchema = z.object({
  /** The GraphQL node id — every field/item read and every write takes this. */
  id: z.string(),
  /** The board's number within its owner, e.g. the `7` in `.../projects/7`. */
  number: z.number().int().positive(),
  title: z.string(),
  /** The board's page on the forge. Always https; opened through `shell.openExternal`. */
  url: z.string(),
  /** A closed board still reads; it just does not accept new items. */
  closed: z.boolean().default(false),
});
export type ForgeProject = z.infer<typeof ForgeProjectSchema>;

/** One option of a `single_select` field, with the colour GitHub assigned it. */
export const ForgeProjectFieldOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** GitHub's own colour name (`BLUE`, `GREEN`, …), kept as sent. Empty when withheld. */
  color: z.string().default(''),
});
export type ForgeProjectFieldOption = z.infer<typeof ForgeProjectFieldOptionSchema>;

/**
 * One custom field on a board, discriminated on `dataType`.
 *
 * A union rather than one shape with an optional `options` array for the same
 * reason `ForgeProjectItemContent` is a union below: `options` only ever
 * exists on `single_select`, and a shape that offers it everywhere is a shape
 * the renderer has to guard against on every other field type. `iteration` is
 * a member so a board that has one still loads — see the phase doc — but it
 * carries nothing beyond identity: Theme E's writes only ever target
 * `text`/`number`/`date`/`single_select`, and an iteration field is read-only
 * in this app for the whole of the MVP.
 */
export const ForgeProjectFieldSchema = z.discriminatedUnion('dataType', [
  z.object({ id: z.string(), name: z.string(), dataType: z.literal('text') }),
  z.object({ id: z.string(), name: z.string(), dataType: z.literal('number') }),
  z.object({ id: z.string(), name: z.string(), dataType: z.literal('date') }),
  z.object({
    id: z.string(),
    name: z.string(),
    dataType: z.literal('single_select'),
    options: z.array(ForgeProjectFieldOptionSchema).default([]),
  }),
  z.object({ id: z.string(), name: z.string(), dataType: z.literal('iteration') }),
]);
export type ForgeProjectField = z.infer<typeof ForgeProjectFieldSchema>;

/**
 * One item's value for one field, discriminated on `dataType` the same way
 * `ForgeProjectField` is.
 *
 * This is the whole reason the union exists at all. GraphQL's
 * `fieldValues.nodes[]` comes back as a heterogeneous list of
 * `ProjectV2ItemFieldTextValue` / `…NumberValue` / `…DateValue` /
 * `…SingleSelectValue` / `…IterationValue`, each shaped differently and
 * distinguishable only by its `__typename`. `gh-project.ts` (Theme B) flattens
 * that list into a `Record<fieldId, ForgeProjectFieldValue>` keyed by field id
 * — this schema is what each entry of that record validates against.
 *
 * **Deliberately independent of `ForgeProjectField.options`.** A
 * `single_select` value carries the option id and name *as they were when the
 * item was set*, not a live reference into the field's current option list.
 * GitHub lets a board's options be renamed or deleted after items already
 * point at them, and a value schema that cross-checked against today's option
 * list would fail to parse the moment that happens — turning a routine board
 * edit on github.com into a broken cell in this app. See the round-trip test
 * for the case this note exists to cover.
 */
export const ForgeProjectFieldValueSchema = z.discriminatedUnion('dataType', [
  z.object({ fieldId: z.string(), dataType: z.literal('text'), text: z.string() }),
  z.object({ fieldId: z.string(), dataType: z.literal('number'), number: z.number() }),
  /** GitHub's date-only string, e.g. `2024-06-01` — no time component. */
  z.object({ fieldId: z.string(), dataType: z.literal('date'), date: z.string() }),
  z.object({
    fieldId: z.string(),
    dataType: z.literal('single_select'),
    optionId: z.string(),
    /** The option's name at set-time — see the schema's own note above. */
    name: z.string().default(''),
  }),
  z.object({
    fieldId: z.string(),
    dataType: z.literal('iteration'),
    iterationId: z.string(),
    title: z.string().default(''),
  }),
]);
export type ForgeProjectFieldValue = z.infer<typeof ForgeProjectFieldValueSchema>;

/**
 * What a project item actually is, discriminated on `type`.
 *
 * A union rather than one shape with optional `number`/`url` fields, and this
 * is the one Theme A rule that most bites if skipped: a draft item is text
 * typed straight into a board with no issue or PR behind it, so it has
 * neither. Folding all three into one shape with `number: number | null` would
 * let a renderer build `<a href={\`.../issues/${number}\`}>` for a draft whose
 * `number` is null and ship a link to `/issues/null` — the union makes that
 * construction impossible instead of merely unlikely.
 */
export const ForgeProjectItemContentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('issue'),
    /** The issue's own GraphQL node id — what `addProjectV2ItemById` takes. */
    id: z.string(),
    number: z.number().int().positive(),
    title: z.string(),
    url: z.string(),
    state: ForgeIssueStateSchema,
    /** Logins, in the order the forge listed them. Empty means unassigned. */
    assignees: z.array(z.string()).default([]),
  }),
  z.object({
    type: z.literal('pull'),
    id: z.string(),
    number: z.number().int().positive(),
    title: z.string(),
    url: z.string(),
    state: ForgePullStateSchema,
    assignees: z.array(z.string()).default([]),
  }),
  z.object({
    type: z.literal('draft'),
    /** The draft's own node id — still needed to target a field write at it. */
    id: z.string(),
    title: z.string(),
    assignees: z.array(z.string()).default([]),
  }),
]);
export type ForgeProjectItemContent = z.infer<typeof ForgeProjectItemContentSchema>;

/** One row of a board: its content, plus its current value for every field. */
export const ForgeProjectItemSchema = z.object({
  /** The `ProjectV2Item` node id — distinct from `content.id`, and what
   *  `updateProjectV2ItemFieldValue` targets. */
  id: z.string(),
  content: ForgeProjectItemContentSchema,
  /**
   * Keyed by `ForgeProjectField.id`. A field the item has never been set for
   * simply has no entry — never a placeholder value — so the table can tell
   * "empty" from "unset" without a sentinel.
   */
  fieldValues: z.record(z.string(), ForgeProjectFieldValueSchema).default({}),
});
export type ForgeProjectItem = z.infer<typeof ForgeProjectItemSchema>;

/**
 * A project listing that is allowed to come back empty-handed.
 *
 * Same envelope shape as `ForgeRunsResult`/`ForgePullsResult` in `forge.ts`:
 * "no boards yet" and "gh could not be reached" have to stay different
 * answers, so an empty array is never the only signal of failure.
 */
export const ForgeProjectsResultSchema = z.object({
  cli: ForgeCliStatusSchema,
  projects: z.array(ForgeProjectSchema).default([]),
  error: z.string().nullable().default(null),
});
export type ForgeProjectsResult = z.infer<typeof ForgeProjectsResultSchema>;

/** A board's field definitions. */
export const ForgeProjectFieldsResultSchema = z.object({
  cli: ForgeCliStatusSchema,
  fields: z.array(ForgeProjectFieldSchema).default([]),
  error: z.string().nullable().default(null),
});
export type ForgeProjectFieldsResult = z.infer<typeof ForgeProjectFieldsResultSchema>;

/**
 * One page of a board's items.
 *
 * `nextCursor` rather than a bare `hasNextPage` boolean: GraphQL pagination
 * takes the cursor itself, and a boolean-only answer would make the caller
 * remember it separately instead of just re-sending what it was handed.
 */
export const ForgeProjectItemsResultSchema = z.object({
  cli: ForgeCliStatusSchema,
  items: z.array(ForgeProjectItemSchema).default([]),
  /** Set when there is a further page; null once the last one has been read. */
  nextCursor: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
});
export type ForgeProjectItemsResult = z.infer<typeof ForgeProjectItemsResultSchema>;

/**
 * What a ProjectV2 write answers with.
 *
 * `ForgeWriteResult` (see `forge.ts`) is not enough on its own here: its
 * `cli.reason` distinguishes "gh not installed" from "gh not authenticated",
 * but a missing `project` OAuth scope is neither of those — `gh` is installed
 * and signed in, and every other forge call this app makes still succeeds.
 * Discriminating on `kind` — the same device `GitOpFailureSchema` uses in
 * `result.ts`, and the same reasoning `ForgeCliStatus` gives for its own
 * `reason` code — is what lets the Projects view (Theme D/F) render the exact
 * `gh auth refresh -s project` fix rather than a generic failure toast.
 */
export const ForgeProjectWriteResultSchema = z.discriminatedUnion('kind', [
  z.object({ ok: z.literal(true), kind: z.literal('ok') }),
  z.object({
    ok: z.literal(false),
    kind: z.literal('insufficient-scope'),
    /** The exact command that fixes it — shown verbatim and copyable in Theme F. */
    hint: z.string().default('gh auth refresh -s project'),
  }),
  z.object({
    ok: z.literal(false),
    kind: z.literal('error'),
    /** Human-readable, already mapped from `gh`'s stderr where recognised. */
    message: z.string(),
  }),
]);
export type ForgeProjectWriteResult = z.infer<typeof ForgeProjectWriteResultSchema>;
