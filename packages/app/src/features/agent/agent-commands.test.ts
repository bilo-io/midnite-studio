import { describe, expect, it } from 'vitest';

import { DEFAULT_AGENT_SKILLS } from '../../store/ui-store';
import { AGENT_COMMANDS, AGENT_COMMAND_GROUPS } from './agent-commands';

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

  it('gives every entry a line of sub-text', () => {
    // `hint` is one string serving two renderers — the menu row's description
    // and the settings field's caption. A blank one is a row that explains
    // itself with an empty line rather than not at all.
    for (const command of AGENT_COMMANDS) {
      expect(command.hint.trim(), command.id).not.toBe('');
    }
  });

  it('groups categories contiguously, in tasks → reviews → releases → git → loops order', () => {
    // The settings page draws one divider per category *change*, so a category
    // that reappears after the list has moved past it would draw a second
    // divider for the same group instead of one. The menu now renders one
    // submenu per group, where the same drift would instead split a group's
    // entries across… nothing at all, since it filters by category.
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
    expect(order).toEqual(['tasks', 'reviews', 'releases', 'git', 'loops']);
  });

  it('keeps the git category at exactly the two repo-housekeeping verbs', () => {
    // The category exists to keep housekeeping out of `tasks`, where it would
    // read as a build task. Membership is therefore the assertion: an entry
    // drifting in or out changes what the Git submenu offers, and nothing else
    // in this file would notice.
    const git = AGENT_COMMANDS.filter((command) => command.category === 'git');
    expect(git.map((command) => command.id)).toEqual(['gitReport', 'gitCleanup']);

    // Read-only report ordered before the destructive prune, and both pointed at
    // skills that exist under `.claude/skills/`. Asserted because a typo here is
    // invisible until the menu opens a terminal on a command that isn't there.
    expect(DEFAULT_AGENT_SKILLS.gitReport).toBe('/midnite-git-report');
    expect(DEFAULT_AGENT_SKILLS.gitCleanup).toBe('/midnite-git-cleanup');
  });
});

/**
 * The groups are the menu's whole top level, so an id that appears in one
 * literal and not the other is a verb with no way to reach it — or a chevron
 * that opens onto nothing.
 */
describe('AGENT_COMMAND_GROUPS', () => {
  it('is the menu top level: Tasks, Reviews, Releases, Git, Loops', () => {
    expect(AGENT_COMMAND_GROUPS.map((group) => group.label)).toEqual([
      'Tasks',
      'Reviews',
      'Releases',
      'Git',
      'Loops',
    ]);
  });

  it('covers every category the commands use, and no empty ones', () => {
    const used = new Set(AGENT_COMMANDS.map((command) => command.category));
    const declared = AGENT_COMMAND_GROUPS.map((group) => group.id);

    expect(new Set(declared).size).toBe(declared.length);
    expect([...used].sort()).toEqual([...declared].sort());
  });

  it('matches the commands on group order', () => {
    // The menu renders `AGENT_COMMAND_GROUPS` in order and the settings page
    // renders `AGENT_COMMANDS` in order; the two would silently disagree about
    // which group comes first if only one of them were reordered.
    const firstSeen: string[] = [];
    for (const { category } of AGENT_COMMANDS) {
      if (!firstSeen.includes(category)) firstSeen.push(category);
    }
    expect(firstSeen).toEqual(AGENT_COMMAND_GROUPS.map((group) => group.id));
  });

  it('gives every group its own glyph and its own line of sub-text', () => {
    const icons = AGENT_COMMAND_GROUPS.map((group) => group.icon);
    expect(new Set(icons).size).toBe(AGENT_COMMAND_GROUPS.length);

    // Distinct from the entries' glyphs too: a group row and one of the rows it
    // opens onto sharing a mark reads as the same thing listed twice.
    const commandIcons = new Set(AGENT_COMMANDS.map((command) => command.icon));
    for (const group of AGENT_COMMAND_GROUPS) {
      expect(commandIcons.has(group.icon), group.id).toBe(false);
      expect(group.hint.trim(), group.id).not.toBe('');
    }
  });
});
