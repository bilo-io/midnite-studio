import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SiGit } from 'react-icons/si';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SetupStatusRow, setupRowStatus } from './setup-status-row';

/** Phase 98 Theme D — the one status row every setup page draws. */
afterEach(cleanup);

const row = () => screen.getByTestId('setup-status-row');

describe('setupRowStatus', () => {
  it('is installing while an install runs, whatever the probe says', () => {
    expect(setupRowStatus({ loading: false, installing: true, installed: false })).toBe('installing');
    expect(setupRowStatus({ loading: true, installing: true, installed: undefined })).toBe('installing');
  });

  it('is checking until there is an answer, then ready or missing', () => {
    expect(setupRowStatus({ loading: true, installing: false, installed: undefined })).toBe('checking');
    expect(setupRowStatus({ loading: false, installing: false, installed: undefined })).toBe('checking');
    expect(setupRowStatus({ loading: false, installing: false, installed: true })).toBe('ready');
    expect(setupRowStatus({ loading: false, installing: false, installed: false })).toBe('missing');
  });
});

describe('SetupStatusRow', () => {
  it('checking: a spinner, no action', () => {
    render(<SetupStatusRow label="git" status="checking" action={<button type="button">Install</button>} />);
    expect(row().dataset['status']).toBe('checking');
    expect(screen.getByRole('img', { name: 'Checking' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('missing: shows the page action', () => {
    render(<SetupStatusRow label="git" status="missing" action={<button type="button">Install</button>} />);
    expect(screen.getByRole('img', { name: 'Not installed' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy();
  });

  it('installing: a spinner and a link to the terminal running it', () => {
    const reveal = vi.fn();
    render(<SetupStatusRow label="git" status="installing" onRevealTerminal={reveal} />);
    expect(screen.getByRole('img', { name: 'Installing' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Running in terminal' }));
    expect(reveal).toHaveBeenCalledOnce();
  });

  it('installing without a terminal says so plainly', () => {
    render(<SetupStatusRow label="Midnite CLI" status="installing" />);
    expect(screen.queryByRole('button', { name: 'Running in terminal' })).toBeNull();
    expect(screen.getByText('Installing…')).toBeTruthy();
  });

  it('ready: the pulsing check, the brand-coloured icon and the version', () => {
    render(<SetupStatusRow label="git" status="ready" icon={SiGit} brandColor="#F05032" detail="2.45.0" />);
    const check = screen.getByRole('img', { name: 'Ready' });
    expect(check.classList.contains('setup-ready-check')).toBe(true);
    expect(screen.getByText('2.45.0')).toBeTruthy();
    const icon = row().querySelector('svg[style]') as SVGElement | null;
    expect(icon?.style.color).toBe('rgb(240, 80, 50)');
  });
});
