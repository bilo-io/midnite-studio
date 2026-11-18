import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Mobile tests run in jsdom against react-native-web (Phase 146 B8); native-only modules are mocked in test/mocks.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@midnite/studio-git-engine/diff': new URL('../../packages/git-engine/src/parsers/diff-parser.ts', import.meta.url).pathname,
      'react-native': 'react-native-web',
      'react-native-gesture-handler': new URL('./test/mocks/gesture-handler.tsx', import.meta.url).pathname,
      'react-native-safe-area-context': new URL('./test/mocks/safe-area-context.tsx', import.meta.url).pathname,
      'expo-secure-store': new URL('./test/mocks/expo-secure-store.ts', import.meta.url).pathname,
      'expo-web-browser': new URL('./test/mocks/expo-web-browser.ts', import.meta.url).pathname,
      'expo-clipboard': new URL('./test/mocks/expo-clipboard.ts', import.meta.url).pathname,
      'expo-router': new URL('./test/mocks/expo-router.tsx', import.meta.url).pathname,
      'expo-status-bar': new URL('./test/mocks/empty.ts', import.meta.url).pathname,
    },
  },
  test: {
    name: 'mobile',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}', 'app/**/*.test.{ts,tsx}'],
  },
});
