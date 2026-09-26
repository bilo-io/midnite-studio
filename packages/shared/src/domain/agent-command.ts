/**
 * `AgentCommandId`/`AGENT_COMMAND_IDS` — the verbs the sidebar's midnite menu
 * offers, grouped into the menu's three categories: agent tasks, release
 * tasks, then loops. Moved here from `packages/app/src/store/ui-store.ts`
 * (Phase 94 Theme A) by the exact manoeuvre
 * [Phase 81](../../../.midnite/tasks/phases/phase-81-where-the-companion-can-take-you.md)
 * Theme A used for `ViewId`/`SettingsPageId` (`view.ts`): `shared` needs the
 * id to declare `AgentRunSchema`'s `skillId` field as a closed `z.enum`
 * (`agent-run.ts`), and `shared` cannot import `app`.
 *
 * Declared array-first with `as const`, `ViewId`-style, so `AgentCommandId`
 * is a literal tuple `z.enum` can be built over directly rather than a
 * hand-written union kept in sync with a separately-annotated array.
 *
 * **The id list only.** Labels, icons and the default skill-command strings
 * are UI copy and stay in `app` — `features/agent/agent-commands.ts` owns the
 * menu's labels/icons, and `ui-store.ts` keeps `DEFAULT_AGENT_SKILLS: Record<
 * AgentCommandId, string>`. `ui-store.ts` re-exports this type and this array
 * so no existing `import type { AgentCommandId } from '../store/ui-store'`
 * (or `AGENT_COMMAND_IDS`) call site has to move.
 */
export const AGENT_COMMAND_IDS = [
  'execBacklog',
  'execAdhoc',
  'addressIssue',
  'brainstorm',
  'refine',
  'execSwarm',
  'prReview',
  'prFeedback',
  'triage',
  'releasePrep',
  'releaseComplete',
  'gitReport',
  'gitCleanup',
  'loopGuard',
  'loopPatrol',
  'loopPrReview',
  'loopPrFeedback',
  'loopExecBacklog',
  'loopExecAdhoc',
  'loopAddressIssue',
  'loopBrainstorm',
  'loopOverhaul',
] as const;
export type AgentCommandId = (typeof AGENT_COMMAND_IDS)[number];
