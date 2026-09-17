import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LuCircleDot } from 'react-icons/lu';

import { CardAssignees, CardFieldChips, CardNumberRow, CardTitleRow, CONTENT_ICON } from './card-chrome';

afterEach(cleanup);

describe('CONTENT_ICON', () => {
  it('has exactly one entry per content type', () => {
    expect(Object.keys(CONTENT_ICON).sort()).toEqual(['draft', 'issue', 'pull']);
  });
});

describe('CardTitleRow', () => {
  it('renders the icon and the title', () => {
    render(<CardTitleRow icon={LuCircleDot} title="Fix the flaky test" />);
    expect(screen.getByText('Fix the flaky test')).toBeDefined();
  });
});

describe('CardNumberRow', () => {
  it('renders an empty span for a null number (a draft)', () => {
    const { container } = render(<CardNumberRow number={null} href={null} />);
    expect(container.textContent).toBe('');
  });

  it('renders a plain number with no href', () => {
    render(<CardNumberRow number={7} href={null} />);
    expect(screen.getByText('#7').closest('a')).toBeNull();
  });

  it('links the number when an href is given, and stops the click reaching a parent', () => {
    render(<CardNumberRow number={7} href="https://github.com/acme/widgets/issues/7" />);
    const link = screen.getByText('#7').closest('a');
    expect(link?.getAttribute('href')).toBe('https://github.com/acme/widgets/issues/7');
  });
});

describe('CardAssignees', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(<CardAssignees assignees={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one avatar per login', () => {
    render(<CardAssignees assignees={['octocat', 'monalisa']} />);
    expect(screen.getByAltText('octocat')).toBeDefined();
    expect(screen.getByAltText('monalisa')).toBeDefined();
  });
});

describe('CardFieldChips', () => {
  const priorityField: ForgeProjectField = { id: 'f-priority', name: 'Priority', dataType: 'text' };
  const item: ForgeProjectItem = {
    id: 'item1',
    content: {
      type: 'draft',
      id: 'DI_1',
      title: 'Write the design doc',
      assignees: [],
      body: '',
    },
    fieldValues: { 'f-priority': { fieldId: 'f-priority', dataType: 'text', text: 'High' } },
  };

  it('renders a chip carrying data-card-chip for each field with a value', () => {
    render(<CardFieldChips item={item} fields={[priorityField]} />);
    const chip = screen.getByText('High');
    expect(chip.hasAttribute('data-card-chip')).toBe(true);
  });

  it('skips a field with no value, and renders nothing when none qualify', () => {
    const emptyField: ForgeProjectField = { id: 'f-empty', name: 'Empty', dataType: 'text' };
    const { container } = render(<CardFieldChips item={item} fields={[emptyField]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a single_select field chip styled with GitHub option color, dot and tint', () => {
    const statusField: ForgeProjectField = {
      id: 'f-status',
      name: 'Status',
      dataType: 'single_select',
      options: [
        { id: 'opt-done', name: 'Done', color: 'GREEN' },
        { id: 'opt-review', name: 'In Review', color: 'PURPLE' },
      ],
    };
    const itemWithStatus: ForgeProjectItem = {
      ...item,
      fieldValues: {
        'f-status': { fieldId: 'f-status', dataType: 'single_select', optionId: 'opt-done', name: 'Done' },
      },
    };
    render(<CardFieldChips item={itemWithStatus} fields={[statusField]} />);
    const chip = screen.getByText('Done');
    expect(chip.hasAttribute('data-card-chip')).toBe(true);
    // Green option styling (#22C55E)
    expect(chip.style.color).toBe('rgb(34, 197, 94)');
    expect(chip.style.backgroundColor).toBe('rgba(34, 197, 94, 0.1)');
    const dot = chip.querySelector('[aria-hidden]');
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute('style')).toContain('background-color: rgb(34, 197, 94)');
  });
});
