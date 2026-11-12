// vitest/jsdom: the host's rail and view router over a mock bridge — nothing here needs a real browser.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firstViewOfModule, moduleOfView, navConfigProblems, suiteShellTestBridge } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';

import { HealthHostApp, HEALTH_PANES } from './host-app';
import { HEALTH_HOST_NAV } from './host-nav';

beforeEach(() => {
  window.midniteStudio = suiteShellTestBridge({
    report: {
      logPath: vi.fn().mockResolvedValue({ path: '/tmp/health.log' }),
      bundle: vi.fn().mockResolvedValue({ text: 'boot' }),
      ghStatus: vi.fn().mockResolvedValue({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' }),
      onOpen: () => () => undefined,
    },
  }) as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('Health host nav', () => {
  it('has a sound config, one group for each mounted module, and a pane for every group', () => {
    expect(navConfigProblems(HEALTH_HOST_NAV)).toEqual([]);
    expect(HEALTH_HOST_NAV.groups?.map((g) => g.id)).toEqual(['health']);
    expect(APP_MODULES.health).toContain('health');
    for (const group of HEALTH_HOST_NAV.groups ?? []) {
      expect(HEALTH_PANES[group.id]).toBeTypeOf('function');
      for (const view of group.views) expect(moduleOfView(HEALTH_HOST_NAV, view.id)).toBe(group.id);
    }
  });

  it("lands a module link on that module's first view", () => {
    expect(firstViewOfModule(HEALTH_HOST_NAV, 'health')).toBe('today');
  });
});

describe('Health host', () => {
  it('lists the five rows under the Health group and opens on Today', async () => {
    render(<HealthHostApp />);
    const rail = screen.getByRole('navigation', { name: 'Views' });
    for (const label of ['Today', 'Biometrics', 'Nutrition', 'Workouts', 'Progress']) expect(within(rail).getByRole('link', { name: label })).toBeDefined();
    // The test bridge carries no Health channels, so Today (the opening view) renders its no-bridge notice.
    expect(await screen.findByTestId('health-missing')).toBeDefined();
  });
});
