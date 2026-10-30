// vitest/jsdom: the page-to-agent boundary as Browser composes it (Phase 117 Theme G). Two halves, no real
// browser needed: a walk over the agent's wire schema, and the whole app rendered over a bridge that records
// every namespace the renderer touches while a session starts, asks and ends.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { useBrowserStore } from '@midnite/studio-feature-browser/renderer';
import { BrowserAgentToolResponse, UntrustedPageContentSchema } from '@midnite/studio-shared';

import { agentSessionStore } from '../agent-session-store';
import { BrowserApp } from '../browser-app';

/**
 * Every string leaf a schema can carry, by path, except inside `UntrustedPageContentSchema` — the one
 * place page words may travel. zod 3's internals, walked by `_def.typeName`.
 */
function stringLeaves(schema: z.ZodTypeAny, path = '', out: string[] = []): string[] {
  if (schema === UntrustedPageContentSchema) return out;
  const def = schema._def as { typeName: string } & Record<string, unknown>;
  switch (def.typeName) {
    case 'ZodString':
      out.push(path);
      break;
    case 'ZodObject':
      for (const [key, value] of Object.entries((schema as z.AnyZodObject).shape)) stringLeaves(value as z.ZodTypeAny, `${path}.${key}`, out);
      break;
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
      stringLeaves(def.innerType as z.ZodTypeAny, path, out);
      break;
    case 'ZodEffects':
      stringLeaves(def.schema as z.ZodTypeAny, path, out);
      break;
    case 'ZodArray':
      stringLeaves(def.type as z.ZodTypeAny, `${path}[]`, out);
      break;
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion':
      (def.options as z.ZodTypeAny[]).forEach((option, i) => stringLeaves(option, `${path}|${i}`, out));
      break;
    case 'ZodRecord':
    case 'ZodMap':
    case 'ZodAny':
    case 'ZodUnknown':
      // An open-ended value could carry anything, page words included.
      out.push(`${path}<open:${def.typeName}>`);
      break;
    default:
      // Literals, enums, numbers and booleans carry no free text.
      break;
  }
  return out;
}

describe('what the agent receives', () => {
  it('carries page words only inside UntrustedPageContent: the only other strings are pixels and our own error line', () => {
    expect(stringLeaves(BrowserAgentToolResponse).sort()).toEqual(['|0.screenshot', '|1.message']);
  });

  it('the walker skips only the envelope: a stray string beside it is caught', () => {
    expect(stringLeaves(z.object({ page: UntrustedPageContentSchema, leak: z.string() }))).toEqual(['.leak']);
    expect(stringLeaves(z.object({ blob: z.record(z.unknown()) }))).toEqual(['.blob<open:ZodRecord>']);
  });
});

describe('what the Browser renderer reaches while an agent drives', () => {
  afterEach(() => {
    cleanup();
    agentSessionStore.setState({ session: null, notice: null });
  });

  it('touches only the browser, web-app, clipboard-write, menu and report slices: no vault, secrets, terminal or repository', async () => {
    const touched = new Set<string>();
    let emit: ((event: unknown) => void) | null = null;
    const state = {
      sessionId: 's1',
      tabId: 'tab-1',
      goal: 'Summarise',
      allowlist: ['https://example.com'],
      status: 'running' as const,
      pending: null,
      log: [],
    };
    const browser = new Proxy(
      {},
      {
        get: (_t, method: string) => {
          if (method === 'onEvent') return (handler: (event: unknown) => void) => ((emit = handler), () => undefined);
          if (method.startsWith('on')) return () => () => undefined;
          if (method === 'agentStart') return async () => ({ ok: true, state });
          return vi.fn(async () => ({ ok: true }));
        },
      },
    );
    const leaf = () => new Proxy({}, { get: (_t, m: string) => (m.startsWith('on') ? () => () => undefined : async () => ({ ok: true })) });
    const slices: Record<string, unknown> = { browser, webApps: leaf(), clipboard: leaf(), menu: leaf(), report: leaf() };
    window.midniteStudio = new Proxy(slices, {
      get: (target, key: string) => {
        touched.add(key);
        return target[key];
      },
    }) as never;
    useBrowserStore.setState({
      tabs: [{ id: 'tab-1', kind: 'page', url: 'https://example.com/post', title: 'Post', loading: false, canGoBack: false, canGoForward: false }],
      activeTabId: 'tab-1',
    } as never);

    render(<BrowserApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Agent Session' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'What should the agent do?' }), { target: { value: 'Summarise' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const strip = await screen.findByRole('region', { name: 'Agent Driving Session' });
    act(() =>
      emit?.({
        kind: 'agent-session',
        tabId: 'tab-1',
        state: { ...state, status: 'waiting-for-user', pending: { id: 'q', reason: 'cross-origin', summary: 'The agent wants to open a site outside this session: https://evil.example.' } },
      }),
    );
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'The agent needs you' })).getByRole('button', { name: 'Allow once' }));
    fireEvent.click(within(strip).getByRole('button', { name: 'Take Over' }));

    const reached = [...touched].filter((k) => typeof k === 'string' && !k.startsWith('__') && k !== 'then');
    // `windowRole` is a plain string the frame reads to tell a pop-out from the main window, not a namespace; `windowChrome` and `suitePrefs` are the suite shell's own (title bar, shared appearance).
    expect(reached.filter((k) => !['browser', 'webApps', 'clipboard', 'menu', 'report', 'windowRole', 'windowChrome', 'suitePrefs'].includes(k))).toEqual([]);
    for (const forbidden of ['secrets', 'vault', 'terminal', 'pty', 'fs', 'ops', 'repo', 'git', 'agents']) expect(touched.has(forbidden)).toBe(false);
  });
});
