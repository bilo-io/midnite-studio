import type { ExpoConfig } from 'expo/config';

// Expo Go only (Phase 146 scope guardrail): no custom native modules, no config plugin that needs a dev build.
const config: ExpoConfig = {
  name: 'Midnite',
  slug: 'midnite-mobile',
  scheme: 'midnite-mobile',
  version: '0.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  backgroundColor: '#0a0a0a',
  ios: { bundleIdentifier: 'io.bilo.midnite.mobile', supportsTablet: false },
  android: { package: 'io.bilo.midnite.mobile' },
  plugins: ['expo-router'],
  experiments: { typedRoutes: true },
  extra: {
    githubClientId: process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID,
  },
};

export default config;
