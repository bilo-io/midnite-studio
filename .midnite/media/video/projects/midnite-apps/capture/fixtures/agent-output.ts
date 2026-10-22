/**
 * Streamed agent transcripts for the live ptys, written through the mock
 * bridge's `__mstudioPtyWrite` seam on an in-page timer so xterm renders it
 * as real pty output (ANSI colour and all).
 */
import type { Page } from '@playwright/test';

import type { AgentRun } from './agents';

const C = {
  dim: '\x1b[2m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  orange: '\x1b[38;2;217;119;87m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  grey: '\x1b[90m',
  blue: '\x1b[38;2;120;160;255m',
};

type Step = { text: string; delay: number };

const FILES: Record<string, string[]> = {
  'phase-116-test-suite-diet': [
    'packages/app/e2e/visual/graph.visual.ts',
    'scripts/e2e-budget.mjs',
    'packages/app/playwright.visual.config.ts',
  ],
  'phase-111-voice-agent': [
    'packages/app/src/features/companion/voice-ports.ts',
    'packages/shared/src/companion-models.ts',
    'packages/app/src/features/companion/model-switcher.tsx',
  ],
  'phase-106-2d-assets': [
    'packages/features/media/renderer/sprites/sheet-grid.tsx',
    'packages/features/media/main/sprite-jobs.ts',
    'packages/shared/src/sprite-spec.ts',
  ],
  'phase-89-knowledge-variants': [
    'packages/features/knowledge/renderer/canvas/force-layout.ts',
    'packages/features/knowledge/renderer/canvas/radial-variant.tsx',
    'packages/shared/src/knowledge-graph.ts',
  ],
};

const DIFF: Record<string, [string, string]> = {
  'phase-116-test-suite-diet': ['export const BUDGET = { baselines: 100, megabytes: 3 };', 'const budget = 160;'],
  'phase-111-voice-agent': ["const model = session.pick('voice', prefs.voiceModel);", "const model = 'whisper-small';"],
  'phase-106-2d-assets': ['layers: parallax.map((l) => ({ ...l, speed: l.depth * 0.25 })),', 'layers: [background],'],
  'phase-89-knowledge-variants': ["variant: 'radial' | 'force' | 'tree';", "variant: 'force';"],
};

const THEME: Record<string, string> = {
  'phase-116-test-suite-diet': 'Theme D — the visual-baseline ratchet',
  'phase-111-voice-agent': 'Theme C — switch models mid-conversation',
  'phase-106-2d-assets': 'Theme L — parallax backgrounds',
  'phase-89-knowledge-variants': 'Theme F — the radial variant',
};

export function agentScript(run: AgentRun): Step[] {
  const files = FILES[run.slug] ?? ['packages/app/src/app.tsx'];
  const theme = THEME[run.slug] ?? 'next theme';
  const [plus, minus] = DIFF[run.slug] ?? ['export {};', '// todo'];
  const L = (text: string, delay = 380): Step => ({ text: text + '\r\n', delay });
  return [
    L(`${C.orange}✻${C.reset} ${C.bold}/midnite-create${C.reset} ${run.title} ${C.grey}· ${theme}${C.reset}`, 200),
    L(''),
    L(`${C.green}⏺${C.reset} ${C.bold}Read${C.reset}(.midnite/tasks/phases/${run.slug}.md)`),
    L(`  ${C.grey}⎿  Read 214 lines${C.reset}`, 300),
    L(`${C.green}⏺${C.reset} ${C.bold}Bash${C.reset}(git worktree add .worktrees/${run.slug} -b feature/${run.slug})`, 520),
    L(`  ${C.grey}⎿  Preparing worktree (new branch 'feature/${run.slug}')${C.reset}`, 300),
    L(`${C.green}⏺${C.reset} ${C.bold}Read${C.reset}(${files[0]})`, 480),
    L(`  ${C.grey}⎿  Read 168 lines${C.reset}`, 260),
    L(`${C.green}⏺${C.reset} ${C.bold}Update${C.reset}(${files[0]})`, 600),
    L(`  ${C.grey}⎿  Updated with ${C.green}14 additions${C.grey} and ${C.red}6 removals${C.reset}`, 260),
    L(`     ${C.grey}42${C.reset} ${C.green}+  ${plus}${C.reset}`, 140),
    L(`     ${C.grey}43${C.reset} ${C.red}-  ${minus}${C.reset}`, 140),
    L(`${C.green}⏺${C.reset} ${C.bold}Update${C.reset}(${files[1]})`, 640),
    L(`  ${C.grey}⎿  Updated with ${C.green}9 additions${C.grey} and ${C.red}2 removals${C.reset}`, 260),
    L(`${C.green}⏺${C.reset} ${C.bold}Write${C.reset}(${files[2]})`, 560),
    L(`  ${C.grey}⎿  Wrote 61 lines${C.reset}`, 260),
    L(`${C.green}⏺${C.reset} ${C.bold}Bash${C.reset}(git commit -am "feat: ${theme.split(' — ')[1] ?? theme}")`, 700),
    L(`  ${C.grey}⎿  [feature/${run.slug} 4c1e9a2] 3 files changed, 84 insertions(+), 8 deletions(-)${C.reset}`, 300),
    L(`${C.green}⏺${C.reset} ${C.bold}Bash${C.reset}(git push -u origin feature/${run.slug})`, 640),
    L(`  ${C.grey}⎿  branch 'feature/${run.slug}' set up to track 'origin/feature/${run.slug}'${C.reset}`, 300),
    L(''),
    L(`${C.orange}✶${C.reset} ${C.orange}Thinking…${C.reset} ${C.grey}(esc to interrupt)${C.reset}`, 500),
  ];
}

/** Starts an in-page timer per pty; returns a stop function. */
export function playAgentScript(page: Page, streams: { pty: string; lines: Step[] }[]): () => Promise<void> {
  const ready = page.evaluate((streams) => {
    const w = window as unknown as {
      __mstudioPtyWrite: (p: string, d: string) => boolean;
      __capTimers?: number[];
    };
    w.__capTimers = [];
    streams.forEach((s, si) => {
      let i = 0;
      const tick = (): void => {
        if (i >= s.lines.length) i = 2; // loop the work, never the header
        const step = s.lines[i++]!;
        w.__mstudioPtyWrite(s.pty, step.text);
        w.__capTimers!.push(window.setTimeout(tick, step.delay));
      };
      w.__capTimers!.push(window.setTimeout(tick, 120 + si * 260));
    });
  }, streams);
  return async () => {
    await ready;
    await page.evaluate(() => {
      const w = window as unknown as { __capTimers?: number[] };
      (w.__capTimers ?? []).forEach((t) => clearTimeout(t));
    });
  };
}
