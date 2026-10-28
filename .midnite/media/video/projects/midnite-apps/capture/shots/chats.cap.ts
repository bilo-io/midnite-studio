/**
 * chats-dark — Agents ▸ Chats: ask Claude about this repo's terminal broker
 * and watch the answer arrive — thinking, tool calls (Read / Grep), then a
 * markdown answer with a code block (the real `socket-name.ts`) and a list.
 *
 * The mock's own `send` streams its reply in three chunks with no tool calls,
 * so an init script takes over `send` / `get` for the staged chat and drives
 * the same `chats.onEvent` stream the real main process does: `thinking`,
 * `activity`, word-sized `delta`s, `usage`, then the final `message`.
 */
import { expect, test, type Page } from '@playwright/test';

import { installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, gotoView, placeCursor, preparePage, Recorder, settlePage, typeSlow } from '../lib';
import { MAIN, REPO_ID, roadmapFixtures } from '../fixtures/roadmap';

const PROBE = process.env['CAP_PROBE'];
const shot = async (page: Page, n: string) => {
  if (PROBE) await page.screenshot({ path: `${PROBE}/chats-${n}.png` });
};

const NOW = Date.now();
const MIN = 60_000;
const CHAT_ID = 'chat-broker';

const chat = (id: string, title: string, agoMin: number, messages: Array<[string, string]>, engine = 'claude') => ({
  id,
  title,
  engine,
  model: null,
  mode: 'ask',
  repoId: REPO_ID,
  repoName: 'midnite-studio',
  repoPath: MAIN,
  pinned: false,
  createdAt: NOW - agoMin * MIN - 600_000,
  updatedAt: NOW - agoMin * MIN,
  session: null,
  messages: messages.map(([role, text], i) => ({
    id: `${id}-m${i}`,
    role,
    text,
    createdAt: NOW - agoMin * MIN - (messages.length - i) * 30_000,
    status: 'done',
    ...(role === 'assistant' ? { engine } : {}),
  })),
});

const SEED = [
  chat(CHAT_ID, 'The terminal broker', 2, [
    ['user', 'Where does the pty broker live?'],
    ['assistant', 'In `packages/desktop/src/broker/`. It is spawned **detached**, so terminals survive reloads, window closes and relaunches. Every app attaches to it through the runtime’s `broker/client.ts`.'],
  ]),
  chat('chat-gate', 'Fold gate-locale into gate-native', 48, [['user', 'Can gate-locale run as a step in gate-native?'], ['assistant', 'Yes. It needs the same native modules, so one job saves a 321s macOS VM boot.']]),
  chat('chat-lanes', 'Lane layout for octopus merges', 190, [['user', 'How does the lane layout handle a merge with three parents?'], ['assistant', 'Each extra parent opens a lane to the right of the commit’s own.']], 'codex'),
  chat('chat-lock', 'Why is index.lock contended?', 400, [['user', 'Why did two writes race on index.lock?'], ['assistant', 'They bypassed the per-repo write queue. All git writes go through `write-queue.ts`.']]),
  chat('chat-gpu', 'Phase 117 · per-process GPU share', 1300, [['user', 'Plan the GPU share column for Monitor.'], ['assistant', 'Read `ioreg` per process in main, sample with the metrics stream.']]),
  chat('chat-knowledge', 'Knowledge view cold load', 2900, [['user', 'Why is the knowledge view slow on first open?'], ['assistant', 'The 15k-node layout runs cold. Cache it per builtAtCommit.']], 'codex'),
];

const QUESTION = 'Why do my terminals survive a reinstall? Show me where the socket name is built.';

const THINKING = 'The user wants the reinstall behaviour. That is the broker socket name plus the staleness check. Read socket-name.ts and staleness.ts, then the client’s legacy-peer path.';
const ACTIVITY = [
  'Read packages/runtime/src/broker/socket-name.ts',
  'Grep "brokerSocketName" packages/',
  'Read packages/desktop/src/broker/staleness.ts',
  'Read packages/runtime/src/broker/client.ts',
];
const REPLY = [
  'The broker is spawned **detached**, so it outlives the window. Its socket name carries a **build fingerprint**, so a new build never attaches to a broker running the old bundle:',
  '',
  '```ts',
  '// packages/runtime/src/broker/socket-name.ts',
  'export function brokerSocketName(',
  '  appVersion: string, buildId: string, isPackaged: boolean,',
  '): string {',
  "  return `${appVersion}-${buildId}${isPackaged ? '' : '-dev'}.sock`;",
  '}',
  '',
  'export function fingerprintFile(path: string): string {',
  "  return createHash('sha1').update(readFileSync(path)).digest('hex').slice(0, 8);",
  '}',
  '```',
  '',
  'On a reinstall:',
  '',
  '1. The new build gets a new name and starts **its own** broker.',
  '2. The old broker is found as a *legacy peer*: its sessions stay reachable until they end.',
  '3. If the broker script or `spawn-helper` changes on disk, it answers `create` with `stale-broker` and retires to `-retired-<pid>.sock` **before** its successor binds the path.',
].join('\n');

function chatsInit(seed: { chatId: string; chats: Array<Record<string, unknown>>; thinking: string; activity: string[]; reply: string }): void {
  const w = window as unknown as { midniteStudio?: { chats?: Record<string, unknown> } };
  const api = w.midniteStudio?.chats;
  if (!api) return;
  const handlers: Array<(e: unknown) => void> = [];
  const onEvent = api['onEvent'] as (h: (e: unknown) => void) => () => void;
  api['onEvent'] = (h: (e: unknown) => void) => {
    handlers.push(h);
    const off = onEvent(h);
    return () => {
      handlers.splice(handlers.indexOf(h), 1);
      off();
    };
  };
  const emit = (e: unknown) => handlers.forEach((h) => h(e));
  const mine = JSON.parse(JSON.stringify(seed.chats.find((c) => c['id'] === seed.chatId))) as Record<string, unknown> & { messages: Array<Record<string, unknown>> };
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const get = api['get'] as (req: { id: string }) => Promise<unknown>;
  api['get'] = async (req: { id: string }) => (req.id === seed.chatId ? { ok: true, value: { chat: clone(mine) } } : get(req));
  const send = api['send'] as (req: { chatId: string; text?: string }) => Promise<unknown>;
  api['send'] = async (req: { chatId: string; text?: string }) => {
    if (req.chatId !== seed.chatId) return send(req);
    const at = Date.now();
    const chatId = seed.chatId;
    const user = { id: 'u-live', role: 'user', text: (req.text ?? '').trim(), createdAt: at, status: 'done' };
    const a: Record<string, unknown> & { text: string; activity: string[]; thinking: string } = {
      id: 'a-live', role: 'assistant', text: '', createdAt: at + 1, status: 'streaming', engine: 'claude', model: null, activity: [], thinking: '',
    };
    mine.messages.push(user, a);
    mine['updatedAt'] = at;
    emit({ kind: 'message', chatId, message: clone(user) });
    emit({ kind: 'message', chatId, message: clone(a) });
    emit({ kind: 'chat', chatId });
    const steps: Array<[number, () => void]> = [];
    let t = 250;
    for (const word of seed.thinking.split(/(?<= )/)) {
      t += 28;
      steps.push([t, () => { a.thinking += word; emit({ kind: 'thinking', chatId, messageId: a['id'], text: word }); }]);
    }
    for (const line of seed.activity) {
      t += 330;
      steps.push([t, () => { a.activity.push(line); emit({ kind: 'activity', chatId, messageId: a['id'], line }); }]);
    }
    t += 250;
    let out = 0;
    for (const piece of seed.reply.match(/\S+\s*|\s+/g) ?? []) {
      t += piece.includes('\n') ? 34 : 19;
      steps.push([t, () => {
        a.text += piece;
        out += 1;
        emit({ kind: 'delta', chatId, messageId: a['id'], text: piece });
        if (out % 12 === 0) emit({ kind: 'usage', chatId, messageId: a['id'], usage: { outputTokens: Math.round(out * 1.6), contextTokens: 41_200 + out * 2, contextWindow: 200_000 } });
      }]);
    }
    t += 200;
    steps.push([t, () => {
      a['status'] = 'done';
      a['finishedAt'] = Date.now();
      a['thinkingMs'] = 1400;
      a['usage'] = { outputTokens: Math.round(out * 1.6), contextTokens: 41_200 + out * 2, contextWindow: 200_000 };
      mine['updatedAt'] = Date.now();
      emit({ kind: 'message', chatId, message: clone(a) });
      emit({ kind: 'chat', chatId });
    }]);
    for (const [ms, fn] of steps) setTimeout(fn, ms);
    return { ok: true, value: { messageId: a['id'] } };
  };
}

async function open(page: Page): Promise<void> {
  await installMockBridge(page, roadmapFixtures({ chats: { seed: SEED, reply: 'ok' } } as never), { cspGuard: false });
  await page.addInitScript(chatsInit, { chatId: CHAT_ID, chats: SEED, thinking: THINKING, activity: ACTIVITY, reply: REPLY });
  await preparePage(page, { theme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await gotoView(page, 'Chats');
    await expect(page.getByRole('list', { name: 'Chats' })).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  await page.getByRole('list', { name: 'Chats' }).getByText('The terminal broker').first().click();
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible();
  await expect(page.getByText('Where does the pty broker live?').first()).toBeVisible();
  await placeCursor(page, 900, 560);
  await settlePage(page, 900);
}

test('chats-dark', async ({ page }) => {
  await open(page);
  await shot(page, '0');
  const rec = PROBE ? null : new Recorder(page, 'chats-dark');
  await rec?.start();
  await page.waitForTimeout(650);

  const box = page.getByRole('textbox', { name: 'Message' });
  await glideTo(page, box, 600, { x: 0.3, y: 0.5 });
  await click(page);
  await typeSlow(page, QUESTION, 14);
  await page.waitForTimeout(200);
  await glideTo(page, page.getByTestId('chat-input-send'), 400);
  await click(page);
  await shot(page, '1');
  await glide(page, 1180, 420, 900);
  await page.waitForTimeout(1700);
  await shot(page, '2');
  await expect(page.getByTestId('chat-message-assistant').last()).toHaveAttribute('data-status', 'done', { timeout: 20_000 });
  await shot(page, '3');
  await glide(page, 980, 520, 800);
  await page.waitForTimeout(900);
  await shot(page, '4');
  await rec?.stop();
});
