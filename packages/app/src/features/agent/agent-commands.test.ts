import { describe, expect, it } from 'vitest';

import { DEFAULT_AGENT_SKILLS } from '../../store/ui-store';
import { AGENT_COMMANDS } from './agent-commands';

/**
 * `AGENT_COMMANDS` is a flat array, not a record keyed by `AgentCommandId`, so
 * TypeScript cannot notice a new id that nobody gave a label to — and a
 * label-less id is invisible twice over: no menu row, and no settings field to
 * point it anywhere. These are the assertions that stand in for the exhaustive
 * check the shape does not give.
 */
describe('AGENT_COMMANDS', () => {
  it('covers every id the store persists a skill for, in one order', () => {
    expect(AGENT_COMMANDS.map((command) => command.id)).toEqual(
      Object.keys(DEFAULT_AGENT_SKILLS),
    );
  });

  it('gives every entry its own label and its own glyph', () => {
    const labels = AGENT_COMMANDS.map((command) => command.label);
    const icons = AGENT_COMMANDS.map((command) => command.icon);

    // Labels reach the DOM as the menu row's text and as each settings field's
    // `aria-label` ("Skill for …"), so two entries sharing one would make both
    // ambiguous to a screen reader and to every test that names them.
    expect(new Set(labels).size).toBe(AGENT_COMMANDS.length);
    expect(new Set(icons).size).toBe(AGENT_COMMANDS.length);
  });

  it('keeps the labels a display layer, free of the ids they render', () => {
    // "Backlog Task" over `execBacklog`, "Refine Plan" over `refine`: the menu reads as
    // verb phrases while the persisted keys stay short. Asserted so a later
    // rename of one cannot quietly drag the other with it.
    expect(AGENT_COMMANDS.find((command) => command.id === 'execBacklog')?.label).toBe(
      'Backlog Task',
    );
    expect(AGENT_COMMANDS.find((command) => command.id === 'refine')?.label).toBe('Refine Plan');
    expect(DEFAULT_AGENT_SKILLS.refine).toBe('/midnite-refine');
  });

  it('groups categories contiguously, in execute → pr → release → maintain → loops order', () => {
    // The menu and the settings page each draw one divider per category
    // *change*, so a category that reappears after the list has moved past it
    // would draw a second divider for the same group instead of one.
    const categories = AGENT_COMMANDS.map((command) => command.category);
    const closed = new Set<string>();
    const order: string[] = [];
    let current: string | undefined;
    for (const category of categories) {
      if (category === current) continue;
      expect(closed.has(category)).toBe(false);
      if (current !== undefined) closed.add(current);
      current = category;
      order.push(category);
    }
    expect(order).toEqual(['execute', 'pr', 'release', 'maintain', 'loops']);
  });

  it('keeps the maintain category at exactly the two repo-housekeeping verbs', () => {
    // The category exists to keep housekeeping out of `execute`, where it would
    // read as a build task. Membership is therefore the assertion: an entry
    // drifting in or out changes what the menu's third divider means, and
    // nothing else in this file would notice.
    const maintain = AGENT_COMMANDS.filter((command) => command.category === 'maintain');
    expect(maintain.map((command) => command.id)).toEqual(['gitReport', 'gitCleanup']);

    // Read-only report ordered before the destructive prune, and both pointed at
    // skills that exist under `.claude/skills/`. Asserted because a typo here is
    // invisible until the menu opens a terminal on a command that isn't there.
    expect(DEFAULT_AGENT_SKILLS.gitReport).toBe('/midnite-git-report');
    expect(DEFAULT_AGENT_SKILLS.gitCleanup).toBe('/midnite-git-cleanup');
  });
});
