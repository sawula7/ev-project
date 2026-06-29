import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'EV Charge Owner',
  slug: 'ev-owner-app',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'evchargeowner',
  platforms: ['ios', 'android'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.evcharge.owner',
  },
  android: {
    package: 'com.evcharge.owner',
  },
  extra: {
    apiUrl: process.env.API_URL ?? 'http://localhost:3000',
  },
  plugins: ['expo-router', 'expo-secure-store'],
};

export default config;
