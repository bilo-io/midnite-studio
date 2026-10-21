import { describe, expect, it } from 'vitest';

import {
  AUTONOMY_CHOICE,
  COMMON_RUN_MODIFIERS,
  DEFAULT_LOOPS,
  DEFAULT_LOOP_SCHEDULE,
  ALL_LOOP_WEEKDAYS,
  LEGACY_LOOP_DAY_SETS,
  LOOP_FREQUENCIES,
  LOOP_MODELS,
  LOOP_WEEKDAYS,
  LoopDefinitionSchema,
  LoopFrequencySchema,
  LoopModelSchema,
  LoopRunRecordSchema,
  LoopScheduleSchema,
  LoopWeekdaySchema,
  ROUTINE_PR_FRAGMENT,
  LOOP_AUTO_ROTATE,
  LOOP_SKILL_SLOT,
  LoopModifierSchema,
  ROUTINE_PR_SKILL_TEMPLATE,
  composeLoopPrompt,
  loopModifierFragment,
  normaliseLoopSkill,
  onceOffBasePrompt,
  loopModelArgs,
  loopModelsFor,
  loopScheduleFragment,
  loopScheduleSummary,
  resolveLoopChoice,
  resolveLoopDays,
  type LoopDefinition,
  type LoopSchedule,
} from './loops';

/** A loop whose fragments are trivially identifiable in the composed line. */
const loop: Pick<LoopDefinition, 'modifiers' | 'choices'> = {
  modifiers: [
    {
      id: 'first',
      label: 'First',
      promptFragment: 'Do the first thing.',
      group: 'tasks',
      control: 'checkbox',
      defaultOn: false,
    },
    {
      id: 'second',
      label: 'Second',
      promptFragment: 'Do the second thing.',
      group: 'tasks',
      control: 'checkbox',
      defaultOn: true,
    },
    {
      id: 'third',
      label: 'Third',
      promptFragment: 'Do the third thing.',
      group: 'tasks',
      control: 'checkbox',
      defaultOn: false,
    },
    {
      id: 'policy',
      label: 'Policy',
      promptFragment: 'Behave politely.',
      group: 'run',
      control: 'switch',
      defaultOn: false,
    },
  ],
  choices: [
    {
      id: 'depth',
      label: 'Depth',
      group: 'scope',
      defaultOptionId: 'shallow',
      options: [
        { id: 'shallow', label: 'Shallow' },
        { id: 'deep', label: 'Deep', promptFragment: 'Go deep.' },
      ],
    },
  ],
};

describe('composeLoopPrompt', () => {
  it('returns the base prompt alone when nothing is set', () => {
    expect(composeLoopPrompt('/loop /midnite-create', loop, {})).toBe('/loop /midnite-create');
  });

  it('defaults every argument — an empty selection is a legal selection', () => {
    expect(composeLoopPrompt('/base', loop)).toBe('/base');
  });

  it('appends only the checked fragments', () => {
    expect(composeLoopPrompt('/base', loop, { modifierIds: ['first'] })).toBe(
      '/base Do the first thing.',
    );
  });

  it('orders fragments by the loop declaration, not the click order', () => {
    const backwards = composeLoopPrompt('/base', loop, { modifierIds: ['third', 'first'] });
    const forwards = composeLoopPrompt('/base', loop, { modifierIds: ['first', 'third'] });
    expect(backwards).toBe('/base Do the first thing. Do the third thing.');
    expect(backwards).toBe(forwards);
  });

  it('emits by group — tasks, then scope, then the standing rules', () => {
    // The invariant the group order exists for: a policy must land after the
    // steps it governs, whatever order the declarations happen to be in.
    expect(
      composeLoopPrompt('/base', loop, {
        modifierIds: ['policy', 'first'],
        choiceIds: { depth: 'deep' },
      }),
    ).toBe('/base Do the first thing. Go deep. Behave politely.');
  });

  it('ignores ids that name no modifier', () => {
    expect(composeLoopPrompt('/base', loop, { modifierIds: ['ghost'] })).toBe('/base');
  });

  it('says nothing for a choice sitting on its neutral option', () => {
    expect(composeLoopPrompt('/base', loop, { choiceIds: { depth: 'shallow' } })).toBe('/base');
  });

  it('falls back to a choice default when the stored option id is unknown', () => {
    expect(composeLoopPrompt('/base', loop, { choiceIds: { depth: 'renamed' } })).toBe('/base');
  });

  it('appends the schedule after the settings and before the extras', () => {
    expect(
      composeLoopPrompt('/base', loop, {
        modifierIds: ['first'],
        schedule: { enabled: true, from: '09:00', to: '17:00' },
        extras: 'Only touch docs.',
      }),
    ).toBe(
      '/base Do the first thing. Work only between 09:00 and 17:00 local time — outside that window, idle and wait rather than starting new work. Only touch docs.',
    );
  });

  it('puts free-text extras last, after every fragment', () => {
    expect(composeLoopPrompt('/base', loop, { modifierIds: ['second'], extras: 'Only docs.' })).toBe(
      '/base Do the second thing. Only docs.',
    );
  });

  it('trims each part and drops the ones that are empty or whitespace', () => {
    expect(composeLoopPrompt('  /base  ', loop, { extras: '   ' })).toBe('/base');
    expect(composeLoopPrompt('/base', loop, { extras: '  extras  ' })).toBe('/base extras');
  });

  it('is deterministic — the same inputs compose the same line', () => {
    const selection = { modifierIds: ['first', 'second'], extras: 'extras' };
    expect(composeLoopPrompt('/base', loop, selection)).toBe(
      composeLoopPrompt('/base', loop, selection),
    );
  });
});

describe('resolveLoopChoice', () => {
  const choice = loop.choices[0]!;

  it('returns the selected option', () => {
    expect(resolveLoopChoice(choice, 'deep').id).toBe('deep');
  });

  it('falls back to the declared default when nothing is selected', () => {
    expect(resolveLoopChoice(choice, undefined).id).toBe('shallow');
  });

  it('falls back rather than leaving a group with nothing on', () => {
    expect(resolveLoopChoice(choice, 'gone').id).toBe('shallow');
  });
});

describe('loopScheduleFragment', () => {
  it('says nothing when the schedule is off', () => {
    expect(loopScheduleFragment({ enabled: false, from: '09:00', to: '17:00' })).toBeNull();
    expect(loopScheduleFragment(null)).toBeNull();
    expect(loopScheduleFragment(undefined)).toBeNull();
  });

  it('says nothing for a zero-width window — that is a user mid-edit', () => {
    expect(loopScheduleFragment({ enabled: true, from: '09:00', to: '09:00' })).toBeNull();
  });

  it('names the window', () => {
    expect(loopScheduleFragment({ enabled: true, from: '09:00', to: '17:00' })).toContain(
      'between 09:00 and 17:00 local time —',
    );
  });

  it('names a window that wraps midnight as overnight, so it does not read as a typo', () => {
    expect(loopScheduleFragment({ enabled: true, from: '22:00', to: '06:00' })).toContain(
      'between 22:00 and 06:00 local time (overnight)',
    );
  });

  it('parses, and rejects a time that is not HH:MM', () => {
    expect(LoopScheduleSchema.parse(DEFAULT_LOOP_SCHEDULE)).toEqual(DEFAULT_LOOP_SCHEDULE);
    expect(LoopScheduleSchema.safeParse({ enabled: true, from: '9am', to: '17:00' }).success).toBe(
      false,
    );
    expect(LoopScheduleSchema.safeParse({ enabled: true, from: '24:00', to: '17:00' }).success).toBe(
      false,
    );
  });

  it('starts a fresh loop unscheduled, and neutral on both new axes', () => {
    expect(DEFAULT_LOOP_SCHEDULE.enabled).toBe(false);
    expect(DEFAULT_LOOP_SCHEDULE.frequency).toBe('continuous');
    expect(DEFAULT_LOOP_SCHEDULE.days).toEqual([...ALL_LOOP_WEEKDAYS]);
  });

  it('reads a schedule persisted before frequency and days existed as neutral on both', () => {
    // The optional fields are what make this true: an old record parses, and
    // the fragment it composes is exactly the one it always composed.
    const legacy = LoopScheduleSchema.parse({ enabled: true, from: '09:00', to: '17:00' });
    expect(legacy.frequency).toBeUndefined();
    expect(legacy.days).toBeUndefined();
    expect(loopScheduleFragment(legacy)).toBe(
      loopScheduleFragment({ ...legacy, days: [...ALL_LOOP_WEEKDAYS] }),
    );
  });

  it('widens a legacy preset token into the day set it always named', () => {
    // `days` was `'all' | 'weekdays' | 'weekends'` before the multi-select, and
    // those strings are sitting in every existing `settings.json`.
    for (const [token, set] of Object.entries(LEGACY_LOOP_DAY_SETS)) {
      const parsed = LoopScheduleSchema.parse({
        enabled: true,
        from: '09:00',
        to: '17:00',
        days: token,
      });
      expect(parsed.days, token).toEqual([...set]);
    }
  });

  it('drops an unrecognised day token rather than refusing the whole schedule', () => {
    const parsed = LoopScheduleSchema.safeParse({
      enabled: true,
      from: '09:00',
      to: '17:00',
      days: 'fortnightly',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.days).toBeUndefined();
  });

  it('names the cadence after the window, so the pacing rule reads as a qualifier', () => {
    const line = loopScheduleFragment({
      enabled: true,
      from: '09:00',
      to: '17:00',
      frequency: 'hourly',
    });
    expect(line).toContain('between 09:00 and 17:00');
    expect(line).toContain('roughly one pass an hour');
    expect(line!.indexOf('one pass an hour')).toBeGreaterThan(line!.indexOf('between 09:00'));
  });

  it('names the day set before the window — which days, then when inside one', () => {
    const line = loopScheduleFragment({
      enabled: true,
      from: '09:00',
      to: '17:00',
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    });
    expect(line!.indexOf('weekdays only')).toBeLessThan(line!.indexOf('between 09:00'));
  });

  it('still carries cadence and days when the window itself is mid-edit', () => {
    // A zero-width window says nothing; the other two axes answer different
    // questions and are not silenced with it.
    const line = loopScheduleFragment({
      enabled: true,
      from: '09:00',
      to: '09:00',
      frequency: 'daily',
      days: ['sat', 'sun'],
    });
    expect(line).toContain('weekends only');
    expect(line).toContain('at most one pass a day');
    expect(line).not.toContain('between');
  });

  it('says nothing at all when every axis is on its neutral option', () => {
    expect(
      loopScheduleFragment({
        enabled: true,
        from: '09:00',
        to: '09:00',
        frequency: 'continuous',
        days: [...ALL_LOOP_WEEKDAYS],
      }),
    ).toBeNull();
  });
});

describe('loopScheduleSummary', () => {
  it('is null exactly when the composed line is, so the chip cannot over-claim', () => {
    const cases: LoopSchedule[] = [
      { enabled: false, from: '09:00', to: '17:00' },
      { enabled: true, from: '09:00', to: '09:00' },
      {
        enabled: true,
        from: '09:00',
        to: '09:00',
        frequency: 'continuous',
        days: [...ALL_LOOP_WEEKDAYS],
      },
      { enabled: true, from: '09:00', to: '17:00' },
      { enabled: true, from: '09:00', to: '09:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      { enabled: true, from: '09:00', to: '09:00', days: [] },
    ];
    for (const schedule of cases) {
      expect(loopScheduleSummary(schedule) === null, JSON.stringify(schedule)).toBe(
        loopScheduleFragment(schedule) === null,
      );
    }
  });

  it('reads as the window, then what qualifies it', () => {
    expect(
      loopScheduleSummary({
        enabled: true,
        from: '22:00',
        to: '06:00',
        frequency: 'hourly',
        days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      }),
    ).toBe('22:00–06:00 · Weekdays · Hourly');
  });

  it('drops the neutral axes rather than spelling them out', () => {
    expect(loopScheduleSummary({ enabled: true, from: '09:00', to: '17:00' })).toBe('09:00–17:00');
  });
});

describe('LOOP_FREQUENCIES', () => {
  it('offers exactly one neutral option, and it is the schema default', () => {
    expect(LOOP_FREQUENCIES.filter((f) => f.promptFragment === null).map((f) => f.id)).toEqual([
      'continuous',
    ]);
  });

  it('covers every id the schema accepts, so no stored pick renders as a raw token', () => {
    expect(LOOP_FREQUENCIES.map((f) => f.id)).toEqual(LoopFrequencySchema.options);
  });
});

describe('LOOP_WEEKDAYS', () => {
  it('offers all seven, Monday first, and covers every id the schema accepts', () => {
    expect(LOOP_WEEKDAYS).toHaveLength(7);
    expect(LOOP_WEEKDAYS[0]?.id).toBe('mon');
    expect(LOOP_WEEKDAYS.map((d) => d.id)).toEqual([...ALL_LOOP_WEEKDAYS]);
    expect(LoopWeekdaySchema.options).toEqual([...ALL_LOOP_WEEKDAYS]);
  });

  it('names every day both long and short, so prose and chip cannot disagree', () => {
    for (const day of LOOP_WEEKDAYS) {
      expect(day.label.startsWith(day.short), day.id).toBe(true);
    }
  });
});

describe('resolveLoopDays', () => {
  it('reads an absent answer as every day — the neutral one', () => {
    expect(resolveLoopDays(undefined)).toEqual([...ALL_LOOP_WEEKDAYS]);
  });

  it('answers neutrally for a key it inherits rather than owns', () => {
    // An object literal inherits `toString`/`constructor`/`valueOf`, and a
    // bare lookup would find a function and throw on the spread — taking the
    // composer's render with it rather than falling back.
    for (const key of ['constructor', 'toString', 'valueOf']) {
      expect(resolveLoopDays(key as unknown as LoopSchedule['days']), key).toEqual([
        ...ALL_LOOP_WEEKDAYS,
      ]);
    }
    // …and the composed line neither throws nor gains a day rule: a
    // zero-width window plus an unreadable day token says nothing at all.
    expect(
      loopScheduleFragment({
        enabled: true,
        from: '09:00',
        to: '09:00',
        days: 'constructor' as unknown as LoopSchedule['days'],
      }),
    ).toBeNull();
  });

  it('reads a legacy preset string, which the store still holds unparsed', () => {
    // `settings.json` is spread into the store rather than re-parsed through
    // zod, so the type says array while the value on disk may be a token.
    expect(resolveLoopDays('weekends' as unknown as LoopSchedule['days'])).toEqual(['sat', 'sun']);
    expect(resolveLoopDays('nonsense' as unknown as LoopSchedule['days'])).toEqual([
      ...ALL_LOOP_WEEKDAYS,
    ]);
  });

  it('canonicalises an array: Monday first, duplicates and junk dropped', () => {
    expect(
      resolveLoopDays(['fri', 'mon', 'fri', 'nope'] as unknown as LoopSchedule['days']),
    ).toEqual(['mon', 'fri']);
  });

  it('keeps an empty selection empty — mid-edit is not "every day"', () => {
    expect(resolveLoopDays([])).toEqual([]);
  });
});

describe('the day axis', () => {
  const at = (days: LoopSchedule['days']): LoopSchedule => ({
    enabled: true,
    from: '09:00',
    to: '09:00',
    days,
  });

  it('says nothing for every day, and nothing for none — both are mid-answer', () => {
    expect(loopScheduleFragment(at([...ALL_LOOP_WEEKDAYS]))).toBeNull();
    expect(loopScheduleFragment(at([]))).toBeNull();
  });

  it('keeps the two preset sentences a stored preset used to compose', () => {
    expect(loopScheduleFragment(at(['mon', 'tue', 'wed', 'thu', 'fri']))).toContain(
      'weekdays only',
    );
    expect(loopScheduleFragment(at(['sat', 'sun']))).toContain('weekends only');
  });

  it('names an arbitrary set as a sentence, long-form and in week order', () => {
    expect(loopScheduleFragment(at(['fri', 'mon', 'wed']))).toBe(
      'Work on Monday, Wednesday and Friday only — idle on every other day.',
    );
    expect(loopScheduleSummary(at(['fri', 'mon', 'wed']))).toBe('Mon, Wed, Fri');
  });

  it('names a single day without a stray conjunction', () => {
    expect(loopScheduleFragment(at(['sun']))).toBe(
      'Work on Sunday only — idle on every other day.',
    );
  });
});

describe('loopModelArgs', () => {
  it('passes no flag for the default — the CLI keeps its own configuration', () => {
    expect(loopModelArgs('claude', 'default')).toEqual([]);
  });

  it('passes the pinned model id, not the friendly label', () => {
    expect(loopModelArgs('claude', 'sonnet-5')).toEqual(['--model', 'claude-sonnet-5']);
    expect(loopModelArgs('claude', 'opus-5')).toEqual(['--model', 'claude-opus-5']);
  });

  it('passes nothing to an agent whose CLI has no --model — it would fail the launch', () => {
    for (const agentId of ['codex', 'agy', 'opencode']) {
      expect(loopModelArgs(agentId, 'opus-5'), agentId).toEqual([]);
    }
  });

  it('offers exactly one model per id, and only the default passes no flag', () => {
    expect(LOOP_MODELS.map((m) => m.id)).toEqual([
      'default',
      'haiku-4-5',
      'sonnet-5',
      'sonnet-5-5',
      'opus-4-8',
      'opus-5',
      'opus-5-5',
      'fable-5',
      'fable-5-1',
    ]);
    expect(LOOP_MODELS.filter((m) => m.cliModel === null).map((m) => m.id)).toEqual(['default']);
    expect(new Set(LOOP_MODELS.map((m) => m.label)).size).toBe(LOOP_MODELS.length);
  });

  it('keeps every id in the schema, so a stored pick can never fail to parse', () => {
    for (const model of LOOP_MODELS) {
      expect(LoopModelSchema.safeParse(model.id).success, model.id).toBe(true);
    }
  });

  it('names the previous generations too — a long unattended run may want a known-good one', () => {
    expect(loopModelArgs('claude', 'opus-4-8')).toEqual(['--model', 'claude-opus-4-8']);
    expect(loopModelArgs('claude', 'opus-5-5')).toEqual(['--model', 'claude-opus-5-5']);
    expect(loopModelArgs('claude', 'sonnet-5-5')).toEqual(['--model', 'claude-sonnet-5-5']);
    expect(loopModelArgs('claude', 'fable-5-1')).toEqual(['--model', 'claude-fable-5-1']);
  });
});

describe('DEFAULT_LOOPS', () => {
  it('parses, and every loop has a unique id', () => {
    for (const entry of DEFAULT_LOOPS) expect(LoopDefinitionSchema.parse(entry)).toBeTruthy();
    expect(new Set(DEFAULT_LOOPS.map((l) => l.id)).size).toBe(DEFAULT_LOOPS.length);
  });

  it('covers the six FAB tabs, so persisted activeFabTab keeps meaning', () => {
    expect(DEFAULT_LOOPS.map((l) => l.id)).toEqual(['guard', 'innovate', 'automate', 'watchdog', 'medic', 'overhaul']);
  });

  it('runs claude only — the one agent with honest activity markers', () => {
    for (const entry of DEFAULT_LOOPS) expect(entry.agentId).toBe('claude');
  });

  it('gives every loop unique modifier and choice ids', () => {
    for (const entry of DEFAULT_LOOPS) {
      expect(new Set(entry.modifiers.map((m) => m.id)).size, entry.id).toBe(entry.modifiers.length);
      expect(new Set(entry.choices.map((c) => c.id)).size, entry.id).toBe(entry.choices.length);
    }
  });

  it('gives every choice a default that names one of its own options', () => {
    for (const entry of DEFAULT_LOOPS) {
      for (const choice of entry.choices) {
        const ids = choice.options.map((o) => o.id);
        expect(ids, `${entry.id}/${choice.id}`).toContain(choice.defaultOptionId);
        expect(new Set(ids).size, `${entry.id}/${choice.id}`).toBe(ids.length);
      }
    }
  });

  it('offers the autonomy radio on every loop, in the run group', () => {
    // The one setting every tab shares. It is a radio because its answers
    // contradict: ticking "take the recommendation" and "take the fastest
    // path" as boxes was a contradiction the composer had to shrug at.
    for (const entry of DEFAULT_LOOPS) {
      expect(entry.choices.at(-1), entry.id).toEqual(AUTONOMY_CHOICE);
    }
    expect(AUTONOMY_CHOICE.group).toBe('run');
    expect(AUTONOMY_CHOICE.defaultOptionId).toBe('ask');
  });

  it('never defaults autonomy away from asking — unattended is opt-in', () => {
    const ask = AUTONOMY_CHOICE.options.find((o) => o.id === AUTONOMY_CHOICE.defaultOptionId);
    expect(ask?.promptFragment).toBeUndefined();
  });

  it('offers the common run switches on every loop', () => {
    for (const entry of DEFAULT_LOOPS) {
      expect(entry.modifiers.slice(-COMMON_RUN_MODIFIERS.length), entry.id).toEqual([
        ...COMMON_RUN_MODIFIERS,
      ]);
    }
  });

  it('draws additive jobs as boxes and standing policies as switches', () => {
    // The rule the whole `control` field exists for. A task is something a run
    // can do alongside another task; a `run`-group setting is a mode.
    for (const entry of DEFAULT_LOOPS) {
      for (const modifier of entry.modifiers) {
        const expected = modifier.group === 'tasks' ? 'checkbox' : 'switch';
        expect(modifier.control, `${entry.id}/${modifier.id}`).toBe(expected);
      }
    }
  });

  it('keeps every label short enough to read in a 320px panel', () => {
    for (const entry of DEFAULT_LOOPS) {
      for (const modifier of entry.modifiers) {
        expect(modifier.label.length, `${entry.id}/${modifier.id}`).toBeLessThanOrEqual(26);
      }
      for (const choice of entry.choices) {
        expect(choice.label.length, `${entry.id}/${choice.id}`).toBeLessThanOrEqual(20);
        for (const option of choice.options) {
          expect(option.label.length, `${entry.id}/${option.id}`).toBeLessThanOrEqual(24);
        }
      }
    }
  });

  it('drives Patrol off a bare loop, with the PR skills as its checkboxes', () => {
    // Patrol's whole design: the base names no skill, so an unchecked box is a
    // skill that does *not* run. A skill creeping into `fallbackPrompt` would
    // make "Review PRs" a checkbox that changes nothing.
    const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog');
    expect(patrol?.label).toBe('Patrol');
    expect(patrol?.fallbackPrompt).toBe('/loop');
    expect(patrol?.agentCommandId).toBe('loopPatrol');

    const fragments = new Map(patrol?.modifiers.map((m) => [m.id, m.promptFragment]));
    expect(fragments.get('pr-review')).toBe('/pr-review');
    expect(fragments.get('pr-feedback')).toBe('/pr-feedback');
    expect(fragments.get('security-review')).toBe('/security-review');

    // Review is the tab's resting job; the others are extra passes.
    expect(patrol?.modifiers.find((m) => m.id === 'pr-review')?.defaultOn).toBe(true);
    expect(patrol?.modifiers.find((m) => m.id === 'pr-feedback')?.defaultOn).toBe(false);
  });

  it('puts Routine first on Patrol, on by default, ahead of the other task boxes', () => {
    const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog')!;
    const boxes = patrol.modifiers.filter((m) => m.control === 'checkbox');
    expect(boxes.map((m) => m.id)).toEqual(['routine', 'pr-review', 'pr-feedback', 'security-review']);
    expect(boxes.map((m) => m.label)).toEqual(['Routine', 'Review PRs', 'Reply to PRs', 'Security review']);

    const routine = patrol.modifiers[0]!;
    expect(routine.id).toBe('routine');
    expect(routine.group).toBe('tasks');
    expect(routine.providesTask).toBe(true);
    expect(routine.defaultOn).toBe(true);
    expect(routine.promptFragment).toBe(ROUTINE_PR_FRAGMENT);
  });

  it('renames "Answer feedback" to "Reply to PRs" without moving its persisted id', () => {
    // `pr-feedback` is a key in the persisted `loopModifierDefaults`; a saved
    // `true` from before the rename must still tick the same box.
    const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog')!;
    const feedback = patrol.modifiers.find((m) => m.id === 'pr-feedback');
    expect(feedback?.label).toBe('Reply to PRs');
    expect(feedback?.promptFragment).toBe('/pr-feedback');
    expect(DEFAULT_LOOPS.flatMap((l) => l.modifiers).some((m) => m.label === 'Answer feedback')).toBe(false);
  });

  it('scopes the Routine rule to the routine label and approves only without critical issues', () => {
    expect(ROUTINE_PR_FRAGMENT).toContain('`routine` label');
    expect(ROUTINE_PR_FRAGMENT).toMatch(/no critical issues, approve/);
    expect(ROUTINE_PR_FRAGMENT).toContain('"LGTM" or "🚀"');
    expect(ROUTINE_PR_FRAGMENT).toContain('do not approve');
    expect(ROUTINE_PR_FRAGMENT).toContain('PRs without the `routine` label are unaffected');
  });

  it('carries the Routine approve rule on the Patrol line only when the box is on', () => {
    const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog')!;
    const on = composeLoopPrompt(patrol.fallbackPrompt, patrol, { modifierIds: ['routine', 'pr-review'] });
    expect(on).toContain(ROUTINE_PR_FRAGMENT);
    // Tasks emit in declaration order, so Routine leads the line.
    expect(on.startsWith(`/loop ${ROUTINE_PR_FRAGMENT} /pr-review`)).toBe(true);

    const off = composeLoopPrompt(patrol.fallbackPrompt, patrol, { modifierIds: ['pr-review'] });
    expect(off).not.toContain(ROUTINE_PR_FRAGMENT);
    expect(off).not.toContain('routine');
  });

  it('starts a fresh Patrol run with Routine and Review PRs ticked', () => {
    // The composer's resolution order is run check ?? saved default ?? defaultOn,
    // and `loopModifierDefaults` is sparse — so a profile saved before Routine
    // existed has no entry for it and resolves to on, with no migration.
    const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog')!;
    const savedBeforeRoutine: Record<string, boolean> = { 'pr-review': true, 'pr-feedback': true };
    const ticked = patrol.modifiers
      .filter((m) => m.group === 'tasks' && (savedBeforeRoutine[m.id] ?? m.defaultOn))
      .map((m) => m.id);
    expect(ticked).toEqual(['routine', 'pr-review', 'pr-feedback']);
  });

  it('has Triage only override the Routine approval rule too', () => {
    // Routine is on by default, so a triage run's line carries it; the triage
    // fragment must name it or "leave no reviews" contradicts an approve order.
    const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog')!;
    const triage = patrol.modifiers.find((m) => m.id === 'triage-only')!;
    expect(triage.promptFragment).toContain('routine-PR approval rule');
  });

  it('gives Medic the dependency bots and the failing-test sweep over the issue backlog', () => {
    const medic = DEFAULT_LOOPS.find((l) => l.id === 'medic');
    expect(medic?.fallbackPrompt).toBe('/loop /midnite-address-issue');
    expect(medic?.agentCommandId).toBe('loopAddressIssue');
    expect(medic?.modifiers.filter((m) => m.group === 'tasks').map((m) => m.id)).toEqual([
      'dependabot',
      'renovate',
      'failing-tests',
      'prune-branches',
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

  it('gives a requiresModifier loop controls that can actually satisfy it', () => {
    // The guard reads `providesTask`, not "any box checked" — the autonomy
    // radio is a standing rule with no task under it. A loop that required a
    // modifier and marked none of them would be unstartable.
    for (const entry of DEFAULT_LOOPS.filter((l) => l.requiresModifier)) {
      expect(entry.modifiers.filter((m) => m.providesTask).map((m) => m.id), entry.id).toEqual([
        'routine',
        'pr-review',
        'pr-feedback',
        'security-review',
        'triage-only',
      ]);
    }
    for (const modifier of COMMON_RUN_MODIFIERS) expect(modifier.providesTask).toBeUndefined();
  });

  it('has Patrol override its own default-on skill when triage is switched on', () => {
    // `pr-review` is `defaultOn`, so the composed triage line still carries
    // `/pr-review`. The fragment must therefore *name* what it overrides — a
    // bare "do not review" beside `/pr-review` is a contradiction, not an order.
    const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog')!;
    const line = composeLoopPrompt(patrol.fallbackPrompt, patrol, {
      modifierIds: ['pr-review', 'triage-only'],
    });
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

  it('points both triage switches at the one read-only skill', () => {
    // Same words on two tabs must mean the same thing, or "Triage only" reads
    // as a different promise depending on which tab you flipped it on.
    const triage = DEFAULT_LOOPS.flatMap((l) => l.modifiers).filter((m) => m.id === 'triage-only');
    expect(triage).toHaveLength(2);
    for (const modifier of triage) {
      expect(modifier.label).toBe('Triage only');
      expect(modifier.control).toBe('switch');
      expect(modifier.promptFragment).toContain('/midnite-sitrep');
      expect(modifier.promptFragment).not.toContain('/midnite-triage');
      expect(modifier.promptFragment).toMatch(/push no fixes/);
    }
  });

  it('composes Patrol the way the tab reads — skills first, standing rules last', () => {
    const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog')!;
    expect(
      composeLoopPrompt(patrol.fallbackPrompt, patrol, {
        modifierIds: ['pr-feedback', 'pr-review'],
        choiceIds: { 'pr-scope': 'ready', autonomy: 'fastest' },
      }),
    ).toBe(
      '/loop /pr-review /pr-feedback Look only at PRs that are ready for review — skip drafts. Never stop to ask: keep advancing and always take the most performant option.',
    );
  });
});

describe('LoopRunRecordSchema', () => {
  const running = {
    id: 'r1',
    loopId: 'automate',
    sessionId: 's1',
    startedAt: 1,
    composedPrompt: '/loop /midnite-create',
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

  it('remembers the model, which the composed prompt cannot say', () => {
    expect(LoopRunRecordSchema.parse({ ...running, model: 'opus-5' })).toMatchObject({
      model: 'opus-5',
    });
    // Records written before the picker existed have no answer, and inventing
    // `'default'` for them would be a guess about what someone once ran.
    expect(LoopRunRecordSchema.parse(running).model).toBeUndefined();
    expect(LoopRunRecordSchema.safeParse({ ...running, model: 'haiku' }).success).toBe(false);
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

describe('loopModelsFor', () => {
  it('offers Claude the whole ladder', () => {
    expect(loopModelsFor('claude')).toEqual(LOOP_MODELS);
  });

  it('offers every other agent the neutral entry alone, matching loopModelArgs', () => {
    // A picker that offered Opus for `codex` and a launcher that dropped the
    // flag would disagree about what the run cost.
    for (const agentId of ['codex', 'agy', 'cursor']) {
      expect(loopModelsFor(agentId).map((entry) => entry.id), agentId).toEqual(['default']);
      expect(loopModelArgs(agentId, 'opus-5'), agentId).toEqual([]);
    }
  });
});

describe('skill field — skillTemplate / loopModifierFragment', () => {
  const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog')!;
  const modifier = (loopId: string, id: string) =>
    DEFAULT_LOOPS.find((l) => l.id === loopId)!.modifiers.find((m) => m.id === id)!;

  it('offers a skill field on every skill-invoking or review/feedback/triage option', () => {
    const withSkill = DEFAULT_LOOPS.flatMap((l) =>
      l.modifiers.filter((m) => m.skillTemplate !== undefined).map((m) => `${l.id}:${m.id}`),
    );
    expect(withSkill.sort()).toEqual(
      [
        'guard:security-review',
        'innovate:refine-existing',
        'medic:prune-branches',
        'medic:triage-only',
        'watchdog:pr-feedback',
        'watchdog:pr-review',
        'watchdog:routine',
        'watchdog:security-review',
        'watchdog:triage-only',
      ].sort(),
    );
  });

  it('reads exactly as the default fragment when the default skill is in the slot', () => {
    for (const loop of DEFAULT_LOOPS) {
      for (const m of loop.modifiers) {
        expect(m.skillTemplate === undefined || m.skillTemplate.includes(LOOP_SKILL_SLOT), m.id).toBe(true);
        if (m.defaultSkill !== undefined) {
          expect(m.skillTemplate!.split(LOOP_SKILL_SLOT).join(m.defaultSkill), `${loop.id}:${m.id}`).toBe(
            m.promptFragment,
          );
          expect(m.promptFragment).toContain(m.defaultSkill);
        }
      }
    }
  });

  it('rejects a skillTemplate with no slot', () => {
    expect(
      LoopModifierSchema.safeParse({ id: 'x', label: 'X', promptFragment: 'p', skillTemplate: 'no slot' }).success,
    ).toBe(false);
  });

  it('normalises the field text — slash added, whitespace collapsed, empty stays empty', () => {
    expect(normaliseLoopSkill('ekko-pr-review')).toBe('/ekko-pr-review');
    expect(normaliseLoopSkill('  /ekko-pr-review  ')).toBe('/ekko-pr-review');
    expect(normaliseLoopSkill('plugin:skill  --fast')).toBe('/plugin:skill --fast');
    expect(normaliseLoopSkill('   ')).toBe('');
    expect(normaliseLoopSkill(undefined)).toBe('');
  });

  it('substitutes a chosen skill, and keeps the default when the pick is empty', () => {
    const review = modifier('watchdog', 'pr-review');
    expect(loopModifierFragment(review, 'ekko-pr-review')).toBe('/ekko-pr-review');
    expect(loopModifierFragment(review, '')).toBe('/pr-review');
    expect(loopModifierFragment(review)).toBe('/pr-review');
    expect(loopModifierFragment(modifier('watchdog', 'routine'), '/ekko-pr-review')).toBe(
      ROUTINE_PR_SKILL_TEMPLATE.replace(LOOP_SKILL_SLOT, '/ekko-pr-review'),
    );
    expect(loopModifierFragment(modifier('watchdog', 'triage-only'), 'midnite-triage')).toContain(
      'run /midnite-triage instead',
    );
  });

  it('ignores a skill on an option that takes none', () => {
    const policy = modifier('automate', 'auto-merge');
    expect(loopModifierFragment(policy, '/whatever')).toBe(policy.promptFragment);
  });

  it('composes the picked skills into the line, per option', () => {
    expect(
      composeLoopPrompt('/loop', patrol, {
        modifierIds: ['pr-review', 'pr-feedback'],
        skills: { 'pr-review': 'ekko-pr-review', 'pr-feedback': '' },
      }),
    ).toBe('/loop /ekko-pr-review /pr-feedback');
  });
});

describe('#870 run options', () => {
  const patrol = DEFAULT_LOOPS.find((l) => l.id === 'watchdog')!;

  it('restricts review to the picked users, in the scope group', () => {
    expect(
      composeLoopPrompt('/loop', patrol, {
        modifierIds: ['pr-review', 'auto-approve'],
        reviewUsers: ['bilo-io', ' kurt '],
      }),
    ).toBe(
      '/loop /pr-review Review PRs for these users only: bilo-io, kurt. Auto-approve PRs that pass review with no blocking findings.',
    );
    expect(composeLoopPrompt('/loop', patrol, { modifierIds: ['pr-review'], reviewUsers: [] })).toBe(
      '/loop /pr-review',
    );
  });

  it('tells subagents when to rotate, with the run rules, clamped and snapped to the slider', () => {
    expect(LOOP_AUTO_ROTATE).toEqual({ min: 10, max: 100, step: 5, default: 30 });
    expect(composeLoopPrompt('/loop', patrol, { modifierIds: ['pr-review'], autoRotatePercent: 30 })).toBe(
      '/loop /pr-review Auto-rotate subagents at 30% context.',
    );
    expect(composeLoopPrompt('/loop', patrol, { autoRotatePercent: 3 })).toBe(
      '/loop Auto-rotate subagents at 10% context.',
    );
    expect(composeLoopPrompt('/loop', patrol, { autoRotatePercent: 140 })).toBe(
      '/loop Auto-rotate subagents at 100% context.',
    );
    expect(composeLoopPrompt('/loop', patrol, { autoRotatePercent: 47 })).toBe(
      '/loop Auto-rotate subagents at 45% context.',
    );
  });

  it('drops /loop when the Loop switch is off, so the run is once-off', () => {
    const create = { modifiers: [], choices: [] };
    expect(composeLoopPrompt('/loop /midnite-create', create, { repeat: false })).toBe('/midnite-create');
    expect(composeLoopPrompt('/loop /midnite-create', create, { repeat: true })).toBe('/loop /midnite-create');
    expect(composeLoopPrompt('/loop /midnite-create', create, {})).toBe('/loop /midnite-create');
    expect(composeLoopPrompt('/loop', patrol, { modifierIds: ['pr-review'], repeat: false })).toBe('/pr-review');
    expect(onceOffBasePrompt('/looper /x')).toBe('/looper /x');
  });

  it('keeps an old selection (no skills, users, rotate or repeat) composing exactly as before', () => {
    expect(
      composeLoopPrompt(patrol.fallbackPrompt, patrol, {
        modifierIds: ['pr-feedback', 'pr-review'],
        choiceIds: { 'pr-scope': 'ready' },
      }),
    ).toBe('/loop /pr-review /pr-feedback Look only at PRs that are ready for review — skip drafts.');
  });
});

describe('reviewsPrs', () => {
  it('is set on Patrol alone, the one loop that reviews other people’s PRs', () => {
    expect(DEFAULT_LOOPS.filter((loop) => loop.reviewsPrs).map((loop) => loop.id)).toEqual(['watchdog']);
  });

  it('defaults to false for a loop that does not declare it', () => {
    const parsed = LoopDefinitionSchema.parse({ ...DEFAULT_LOOPS[0]!, reviewsPrs: undefined });
    expect(parsed.reviewsPrs).toBe(false);
  });
});
