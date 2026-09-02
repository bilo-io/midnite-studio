import { describe, expect, it } from 'vitest';

import {
  AUTO_PICK_MODIFIERS,
  DEFAULT_LOOPS,
  LoopDefinitionSchema,
  LoopRunRecordSchema,
  composeLoopPrompt,
  type LoopDefinition,
} from './loops';

/** A loop whose fragments are trivially identifiable in the composed line. */
const loop: Pick<LoopDefinition, 'modifiers'> = {
  modifiers: [
    { id: 'first', label: 'First', promptFragment: 'Do the first thing.', defaultOn: false },
    { id: 'second', label: 'Second', promptFragment: 'Do the second thing.', defaultOn: true },
    { id: 'third', label: 'Third', promptFragment: 'Do the third thing.', defaultOn: false },
  ],
};

describe('composeLoopPrompt', () => {
  it('returns the base prompt alone when nothing is checked', () => {
    expect(composeLoopPrompt('/loop /midnite-exec', loop, [])).toBe('/loop /midnite-exec');
  });

  it('appends only the checked fragments', () => {
    expect(composeLoopPrompt('/base', loop, ['first'])).toBe('/base Do the first thing.');
  });

  it('orders fragments by the loop declaration, not the click order', () => {
    const clickedBackwards = composeLoopPrompt('/base', loop, ['third', 'first']);
    const clickedForwards = composeLoopPrompt('/base', loop, ['first', 'third']);
    expect(clickedBackwards).toBe('/base Do the first thing. Do the third thing.');
    expect(clickedBackwards).toBe(clickedForwards);
  });

  it('ignores ids that name no modifier', () => {
    expect(composeLoopPrompt('/base', loop, ['ghost'])).toBe('/base');
  });

  it('puts free-text extras last, after every fragment', () => {
    expect(composeLoopPrompt('/base', loop, ['second'], 'Only touch docs.')).toBe(
      '/base Do the second thing. Only touch docs.',
    );
  });

  it('trims each part and drops the ones that are empty or whitespace', () => {
    expect(composeLoopPrompt('  /base  ', loop, [], '   ')).toBe('/base');
    expect(composeLoopPrompt('/base', loop, [], '  extras  ')).toBe('/base extras');
  });

  it('is deterministic — the same inputs compose the same line', () => {
    const once = composeLoopPrompt('/base', loop, ['first', 'second'], 'extras');
    const twice = composeLoopPrompt('/base', loop, ['first', 'second'], 'extras');
    expect(once).toBe(twice);
  });
});

describe('DEFAULT_LOOPS', () => {
  it('parses, and every loop has a unique id', () => {
    for (const entry of DEFAULT_LOOPS) expect(LoopDefinitionSchema.parse(entry)).toBeTruthy();
    expect(new Set(DEFAULT_LOOPS.map((l) => l.id)).size).toBe(DEFAULT_LOOPS.length);
  });

  it('covers the four historical FAB tabs, so persisted activeFabTab keeps meaning', () => {
    expect(DEFAULT_LOOPS.map((l) => l.id)).toEqual([
      'innovate',
      'automate',
      'watchdog',
      'medic',
    ]);
  });

  it('runs claude only this phase — the one agent with honest activity markers', () => {
    for (const entry of DEFAULT_LOOPS) expect(entry.agentId).toBe('claude');
  });

  it('gives every loop unique modifier ids', () => {
    for (const entry of DEFAULT_LOOPS) {
      expect(new Set(entry.modifiers.map((m) => m.id)).size).toBe(entry.modifiers.length);
    }
  });

  it('offers both auto-pick toggles on every loop, and offers them last', () => {
    // Last is the assertion that matters: `composeLoopPrompt` emits in declared
    // order, so a loop that listed them earlier would bury a standing rule in
    // the middle of its steps.
    for (const entry of DEFAULT_LOOPS) {
      expect(entry.modifiers.slice(-AUTO_PICK_MODIFIERS.length), entry.id).toEqual([
        ...AUTO_PICK_MODIFIERS,
      ]);
    }
  });

  it('never defaults an auto-pick box on — unattended is opt-in', () => {
    for (const modifier of AUTO_PICK_MODIFIERS) expect(modifier.defaultOn).toBe(false);
  });

  it('drives Patrol off a bare loop, with the PR skills as its checkboxes', () => {
    // Patrol's whole design: the base names no skill, so an unchecked box is a
    // skill that does *not* run. A skill creeping into `fallbackPrompt` would
    // make "PR review" a checkbox that changes nothing.
    const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog');
    expect(patrol?.label).toBe('Patrol');
    expect(patrol?.fallbackPrompt).toBe('/loop');
    expect(patrol?.agentCommandId).toBe('loopPatrol');

    const fragments = new Map(patrol?.modifiers.map((m) => [m.id, m.promptFragment]));
    expect(fragments.get('pr-review')).toBe('/pr-review');
    expect(fragments.get('pr-feedback')).toBe('/pr-feedback');

    // Review is the tab's resting job; feedback is the extra pass.
    expect(patrol?.modifiers.find((m) => m.id === 'pr-review')?.defaultOn).toBe(true);
    expect(patrol?.modifiers.find((m) => m.id === 'pr-feedback')?.defaultOn).toBe(false);
  });

  it('gives Medic the dependency bots over the issue backlog, and no PR-review skill', () => {
    const medic = DEFAULT_LOOPS.find((l) => l.id === 'medic');
    expect(medic?.fallbackPrompt).toBe('/loop /midnite-address-issue');
    expect(medic?.agentCommandId).toBe('loopAddressIssue');
    expect(medic?.modifiers.map((m) => m.id)).toEqual([
      'dependabot',
      'renovate',
      'triage-only',
      ...AUTO_PICK_MODIFIERS.map((m) => m.id),
    ]);
  });

  it('marks a loop whose base names no skill as needing a box, and only that one', () => {
    // The pairing is the invariant: `requiresModifier` exists to stop a bare
    // `/loop` reaching a pty, so it must be true exactly where the base is bare.
    for (const entry of DEFAULT_LOOPS) {
      const bare = entry.fallbackPrompt.trim() === '/loop';
      expect(entry.requiresModifier, entry.id).toBe(bare);
    }
    expect(DEFAULT_LOOPS.filter((l) => l.requiresModifier).map((l) => l.id)).toEqual(['watchdog']);
  });

  it('gives a requiresModifier loop boxes that can actually satisfy it', () => {
    // The guard reads `providesTask`, not "any box checked" — the auto-pick pair
    // is a standing rule with no task under it. A loop that required a modifier
    // and marked none of them would be unstartable.
    for (const entry of DEFAULT_LOOPS.filter((l) => l.requiresModifier)) {
      expect(entry.modifiers.filter((m) => m.providesTask).map((m) => m.id), entry.id).toEqual([
        'pr-review',
        'pr-feedback',
        'triage-only',
      ]);
    }
    for (const modifier of AUTO_PICK_MODIFIERS) expect(modifier.providesTask).toBeUndefined();
  });

  it('has Patrol override its own default-on skill when triage is checked', () => {
    // `pr-review` is `defaultOn`, so the composed triage line still carries
    // `/pr-review`. The fragment must therefore *name* what it overrides — a
    // bare "do not review" beside `/pr-review` is a contradiction, not an order.
    const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog')!;
    const line = composeLoopPrompt(patrol.fallbackPrompt, patrol, ['pr-review', 'triage-only']);
    expect(line).toContain('/pr-review');
    expect(line).toContain('ignore any review or feedback skill named above');
  });

  it('keeps Medic off merging — its bot boxes gate, they do not land', () => {
    // These two ids predate this change and persist in `loopModifierDefaults`,
    // so a stored `true` must not quietly start auto-merging dependency PRs.
    const medic = DEFAULT_LOOPS.find((l) => l.id === 'medic')!;
    for (const id of ['dependabot', 'renovate']) {
      const fragment = medic.modifiers.find((m) => m.id === id)?.promptFragment ?? '';
      expect(fragment, id).toContain('run the gate');
      expect(fragment, id).not.toMatch(/\b(merge|land|approve)/i);
    }
  });

  it('points both triage boxes at the one read-only skill', () => {
    // Same words on two tabs must mean the same thing, or "Triage only" reads
    // as a different promise depending on which tab you ticked it on.
    const triage = DEFAULT_LOOPS.flatMap((l) => l.modifiers).filter(
      (m) => m.id === 'triage-only',
    );
    expect(triage).toHaveLength(2);
    for (const modifier of triage) {
      expect(modifier.label).toBe('Triage only');
      expect(modifier.promptFragment).toContain('/midnite-triage');
      expect(modifier.promptFragment).toMatch(/push no fixes/);
    }
  });

  it('composes Patrol the way the tab reads — skills first, standing rule last', () => {
    const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog')!;
    expect(
      composeLoopPrompt(patrol.fallbackPrompt, patrol, [
        'auto-pick-performance',
        'pr-feedback',
        'pr-review',
      ]),
    ).toBe(
      '/loop /pr-review /pr-feedback Never stop to ask: keep advancing and always take the most performant option.',
    );
  });
});

describe('LoopRunRecordSchema', () => {
  const running = {
    id: 'r1',
    loopId: 'automate',
    sessionId: 's1',
    startedAt: 1,
    composedPrompt: '/loop /midnite-exec',
    checkedModifierIds: [],
    status: 'running' as const,
  };

  it('round-trips a running record with no end', () => {
    expect(LoopRunRecordSchema.parse(running)).toEqual(running);
  });

  it('round-trips a finished record with an exit code', () => {
    const ended = { ...running, status: 'exited' as const, endedAt: 2, exitCode: 0 };
    expect(LoopRunRecordSchema.parse(ended)).toEqual(ended);
  });

  it('accepts a negative exit code — a signal death is still a real end', () => {
    expect(
      LoopRunRecordSchema.parse({ ...running, status: 'exited', endedAt: 2, exitCode: -1 }),
    ).toMatchObject({ exitCode: -1 });
  });

  it('rejects an unknown status', () => {
    expect(LoopRunRecordSchema.safeParse({ ...running, status: 'paused' }).success).toBe(false);
  });
});
