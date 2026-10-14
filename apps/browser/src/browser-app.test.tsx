import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserApp } from './browser-app';
import { createDefaultBrowserHost } from './ports/browser-host';

afterEach(() => {
  cleanup();
});

describe('BrowserApp composition', () => {
  it('renders the full-window browser with web-apps dock, tabs, and toolbar', () => {
    const host = createDefaultBrowserHost();
    render(<BrowserApp host={host} />);

    // Web Apps dock
    expect(screen.getByLabelText('Web Apps Dock')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open Slack' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open Linear' })).toBeDefined();

    // Tab strip
    expect(screen.getByRole('tab', { selected: true })).toBeDefined();
    expect(screen.getAllByText('Midnite Apps').length).toBeGreaterThan(0);

    // Toolbar
    expect(screen.getByRole('button', { name: 'Back' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Forward' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDefined();
    expect(screen.getByPlaceholderText('Search or enter web address...')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Start Agent Session' })).toBeDefined();

    // Full-window canvas
    expect(screen.getByRole('main', { name: 'Web View: Midnite Apps' })).toBeDefined();
  });

  it('switches between web tabs and web-app rail dock', () => {
    const host = createDefaultBrowserHost();
    render(<BrowserApp host={host} />);

    // Click Slack web app
    const slackBtn = screen.getByRole('button', { name: 'Open Slack' });
    fireEvent.click(slackBtn);

    expect(screen.getByRole('main', { name: 'Web App: Slack' })).toBeDefined();
    expect(screen.getByText('Partition: persist:app-slack')).toBeDefined();

    // Click tab to switch back
    const tab = screen.getByText('Midnite Apps');
    fireEvent.click(tab);

    expect(screen.getByRole('main', { name: 'Web View: Midnite Apps' })).toBeDefined();
  });

  it('adds and closes tabs in full-window tab strip', () => {
    const host = createDefaultBrowserHost();
    render(<BrowserApp host={host} />);

    // Click '+' to add tab
    const addTabBtn = screen.getByRole('button', { name: 'Add tab' });
    fireEvent.click(addTabBtn);

    expect(host.getTabs().length).toBe(2);

    // Close the second tab
    const closeButtons = screen.getAllByRole('button', { name: /Close tab/ });
    expect(closeButtons.length).toBe(2);
    fireEvent.click(closeButtons[1]!);

    expect(host.getTabs().length).toBe(1);
  });

  it('activates and controls agent-driven browsing session', () => {
    const host = createDefaultBrowserHost();
    render(<BrowserApp host={host} />);

    // Start agent session
    act(() => {
      host.startAgentSession('Audit checkout flow');
    });

    expect(screen.getByRole('region', { name: 'Agent Driving Session' })).toBeDefined();
    expect(screen.getAllByText(/Audit checkout flow/).length).toBeGreaterThan(0);
    expect(screen.getByText('AGENT DRIVING')).toBeDefined();

    // Step session
    const stepBtn = screen.getByRole('button', { name: 'Step' });
    fireEvent.click(stepBtn);

    expect(host.getAgentSession().status).toBe('interacting');

    // Take over / stop
    const stopBtn = screen.getByRole('button', { name: 'Take Over' });
    fireEvent.click(stopBtn);

    expect(screen.queryByRole('region', { name: 'Agent Driving Session' })).toBeNull();
    expect(host.getAgentSession().active).toBe(false);
  });
});
