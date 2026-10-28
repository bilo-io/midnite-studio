/**
 * councils-dark — a seeded four-member council; type a question, Run, watch the
 * members settle one by one (the view polls `council.run.get` every 1.2s), read
 * two answers, then the synthesis.
 *
 * The mock's own `run.start` answers with an instantly-completed run and
 * placeholder text, so this shot swaps `council.run.{start,get,list}` in-page
 * for a staged run with real prose.
 */
import { expect, test } from '@playwright/test';

import { installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glideTo, gotoView, placeCursor, preparePage, Recorder, settlePage, typeSlow } from '../lib';
import { roadmapFixtures } from '../fixtures/roadmap';

const NOW = Date.now();
const COUNCIL = {
  id: 'council-release',
  name: 'Release council',
  description: 'Go / no-go before a tag is cut.',
  members: [
    { id: 'm1', name: 'Architect', provider: 'agy', role: 'Judge the design and its blast radius.' },
    { id: 'm2', name: 'Skeptic', provider: 'codex', role: 'Find the strongest objection.' },
    { id: 'm3', name: 'Security', provider: 'opencode', role: 'Look for anything that leaves the Mac.' },
    { id: 'm4', name: 'Release manager', provider: 'agy', role: 'Decide what ships and when.' },
  ],
  synthProvider: 'agy',
  createdAt: NOW - 86_400_000 * 3,
  updatedAt: NOW - 86_400_000,
};

const PROMPT = 'Should v0.0.5 ship the launcher auto-update channel, or hold it a release?';

const ANSWERS: Record<string, string> = {
  m1:
    'Ship it behind the feed. The generic provider already reads midnite-studio/feed/latest-mac.yml, so the launcher can reuse the same manifest shape with no new endpoint.\n\n' +
    'Blast radius is the launcher alone: Studio keeps its own updater, and the namespaced tags mean releases/latest is never consulted.\n\n' +
    'One change before the tag: pin the feed URL in electron-builder.yml rather than deriving it at runtime.',
  m2:
    'Hold it. The launcher has no rollback path yet — if a bad build reaches the feed, every installed copy pulls it on next launch.\n\n' +
    'We have never exercised a downgrade on a packaged arm64 build, and the CI lane that would catch it (gate-native) runs on main only.\n\n' +
    'Ship the channel dark in 0.0.5 and flip it on in 0.0.6 once one update has round-tripped by hand.',
  m3:
    'The update check is the launcher\'s first request that leaves the Mac on its own. It must go to the public feed only, over HTTPS, with no identifiers in the query string.\n\n' +
    'Checksums are already in version.json; verify them before swapping the bundle. With that, no objection.',
  m4:
    'Ship in 0.0.5 with the channel default-off and a Settings ▸ Updates switch. That satisfies the Skeptic without slipping the date.\n\n' +
    'Owner: Phase 117 Theme B. Verification: one manual update on a clean macOS profile before the tag.',
};

const SYNTHESIS =
  'Verdict: ship the auto-update channel in v0.0.5, default-off.\n\n' +
  'Agreed by all four:\n' +
  '  • Reuse the generic feed (midnite-studio/feed/latest-mac.yml); no new endpoint.\n' +
  '  • HTTPS only, no identifiers, checksums from version.json verified before swap.\n\n' +
  'Resolved disagreement: the Skeptic\'s rollback concern is met by shipping dark —\n' +
  'Settings ▸ Updates ▸ "Check for launcher updates" stays off until one update has\n' +
  'round-tripped on a clean profile.\n\n' +
  'Next: Phase 117 Theme B, plus a manual verification line in the release checklist.';

function stageCouncil(cfg: { answers: Record<string, string>; synthesis: string; settleAt: number[]; synthAt: number }): void {
  const w = window as unknown as {
    midniteStudio: { council: { run: Record<string, unknown> } };
    __capRuns?: Record<string, unknown>[];
  };
  const runs: Array<Record<string, unknown> & { id: string; councilId: string; t0: number }> = [];
  const snapshot = (r: (typeof runs)[number]): Record<string, unknown> => {
    const dt = Date.now() - r.t0;
    const members = (r['members'] as Array<Record<string, unknown>>).map((m, i) => {
      const done = dt >= (cfg.settleAt[i] ?? 3000);
      return {
        ...m,
        status: done ? 'succeeded' : 'running',
        output: done ? cfg.answers[m['memberId'] as string] ?? '' : '',
        ...(done ? { endedAt: r.t0 + (cfg.settleAt[i] ?? 0) } : {}),
      };
    });
    const allDone = members.every((m) => m.status === 'succeeded');
    const status = !allDone ? 'running' : dt >= cfg.synthAt ? 'completed' : 'synthesizing';
    return {
      ...r,
      members,
      status,
      synthesisOutput: status === 'completed' ? cfg.synthesis : '',
      updatedAt: Date.now(),
    };
  };
  const run = w.midniteStudio.council.run;
  const origList = run['list'] as (req: { councilId: string }) => Promise<{ runs: unknown[] }>;
  run['start'] = async (req: { councilId: string; prompt: string }) => {
    const council = (await (w.midniteStudio.council as unknown as { get: (r: { id: string }) => Promise<{ council: Record<string, unknown> }> }).get({ id: req.councilId })).council;
    const t0 = Date.now();
    const r = {
      id: `run-${runs.length + 1}`,
      councilId: req.councilId,
      prompt: req.prompt,
      format: 'brainstorm',
      synthProvider: council['synthProvider'],
      members: (council['members'] as Array<Record<string, string>>).map((m) => ({
        memberId: m['id'],
        name: m['name'],
        provider: m['provider'],
        role: m['role'],
        status: 'running',
        output: '',
        truncated: false,
        startedAt: t0,
      })),
      synthesisTruncated: false,
      createdAt: t0,
      t0,
    };
    runs.push(r);
    return { ok: true, value: snapshot(r) };
  };
  run['get'] = async (req: { runId: string }) => {
    const r = runs.find((x) => x.id === req.runId);
    return { run: r ? snapshot(r) : null };
  };
  run['list'] = async (req: { councilId: string }) => {
    const mine = runs.filter((x) => x.councilId === req.councilId).map(snapshot);
    if (mine.length) return { runs: mine };
    return origList(req);
  };
}

test('councils-dark', async ({ page }) => {
  await installMockBridge(page, roadmapFixtures({ councils: [COUNCIL] } as never), { cspGuard: false });
  await preparePage(page, { theme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(stageCouncil, {
    answers: ANSWERS,
    synthesis: SYNTHESIS,
    settleAt: [1700, 3100, 2300, 4300],
    synthAt: 5600,
  });
  await expect(async () => {
    await gotoView(page, 'Councils');
    await expect(page.getByText('Release council').first()).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  await page.getByText('Release council').first().click();
  const prompt = page.getByPlaceholder('What should the council answer?');
  await expect(prompt).toBeVisible();
  await placeCursor(page, 760, 420);
  await settlePage(page, 1000);

  const rec = new Recorder(page, 'councils-dark');
  await rec.start();
  await page.waitForTimeout(600);
  await glideTo(page, prompt, 900, { x: 0.3, y: 0.5 });
  await click(page);
  await typeSlow(page, PROMPT, 22);
  await page.waitForTimeout(250);
  await glideTo(page, page.getByRole('button', { name: 'Run', exact: true }), 700);
  await click(page);
  const pane = page.locator('.panel-stack-pane:not([aria-hidden])');
  await expect(pane.getByRole('button', { name: /^Architect/ })).toBeVisible();
  await page.waitForTimeout(1600);
  await glideTo(page, pane.getByRole('button', { name: /^Architect/ }), 700);
  await click(page);
  await page.waitForTimeout(1500);
  await glideTo(page, pane.getByRole('button', { name: /^Skeptic/ }), 600);
  await click(page);
  await page.waitForTimeout(1700);
  await glideTo(page, pane.getByRole('button', { name: 'Synthesis' }), 900);
  await click(page);
  await expect(pane.getByText(/^Verdict: ship/)).toBeVisible({ timeout: 8000 });
  // The run list is fetched once at Run and the mock never refetches it, so its
  // row would read Running forever; render what a refetch would (green "Done").
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('span.text-blue-500')) {
      if (!el.textContent?.includes('Running')) continue;
      el.classList.replace('text-blue-500', 'text-green-500');
      el.querySelector('svg')?.remove();
      el.lastChild!.textContent = 'Done';
    }
  });
  await page.waitForTimeout(2600);
  await rec.stop();
});
