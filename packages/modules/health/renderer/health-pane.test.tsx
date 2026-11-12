import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { HealthPane } from './health-pane';

afterEach(cleanup);

describe('HealthPane', () => {
  it('renders Today for an unknown view', () => {
    render(<HealthPane view="nope" onView={() => undefined} />);
    expect(screen.getByText('Nothing logged today')).toBeTruthy();
  });

  it.each(['progress'])('renders %s', (id) => {
    render(<HealthPane view={id} onView={() => undefined} />);
    expect(screen.getByTestId(`${id}-empty`)).toBeTruthy();
  });

  it.each(['biometrics', 'nutrition', 'workouts'])('renders the %s view (no bridge: Health runs in its own app)', (id) => {
    render(<HealthPane view={id} onView={() => undefined} />);
    expect(screen.getByTestId('health-missing')).toBeTruthy();
  });
});
