import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBreachChecker, hashSha1Upper } from './hibp-check';

describe('hibp-check', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'hibp-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('correctly checks a known password against mocked HIBP range API', async () => {
    const password = 'password123';
    const sha1 = hashSha1Upper(password);
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toContain(prefix);
      expect((init?.headers as Record<string, string>)?.['Add-Padding']).toBe('true');
      const body = [
        '00000000000000000000000000000000000:0', // padding line
        `${suffix}:953123`,
        '11111111111111111111111111111111111:5',
      ].join('\n');
      return new Response(body, { status: 200 });
    });

    const checker = createBreachChecker(tempDir, mockFetch as unknown as typeof fetch);
    const result = await checker.check(password);

    expect(result.breached).toBe(true);
    expect(result.count).toBe(953123);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second check within TTL should hit cache
    const cachedResult = await checker.check(password);
    expect(cachedResult.breached).toBe(true);
    expect(cachedResult.count).toBe(953123);
    expect(cachedResult.fromCache).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1); // not called again
  });

  it('returns clean when suffix is not in response or only padding exists', async () => {
    const password = 'extremely_unique_random_pw_xyz_98765';
    const mockFetch = vi.fn().mockImplementation(async () => {
      const body = [
        '00000000000000000000000000000000000:0',
        '22222222222222222222222222222222222:12',
      ].join('\n');
      return new Response(body, { status: 200 });
    });

    const checker = createBreachChecker(tempDir, mockFetch as unknown as typeof fetch);
    const result = await checker.check(password);

    expect(result.breached).toBe(false);
    expect(result.count).toBe(0);
  });
});
