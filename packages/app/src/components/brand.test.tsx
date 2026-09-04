import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../store/ui-store';
import { Brand, BrandHomeButton, BrandMark, Wordmark } from './brand';

describe('Brand components', () => {
  beforeEach(() => {
    useUiStore.setState({ activeView: 'graph' });
  });

  afterEach(cleanup);

  describe('BrandMark', () => {
    it('renders the mark image with default styling', () => {
      const { container } = render(<BrandMark />);
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.className).toContain('h-5 w-5');
      expect(img?.className).toContain('rounded-full');
    });

    it('respects a custom className', () => {
      const { container } = render(<BrandMark className="h-8 w-8" />);
      const img = container.querySelector('img');
      expect(img?.className).toContain('h-8 w-8');
    });
  });

  describe('Wordmark', () => {
    it('renders Midnite in brand font and Studio in medium font', () => {
      render(<Wordmark />);
      expect(screen.getByText('Midnite')).toBeTruthy();
      expect(screen.getByText('Studio')).toBeTruthy();
      expect(screen.getByText('Midnite').className).toContain('font-brand');
    });
  });

  describe('Brand', () => {
    it('renders both mark and wordmark by default', () => {
      render(<Brand data-testid="brand-root" />);
      expect(screen.getByTestId('brand-root')).toBeTruthy();
      expect(screen.getByText('Midnite')).toBeTruthy();
      expect(screen.getByText('Studio')).toBeTruthy();
    });

    it('hides the wordmark when showWordmark is false', () => {
      render(<Brand showWordmark={false} />);
      expect(screen.queryByText('Midnite')).toBeNull();
      expect(screen.queryByText('Studio')).toBeNull();
    });

    it('applies custom mark and wordmark class names', () => {
      const { container } = render(<Brand markClassName="h-7 w-7" wordmarkClassName="text-xl" />);
      const img = container.querySelector('img');
      expect(img?.className).toContain('h-7 w-7');
      expect(screen.getByText('Midnite').parentElement?.className).toContain('text-xl');
    });
  });

  describe('BrandHomeButton', () => {
    it('navigates to landing view on click', () => {
      render(
        <BrandHomeButton>
          <span>Home</span>
        </BrandHomeButton>,
      );
      const button = screen.getByRole('button', { name: 'Go to the landing page' });
      expect(button.getAttribute('aria-current')).toBeNull();

      fireEvent.click(button);
      expect(useUiStore.getState().activeView).toBe('landing');
    });

    it('reflects aria-current="page" when on landing view', () => {
      useUiStore.setState({ activeView: 'landing' });
      render(
        <BrandHomeButton>
          <span>Home</span>
        </BrandHomeButton>,
      );
      const button = screen.getByRole('button', { name: 'Go to the landing page' });
      expect(button.getAttribute('aria-current')).toBe('page');
    });
  });
});
