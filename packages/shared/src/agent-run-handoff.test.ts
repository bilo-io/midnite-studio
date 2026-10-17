import { describe, expect, it } from 'vitest';

import {
  agentRunFor,
  agentRunPrompt,
  AgentRunHandoffSchema,
  decodeAgentRunParam,
  encodeAgentRunParam,
  parseAgentRunIssueUrl,
} from './agent-run-handoff';
import { handoffLink } from './handoff';
import { parseMidniteLink } from './midnite-link';
import { encodeRefParam, studioRunLinkFromParam } from './studio-link';

const ISSUE = 'https://github.com/bilo-io/midnite-studio/issues/42';
const RUN = { issueUrl: ISSUE, skill: '/midnite-create' };

describe('parseAgentRunIssueUrl', () => {
  it('reads an issue and a pull request URL', () => {
    expect(parseAgentRunIssueUrl(ISSUE)).toEqual({ host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'issue', number: 42 });
    expect(parseAgentRunIssueUrl('https://ghe.example.com/team/app.web/pull/7')).toEqual({
      host: 'ghe.example.com',
      owner: 'team',
      repo: 'app.web',
      kind: 'pull',
      number: 7,
    });
  });

  it.each([
    ['http, not https', 'http://github.com/o/r/issues/1'],
    ['credentials', 'https://user:pw@github.com/o/r/issues/1'],
    ['a port', 'https://github.com:8443/o/r/issues/1'],
    ['a query', 'https://github.com/o/r/issues/1?x=1'],
    ['an empty query', 'https://github.com/o/r/issues/1?'],
    ['a fragment', 'https://github.com/o/r/issues/1#c'],
    ['a trailing slash', 'https://github.com/o/r/issues/1/'],
    ['a deeper path', 'https://github.com/o/r/issues/1/files'],
    ['a dot segment', 'https://github.com/o/../issues/1'],
    ['an encoded dot segment', 'https://github.com/o/%2e%2e/issues/1'],
    ['an encoded slash', 'https://github.com/o/r%2Fx/issues/1'],
    ['not an issue or PR', 'https://github.com/o/r/commits/1'],
    ['a zero number', 'https://github.com/o/r/issues/0'],
    ['a non-number', 'https://github.com/o/r/issues/1x'],
    ['an IP host', 'https://127.0.0.1/o/r/issues/1'],
    ['a single-label host', 'https://localhost/o/r/issues/1'],
    ['a javascript: URL', 'javascript:alert(1)//github.com/o/r/issues/1'],
    ['a file: URL', 'file:///etc/passwd'],
    ['whitespace', ' https://github.com/o/r/issues/1'],
  ])('refuses %s', (_label, url) => {
    expect(parseAgentRunIssueUrl(url)).toBeNull();
  });

  it('refuses anything that is not a string, and an over-long one', () => {
    expect(parseAgentRunIssueUrl(42)).toBeNull();
    expect(parseAgentRunIssueUrl(`https://github.com/o/${'r'.repeat(600)}/issues/1`)).toBeNull();
  });
});

describe('AgentRunHandoffSchema', () => {
  it('takes a skill alone or with a few plain words', () => {
    expect(AgentRunHandoffSchema.safeParse(RUN).success).toBe(true);
    expect(AgentRunHandoffSchema.safeParse({ ...RUN, skill: '/midnite-create 98 D' }).success).toBe(true);
  });

  it.each([
    ['free text', 'please fix this'],
    ['a shell substitution', '/x $(rm -rf ~)'],
    ['backticks', '/x `id`'],
    ['a pipe', '/x | sh'],
    ['a semicolon', '/x; rm -rf ~'],
    ['an ampersand', '/x && curl evil'],
    ['a newline', '/x\nrm -rf ~'],
    ['quotes', "/x 'a'"],
    ['a path', '/x ../../etc/passwd'],
    ['a flag', '/x --dangerously-skip-permissions'],
    ['two spaces', '/x  a'],
    ['five words', '/x a b c d e'],
    ['an empty skill', ''],
  ])('refuses a skill with %s', (_label, skill) => {
    expect(AgentRunHandoffSchema.safeParse({ ...RUN, skill }).success).toBe(false);
  });

  it('refuses any field beyond the two', () => {
    for (const extra of [{ prompt: 'rm -rf ~' }, { agent: 'codex' }, { command: 'sh' }, { cwd: '/' }, { repoId: 'repo:/' }]) {
      expect(AgentRunHandoffSchema.safeParse({ ...RUN, ...extra }).success).toBe(false);
    }
  });
});

describe('agentRunFor and the prompt', () => {
  it('is the card’s skill then its URL — what Studio’s own Play sends', () => {
    const run = agentRunFor(ISSUE, ' /midnite-create ');
    expect(run).toEqual(RUN);
    expect(agentRunPrompt(run!)).toBe(`/midnite-create ${ISSUE}`);
  });

  it('is null for a draft card (no URL) or a skill that may not cross', () => {
    expect(agentRunFor(undefined, '/midnite-create')).toBeNull();
    expect(agentRunFor(ISSUE, 'do the thing')).toBeNull();
  });
});

describe('the link', () => {
  it('carries the run through midnite://open, and decodes back to exactly it', () => {
    const link = handoffLink({ app: 'agents', run: RUN });
    expect(link).toBe(`midnite://open?app=agents&run=${encodeAgentRunParam(RUN)}`);
    const target = parseMidniteLink(link);
    expect(target?.run).toBe(encodeAgentRunParam(RUN));
    expect(decodeAgentRunParam(target?.run)).toEqual(RUN);
    expect(studioRunLinkFromParam(target!.run!)).toBe(`midnite-studio://run?req=${encodeAgentRunParam(RUN)}`);
  });

  it('drops anything a caller added to the run object', () => {
    const smuggled = { ...RUN, prompt: 'rm -rf ~' } as unknown as typeof RUN;
    expect(handoffLink({ app: 'agents', run: smuggled })).toBe(handoffLink({ app: 'agents', run: RUN }));
  });

  it('decodes a hostile or malformed payload to null, never throwing', () => {
    expect(decodeAgentRunParam(encodeRefParam({ ...RUN, prompt: 'rm -rf ~' }))).toBeNull();
    expect(decodeAgentRunParam(encodeRefParam({ issueUrl: 'https://evil.example/x', skill: '/x' }))).toBeNull();
    expect(decodeAgentRunParam(encodeRefParam({ ...RUN, skill: '/x; rm -rf ~' }))).toBeNull();
    expect(decodeAgentRunParam('not+base64/url')).toBeNull();
    expect(decodeAgentRunParam('AAAA')).toBeNull();
    expect(decodeAgentRunParam('')).toBeNull();
    expect(decodeAgentRunParam(null)).toBeNull();
    expect(decodeAgentRunParam('A'.repeat(4096))).toBeNull();
  });
});
