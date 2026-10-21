import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KitPopover, KitTreeSection, useEscapeDismiss } from './kit-ui';

afterEach(cleanup);

describe('KitPopover', () => {
  it('toggles on its trigger and closes on Escape and on an outside press', () => {
    render(
      <div>
        <KitPopover label="Pick one" trigger="open">
          <p>panel</p>
        </KitPopover>
        <button type="button">elsewhere</button>
      </div>,
    );
    expect(screen.queryByText('panel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Pick one' }));
    expect(screen.getByText('panel')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('panel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Pick one' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.queryByText('panel')).toBeNull();
  });

  it('reports every change when it is controlled', () => {
    const changes: boolean[] = [];
    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <KitPopover
          label="Pick"
          trigger="t"
          open={open}
          onOpenChange={(next) => {
            changes.push(next);
            setOpen(next);
          }}
        >
          body
        </KitPopover>
      );
    }
    render(<Controlled />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(changes).toEqual([true, false]);
  });
});

describe('KitTreeSection', () => {
  it('collapses its rows, and hides itself when it is empty and asked to', () => {
    const { rerender } = render(
      <KitTreeSection title="Collections" count={2} collapsible open onToggle={() => undefined}>
        <p>rows</p>
      </KitTreeSection>,
    );
    expect(screen.getByText('rows')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Collections/ }).getAttribute('aria-expanded')).toBe('true');

    rerender(
      <KitTreeSection title="Collections" count={2} collapsible open={false} onToggle={() => undefined}>
        <p>rows</p>
      </KitTreeSection>,
    );
    expect(screen.queryByText('rows')).toBeNull();

    rerender(
      <KitTreeSection title="Collections" count={0}>
        <p>rows</p>
      </KitTreeSection>,
    );
    expect(screen.queryByText('Collections')).toBeNull();
  });

  it('renders its trailing action and runs it', () => {
    const run = vi.fn();
    render(
      <KitTreeSection title="History" action={{ label: 'Clear history', onClick: run }}>
        rows
      </KitTreeSection>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(run).toHaveBeenCalledOnce();
  });
});

describe('useEscapeDismiss', () => {
  it('listens only while open', () => {
    const dismiss = vi.fn();
    function Probe({ open }: { open: boolean }) {
      useEscapeDismiss(open, dismiss);
      return null;
    }
    const { rerender } = render(<Probe open={false} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dismiss).not.toHaveBeenCalled();

    rerender(<Probe open />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dismiss).toHaveBeenCalledOnce();
  });
});
