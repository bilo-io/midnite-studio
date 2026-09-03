import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LuGitBranch, LuTerminal } from 'react-icons/lu';

import { IconSelect } from './icon-select';

afterEach(cleanup);

const OPTIONS = [
  { id: 'claude', label: 'Claude', icon: LuTerminal, iconColor: '#D97757' },
  { id: 'codex', label: 'Codex', icon: LuGitBranch, iconColor: '#10A37F' },
];

describe('IconSelect', () => {
  it('shows the selected option, with its icon, as the current value', () => {
    render(<IconSelect ariaLabel="Agent" options={OPTIONS} value="claude" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Agent')).toBeDefined();
    expect(screen.getByText('Claude')).toBeDefined();
  });

  it('is searchable: typing narrows the open menu to matching options', () => {
    render(<IconSelect ariaLabel="Agent" options={OPTIONS} value="claude" onChange={vi.fn()} />);

    const input = screen.getByLabelText('Agent');
    fireEvent.mouseDown(input);
    fireEvent.change(input, { target: { value: 'cod' } });

    expect(screen.getByText('Codex')).toBeDefined();
    expect(screen.queryByRole('option', { name: /Claude/ })).toBeNull();
  });

  it('picking an option calls onChange with its id', () => {
    const onChange = vi.fn();
    render(<IconSelect ariaLabel="Agent" options={OPTIONS} value="claude" onChange={onChange} />);

    const input = screen.getByLabelText('Agent');
    fireEvent.mouseDown(input);
    fireEvent.click(screen.getByText('Codex'));

    expect(onChange).toHaveBeenCalledWith('codex');
  });

  it('disables the control when there are no options to choose from', () => {
    render(<IconSelect ariaLabel="Model" options={[]} value="" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Model')).toHaveProperty('disabled', true);
  });
});
