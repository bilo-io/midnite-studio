// vitest/jsdom: provider tree renders its children (Phase 146 B8); no real-device capability needed.
import { render, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { describe, expect, it } from 'vitest';
import { AppProviders } from './app-providers';

describe('AppProviders', () => {
  it('renders children through the theme, query and auth providers', () => {
    render(
      <AppProviders>
        <Text>hello</Text>
      </AppProviders>,
    );
    expect(screen.getByText('hello')).toBeTruthy();
  });
});
