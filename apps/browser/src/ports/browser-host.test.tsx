import { describe, expect, it } from 'vitest';
import { createDefaultBrowserHost } from './browser-host';

describe('createDefaultBrowserHost', () => {
  it('initializes with default tab and web apps', () => {
    const host = createDefaultBrowserHost();
    expect(host.getTabs().length).toBeGreaterThan(0);
    expect(host.getActiveTab()?.url).toBe('https://github.com/bilo-io/midnite-apps');
    expect(host.getWebApps().length).toBe(4);
    expect(host.getActiveWebAppId()).toBeNull();
    expect(host.getAgentSession().active).toBe(false);
  });

  it('handles tab lifecycle: open, select, close', () => {
    const host = createDefaultBrowserHost();
    const newId = host.openTab('https://example.com');
    expect(host.getTabs().length).toBe(2);
    expect(host.getActiveTab()?.id).toBe(newId);
    expect(host.getActiveTab()?.url).toBe('https://example.com');

    // Select original tab
    const firstTab = host.getTabs()[0]!;
    host.selectTab(firstTab.id);
    expect(host.getActiveTab()?.id).toBe(firstTab.id);

    // Close new tab
    host.closeTab(newId);
    expect(host.getTabs().length).toBe(1);
    expect(host.getActiveTab()?.id).toBe(firstTab.id);
  });

  it('handles web-app toggling and tab mutual exclusion', () => {
    const host = createDefaultBrowserHost();
    host.toggleWebApp('slack');
    expect(host.getActiveWebAppId()).toBe('slack');
    expect(host.getTabs().some((t) => t.active)).toBe(false);

    // Toggle off restores active tab
    host.toggleWebApp('slack');
    expect(host.getActiveWebAppId()).toBeNull();
    expect(host.getActiveTab()?.active).toBe(true);
  });

  it('manages agent session lifecycle', () => {
    const host = createDefaultBrowserHost();
    host.startAgentSession('Verify login form');
    let session = host.getAgentSession();
    expect(session.active).toBe(true);
    expect(session.goal).toBe('Verify login form');
    expect(session.status).toBe('navigating');

    host.stepAgentSession('Clicked submit button');
    session = host.getAgentSession();
    expect(session.status).toBe('interacting');
    expect(session.lastAction).toBe('Clicked submit button');

    host.stopAgentSession();
    session = host.getAgentSession();
    expect(session.active).toBe(false);
    expect(session.status).toBe('idle');
  });
});
