import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LuEye, LuEyeOff, LuGrid } from 'react-icons/lu';
import { describe, expect, it, vi } from 'vitest';

import { IconSelect, type IconSelectOption } from './icon-select';

const mockOptions: IconSelectOption[] = [
  {
    value: 'perspective',
    label: 'Perspective',
    icon: LuEye,
    description: 'Camera projection: perspective keeps depth',
  },
  {
    value: 'orthographic',
    label: 'Orthographic',
    icon: LuEyeOff,
    description: 'Camera projection: orthographic keeps parallel lines',
  },
  {
    value: 'isometric',
    label: 'Isometric',
    icon: LuGrid,
    description: 'Camera projection: isometric view',
  },
];

describe('IconSelect', () => {
  it('displays the selected option text', () => {
    render(
      <IconSelect
        options={mockOptions}
        value="perspective"
        onChange={vi.fn()}
        icon={LuEye}
        label="Projection"
      />,
    );

    expect(screen.getByText('Perspective')).toBeInTheDocument();
  });

  it('shows tooltip with label and description on hover', async () => {
    const user = userEvent.setup();
    render(
      <IconSelect
        options={mockOptions}
        value="perspective"
        onChange={vi.fn()}
        icon={LuEye}
        label="Projection"
        description="Choose camera projection"
      />,
    );

    const button = screen.getByRole('button');
    await user.hover(button);

    // Tooltip should appear after delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(screen.getByText('Projection')).toBeInTheDocument();
    expect(screen.getByText('Choose camera projection')).toBeInTheDocument();
  });

  it('opens dropdown when clicked', async () => {
    const user = userEvent.setup();
    render(
      <IconSelect
        options={mockOptions}
        value="perspective"
        onChange={vi.fn()}
        icon={LuEye}
        label="Projection"
      />,
    );

    const button = screen.getByRole('button', { hidden: true });
    await user.click(button);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /perspective/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /orthographic/i })).toBeInTheDocument();
  });

  it('calls onChange and closes when option is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <IconSelect
        options={mockOptions}
        value="perspective"
        onChange={onChange}
        icon={LuEye}
        label="Projection"
      />,
    );

    const button = screen.getByRole('button', { hidden: true });
    await user.click(button);

    const orthographicOption = screen.getByRole('option', { name: /orthographic/i });
    await user.click(orthographicOption);

    expect(onChange).toHaveBeenCalledWith('orthographic');

    // Menu should be closed
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('marks selected option with aria-selected', async () => {
    const user = userEvent.setup();
    render(
      <IconSelect
        options={mockOptions}
        value="orthographic"
        onChange={vi.fn()}
        icon={LuEye}
        label="Projection"
      />,
    );

    const button = screen.getByRole('button', { hidden: true });
    await user.click(button);

    const orthographicOption = screen.getByRole('option', { name: /orthographic/i });
    const perspectiveOption = screen.getByRole('option', { name: /perspective/i });

    expect(orthographicOption).toHaveAttribute('aria-selected', 'true');
    expect(perspectiveOption).toHaveAttribute('aria-selected', 'false');
  });

  it('closes dropdown on outside click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <IconSelect
          options={mockOptions}
          value="perspective"
          onChange={vi.fn()}
          icon={LuEye}
          label="Projection"
        />
        <div data-testid="outside">Outside element</div>
      </div>,
    );

    const button = screen.getByRole('button', { hidden: true });
    await user.click(button);

    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(screen.getByTestId('outside'));

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('toggles menu on repeated clicks', async () => {
    const user = userEvent.setup();
    render(
      <IconSelect
        options={mockOptions}
        value="perspective"
        onChange={vi.fn()}
        icon={LuEye}
        label="Projection"
      />,
    );

    const button = screen.getByRole('button', { hidden: true });

    await user.click(button);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(button);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(button);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});
