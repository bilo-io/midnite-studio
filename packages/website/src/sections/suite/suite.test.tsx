import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SITE_APPS } from '../../apps/catalog';
import { LauncherMock } from '../hero/launcher-mock';

import { Suite } from './suite';

describe('Suite', () => {
  it('links a card per app to that app’s slide on the Apps page', () => {
    render(<Suite />);
    for (const app of SITE_APPS) {
      const card = screen.getByRole('link', { name: new RegExp(`^Midnite ${app.name}\\b`) });
      expect(card.getAttribute('href')).toBe(`/apps/#${app.id}`);
    }
  });
});

describe('LauncherMock', () => {
  it('draws a tile per app, each linking to its slide', () => {
    render(<LauncherMock />);
    for (const app of SITE_APPS) {
      expect(screen.getByRole('link', { name: app.name }).getAttribute('href')).toBe(`/apps/#${app.id}`);
    }
  });
});
