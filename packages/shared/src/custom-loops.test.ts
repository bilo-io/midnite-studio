import { describe, expect, it } from 'vitest';

import {
  CUSTOM_LOOP_COLOR,
  CustomLoopSchema,
  addCustomOption,
  addCustomSection,
  createBlankCustomLoop,
  customLoopForRun,
  customLoopNeedsOption,
  duplicateLoopAsCustom,
  isCustomLoop,
  moveCustomSection,
  parseCustomLoops,
  removeCustomChoice,
  removeCustomOption,
  removeCustomSection,
  renameCustomSection,
  restartCustomLoop,
  updateCustomOption,
  type IdFactory,
} from './custom-loops';
import { AUTONOMY_CHOICE, COMMON_RUN_MODIFIERS, DEFAULT_LOOPS, composeLoopPrompt } from './loops';

function counterIds(): IdFactory {
  let n = 0;
  return (kind) => (kind === 'loop' ? `custom-${++n}` : `${kind}-${++n}`);
}

const guard = DEFAULT_LOOPS.find((l) => l.id === 'guard')!;
const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog')!;

describe('CustomLoopSchema', () => {
  it('accepts a blank loop and every duplicated built-in', () => {
    expect(CustomLoopSchema.safeParse(createBlankCustomLoop(counterIds(), 1)).success).toBe(true);
    for (const loop of DEFAULT_LOOPS) {
      const copy = duplicateLoopAsCustom(loop, loop.fallbackPrompt, counterIds(), 1);
      expect(CustomLoopSchema.safeParse(copy).success, loop.id).toBe(true);
    }
  });

  it('rejects an id that could collide with a built-in, and a non-custom loop', () => {
    const blank = createBlankCustomLoop(counterIds(), 1);
    expect(CustomLoopSchema.safeParse({ ...blank, id: 'guard' }).success).toBe(false);
    expect(CustomLoopSchema.safeParse({ ...blank, custom: undefined }).success).toBe(false);
    expect(CustomLoopSchema.safeParse({ ...blank, hue: 400 }).success).toBe(false);
  });

  it('parseCustomLoops keeps the valid rows, drops the broken and duplicate ones', () => {
    const a = createBlankCustomLoop(counterIds(), 1);
    const b = { ...createBlankCustomLoop(counterIds(), 1), id: 'custom-b' };
    expect(parseCustomLoops([a, { nope: true }, b, a]).map((l) => l.id)).toEqual([a.id, 'custom-b']);
    expect(parseCustomLoops(undefined)).toEqual([]);
    expect(parseCustomLoops('x')).toEqual([]);
  });

  it('tells a custom loop from a built-in', () => {
    expect(isCustomLoop(createBlankCustomLoop())).toBe(true);
    expect(isCustomLoop(guard)).toBe(false);
  });
});

describe('createBlankCustomLoop', () => {
  it('has one empty section and only the shared Run controls', () => {
    const blank = createBlankCustomLoop(counterIds(), 5);
    expect(blank.sections).toEqual([{ id: 'section-2', label: 'Tasks' }]);
    expect(blank.modifiers.map((m) => m.id)).toEqual(COMMON_RUN_MODIFIERS.map((m) => m.id));
    expect(blank.modifiers.every((m) => m.section === undefined)).toBe(true);
    expect(blank.choices.map((c) => c.id)).toEqual([AUTONOMY_CHOICE.id]);
    expect(blank.color).toBe(CUSTOM_LOOP_COLOR);
    expect(blank.agentCommandId).toBe(blank.id);
    expect(customLoopNeedsOption(blank)).toBe(true);
  });
});

describe('duplicateLoopAsCustom', () => {
  it('copies a built-in into one section per group, keeping the shared Run controls apart', () => {
    const copy = duplicateLoopAsCustom(guard, '/loop /guard-it', counterIds(), 1);
    expect(copy.id).toBe('custom-1');
    expect(copy.label).toBe('Guard copy');
    expect(copy.icon).toBe('guard');
    expect(copy.hue).toBe(120);
    expect(copy.fallbackPrompt).toBe('/loop /guard-it');
    expect(copy.sections.map((s) => s.label)).toEqual(['Tasks', 'Scope', 'Policies']);
    const own = copy.modifiers.filter((m) => m.section !== undefined).map((m) => m.id);
    expect(own).toEqual(['secret-scan', 'dep-audit', 'security-review', 'sbom', 'fix-findings', 'report-only']);
    // The Severity gate radio rides along in the Scope section; autonomy stays shared.
    const severity = copy.choices.find((c) => c.id === 'severity')!;
    expect(severity.section).toBe(copy.sections[1]!.id);
    expect(copy.choices.find((c) => c.id === 'autonomy')!.section).toBeUndefined();
  });

  it('composes exactly the line the built-in composes for the same selection', () => {
    for (const loop of DEFAULT_LOOPS) {
      const copy = duplicateLoopAsCustom(loop, loop.fallbackPrompt, counterIds(), 1);
      const modifierIds = loop.modifiers.filter((m) => m.defaultOn).map((m) => m.id);
      const selection = { modifierIds, autoRotatePercent: 30, repeat: true };
      expect(composeLoopPrompt(copy.fallbackPrompt, copy, selection), loop.id).toBe(
        composeLoopPrompt(loop.fallbackPrompt, loop, selection),
      );
    }
  });

  it('keeps the Users filter on a copy of Patrol', () => {
    expect(duplicateLoopAsCustom(patrol, '/loop').reviewsPrs).toBe(true);
  });

  it('restartCustomLoop swaps content but keeps the identity', () => {
    const blank = createBlankCustomLoop(counterIds(), 7);
    const restarted = restartCustomLoop(blank, duplicateLoopAsCustom(guard, '/loop x', counterIds(), 9));
    expect(restarted.id).toBe(blank.id);
    expect(restarted.agentCommandId).toBe(blank.id);
    expect(restarted.createdAt).toBe(7);
    expect(restarted.label).toBe('Guard copy');
  });
});

describe('structural edits', () => {
  const ids = counterIds();
  const base = createBlankCustomLoop(ids, 1);
  const tasks = base.sections[0]!.id;

  it('adds, renames, reorders and removes sections', () => {
    let loop = addCustomSection(base, 'Checks', ids);
    const checks = loop.sections[1]!.id;
    loop = renameCustomSection(loop, checks, 'Reviews');
    expect(loop.sections.map((s) => s.label)).toEqual(['Tasks', 'Reviews']);
    loop = addCustomOption(loop, tasks, ids);
    loop = addCustomOption(loop, checks, ids);
    loop = moveCustomSection(loop, checks, -1);
    expect(loop.sections.map((s) => s.label)).toEqual(['Reviews', 'Tasks']);
    // Options follow their section, shared Run switches stay last.
    expect(loop.modifiers.map((m) => m.section ?? 'shared')).toEqual([checks, tasks, 'shared', 'shared']);
    expect(moveCustomSection(loop, checks, -1)).toBe(loop);
    loop = removeCustomSection(loop, checks);
    expect(loop.sections.map((s) => s.id)).toEqual([tasks]);
    expect(loop.modifiers.some((m) => m.section === checks)).toBe(false);
  });

  it('adds an option after the section’s last one, patches and removes it', () => {
    let loop = addCustomOption(base, tasks, ids);
    loop = addCustomOption(loop, tasks, ids);
    const [first, second] = loop.modifiers.filter((m) => m.section === tasks);
    loop = updateCustomOption(loop, second!.id, {
      label: 'Review',
      description: 'Reviews things',
      promptFragment: 'Review recent PRs.',
      skillTemplate: 'Review recent PRs with {skill}.',
      defaultSkill: '/pr-review',
      defaultOn: true,
    });
    const edited = loop.modifiers.find((m) => m.id === second!.id)!;
    expect(edited).toMatchObject({ label: 'Review', defaultOn: true, defaultSkill: '/pr-review' });
    // Blank optional fields are stored as absent; a template without a slot is dropped.
    loop = updateCustomOption(loop, second!.id, { description: '  ', skillTemplate: 'no slot' });
    const cleared = loop.modifiers.find((m) => m.id === second!.id)!;
    expect(cleared.description).toBeUndefined();
    expect(cleared.skillTemplate).toBeUndefined();
    expect(CustomLoopSchema.safeParse(loop).success).toBe(true);
    loop = removeCustomOption(loop, first!.id);
    expect(loop.modifiers.filter((m) => m.section === tasks).map((m) => m.id)).toEqual([second!.id]);
  });

  it('never edits or removes the shared Run controls', () => {
    const shared = base.modifiers[0]!;
    expect(updateCustomOption(base, shared.id, { label: 'x' }).modifiers[0]).toEqual(shared);
    expect(removeCustomOption(base, shared.id).modifiers).toHaveLength(base.modifiers.length);
    expect(removeCustomChoice(base, 'autonomy').choices).toHaveLength(1);
  });
});

describe('composing a custom loop', () => {
  it('runs through composeLoopPrompt unchanged, in section order', () => {
    const ids = counterIds();
    let loop = createBlankCustomLoop(ids, 1);
    loop = { ...loop, fallbackPrompt: '/loop /midnite-create' };
    const tasks = loop.sections[0]!.id;
    loop = addCustomSection(loop, 'More', ids);
    const more = loop.sections[1]!.id;
    loop = addCustomOption(loop, more, ids);
    loop = addCustomOption(loop, tasks, ids);
    const moreOpt = loop.modifiers.find((m) => m.section === more)!;
    const taskOpt = loop.modifiers.find((m) => m.section === tasks)!;
    loop = updateCustomOption(loop, moreOpt.id, { promptFragment: 'Then tidy up.' });
    loop = updateCustomOption(loop, taskOpt.id, {
      promptFragment: 'Review open PRs.',
      skillTemplate: 'Review open PRs with {skill}.',
    });
    const line = composeLoopPrompt(loop.fallbackPrompt, customLoopForRun(loop), {
      modifierIds: [moreOpt.id, taskOpt.id, 'worktree-only'],
      skills: { [taskOpt.id]: 'ekko-pr-review' },
      choiceIds: { autonomy: 'recommended' },
    });
    expect(line).toBe(
      '/loop /midnite-create Review open PRs with /ekko-pr-review. Then tidy up. ' +
        'Do every piece of work in its own git worktree — never edit the primary checkout. ' +
        'Never stop to ask: keep advancing and always take the recommended option.',
    );
    expect(customLoopNeedsOption(loop)).toBe(false);
  });

  it('drops an option whose fragment is still empty', () => {
    const ids = counterIds();
    let loop = createBlankCustomLoop(ids, 1);
    loop = addCustomOption(loop, loop.sections[0]!.id, ids);
    const opt = loop.modifiers.find((m) => m.section !== undefined)!;
    expect(composeLoopPrompt('/loop', customLoopForRun(loop), { modifierIds: [opt.id] })).toBe('/loop');
  });
});
