// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createShellGh, describeFailure, isAuthenticated, shellQuote, type GhRunResult } from './gh';

const result = (output: string, exitCode: number | null = 0): GhRunResult => ({ output, stdout: output, exitCode });

describe('createShellGh', () => {
  it('is ready when gh is on PATH and signed in, and caches the probe', async () => {
    const run = vi.fn(async (command: string) =>
      command === 'command -v gh' ? result('banner\n/opt/homebrew/bin/gh\n') : result('Logged in to github.com account bilo-io'),
    );
    const gh = createShellGh(run);
    await expect(gh.status()).resolves.toEqual({ reason: 'ready', binPath: '/opt/homebrew/bin/gh', hint: '' });
    await gh.status();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('says how to install gh when it is missing', async () => {
    const gh = createShellGh(async () => result('', 1));
    await expect(gh.status()).resolves.toMatchObject({ reason: 'not-installed', binPath: null });
  });

  it('says how to sign in when gh holds no credential', async () => {
    const gh = createShellGh(async (command) => (command === 'command -v gh' ? result('/usr/bin/gh') : result('not logged in', 1)));
    const status = await gh.status();
    expect(status.reason).toBe('not-authenticated');
    expect(status.hint).toContain('gh auth login');
  });
});

describe('gh helpers', () => {
  it('quotes a single quote safely', () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it('counts a signed-in line even when another host is signed out', () => {
    expect(isAuthenticated('✓ Logged in to github.com account bilo-io', 1)).toBe(true);
    expect(isAuthenticated('You are not logged into any GitHub hosts', 1)).toBe(false);
  });

  it('picks the failing line, never a JSON payload', () => {
    expect(describeFailure('{"x":"failed"}\nHTTP 422: Validation Failed')).toBe('HTTP 422: Validation Failed');
    expect(describeFailure('')).toBe('The GitHub CLI could not complete that request.');
  });
});
