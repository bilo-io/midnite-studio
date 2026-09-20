import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { composeIssueBody, ReportIssueDialog } from './report-issue-dialog';

const bundleFn = vi.fn();
const cliStatusFn = vi.fn();
const submitIssueFn = vi.fn();
const openExternalFn = vi.fn();

vi.mock('../services/bridge', () => ({
  bridge: () => ({
    report: { bundle: bundleFn, submitIssue: submitIssueFn },
    forge: { cliStatus: cliStatusFn },
    shell: { openExternal: openExternalFn },
  }),
  hasBridge: () => true,
}));

const READY_CLI = { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' };
const NOT_INSTALLED_CLI = { reason: 'not-installed' as const, binPath: null, hint: 'brew install gh' };

function renderDialog(onClose: () => void = () => {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ReportIssueDialog open onClose={onClose} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  bundleFn.mockReset();
  cliStatusFn.mockReset();
  submitIssueFn.mockReset();
  openExternalFn.mockReset();
});

describe('ReportIssueDialog — bug/feature toggle', () => {
  it('defaults to Bug, with the "[bug] " prefix and diagnostics open', async () => {
    bundleFn.mockResolvedValue({ text: '2026-01-01T00:00:00.000Z INFO boot' });
    cliStatusFn.mockResolvedValue(READY_CLI);
    renderDialog();

    expect(screen.getByRole('radio', { name: 'Bug' }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('[bug] ');
    expect(screen.getByText('What happened?')).not.toBeNull();
    // Diagnostics defaults open for a bug. `Accordion`'s collapsed body stays
    // mounted (an `inert`, height-0 CSS transition, not an unmount) so the
    // open/closed default is read off the header's `aria-expanded`, not off
    // whether the block is present in the DOM.
    await screen.findByTestId('report-issue-diagnostics');
    expect(screen.getByRole('button', { name: /Diagnostics/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('switching to Feature swaps the prefill and label, and collapses diagnostics by default', async () => {
    bundleFn.mockResolvedValue({ text: 'some log line' });
    cliStatusFn.mockResolvedValue(READY_CLI);
    renderDialog();

    fireEvent.click(screen.getByRole('radio', { name: 'Feature' }));

    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('[feat] ');
    expect(screen.getByText("What's the problem?")).not.toBeNull();
    await waitFor(() => expect(bundleFn).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /Diagnostics/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('does not clobber a title the user already edited when toggling kind', async () => {
    bundleFn.mockResolvedValue({ text: '' });
    cliStatusFn.mockResolvedValue(READY_CLI);
    renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '[bug] the sync spinner never stops' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Feature' }));

    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('[bug] the sync spinner never stops');
  });
});

describe('ReportIssueDialog — diagnostics stay the single redaction path', () => {
  it('renders the bundle text byte-identical, no re-formatting', async () => {
    const text = 'boot v0.3.1\n2026-01-01T00:00:00.000Z ERROR ~/redacted/already <redacted>';
    bundleFn.mockResolvedValue({ text });
    cliStatusFn.mockResolvedValue(READY_CLI);
    renderDialog();

    const block = await screen.findByTestId('report-issue-diagnostics');
    expect(block.textContent).toBe(text);
  });

  it('composeIssueBody never mutates the diagnostics text it is handed', () => {
    const diagnostics = '~/already/redacted <redacted>';
    const body = composeIssueBody('a description', diagnostics);
    expect(body).toContain(diagnostics);
  });

  it('composeIssueBody clamps to FORGE_BODY_MAX defensively', () => {
    const body = composeIssueBody('x'.repeat(200_000), '');
    expect(body.length).toBeLessThanOrEqual(65_536);
  });
});

describe('ReportIssueDialog — submit', () => {
  it('sends the composed title/body/kind and shows the created issue link on success', async () => {
    bundleFn.mockResolvedValue({ text: 'log tail' });
    cliStatusFn.mockResolvedValue(READY_CLI);
    submitIssueFn.mockResolvedValue({
      ok: true,
      cli: READY_CLI,
      error: null,
      url: 'https://github.com/bilo-io/midnite-apps/issues/42',
    });
    renderDialog();

    await screen.findByTestId('report-issue-diagnostics');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '[bug] the sync spinner never stops' } });
    fireEvent.change(screen.getByLabelText('What happened?'), {
      target: { value: 'Clicked sync and it spun forever.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(submitIssueFn).toHaveBeenCalledTimes(1));
    const call = submitIssueFn.mock.calls[0]![0];
    expect(call.title).toBe('[bug] the sync spinner never stops');
    expect(call.kind).toBe('bug');
    expect(call.body).toContain('Clicked sync and it spun forever.');
    expect(call.body).toContain('log tail');

    const link = await screen.findByRole('button', { name: 'View issue' });
    fireEvent.click(link);
    expect(openExternalFn).toHaveBeenCalledWith({ url: 'https://github.com/bilo-io/midnite-apps/issues/42' });
  });

  it('cannot be submitted with an empty description', async () => {
    bundleFn.mockResolvedValue({ text: '' });
    cliStatusFn.mockResolvedValue(READY_CLI);
    renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '[bug] something' } });
    const submit = screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submitIssueFn).not.toHaveBeenCalled();
  });

  it("shows gh's own refusal on a failed submit", async () => {
    bundleFn.mockResolvedValue({ text: '' });
    cliStatusFn.mockResolvedValue(READY_CLI);
    submitIssueFn.mockResolvedValue({
      ok: false,
      cli: READY_CLI,
      error: 'HTTP 403: Resource not accessible by integration',
      url: null,
    });
    renderDialog();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '[bug] something' } });
    fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'It broke.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('HTTP 403: Resource not accessible by integration')).not.toBeNull();
  });
});

describe('ReportIssueDialog — the fallback is not a dead end', () => {
  it('shows why and a working "Open in browser instead" when gh is not ready', async () => {
    bundleFn.mockResolvedValue({ text: '' });
    cliStatusFn.mockResolvedValue(NOT_INSTALLED_CLI);
    renderDialog();

    expect(await screen.findByText('brew install gh')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open in browser instead' }));
    expect(openExternalFn).toHaveBeenCalledWith({
      url: 'https://github.com/bilo-io/midnite-apps/issues/new?labels=midnite-studio',
    });
  });
});
