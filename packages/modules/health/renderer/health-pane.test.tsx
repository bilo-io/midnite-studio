import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HealthPane } from './health-pane';

describe('HealthPane', () => {
  it('renders Today for an unknown view', () => {
    render(<HealthPane view="nope" onView={() => undefined} />);
    expect(screen.getByText('Nothing logged today')).toBeTruthy();
  });

  it.each(['biometrics', 'nutrition', 'workouts', 'progress'])('renders %s', (id) => {
    render(<HealthPane view={id} onView={() => undefined} />);
    expect(screen.getByTestId(`${id}-empty`)).toBeTruthy();
  });
});
