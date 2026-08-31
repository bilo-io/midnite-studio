import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagnosticsRun } from '@midnite/studio-shared';

import { DiagnosticsSegment } from './diagnostics-segment';

const mockUseActiveWorktree = vi.fn();
const mockUseDiagTrust = vi.fn();
const mockUseDiagResult = vi.fn();
const mockUseDiagCandidates = vi.fn();
const mockUseTrustDiagnostics = vi.fn();
const mockUseUntrustDiagnostics = vi.fn();
const mockUseRunDiagnostics = vi.fn();
const mockUseRepos = vi.fn();

vi.mock('../../services/use-status', () => ({
  useActiveWorktree: () => mockUseActiveWorktree(),
}));

vi.mock('../../services/queries', () => ({
  useDiagTrust: (id: string | null) => mockUseDiagTrust(id),
  useDiagResult: (id: string | null) => mockUseDiagResult(id),
  useDiagCandidates: (id: string | null, enabled: boolean) => mockUseDiagCandidates(id, enabled),
  useTrustDiagnostics: (id: string | null) => mockUseTrustDiagnostics(id),
  useUntrustDiagnostics: (id: string | null) => mockUseUntrustDiagnostics(id),
  useRunDiagnostics: (id: string | null) => mockUseRunDiagnostics(id),
  useRepos: () => mockUseRepos(),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('DiagnosticsSegment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActiveWorktree.mockReturnValue({ repoId: 'repo-1' });
    mockUseRepos.mockReturnValue({ data: [{ id: 'repo-1', path: '/path/to/repo' }] });
    mockUseDiagCandidates.mockReturnValue({ data: [] });
    mockUseTrustDiagnostics.mockReturnValue({ mutate: vi.fn() });
    mockUseUntrustDiagnostics.mockReturnValue({ mutate: vi.fn() });
    mockUseRunDiagnostics.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it('renders "No problems" in the finance segment\'s emerald gain color', () => {
    mockUseDiagTrust.mockReturnValue({
      data: { state: 'trusted', command: { parser: 'eslint', ecosystem: 'javascript', command: 'eslint', args: [] } },
      isLoading: false,
    });
    const cleanRun: DiagnosticsRun = {
      ok: true,
      errorCount: 0,
      warningCount: 0,
      rows: [],
      withheld: 0,
      ranAt: Date.now(),
      durationMs: 50,
    };
    mockUseDiagResult.mockReturnValue({ data: cleanRun });

    renderWithClient(<DiagnosticsSegment />);

    const noProblemsSpan = screen.getByLabelText('No problems');
    expect(noProblemsSpan).toBeDefined();
    expect(noProblemsSpan.className).toContain('text-emerald-600');
    expect(noProblemsSpan.className).toContain('dark:text-emerald-400');
    expect(screen.getByText('No problems')).toBeDefined();
  });

  it('renders errors in text-destructive and warnings in --health-warn', () => {
    mockUseDiagTrust.mockReturnValue({
      data: { state: 'trusted', command: { parser: 'eslint', ecosystem: 'javascript', command: 'eslint', args: [] } },
      isLoading: false,
    });
    const issueRun: DiagnosticsRun = {
      ok: true,
      errorCount: 2,
      warningCount: 5,
      rows: [],
      withheld: 0,
      ranAt: Date.now(),
      durationMs: 50,
    };
    mockUseDiagResult.mockReturnValue({ data: issueRun });

    renderWithClient(<DiagnosticsSegment />);

    const errorsEl = screen.getByTestId('diag-errors');
    expect(errorsEl.className).toContain('text-destructive');
    expect(errorsEl.textContent).toBe('2');

    const warningsEl = screen.getByTestId('diag-warnings');
    expect(warningsEl.getAttribute('style')).toContain('color: hsl(var(--health-warn))');
    expect(warningsEl.textContent).toBe('5');
  });
});
