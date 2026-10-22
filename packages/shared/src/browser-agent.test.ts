import { describe, expect, it } from 'vitest';

import {
  BROWSER_AGENT_TOOLS,
  BrowserAgentToolCallSchema,
  BrowserAgentToolResultSchema,
  agentEgressAllowed,
  classifyAgentAction,
  normaliseAllowlistOrigin,
} from './browser-agent';

const ALLOW = ['https://example.com'];

describe('the tool set', () => {
  it('is exactly the six tools, and nothing that reaches a vault, terminal or repository', () => {
    expect([...BROWSER_AGENT_TOOLS]).toEqual(['navigate', 'read', 'find', 'click', 'type', 'screenshot']);
  });

  it('rejects an unknown tool and extra fields', () => {
    expect(BrowserAgentToolCallSchema.safeParse({ tool: 'vault.read', key: 'x' }).success).toBe(false);
    expect(BrowserAgentToolCallSchema.safeParse({ tool: 'read', selector: 'body' }).success).toBe(false);
  });

  it('returns page text only inside UntrustedPageContent', () => {
    expect(BrowserAgentToolResultSchema.safeParse({ ok: true, tool: 'read', text: 'raw page text' }).success).toBe(false);
  });
});

describe('classifyAgentAction', () => {
  it('lets navigation inside the allowlist through and pauses everything else', () => {
    expect(classifyAgentAction({ tool: 'navigate', url: 'https://example.com/next' }, { allowlist: ALLOW })).toEqual({ kind: 'allow' });
    expect(classifyAgentAction({ tool: 'navigate', url: 'https://evil.example/' }, { allowlist: ALLOW })).toEqual({
      kind: 'needsUser',
      reason: 'cross-origin',
    });
    // Same host, different scheme is a different origin.
    expect(classifyAgentAction({ tool: 'navigate', url: 'http://example.com/' }, { allowlist: ALLOW }).kind).toBe('needsUser');
  });

  it('denies a navigation to anything but http(s) outright', () => {
    expect(classifyAgentAction({ tool: 'navigate', url: 'midnite-studio://run?req=x' }, { allowlist: ALLOW }).kind).toBe('deny');
    expect(classifyAgentAction({ tool: 'navigate', url: 'file:///etc/passwd' }, { allowlist: ALLOW }).kind).toBe('deny');
  });

  it('pauses typing into a password field and any submit', () => {
    const type = { tool: 'type', selector: '#pw', text: 'x' } as const;
    expect(classifyAgentAction(type, { allowlist: ALLOW, target: { isPassword: true } })).toEqual({ kind: 'needsUser', reason: 'password-field' });
    expect(classifyAgentAction({ ...type, submit: true }, { allowlist: ALLOW })).toEqual({ kind: 'needsUser', reason: 'form-submit' });
    expect(classifyAgentAction(type, { allowlist: ALLOW })).toEqual({ kind: 'allow' });
    expect(classifyAgentAction({ tool: 'click', selector: 'button' }, { allowlist: ALLOW, target: { submitsForm: true } }).kind).toBe('needsUser');
    expect(classifyAgentAction({ tool: 'click', selector: 'a' }, { allowlist: ALLOW }).kind).toBe('allow');
  });
});

describe('agentEgressAllowed', () => {
  const base = { pageUrl: 'https://example.com/article', allowlist: ALLOW, isMainFrame: false };

  it('allows the allowlist and the page’s own site', () => {
    expect(agentEgressAllowed({ ...base, requestUrl: 'https://example.com/api' })).toBe(true);
    expect(agentEgressAllowed({ ...base, requestUrl: 'https://cdn.example.com/app.js' })).toBe(true);
  });

  it('cancels a request to any other origin: the egress leg', () => {
    expect(agentEgressAllowed({ ...base, requestUrl: 'https://attacker.example/collect?d=secret' })).toBe(false);
    expect(agentEgressAllowed({ ...base, requestUrl: 'wss://attacker.example/socket' })).toBe(false);
    expect(agentEgressAllowed({ ...base, requestUrl: 'wss://example.com/socket' })).toBe(true);
  });

  it('cancels a main-frame navigation off the allowlist unless the user just approved it', () => {
    const nav = { ...base, isMainFrame: true, requestUrl: 'https://evil.example/' };
    expect(agentEgressAllowed(nav)).toBe(false);
    expect(agentEgressAllowed({ ...nav, approvedOnce: 'https://evil.example' })).toBe(true);
    // The page's own subdomain is still a new top-level origin.
    expect(agentEgressAllowed({ ...nav, requestUrl: 'https://login.example.com/' })).toBe(false);
  });

  it('lets local schemes through and refuses an unknown page', () => {
    expect(agentEgressAllowed({ ...base, requestUrl: 'data:image/png;base64,AAAA' })).toBe(true);
    expect(agentEgressAllowed({ ...base, pageUrl: null, requestUrl: 'https://cdn.example.com/x' })).toBe(false);
  });
});

describe('normaliseAllowlistOrigin', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['https://example.com/path?q', 'https://example.com'],
    ['http://localhost:5173', 'http://localhost:5173'],
    ['  ', null],
    ['javascript:alert(1)', null],
    ['ftp://example.com', null],
  ])('%s → %s', (raw, expected) => {
    expect(normaliseAllowlistOrigin(raw)).toBe(expected);
  });
});
