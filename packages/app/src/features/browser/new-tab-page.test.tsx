import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NewTabPage } from './new-tab-page';
import { WALLPAPER_STORAGE_KEY } from './wallpaper';

describe('NewTabPage', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders search input, shortcuts, and wallpaper controls', () => {
    render(<NewTabPage />);

    expect(screen.getByPlaceholderText(/search the web or enter url/i)).toBeDefined();
    expect(screen.getByTestId('shortcuts-panel')).toBeDefined();
    expect(screen.getByTestId('wallpaper-theme-select')).toBeDefined();
    expect(screen.getByText('Shortcuts')).toBeDefined();
    expect(screen.getByText('Google')).toBeDefined();
    expect(screen.getByText('YouTube')).toBeDefined();
    expect(screen.getByText('Figma')).toBeDefined();
    expect(screen.getByText('Claude')).toBeDefined();
    expect(screen.getByText('Gemini')).toBeDefined();
    expect(screen.getByText('Notebook')).toBeDefined();
  });

  it('renders accurate brand colors for shortcut tiles', () => {
    render(<NewTabPage />);

    const googleTile = screen.getByTestId('shortcut-tile-google');
    expect(googleTile).toBeDefined();

    const youtubeTile = screen.getByTestId('shortcut-tile-youtube');
    expect(youtubeTile).toBeDefined();

    const figmaTile = screen.getByTestId('shortcut-tile-figma');
    expect(figmaTile).toBeDefined();
  });

  it('changes wallpaper theme and persists in localStorage', () => {
    render(<NewTabPage />);

    const select = screen.getByTestId('wallpaper-theme-select') as HTMLSelectElement;
    expect(select.value).toBe('nature');

    fireEvent.change(select, { target: { value: 'cyberpunk' } });
    expect(select.value).toBe('cyberpunk');
    expect(localStorage.getItem(WALLPAPER_STORAGE_KEY)).toBe('cyberpunk');
  });

  it('renders unsplash attribution', () => {
    render(<NewTabPage />);
    expect(screen.getByText(/on unsplash/i)).toBeDefined();
  });
});
