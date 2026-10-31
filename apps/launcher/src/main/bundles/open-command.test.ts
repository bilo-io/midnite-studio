import { describe, expect, it } from 'vitest';

import { bundleOpenCommand } from './open-command';

describe('bundleOpenCommand', () => {
  const arg = '--midnite-link=midnite://open?app=agents&module=coder&view=reviews';

  it('opens a new instance with the switch after --args, so a running host gets it as second-instance', () => {
    expect(bundleOpenCommand('/stubs/Midnite Agents.app', arg)).toEqual({
      command: 'open',
      args: ['-n', '/stubs/Midnite Agents.app', '--args', arg],
    });
  });

  it('keeps the path and the switch as single arguments, never a shell string', () => {
    const cmd = bundleOpenCommand('/a b/$(x).app', arg)!;
    expect(cmd.args).toHaveLength(4);
    expect(cmd.args[1]).toBe('/a b/$(x).app');
  });

  it('is null with nothing to land on, so the bundle opens plainly', () => {
    expect(bundleOpenCommand('/stubs/Agents.app', undefined)).toBeNull();
  });

  it('refuses a relative path, which `open` could read as an option', () => {
    expect(bundleOpenCommand('-a', arg)).toBeNull();
  });
});
