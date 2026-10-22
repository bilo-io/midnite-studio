import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FrameChromeProvider, type FrameChrome } from '../chrome/chrome-port';
import { FrameModal } from '../chrome/frame-modal';
import type { FrameModalProps } from '../chrome/types';
import { createFrameChrome } from './frame-chrome';
import { KitModal } from './kit-modal';

afterEach(cleanup);

describe('KitModal', () => {
  it('renders nothing while closed', () => {
    render(
      <KitModal open={false} onClose={() => {}} title="Report">
        <p>body</p>
      </KitModal>,
    );
    expect(screen.queryByText('body')).toBeNull();
  });

  it('is a labelled modal dialog that closes on Escape and on the scrim, not on the panel', () => {
    const onClose = vi.fn();
    render(
      <KitModal open onClose={onClose} title="Report" testId="panel">
        <button type="button">inside</button>
      </KitModal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Report' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    fireEvent.click(screen.getByTestId('panel'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('FrameModal', () => {
  it("falls back to the kit's modal without a provider", () => {
    render(
      <FrameModal open onClose={() => {}} title="Report">
        <p>body</p>
      </FrameModal>,
    );
    expect(screen.getByRole('dialog', { name: 'Report' })).toBeTruthy();
  });

  it("renders the app's own modal when its chrome installs one", () => {
    function AppModal({ open, title, children }: FrameModalProps) {
      return open ? <section aria-label={`app: ${title}`}>{children}</section> : null;
    }
    const chrome: FrameChrome = { ...createFrameChrome().chrome, Modal: AppModal };
    render(
      <FrameChromeProvider chrome={chrome}>
        <FrameModal open onClose={() => {}} title="Report">
          <p>body</p>
        </FrameModal>
      </FrameChromeProvider>,
    );
    expect(screen.getByLabelText('app: Report')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
