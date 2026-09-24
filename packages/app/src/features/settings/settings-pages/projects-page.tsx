import { Accordion } from '@bilo-io/ui';
import { useState } from 'react';
import { LuBot, LuCheck, LuColumns3, LuCopy, LuGitFork, LuInfo, LuPlay, LuShieldAlert } from 'react-icons/lu';

import {
  AUTOMATE_CONCURRENCY_DEFAULT,
  AUTOMATE_CONCURRENCY_MAX,
  AUTOMATE_CONCURRENCY_MIN,
} from '@midnite/studio-shared';

import { DEFAULT_COLUMN_SKILLS, resolveColumnSkill } from '../../projects/board/board-derive';
import { SettingsSwitchRow } from '../../../components/form/settings-switch-row';
import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';
import { Field, TextField } from './controls';

/** How the fix is spelled — shown verbatim, matching `MissingScopeState` in `projects-view.tsx`. */
const SCOPE_FIX_COMMAND = 'gh auth refresh -s project';

/**
 * Projects (Phase 40 Theme F) — the scope-refresh instructions in one durable
 * place, plus what the view's own two limits mean, so a user does not have to
 * rediscover either mid-triage.
 *
 * No board picker here: which board a repo remembers is set by picking one in
 * the Projects view itself, one click away — a second control for the same
 * state here would be a second place to keep in sync with it.
 */
export function ProjectsPage() {
  const launchAndRunEnabled = useUiStore((s) => s.launchAndRunEnabled);
  const setLaunchAndRunEnabled = useUiStore((s) => s.setLaunchAndRunEnabled);
  const blockedByFieldName = useUiStore((s) => s.blockedByFieldName);
  const setBlockedByFieldName = useUiStore((s) => s.setBlockedByFieldName);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Launch and run" icon={<LuPlay className="h-4 w-4" />}>
        <div className="flex flex-col gap-4 p-3">
          <SettingsSwitchRow
            id="launch-and-run-enabled"
            label="Allow launch-and-run from a card"
            description="Reveals a second button beside Start on a card's composer, beside the existing type-but-don't-send default. Pressing it still shows a confirm dialog with the exact composed command first — this setting only removes the extra step of reaching the button, not the look-before-you-leap."
            on={launchAndRunEnabled}
            onToggle={(_id, next) => setLaunchAndRunEnabled(next)}
          />

          <div className="space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">Why this stays off by default</p>
            <p>
              A card's prompt is composed from an issue or PR's own title and body — remote text any
              contributor to the repository could have written, unlike a FAB loop's fixed,
              user-authored prompt. The confirm dialog names that source every time, on or off.
            </p>
          </div>
        </div>
      </Accordion>

      <Accordion title="Missing permission" icon={<LuShieldAlert className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-2 p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            ProjectV2 requires the <code>project</code> scope, which <code>gh auth login</code> does
            not grant by default. If the Projects view shows a missing-permission state, run this in
            a terminal and reopen it:
          </p>
          <ScopeFixCommand />
        </div>
      </Accordion>

      <Accordion title="How this works" icon={<LuInfo className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-3 p-3">
          <div>
            <p className="text-xs font-medium">Default board</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Each repository remembers the last board you picked in the Projects view and opens on
              it next time — set it there, not here.
            </p>
          </div>
          <div>
            <p className="text-xs font-medium">Item ceiling</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              A board loads its first 1,000 items. Past that, the view says so rather than silently
              dropping the rest.
            </p>
          </div>
        </div>
      </Accordion>

      <Accordion title="Dependency graph" icon={<LuGitFork className="h-4 w-4" />}>
        <div className="flex flex-col gap-3 p-3">
          <Field
            label="Blocked-by field name"
            hint={
              'The dependency graph (Phase 75) reads three sources for what blocks what: GitHub’s ' +
              'own blocked-by relation, an issue description it can parse, and a project field with ' +
              'this name (case-insensitive), checked for every item regardless of type. Clear it to ' +
              'disable the field layer entirely — the other two still run.'
            }
          >
            <TextField
              value={blockedByFieldName}
              onChange={setBlockedByFieldName}
              placeholder="Blocked by"
              label="Blocked-by field name"
              className="w-48"
            />
          </Field>
        </div>
      </Accordion>

      <Accordion title="Column → skill" icon={<LuColumns3 className="h-4 w-4" />}>
        <ColumnSkillMapSection />
      </Accordion>

      <Accordion title="Auto-mate" icon={<LuBot className="h-4 w-4" />}>
        <AutomateCapSection />
      </Accordion>
    </div>
  );
}

/**
 * Auto-mate's concurrency cap (Phase 95 Theme H) — 1 to 5, default 1, edited
 * per project for whichever board is open right now, the identical "no
 * picker here, follows the Projects view" rule `ColumnSkillMapSection`
 * above already follows. The on/off switch itself lives on the board's own
 * header toggle, not here — a setting a user reaches for mid-task belongs
 * where the task is, the same reasoning `ProjectsPage`'s own docblock gives
 * for the default-board memory staying out of this page too.
 */
function AutomateCapSection() {
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const projectBoardByRepo = useUiStore((s) => s.projectBoardByRepo);
  const projectId = selectedRepoId ? projectBoardByRepo[selectedRepoId] : undefined;
  const cap = useUiStore((s) => (projectId ? s.automateCapByProject[projectId] : undefined)) ?? AUTOMATE_CONCURRENCY_DEFAULT;
  const setAutomateCap = useUiStore((s) => s.setAutomateCap);
  // Read-only here — the on/off switch itself is `AutomateToggle` in the
  // board header, not this page (see the section's own docblock).
  const enabled = useUiStore((s) => (projectId ? (s.automateEnabledByProject[projectId] ?? false) : false));

  if (!projectId) {
    return (
      <p className="p-3 text-[11px] leading-relaxed text-muted-foreground">
        No project board is open yet — like the column → skill map above, the cap is edited per
        project, for whichever board is currently open.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {enabled ? 'On for this board.' : 'Off for this board.'} While on (its own toggle is in the
        board header, not here), Auto-mate keeps this many unblocked Todo cards running at once,
        starting the next one the moment a slot frees — and stops entirely on the first one that
        fails, rather than skipping ahead.
      </p>
      <Field label="Concurrency cap" hint="How many cards Auto-mate runs at once, 1 to 5.">
        <input
          type="number"
          aria-label="Auto-mate concurrency cap"
          min={AUTOMATE_CONCURRENCY_MIN}
          max={AUTOMATE_CONCURRENCY_MAX}
          value={cap}
          onChange={(event) => setAutomateCap(projectId, Number(event.target.value))}
          className="h-7 w-16 rounded border border-border bg-background px-2 text-xs outline-none"
        />
      </Field>
    </div>
  );
}

/**
 * Drag-to-skill's own column → skill map (Phase 95 Theme G) — dropping a
 * card into a mapped column moves it, then starts the mapped skill on the
 * card's issue or PR link behind a 5s Undo toast. `In progress` and `In
 * review` are mapped out of the box (`DEFAULT_COLUMN_SKILLS`,
 * `board-derive.ts`); every other column keeps today's status-only drop.
 *
 * **Editable per project, for whichever board is open right now** —
 * `selectedRepoId` → `projectBoardByRepo[repoId]`, the identical "no picker
 * here, follows the Projects view" rule `ProjectsPage`'s own docblock
 * already states for the default-board memory just above. Switching boards
 * in the Projects view switches which project's map this section edits, the
 * same way it already does for "Default board" and the dependency graph's
 * own facets.
 */
function ColumnSkillMapSection() {
  const selectedRepoId = useUiStore((s) => s.selectedRepoId);
  const projectBoardByRepo = useUiStore((s) => s.projectBoardByRepo);
  const projectId = selectedRepoId ? projectBoardByRepo[selectedRepoId] : undefined;
  const overrides = useUiStore((s) => (projectId ? s.columnSkillByProject[projectId] : undefined)) ?? {};
  const setColumnSkill = useUiStore((s) => s.setColumnSkill);
  const [newColumn, setNewColumn] = useState('');
  const [newSkill, setNewSkill] = useState('');

  if (!projectId) {
    return (
      <p className="p-3 text-[11px] leading-relaxed text-muted-foreground">
        Open a project board first — like the default board above, this map is edited per project,
        for whichever board is currently open.
      </p>
    );
  }

  const rowKeys = Array.from(new Set([...Object.keys(DEFAULT_COLUMN_SKILLS), ...Object.keys(overrides)])).sort();

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Dropping a card into a mapped column starts that skill on the card&apos;s issue or PR link,
        behind a 5s Undo toast that cancels before the skill is sent. Clear a row to turn off a
        default without picking a replacement; a column not listed here keeps today&apos;s
        status-only drop.
      </p>

      {rowKeys.map((key) => {
        const effective = resolveColumnSkill(key, overrides) ?? '';
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-xs capitalize" title={key}>
              {key}
            </span>
            <input
              type="text"
              aria-label={`Skill for column "${key}"`}
              value={effective}
              placeholder="Not mapped"
              onChange={(event) => setColumnSkill(projectId, key, event.target.value)}
              className="h-7 flex-1 rounded border border-border bg-background px-2 text-xs outline-none"
            />
          </div>
        );
      })}

      <div className="mt-1 flex items-center gap-2 border-t border-border/50 pt-2">
        <input
          type="text"
          aria-label="New column name"
          value={newColumn}
          onChange={(event) => setNewColumn(event.target.value)}
          placeholder="Column name"
          className="h-7 w-24 shrink-0 rounded border border-border bg-background px-2 text-xs outline-none"
        />
        <input
          type="text"
          aria-label="New column's skill"
          value={newSkill}
          onChange={(event) => setNewSkill(event.target.value)}
          placeholder="/skill-name"
          className="h-7 flex-1 rounded border border-border bg-background px-2 text-xs outline-none"
        />
        <button
          type="button"
          disabled={newColumn.trim() === '' || newSkill.trim() === ''}
          onClick={() => {
            setColumnSkill(projectId, newColumn, newSkill);
            setNewColumn('');
            setNewSkill('');
          }}
          className="h-7 shrink-0 rounded-md border border-border px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function ScopeFixCommand() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-1.5 rounded border border-border bg-muted/40 px-2.5 py-1.5">
      <code className="text-xs">{SCOPE_FIX_COMMAND}</code>
      <button
        type="button"
        aria-label="Copy command"
        onClick={() => {
          void bridge()
            ?.clipboard.writeText({ text: SCOPE_FIX_COMMAND })
            .then((result) => {
              if (result?.ok) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            });
        }}
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {copied ? <LuCheck aria-hidden className="h-3.5 w-3.5" /> : <LuCopy aria-hidden className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
