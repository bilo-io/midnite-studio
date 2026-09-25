import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestPackage, TestSuite } from '@midnite/studio-shared';

import { SuiteList } from './suite-list';

afterEach(cleanup);

const mockAppUnit: TestSuite = {
  id: 'packages/app::unit',
  package: 'packages/app',
  packageName: '@midnite/studio-app',
  name: 'unit',
  kind: 'unit',
  source: 'package.json',
  sourceFile: 'packages/app/package.json',
  displayCommand: 'pnpm test',
  run: { command: 'pnpm', args: ['test'], cwd: '/repo/packages/app' },
};

const mockAppE2e: TestSuite = {
  id: 'packages/app::e2e',
  package: 'packages/app',
  packageName: '@midnite/studio-app',
  name: 'e2e',
  kind: 'e2e',
  source: 'package.json',
  sourceFile: 'packages/app/package.json',
  displayCommand: 'pnpm e2e',
  run: { command: 'pnpm', args: ['e2e'], cwd: '/repo/packages/app' },
};

const mockGitEngineUnit: TestSuite = {
  id: 'packages/git-engine::unit',
  package: 'packages/git-engine',
  packageName: '@midnite/studio-git-engine',
  name: 'unit',
  kind: 'unit',
  source: 'package.json',
  sourceFile: 'packages/git-engine/package.json',
  displayCommand: 'pnpm vitest',
  run: { command: 'pnpm', args: ['vitest'], cwd: '/repo/packages/git-engine' },
};

const mockGitEngineIntegration: TestSuite = {
  id: 'packages/git-engine::integration',
  package: 'packages/git-engine',
  packageName: '@midnite/studio-git-engine',
  name: 'integration',
  kind: 'integration',
  source: 'package.json',
  sourceFile: 'packages/git-engine/package.json',
  displayCommand: 'pnpm vitest run integration',
  run: { command: 'pnpm', args: ['vitest', 'run', 'integration'], cwd: '/repo/packages/git-engine' },
};

const mockSharedTypecheck: TestSuite = {
  id: 'packages/shared::typecheck',
  package: 'packages/shared',
  packageName: '@midnite/studio-shared',
  name: 'typecheck',
  kind: 'typecheck',
  source: 'package.json',
  sourceFile: 'packages/shared/package.json',
  displayCommand: 'pnpm tsc --noEmit',
  run: { command: 'pnpm', args: ['tsc', '--noEmit'], cwd: '/repo/packages/shared' },
};

const PACKAGES: readonly TestPackage[] = [
  {
    path: 'packages/app',
    name: '@midnite/studio-app',
    suites: [mockAppUnit, mockAppE2e],
  },
  {
    path: 'packages/git-engine',
    name: '@midnite/studio-git-engine',
    suites: [mockGitEngineUnit, mockGitEngineIntegration],
  },
  {
    path: 'packages/shared',
    name: '@midnite/studio-shared',
    suites: [mockSharedTypecheck],
  },
];

describe('SuiteList — grouping & accordions', () => {
  it('renders package groups expanded by default and selects suites', () => {
    const onSelect = vi.fn();
    render(
      <SuiteList
        packages={PACKAGES}
        selectedId="packages/app::unit"
        onSelect={onSelect}
      />,
    );

    const appGroup = screen.getByRole('button', { name: /@midnite\/studio-app/ });
    const gitEngineGroup = screen.getByRole('button', { name: /@midnite\/studio-git-engine/ });
    const sharedGroup = screen.getByRole('button', { name: /@midnite\/studio-shared/ });

    expect(appGroup.getAttribute('aria-expanded')).toBe('true');
    expect(gitEngineGroup.getAttribute('aria-expanded')).toBe('true');
    expect(sharedGroup.getAttribute('aria-expanded')).toBe('true');

    // Selected suite has aria-current="true"
    const appRegion = screen.getByRole('region', { name: '@midnite/studio-app' });
    const selectedBtn = within(appRegion).getByRole('button', { name: /^unit/i });
    expect(selectedBtn.getAttribute('aria-current')).toBe('true');

    // Clicking an unselected suite fires onSelect
    const e2eBtn = within(appRegion).getByRole('button', { name: /^e2e/i });
    fireEvent.click(e2eBtn);
    expect(onSelect).toHaveBeenCalledWith('packages/app::e2e');
  });

  it('collapses and expands individual accordion groups independently', () => {
    render(
      <SuiteList
        packages={PACKAGES}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    const appGroup = screen.getByRole('button', { name: /@midnite\/studio-app/ });
    const gitEngineGroup = screen.getByRole('button', { name: /@midnite\/studio-git-engine/ });

    expect(appGroup.getAttribute('aria-expanded')).toBe('true');
    expect(gitEngineGroup.getAttribute('aria-expanded')).toBe('true');

    // Collapse app group
    fireEvent.click(appGroup);
    expect(appGroup.getAttribute('aria-expanded')).toBe('false');
    // git-engine stays expanded
    expect(gitEngineGroup.getAttribute('aria-expanded')).toBe('true');

    // Expand app group again
    fireEvent.click(appGroup);
    expect(appGroup.getAttribute('aria-expanded')).toBe('true');
  });

  it('collapses all groups and expands all groups with toolbar controls', () => {
    render(
      <SuiteList
        packages={PACKAGES}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    const collapseAllBtn = screen.getByTestId('collapse-all');
    const expandAllBtn = screen.getByTestId('expand-all');

    fireEvent.click(collapseAllBtn);

    const appGroup = screen.getByRole('button', { name: /@midnite\/studio-app/ });
    const gitEngineGroup = screen.getByRole('button', { name: /@midnite\/studio-git-engine/ });
    const sharedGroup = screen.getByRole('button', { name: /@midnite\/studio-shared/ });

    expect(appGroup.getAttribute('aria-expanded')).toBe('false');
    expect(gitEngineGroup.getAttribute('aria-expanded')).toBe('false');
    expect(sharedGroup.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(expandAllBtn);

    expect(appGroup.getAttribute('aria-expanded')).toBe('true');
    expect(gitEngineGroup.getAttribute('aria-expanded')).toBe('true');
    expect(sharedGroup.getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles grouping mode between package and kind', () => {
    render(
      <SuiteList
        packages={PACKAGES}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    const toggleGroupBy = screen.getByTestId('toggle-group-by');

    // Initially grouped by package
    expect(screen.getByRole('button', { name: /@midnite\/studio-app/ })).toBeTruthy();

    // Switch to kind
    fireEvent.click(toggleGroupBy);

    expect(screen.getByRole('button', { name: /^unit 2$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^integration 1$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^e2e 1$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^typecheck 1$/i })).toBeTruthy();

    // Switch back to package
    fireEvent.click(toggleGroupBy);
    expect(screen.getByRole('button', { name: /@midnite\/studio-app/ })).toBeTruthy();
  });
});

describe('SuiteList — filtering', () => {
  it('filters suites by suite name', () => {
    render(
      <SuiteList
        packages={PACKAGES}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Filter suites, packages, tags…');
    fireEvent.change(searchInput, { target: { value: 'e2e' } });

    expect(screen.getByText('Showing 1 of 5 suites')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^e2e/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /@midnite\/studio-git-engine/ })).toBeNull();
  });

  it('filters suites by package name', () => {
    render(
      <SuiteList
        packages={PACKAGES}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Filter suites, packages, tags…');
    fireEvent.change(searchInput, { target: { value: 'git-engine' } });

    expect(screen.getByText('Showing 2 of 5 suites')).toBeTruthy();
    expect(screen.getByRole('button', { name: /@midnite\/studio-git-engine/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /@midnite\/studio-app/ })).toBeNull();
  });

  it('filters suites by command', () => {
    render(
      <SuiteList
        packages={PACKAGES}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Filter suites, packages, tags…');
    fireEvent.change(searchInput, { target: { value: 'tsc' } });

    expect(screen.getByText('Showing 1 of 5 suites')).toBeTruthy();
    expect(screen.getByRole('button', { name: /@midnite\/studio-shared/ })).toBeTruthy();
    expect(screen.getByText('pnpm tsc --noEmit')).toBeTruthy();
  });

  it('filters suites by kind tag tab', () => {
    render(
      <SuiteList
        packages={PACKAGES}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    const unitTab = screen.getByRole('tab', { name: 'Filter by kind: unit' });
    fireEvent.click(unitTab);

    expect(screen.getByText('Showing 2 of 5 suites')).toBeTruthy();
    expect(screen.getByRole('button', { name: /@midnite\/studio-app/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /@midnite\/studio-git-engine/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /@midnite\/studio-shared/ })).toBeNull();

    // Clicking All tab restores all suites
    const allTab = screen.getByRole('tab', { name: 'Filter by kind: all' });
    fireEvent.click(allTab);

    expect(screen.queryByText(/Showing/)).toBeNull();
    expect(screen.getByRole('button', { name: /@midnite\/studio-shared/ })).toBeTruthy();
  });

  it('shows empty filter state and restores suites on clear', () => {
    render(
      <SuiteList
        packages={PACKAGES}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Filter suites, packages, tags…');
    fireEvent.change(searchInput, { target: { value: 'does-not-exist' } });

    expect(screen.getByText('Showing 0 of 5 suites')).toBeTruthy();
    expect(screen.getByText('No test suites match the current filter.')).toBeTruthy();

    const clearButton = screen.getByTestId('clear-filter');
    fireEvent.click(clearButton);

    expect(screen.queryByText('No test suites match the current filter.')).toBeNull();
    expect(screen.getByRole('button', { name: /@midnite\/studio-app/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /@midnite\/studio-git-engine/ })).toBeTruthy();
  });
});
