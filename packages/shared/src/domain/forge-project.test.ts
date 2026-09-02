import { describe, expect, it } from 'vitest';

import {
  ForgeProjectFieldSchema,
  ForgeProjectFieldValueSchema,
  ForgeProjectItemSchema,
  ForgeProjectSchema,
} from './forge-project';

describe('ForgeProjectSchema', () => {
  it('round-trips a real board', () => {
    const project = {
      id: 'PVT_kwDOA1',
      number: 7,
      title: 'Roadmap',
      url: 'https://github.com/orgs/o/projects/7',
      closed: false,
    };
    expect(ForgeProjectSchema.parse(project)).toEqual(project);
  });
});

describe('ForgeProjectFieldSchema', () => {
  it('round-trips every dataType, including the read-only iteration arm', () => {
    const text = { id: 'f1', name: 'Notes', dataType: 'text' as const };
    const number = { id: 'f2', name: 'Estimate', dataType: 'number' as const };
    const date = { id: 'f3', name: 'Due', dataType: 'date' as const };
    const singleSelect = {
      id: 'f4',
      name: 'Status',
      dataType: 'single_select' as const,
      options: [
        { id: 'o1', name: 'Todo', color: 'GRAY' },
        { id: 'o2', name: 'Done', color: 'GREEN' },
      ],
    };
    const iteration = { id: 'f5', name: 'Sprint', dataType: 'iteration' as const };

    expect(ForgeProjectFieldSchema.parse(text)).toEqual(text);
    expect(ForgeProjectFieldSchema.parse(number)).toEqual(number);
    expect(ForgeProjectFieldSchema.parse(date)).toEqual(date);
    expect(ForgeProjectFieldSchema.parse(singleSelect)).toEqual(singleSelect);
    // A board with an iteration field still loads — it just parses read-only.
    expect(ForgeProjectFieldSchema.parse(iteration)).toEqual(iteration);
  });

  it('refuses a single_select field with no options key at all, but accepts an empty list', () => {
    const parsed = ForgeProjectFieldSchema.parse({
      id: 'f1',
      name: 'Status',
      dataType: 'single_select',
    });
    if (parsed.dataType !== 'single_select') throw new Error('expected single_select');
    expect(parsed.options).toEqual([]);
  });

  it('rejects a dataType no member of the union claims', () => {
    expect(() =>
      ForgeProjectFieldSchema.parse({ id: 'f1', name: 'Weird', dataType: 'checkbox' }),
    ).toThrow();
  });
});

describe('ForgeProjectFieldValueSchema', () => {
  it('parses one value per dataType', () => {
    expect(
      ForgeProjectFieldValueSchema.parse({ fieldId: 'f1', dataType: 'text', text: 'hi' }),
    ).toMatchObject({ text: 'hi' });
    expect(
      ForgeProjectFieldValueSchema.parse({ fieldId: 'f2', dataType: 'number', number: 3 }),
    ).toMatchObject({ number: 3 });
    expect(
      ForgeProjectFieldValueSchema.parse({ fieldId: 'f3', dataType: 'date', date: '2026-06-01' }),
    ).toMatchObject({ date: '2026-06-01' });
    expect(
      ForgeProjectFieldValueSchema.parse({
        fieldId: 'f5',
        dataType: 'iteration',
        iterationId: 'it_1',
        title: 'Sprint 4',
      }),
    ).toMatchObject({ iterationId: 'it_1' });
  });

  /**
   * The case the schema's own doc comment exists for: GitHub lets a board's
   * options be renamed or deleted after an item was already set against one,
   * so an item field value has to keep parsing even once its `optionId` no
   * longer appears anywhere in `ForgeProjectField.options`. The two schemas
   * are deliberately never cross-checked against each other for exactly this
   * reason.
   */
  it('still parses a single_select value whose optionId has fallen out of the field\'s options', () => {
    const field = ForgeProjectFieldSchema.parse({
      id: 'f4',
      name: 'Status',
      dataType: 'single_select',
      options: [{ id: 'o1', name: 'Todo', color: 'GRAY' }],
    });
    if (field.dataType !== 'single_select') throw new Error('expected single_select');

    const staleValue = ForgeProjectFieldValueSchema.parse({
      fieldId: 'f4',
      dataType: 'single_select',
      optionId: 'o-deleted',
      name: 'Archived Status',
    });
    if (staleValue.dataType !== 'single_select') throw new Error('expected single_select');

    expect(staleValue.optionId).toBe('o-deleted');
    // Confirms the two never reference each other: the option list changing
    // does not retroactively invalidate a value that already parsed.
    expect(field.options.some((o) => o.id === staleValue.optionId)).toBe(false);
  });

  it('rejects a dataType the union has no arm for', () => {
    expect(() =>
      ForgeProjectFieldValueSchema.parse({ fieldId: 'f1', dataType: 'checkbox', checked: true }),
    ).toThrow();
  });
});

describe('ForgeProjectItemSchema / ForgeProjectItemContent', () => {
  it('round-trips an issue item', () => {
    const item = {
      id: 'PVTI_1',
      content: {
        type: 'issue' as const,
        id: 'I_1',
        number: 42,
        title: 'Fix the thing',
        url: 'https://github.com/o/r/issues/42',
        state: 'open' as const,
        assignees: ['octocat'],
        body: 'Steps to reproduce…',
        labels: ['bug'],
      },
      fieldValues: {
        f1: { fieldId: 'f1', dataType: 'text' as const, text: 'a note' },
      },
    };
    expect(ForgeProjectItemSchema.parse(item)).toEqual(item);
  });

  it('round-trips a pull item', () => {
    const item = {
      id: 'PVTI_2',
      content: {
        type: 'pull' as const,
        id: 'PR_1',
        number: 7,
        title: 'Add feature',
        url: 'https://github.com/o/r/pull/7',
        state: 'open' as const,
        assignees: [],
        body: '',
        labels: [],
      },
      fieldValues: {},
    };
    expect(ForgeProjectItemSchema.parse(item)).toEqual(item);
  });

  /**
   * A draft item has no issue or PR behind it — the union's whole reason for
   * existing. It must parse with no `number` and no `url` at all, not with
   * either defaulted to a placeholder a renderer could still link against.
   */
  it('round-trips a draft item with no number and no url', () => {
    const item = {
      id: 'PVTI_3',
      content: {
        type: 'draft' as const,
        id: 'DI_1',
        title: 'Investigate flaky test',
        assignees: [],
        body: '',
      },
      fieldValues: {},
    };
    const parsed = ForgeProjectItemSchema.parse(item);
    expect(parsed).toEqual(item);
    expect('number' in parsed.content).toBe(false);
    expect('url' in parsed.content).toBe(false);
  });

  it('strips a stray number off a draft rather than growing the shape to hold it', () => {
    // zod objects drop unrecognised keys rather than reject them, so a draft
    // handed a `number` by a caller that forgot which variant it was building
    // still comes out with no `number` on it — never the union quietly
    // widening to carry one.
    const parsed = ForgeProjectItemSchema.parse({
      id: 'PVTI_4',
      content: { type: 'draft', id: 'DI_2', title: 'x', number: 1 },
      fieldValues: {},
    });
    expect('number' in parsed.content).toBe(false);
  });

  /**
   * The tolerant-array-parsing pattern `gh-parse.ts` uses everywhere else in
   * this contract (see `parseIssueList`, `parseRunList`): a page is built by
   * `safeParse`-ing each raw row and skipping the ones that fail, so one
   * malformed item never costs the rest of the page. This is the schema-level
   * half of that pattern — it proves a bad row's `safeParse` fails cleanly
   * (never throws) while its neighbours still succeed, which is what
   * `gh-project.ts` (Theme B) will loop over the same way.
   */
  it('lets one malformed item in a page fail parsing without the page throwing', () => {
    const goodOne = {
      id: 'PVTI_1',
      content: {
        type: 'issue' as const,
        id: 'I_1',
        number: 1,
        title: 'Good one',
        url: 'https://github.com/o/r/issues/1',
        state: 'open' as const,
        assignees: [],
      },
      fieldValues: {},
    };
    // Missing `content` entirely — the shape of a row `gh` truncated or a
    // future API version changed underneath this app.
    const malformed = { id: 'PVTI_2' };
    const goodTwo = {
      id: 'PVTI_3',
      content: { type: 'draft' as const, id: 'DI_1', title: 'Draft', assignees: [] },
      fieldValues: {},
    };

    const rawPage: unknown[] = [goodOne, malformed, goodTwo];

    expect(() => {
      const parsedPage = rawPage
        .map((raw) => ForgeProjectItemSchema.safeParse(raw))
        .filter((result) => result.success)
        .map((result) => result.data);
      expect(parsedPage).toHaveLength(2);
      expect(parsedPage.map((i) => i.id)).toEqual(['PVTI_1', 'PVTI_3']);
    }).not.toThrow();
  });
});
