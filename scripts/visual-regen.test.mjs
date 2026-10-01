import { describe, expect, it } from 'vitest';
import { dockerArgs, IMAGE, innerCommand, PLATFORM } from './visual-regen.mjs';

describe('innerCommand', () => {
  it('runs the whole visual suite with -u when no specs are given', () => {
    expect(innerCommand()).toMatch(/playwright test --config playwright\.visual\.config\.ts -u$/);
  });

  it('limits the run to the given specs, shell-quoted', () => {
    expect(innerCommand(['e2e/visual/status-bar.spec.ts', "it's.spec.ts"])).toMatch(
      /playwright\.visual\.config\.ts 'e2e\/visual\/status-bar\.spec\.ts' 'it'\\''s\.spec\.ts' -u$/,
    );
  });

  it('keeps --ignore-scripts on the install (the image has no build toolchain)', () => {
    expect(innerCommand()).toContain('pnpm install --frozen-lockfile --ignore-scripts');
  });
});

describe('dockerArgs', () => {
  const args = dockerArgs('/tmp/copy');

  it("pins CI's architecture, not the host's", () => {
    expect(args.slice(args.indexOf('--platform'), args.indexOf('--platform') + 2)).toEqual(['--platform', PLATFORM]);
    expect(PLATFORM).toBe('linux/amd64');
  });

  it('mounts the copy it was given, never anything else', () => {
    expect(args.filter((a) => a.includes(':/w'))).toEqual(['/tmp/copy:/w']);
  });

  it('passes the packages token by name only', () => {
    expect(args.slice(args.indexOf('-e'), args.indexOf('-e') + 2)).toEqual(['-e', 'GITHUB_PACKAGES_TOKEN']);
    expect(args.join(' ')).not.toMatch(/GITHUB_PACKAGES_TOKEN=/);
  });

  it('runs the pinned image', () => {
    expect(args).toContain(IMAGE);
  });
});
