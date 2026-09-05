import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MultiSelectMenu } from './multi-select-menu';

/**
 * Phase 68 Theme D — the panel autofocused its search box and then had nothing
 * to say about focus ever again: Tab walked into the toolbar behind it, and
 * dismissing it left focus on the removed input, i.e. on `<body>`.
 *
 * The `role="option"` arrow-key contract is deliberately still absent — that is
 * the same shape of work as the context menu's and belongs with it.
 */
describe('MultiSelectMenu focus trap', () => {
  afterEach(cleanup);

  function open() {
    render(
      <MultiSelectMenu
        options={[
          { value: 'main', label: 'main' },
          { value: 'dev', label: 'dev' },
        ]}
        selected={[]}
        onChange={() => {}}
        icon={null}
        allLabel="All branches"
        searchPlaceholder="Filter branches"
        emptyLabel="No branches"
        label="Branches"
        summarise={(n) => `${n} branches`}
      />,
    );
    const trigger = screen.getByRole('button', { name: /All branches/ });
    trigger.focus();
    fireEvent.click(trigger);
    return trigger;
  }

  it('wraps Tab inside the listbox', () => {
    open();

    const search = screen.getByPlaceholderText('Filter branches');
    expect(document.activeElement).toBe(search);

    const options = screen.getAllByRole('option');
    const last = options[options.length - 1]!;

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(search);
  });

  it('returns focus to the trigger when Escape dismisses it', () => {
    const trigger = open();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
