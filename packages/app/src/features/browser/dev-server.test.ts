import { describe, expect, it, vi } from 'vitest';

import {
  DEV_SERVER_PORTS,
  detectDevServer,
  devServerLabel,
  devServerUrl,
  extractPort,
} from './dev-server';

/** A probe that answers `true` for exactly the ports listed, and records the order asked. */
function probeFor(...listening: number[]) {
  const asked: number[] = [];
  const probe = vi.fn(async (port: number) => {
    asked.push(port);
    return listening.includes(port);
  });
  return { probe, asked };
}

const nothingListening = () => probeFor().probe;

describe('extractPort', () => {
  it.each([
    ['vite --port 3001', 3001],
    ['vite --port=3001', 3001],
    ['next dev -p 3001', 3001],
    ['ng serve --port 4300 --open', 4300],
    ['vite --host --port 5174', 5174],
  ])('reads a port out of %s', (command, expected) => {
    expect(extractPort(command)).toBe(expected);
  });

  it.each([
    ['vite'],
    ['next dev'],
    // `--report` starts with `--p` but is not `--port`; `-progress` is not `-p`.
    ['build --report 3001'],
    ['ng serve -progress 3001'],
    // Out of range on both ends — a five-digit number is not automatically a port.
    ['vite --port 0'],
    ['vite --port 99999'],
  ])('finds no port in %s', (command) => {
    expect(extractPort(command)).toBeNull();
  });
});

describe('detectDevServer', () => {
  it('takes an explicit port from the dev script, and probes nothing', async () => {
    const probe = vi.fn(async () => true);
    await expect(
      detectDevServer({ scripts: { dev: 'vite --port 3001' } }, probe),
    ).resolves.toEqual({ port: 3001, source: 'script', script: 'dev' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('reads the start script when there is no dev script', async () => {
    await expect(
      detectDevServer({ scripts: { start: 'next start -p 4000' } }, nothingListening()),
    ).resolves.toEqual({ port: 4000, source: 'script', script: 'start' });
  });

  it('prefers dev over start when both name a port', async () => {
    await expect(
      detectDevServer(
        { scripts: { dev: 'vite --port 5174', start: 'serve -p 8081' } },
        nothingListening(),
      ),
    ).resolves.toMatchObject({ port: 5174, script: 'dev' });
  });

  it('falls back to probing when the dev script names no port', async () => {
    const { probe, asked } = probeFor(5173);
    await expect(detectDevServer({ scripts: { dev: 'vite' } }, probe)).resolves.toEqual({
      port: 5173,
      source: 'probe',
    });
    // In order, and it stops at the first answer rather than sweeping the rest.
    expect(asked).toEqual([3000, 4200, 5173]);
  });

  it('probes in the documented order and takes the first that answers', async () => {
    const { probe, asked } = probeFor(4200, 8080);
    await expect(detectDevServer({}, probe)).resolves.toEqual({ port: 4200, source: 'probe' });
    expect(asked).toEqual([3000, 4200]);
    expect(DEV_SERVER_PORTS).toEqual([3000, 4200, 5173, 8000, 8080]);
  });

  it.each([
    ['no scripts block at all', { name: 'thing' }],
    ['a package.json that is not an object', 'not json'],
    ['null', null],
    ['an array', [1, 2, 3]],
    ['a scripts block that is an array', { scripts: ['dev'] }],
    ['a script whose value is not a string', { scripts: { dev: 3000 } }],
  ])('degrades to probing for %s', async (_name, pkgJson) => {
    const { probe, asked } = probeFor(8000);
    await expect(detectDevServer(pkgJson, probe)).resolves.toEqual({
      port: 8000,
      source: 'probe',
    });
    expect(asked).toEqual([3000, 4200, 5173, 8000]);
  });

  it('answers null when nothing is listening on any candidate', async () => {
    const { probe, asked } = probeFor();
    await expect(detectDevServer({ scripts: { dev: 'vite' } }, probe)).resolves.toBeNull();
    expect(asked).toEqual([...DEV_SERVER_PORTS]);
  });
});

describe('what a hint renders as', () => {
  it('opens loopback and is labelled with the port', () => {
    const hint = { port: 5173, source: 'probe' as const };
    expect(devServerUrl(hint)).toBe('http://localhost:5173');
    expect(devServerLabel(hint)).toBe('Dev server · 5173');
  });
});
