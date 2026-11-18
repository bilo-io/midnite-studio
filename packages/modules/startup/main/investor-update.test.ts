// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { BASE_SCENARIO_ID, buildFleetStarter, type PlanLine, type StartupLedgerSummary, type StartupWorkspace } from '@midnite/studio-shared';

import { buildInvestorUpdatePrompt, cleanInvestorUpdate, factLines, gatherUpdateFacts, UPDATE_SECTIONS } from './investor-update';
import { emptyWorkspace } from './workspace-store';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = new Date('2026-11-18T10:00:00Z');
const line = (n: number, kind: 'cost' | 'revenue', minor: number, over: Partial<PlanLine> = {}): PlanLine => ({
  id: u(n), kind, name: `L${n}`, category: kind === 'revenue' ? 'revenue' : 'software', minor, cadence: 'monthly', start: '2026-01', growthBpPerMonth: 0, ...over,
});
const ms = (n: number, status: 'planned' | 'in-progress' | 'done' | 'dropped', due: string) => ({ id: u(n), title: `Milestone ${n}`, description: '', status, due, dependsOn: [], tags: [] });

const seeded = (): StartupWorkspace => ({
  ...emptyWorkspace(),
  company: { name: 'Acme', currency: 'ZAR', address: '', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 50_000_000, asOf: '2026-11-01' } },
  lines: [line(1, 'cost', 2_000_000), line(2, 'revenue', 1_000_000, { start: '2026-11' })],
  milestones: [ms(1, 'done', '2026-11-10'), ms(2, 'done', '2026-10-30'), ms(3, 'in-progress', '2026-12-20'), ms(4, 'planned', '2026-12-05'), ms(5, 'planned', '2027-03-01'), ms(6, 'dropped', '2026-11-12')],
});

describe('gatherUpdateFacts', () => {
  it('buckets milestones by the period boundaries and drops dropped ones', () => {
    const f = gatherUpdateFacts(seeded(), '2026-11', NOW);
    expect(f.milestones.done).toEqual(['Milestone 1']);
    expect(f.milestones.inProgress).toEqual(['Milestone 3']);
    expect(f.milestones.dueNext).toEqual(['Milestone 3', 'Milestone 4']);
  });

  it('reads revenue this month against last, and the next three months from the base scenario', () => {
    const f = gatherUpdateFacts(seeded(), '2026-11', NOW);
    expect(f.revenue).toEqual({ thisMonth: 'R 10,000', lastMonth: 'R 0' });
    expect(f.next.map((n) => n.month)).toEqual(['December 2026', 'January 2027', 'February 2027']);
    expect(f.next[0]).toMatchObject({ revenue: 'R 10,000', cost: 'R 20,000', net: '−R 10,000' });
  });

  it('models cash and burn without a book, and takes both from the book when one answers', () => {
    const modelled = gatherUpdateFacts(seeded(), '2026-11', NOW);
    expect(modelled.cash).toEqual({ amount: 'R 500,000', source: 'modelled', asOf: '2026-11-01' });
    expect(modelled.burn).toEqual({ text: 'R 10,000 a month', source: 'modelled' });
    const book: StartupLedgerSummary = { bookName: 'Acme', cashMinor: 31_000_000, asOf: '2026-11-17', actualBurnMinor: 1_500_000 };
    const booked = gatherUpdateFacts(seeded(), '2026-11', NOW, book);
    expect(booked.cash).toEqual({ amount: 'R 310,000', source: 'book', asOf: '2026-11-17' });
    expect(booked.burn).toEqual({ text: 'R 15,000 a month', source: 'book' });
  });

  it('says so when cash does not run out, and when the plan is net positive', () => {
    const ws = { ...seeded(), lines: [line(2, 'revenue', 1_000_000)] };
    const f = gatherUpdateFacts(ws, '2026-11', NOW);
    expect(f.runway).toBe('cash does not run out within 24 months');
    expect(f.burn.text).toBe('none, net positive');
  });

  it('lists only fleet projections linked to Runway, with month-0 net', () => {
    const p = buildFleetStarter('gpu-cluster', { projectionId: u(100), nodeId: (() => { let n = 200; return () => u(n++); })() }, '2026-11-01T00:00:00.000Z', 'Rack');
    const q = { ...p, id: u(101), name: 'Unlinked' };
    const source = { kind: 'fleetProjection' as const, projectionId: u(100), part: 'opex' as const, syncedAt: '2026-11-01T00:00:00.000Z' };
    const ws = { ...seeded(), fleetProjections: [p, q], lines: [...seeded().lines, line(9, 'cost', 100, { source })] };
    const f = gatherUpdateFacts(ws, '2026-11', NOW);
    expect(f.fleet.map((x) => x.name)).toEqual(['Rack']);
    expect(f.fleet[0]!.netMonth0).toMatch(/^−?R /);
  });

  it('survives an empty workspace', () => {
    const f = gatherUpdateFacts(emptyWorkspace(), '2026-11', NOW);
    expect(f.company).toBe('the company');
    expect(f.milestones).toEqual({ done: [], inProgress: [], dueNext: [] });
    expect(BASE_SCENARIO_ID).toBeTruthy();
  });
});

describe('buildInvestorUpdatePrompt', () => {
  const facts = gatherUpdateFacts(seeded(), '2026-11', NOW);
  it('carries every fact line and the fixed section list', () => {
    const prompt = buildInvestorUpdatePrompt(facts, '', undefined);
    for (const l of factLines(facts)) expect(prompt).toContain(l);
    for (const s of UPDATE_SECTIONS) expect(prompt).toContain(s);
    expect(prompt).toContain('400 words');
    expect(prompt).toContain('Do not invent');
  });
  it('adds notes and the previous update only when given', () => {
    expect(buildInvestorUpdatePrompt(facts, '  ', undefined)).not.toContain("founder's notes");
    expect(buildInvestorUpdatePrompt(facts, 'Hiring a CTO', '## Highlights\nlast month')).toContain('Hiring a CTO');
    expect(buildInvestorUpdatePrompt(facts, '', '## Highlights\nlast month')).toContain('last month');
  });
});

describe('cleanInvestorUpdate', () => {
  it('unwraps one outer fence and trims', () => {
    expect(cleanInvestorUpdate('```markdown\n## Highlights\nHi\n```\n')).toBe('## Highlights\nHi');
    expect(cleanInvestorUpdate('```\n## A\n```')).toBe('## A');
  });
  it('leaves unfenced text, and a fence inside content, alone', () => {
    expect(cleanInvestorUpdate('  ## A\n\ntext  ')).toBe('## A\n\ntext');
    expect(cleanInvestorUpdate('Intro\n```js\nx\n```\nOutro')).toBe('Intro\n```js\nx\n```\nOutro');
  });
});
