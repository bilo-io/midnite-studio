import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EarlyAccess } from './early-access';
import { composeIssueBody, ISSUE_LABEL, ISSUE_REPO } from './issue-url';

const emailInput = () => screen.getByTestId('email-input') as HTMLInputElement;
const submit = () => screen.getByTestId('submit-request');

const fillEmail = (value: string) => fireEvent.change(emailInput(), { target: { value } });

describe('<EarlyAccess>', () => {
  it('rests as a single field', () => {
    render(<EarlyAccess />);
    expect(emailInput()).toBeDefined();
    expect(screen.queryByTestId('use-case-input')).toBeNull();
    expect(screen.queryByTestId('agent-chips')).toBeNull();
  });

  it('grows into the full form on focus', () => {
    render(<EarlyAccess />);
    fireEvent.focus(emailInput());
    expect(screen.getByTestId('use-case-input')).toBeDefined();
    expect(screen.getByTestId('agent-chips')).toBeDefined();
  });

  it('grows on typing too, for an autofilled or pasted address', () => {
    render(<EarlyAccess />);
    fillEmail('someone@example.com');
    expect(screen.getByTestId('use-case-input')).toBeDefined();
  });

  /**
   * It must not collapse again. Focus leaving the address field — to reach the
   * optional ones, most obviously — would otherwise pull them out from under
   * the cursor.
   */
  it('stays open once it has opened', () => {
    render(<EarlyAccess />);
    fireEvent.focus(emailInput());
    fireEvent.blur(emailInput());
    expect(screen.getByTestId('use-case-input')).toBeDefined();
  });

  it('refuses an invalid address and says why', () => {
    render(<EarlyAccess />);
    fillEmail('someone-at-example');
    fireEvent.click(submit());

    expect(screen.getByTestId('email-error')).toBeDefined();
    expect(emailInput().getAttribute('aria-invalid')).toBe('true');
    expect(emailInput().getAttribute('aria-describedby')).toBe('early-access-email-error');
    expect(screen.queryByTestId('early-access-preview')).toBeNull();
  });

  it('refuses an empty address', () => {
    render(<EarlyAccess />);
    fireEvent.click(submit());
    expect(screen.getByTestId('email-error')).toBeDefined();
  });

  it('clears the error as soon as the address is edited', () => {
    render(<EarlyAccess />);
    fillEmail('nope');
    fireEvent.click(submit());
    expect(screen.getByTestId('email-error')).toBeDefined();

    fillEmail('nope@example.com');
    expect(screen.queryByTestId('email-error')).toBeNull();
    expect(emailInput().getAttribute('aria-invalid')).toBeNull();
  });

  it('shows the composed issue instead of posting it', () => {
    render(<EarlyAccess />);
    fillEmail('someone@example.com');
    fireEvent.change(screen.getByTestId('use-case-input'), {
      target: { value: 'A monorepo with four agents.' },
    });
    fireEvent.click(screen.getByTestId('agent-chip-claude'));
    fireEvent.click(screen.getByTestId('agent-chip-aider'));
    fireEvent.click(submit());

    const preview = screen.getByTestId('early-access-preview');
    expect(preview).toBeDefined();
    expect(screen.getByTestId('preview-title').textContent).toBe(
      'Early access: someone@example.com',
    );
    expect(screen.getByTestId('preview-body').textContent).toBe(
      composeIssueBody({
        email: 'someone@example.com',
        useCase: 'A monorepo with four agents.',
        agentIds: ['claude', 'aider'],
      }),
    );
    expect(preview.textContent).toContain(ISSUE_REPO);
    expect(preview.textContent).toContain(ISSUE_LABEL);
  });

  it('opens the issue through a real link in a new tab, at the public repo', () => {
    render(<EarlyAccess />);
    fillEmail('someone@example.com');
    fireEvent.click(submit());

    const link = screen.getByTestId('open-issue') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noreferrer');

    const url = new URL(link.href);
    expect(url.host).toBe('github.com');
    expect(url.pathname).toBe(`/${ISSUE_REPO}/issues/new`);
    expect(url.searchParams.get('title')).toBe('Early access: someone@example.com');
    expect(url.searchParams.get('labels')).toBe(ISSUE_LABEL);
    expect(link.href).not.toContain('bilo-io/midnite-studio');
  });

  it('toggles an agent chip off again', () => {
    render(<EarlyAccess />);
    fireEvent.focus(emailInput());
    const chip = screen.getByTestId('agent-chip-codex');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  /**
   * The issue must read the same however the chips were clicked, so the ids go
   * in roster order rather than click order.
   */
  it('lists the chosen agents in roster order, not click order', () => {
    render(<EarlyAccess />);
    fillEmail('someone@example.com');
    fireEvent.click(screen.getByTestId('agent-chip-cline'));
    fireEvent.click(screen.getByTestId('agent-chip-claude'));
    fireEvent.click(submit());
    expect(screen.getByTestId('preview-body').textContent).toContain('Claude, Cline');
  });

  it('goes back to the form to edit, keeping what was typed', () => {
    render(<EarlyAccess />);
    fillEmail('someone@example.com');
    fireEvent.click(submit());
    fireEvent.click(screen.getByTestId('edit-request'));

    expect(screen.queryByTestId('early-access-preview')).toBeNull();
    expect(emailInput().value).toBe('someone@example.com');
  });

  /** Enter in the address field submits, because the fields are in a `<form>`. */
  it('submits on Enter', () => {
    render(<EarlyAccess />);
    fillEmail('someone@example.com');
    fireEvent.submit(screen.getByTestId('early-access-form'));
    expect(screen.getByTestId('early-access-preview')).toBeDefined();
  });
});
