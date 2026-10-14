import type { LauncherBridge } from '../common/bridge';
import { createMockBridge } from './mock-bridge';

declare global {
  interface Window {
    midniteLauncher?: LauncherBridge;
  }
}

let fallback: LauncherBridge | null = null;

/**
 * The preload's bridge inside Electron; a mock in a plain browser
 * (`moon run launcher:dev`, screenshots), so the UI can be worked on without
 * an Electron window. `?studio=installed|update|missing` picks the mock's state.
 */
export function getBridge(): LauncherBridge {
  if (window.midniteLauncher) return window.midniteLauncher;
  fallback ??= createMockBridge(new URLSearchParams(window.location.search).get('studio'));
  return fallback;
}
