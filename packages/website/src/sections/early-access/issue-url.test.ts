import { describe, expect, it } from 'vitest';

import {
  composeIssueBody,
  composeIssueTitle,
  composeIssueUrl,
  ISSUE_LABEL,
  ISSUE_REPO,
  isValidEmail,
} from './issue-url';
import { AGENT_ROSTER, rosterLabel } from './roster';

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    for (const value of ['a@b.co', 'first.last@sub.example.com', 'x+tag@example.io']) {
      expect(isValidEmail(value), value).toBe(true);
    }
  });

  it('tolerates surrounding whitespace', () => {
    expect(isValidEmail('  someone@example.com  ')).toBe(true);
  });

  it('rejects the typos it exists to catch', () => {
    for (const value of ['', 'someone', 'someone@', '@example.com', 'a@b', 'a b@example.com', 'a@b.']) {
      expect(isValidEmail(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe('composeIssueTitle', () => {
  it('carries the address, trimmed', () => {
    expect(composeIssueTitle('  someone@example.com ')).toBe('Early access: someone@example.com');
  });
});

describe('composeIssueBody', () => {
  it('renders the answers under markdown headings', () => {
    const body = composeIssueBody({
      email: 'someone@example.com',
      useCase: 'Reviewing agent PRs on a monorepo.',
      agentIds: ['claude', 'aider'],
    });
    expect(body).toContain('### Email');
    expect(body).toContain('someone@example.com');
    expect(body).toContain('Reviewing agent PRs on a monorepo.');
    expect(body).toContain('Claude, Aider');
  });

  /**
   * A blank optional field must read as "they did not say", not as an empty
   * heading — an issue with two bare headings under it looks like a form that
   * failed rather than a request with two optional answers skipped.
   */
  it('says so when the optional answers are empty', () => {
    const body = composeIssueBody({ email: 'a@b.co', useCase: '   ', agentIds: [] });
    expect(body).toContain('### What I want it for\n\nNot specified');
    expect(body).toContain('### Agents I use\n\nNot specified');
  });

  it('uses roster labels, not ids', () => {
    const body = composeIssueBody({ email: 'a@b.co', useCase: '', agentIds: ['agy', 'kilo'] });
    expect(body).toContain('Antigravity, Kilo Code');
    expect(body).not.toContain('agy');
  });
});

describe('composeIssueUrl', () => {
  const request = {
    email: 'someone@example.com',
    useCase: 'Wrangling four agents at once',
    agentIds: ['claude', 'codex'],
  };

  it('points at the public releases repo, never this one', () => {
    const url = composeIssueUrl(request);
    expect(url.startsWith(`https://github.com/${ISSUE_REPO}/issues/new?`)).toBe(true);
    expect(url).not.toContain('bilo-io/midnite-studio');
  });

  it('sets the title and the label', () => {
    const params = new URL(composeIssueUrl(request)).searchParams;
    expect(params.get('title')).toBe('Early access: someone@example.com');
    expect(params.get('labels')).toBe(ISSUE_LABEL);
  });

  it('carries the composed body, decodable back to itself', () => {
    const params = new URL(composeIssueUrl(request)).searchParams;
    expect(params.get('body')).toBe(composeIssueBody(request));
  });

  /**
   * The reason this is `URLSearchParams` and not string concatenation. An `&`
   * or a `#` in the free-text answer would truncate a hand-built query string
   * at that character and silently post half a sentence.
   */
  it('survives ampersands, hashes and newlines in the free text', () => {
    const awkward = {
      ...request,
      useCase: 'Rebasing & squashing #42\nacross two repos + a worktree',
    };
    const params = new URL(composeIssueUrl(awkward)).searchParams;
    expect(params.get('body')).toContain('Rebasing & squashing #42');
    expect(params.get('body')).toContain('across two repos + a worktree');
  });

  it('encodes the whole query — no raw spaces or newlines in the URL', () => {
    const url = composeIssueUrl({ ...request, useCase: 'two words\nand a line' });
    expect(url).not.toMatch(/[ \n]/);
  });
});

describe('AGENT_ROSTER', () => {
  it('lists the ten agents the app ships', () => {
    expect(AGENT_ROSTER).toHaveLength(10);
    expect(AGENT_ROSTER.map((agent) => agent.id)).toEqual([
      'claude',
      'agy',
      'codex',
      'cursor',
      'copilot',
      'openclaude',
      'opencode',
      'kilo',
      'aider',
      'cline',
    ]);
  });

  it('has unique, non-empty ids and labels', () => {
    expect(new Set(AGENT_ROSTER.map((a) => a.id)).size).toBe(AGENT_ROSTER.length);
    expect(new Set(AGENT_ROSTER.map((a) => a.label)).size).toBe(AGENT_ROSTER.length);
    for (const agent of AGENT_ROSTER) {
      expect(agent.id.trim().length).toBeGreaterThan(0);
      expect(agent.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('falls back to the id for an agent it does not know', () => {
    expect(rosterLabel('claude')).toBe('Claude');
    expect(rosterLabel('not-an-agent')).toBe('not-an-agent');
  });
});
