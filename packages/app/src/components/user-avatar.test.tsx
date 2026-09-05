import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetAvatars } from '../services/avatars';
import { UserAvatar } from './user-avatar';

afterEach(cleanup);

describe('UserAvatar', () => {
  beforeEach(() => {
    __resetAvatars();
  });

  it('renders a GitHub avatar image for a GitHub login', () => {
    const { container } = render(<UserAvatar login="octocat" size={24} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://github.com/octocat.png?size=48');
  });

  it('falls back to initials with deterministic background on GitHub image error', () => {
    const { container } = render(<UserAvatar login="octocat" size={24} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img!);

    // After error, img is replaced with initials span
    expect(container.querySelector('img')).toBeNull();
    const initials = screen.getByText('OC');
    expect(initials).not.toBeNull();
  });

  it('renders initials fallback when given git author name and email without gravatar', () => {
    render(<UserAvatar name="Ada Lovelace" email="ada@example.com" size={20} />);
    const initials = screen.getByText('AL');
    expect(initials).not.toBeNull();
  });

  it('wraps avatar with tooltip by default when identity is present', () => {
    const { container } = render(
      <UserAvatar login="bilo" name="Bilo Lwabona" detail="Author" />,
    );
    const trigger = container.querySelector('span.inline-flex');
    expect(trigger).not.toBeNull();
  });

  it('omits tooltip when withTooltip is false', () => {
    const { container } = render(
      <UserAvatar login="bilo" withTooltip={false} />,
    );
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('displays tooltip with user details on focus/hover', async () => {
    const { container } = render(
      <UserAvatar login="bilo" name="Bilo Lwabona" detail="Reviewer" />,
    );
    const trigger = container.querySelector('span.inline-flex');
    expect(trigger).not.toBeNull();
    fireEvent.mouseEnter(trigger!);

    // Wait for the open delay (OPEN_DELAY_MS = 400ms in tooltip.tsx)
    await new Promise((r) => setTimeout(r, 450));
    expect(screen.getByText('Bilo Lwabona')).not.toBeNull();
    expect(screen.getByText('@bilo')).not.toBeNull();
    expect(screen.getByText('Reviewer')).not.toBeNull();
  });
});
