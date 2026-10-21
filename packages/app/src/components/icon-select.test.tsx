import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LuBox, LuEye, LuEyeOff } from 'react-icons/lu';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    icon: LuBox,
    description: 'Camera projection: isometric view',
  },
];

afterEach(cleanup);

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

    expect(screen.getByText('Perspective')).toBeTruthy();
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

    expect(screen.getByText('Projection')).toBeTruthy();
    expect(screen.getByText('Choose camera projection')).toBeTruthy();
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

    const button = screen.getByRole('button');
    await user.click(button);

    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByRole('option', { name: /perspective/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /orthographic/i })).toBeTruthy();
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

    const button = screen.getByRole('button');
    await user.click(button);

    const orthographicOption = screen.getByRole('option', { name: /orthographic/i });
    await user.click(orthographicOption);

    expect(onChange).toHaveBeenCalledWith('orthographic');

    // Menu should be closed
    expect(screen.queryByRole('listbox')).toBeNull();
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

    const button = screen.getByRole('button');
    await user.click(button);

    const orthographicOption = screen.getByRole('option', { name: /orthographic/i });
    const perspectiveOption = screen.getByRole('option', { name: /perspective/i });

    expect(orthographicOption.getAttribute('aria-selected')).toBe('true');
    expect(perspectiveOption.getAttribute('aria-selected')).toBe('false');
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

    const button = screen.getByRole('button');
    await user.click(button);

    expect(screen.getByRole('listbox')).toBeTruthy();

    await user.click(screen.getByTestId('outside'));

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(screen.queryByRole('listbox')).toBeNull();
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

    const button = screen.getByRole('button');

    await user.click(button);
    expect(screen.getByRole('listbox')).toBeTruthy();

    await user.click(button);
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.click(button);
    expect(screen.getByRole('listbox')).toBeTruthy();
  });
});
