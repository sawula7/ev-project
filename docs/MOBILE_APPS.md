# Mobile Apps Guide

Two separate Expo (React Native) apps:

| App | Package | Audience | Color |
|-----|---------|----------|-------|
| Driver App | `@ev/driver-app` | End customers | Green `#1a7f37` |
| Owner App | `@ev/owner-app` | Charger owners | Blue `#0ea5e9` |

---

## Prerequisites

```bash
# Node 20+, then:
npm install -g expo-cli eas-cli

# Create a free Expo account (needed for EAS builds and OTA updates)
# https://expo.dev/signup
eas login
```

You need one of:
- **Android**: Android Studio + emulator, or a physical Android device
- **iOS**: macOS + Xcode + simulator, or a physical iPhone
- **Either**: The **Expo Go** app (fastest for dev — install from App Store / Play Store)

---

## Option A — Expo Go (fastest, no build required)

Expo Go lets you run the app instantly on your phone by scanning a QR code.
**Limitation**: works for development only. Not for production distribution.

```bash
# Make sure your backend is running first
# Then, in one terminal:
cd apps/driver-app
EXPO_PUBLIC_API_URL=http://<YOUR-LAN-IP>:3000 npx expo start

# In a second terminal:
cd apps/owner-app
EXPO_PUBLIC_API_URL=http://<YOUR-LAN-IP>:3000 npx expo start
```

> Find your LAN IP: `ipconfig getifaddr en0` (Mac) or `hostname -I` (Linux)
> Use your machine's IP — not `localhost` — so your phone can reach the backend.

Scan the QR code with:
- **Android**: the Expo Go app
- **iPhone**: the built-in Camera app (opens Expo Go automatically)

---

## Option B — Android Emulator

```bash
# Start Android Studio → Device Manager → launch an emulator
# Then:
cd apps/driver-app
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000 npx expo start --android
```

> `10.0.2.2` is the Android emulator's alias for your host machine's localhost.

---

## Option C — iOS Simulator (Mac only)

```bash
cd apps/driver-app
EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start --ios
```

---

## App structure

### Driver App screens

```
/ (index)          Login
/register          Register
/(tabs)/map        Charger map — tap a pin to open charger detail
/(tabs)/sessions   Session history list
/(tabs)/wallet     Wallet balance (top-up pending gateway)
/charger/[id]      Charger detail + Start Charging button
/session/[id]      Active session — live energy/cost + Stop button
```

### Owner App screens

```
/ (index)          Login
/register          Register
/(tabs)/dashboard  Wallet balance + charger list + Claim button
/(tabs)/sessions   Earnings per session
/claim             Claim a charger (serial + claim code)
/charger/[id]      Set price per kWh + address
/payouts           Request payout + payout history
```

---

## Environment variables

Both apps use a single env var for the API:

| Variable | Used for |
|----------|----------|
| `EXPO_PUBLIC_API_URL` | Base URL for all API calls |

For dev: set it inline when running `expo start`.  
For EAS builds: set it per build profile in `eas.json` (already configured).

---

## Building installable APKs / IPAs

For sharing with testers before App Store submission, use **internal distribution builds** — these produce a downloadable APK (Android) or IPA (iOS) without going through the store.

### Android APK (easiest — no signing setup needed for internal)

```bash
cd apps/driver-app
eas build --platform android --profile preview
```

EAS builds in the cloud and gives you a download link. Send the `.apk` to your tester — they enable "Install from unknown sources" and install it directly.

### iOS IPA (requires Apple Developer account — $99/yr)

```bash
cd apps/driver-app
eas build --platform ios --profile preview
```

EAS handles signing automatically if you run `eas credentials` first. Testers install via the Expo dashboard link or TestFlight.

### Build both at once

```bash
eas build --platform all --profile preview
```

---

## Changing the API URL for a build

Edit `eas.json` in each app:

```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.your-domain.com"
      }
    }
  }
}
```

Then rebuild:
```bash
eas build --platform all --profile production
```

---

## Over-the-Air (OTA) updates

Expo supports pushing JS-only updates to installed apps without going through the App Store — useful for fixing bugs or changing API URLs after release.

```bash
# Push an OTA update to all production apps
cd apps/driver-app
eas update --branch production --message "Fix session polling interval"
```

Users get the update automatically next time they open the app. OTA cannot update native code (new permissions, new native packages) — those require a full store build.

---

## Production App Store submission

### Android — Google Play

1. Create an app in [Google Play Console](https://play.google.com/console)
2. Download a Service Account key JSON → save as `apps/driver-app/google-service-account.json`
3. Update `eas.json` → `submit.production.android.serviceAccountKeyPath`
4. Build + submit:
```bash
cd apps/driver-app
eas build --platform android --profile production
eas submit --platform android --profile production
```

### iOS — App Store

1. Create an app in [App Store Connect](https://appstoreconnect.apple.com)
2. Note your App ID and Team ID
3. Update `eas.json` → `submit.production.ios.*`
4. Build + submit:
```bash
cd apps/driver-app
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Submitted builds go to **TestFlight** first for internal testing. Once approved, you promote to the App Store.

---

## Common issues

| Problem | Fix |
|---------|-----|
| `Network request failed` on phone | Use LAN IP, not `localhost`. Check firewall allows port 3000. |
| Map doesn't show chargers | Location permission denied — go to phone Settings → App → grant location |
| `expo-secure-store` error on web | SecureStore only works on native. Don't test auth on `expo start --web`. |
| Android emulator can't reach backend | Use `10.0.2.2` instead of `localhost` as the API host |
| iOS simulator location shows wrong place | Simulator → Features → Location → Custom Location → set Colombo (6.9271, 79.8612) |
| EAS build fails on `@ev/shared` | The monorepo path alias requires `metro.config.js` — see below |

### Monorepo fix — metro.config.js

Because the apps import `@ev/shared` from the monorepo root, Metro bundler needs to know about it:

```bash
# Create this file in BOTH apps/driver-app and apps/owner-app
```

**`apps/driver-app/metro.config.js`:**

```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Allow Metro to resolve packages from the monorepo root
config.watchFolders = [path.resolve(__dirname, '../..')];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../../node_modules'),
];

module.exports = config;
```

Copy the same file to `apps/owner-app/metro.config.js`.
