import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'EV Charge',
  slug: 'ev-driver-app',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'evcharge',
  platforms: ['ios', 'android'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.evcharge.driver',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'We use your location to show nearby chargers.',
    },
  },
  android: {
    package: 'com.evcharge.driver',
    permissions: ['ACCESS_FINE_LOCATION'],
  },
  extra: {
    apiUrl: process.env.API_URL ?? 'http://localhost:3000',
  },
  plugins: ['expo-router', 'expo-secure-store', 'expo-location'],
};

export default config;
