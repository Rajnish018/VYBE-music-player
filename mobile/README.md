# MEGA Music Mobile

Production-oriented React Native / Expo mobile client for the existing MEGA Music backend.

## What is included

- Same backend API contracts as the existing web app.
- Login / registration / session restore.
- Home, Discover, Library, Favorites, Artists, Artist detail, Albums, Album detail, Settings.
- YouTube search source using the existing `/api/tracks/search?source=youtube` flow.
- YouTube audio playback through `/api/share/youtube/audio?id=VIDEO_ID`.
- MEGA/library playback through `/api/tracks/:id/play?token=...`.
- Persistent native audio player with background playback and lock-screen metadata.
- Queue, next, previous, shuffle, repeat, seek and volume controls.
- Native share modal with system Share sheet and Copy Link.
- Admin upload screen using the existing `/api/admin/tracks` endpoint.
- Production-safe API error handling and configurable API base URL.

## API URL

Create `.env` from `.env.example`.

For Android emulator:

`EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000`

For a physical phone on the same LAN as the backend computer:

`EXPO_PUBLIC_API_BASE_URL=http://YOUR_COMPUTER_LAN_IP:3000`

For production:

`EXPO_PUBLIC_API_BASE_URL=https://YOUR_API_DOMAIN`

Do not use `localhost` on a physical phone unless the API itself runs on the phone.

## Install

Requirements: Node 22.13+ for Expo SDK 57, Android Studio for Android builds, and Xcode 26.4+ for iOS builds. Expo SDK 57 targets React Native 0.86.

```bash
npm install
```

For Expo native modules such as background audio, use a development build or an EAS build rather than relying on Expo Go for the final production configuration.

## Run development

```bash
npx expo start
```

For an Android native development build:

```bash
npx expo run:android
```

Or:

```bash
eas build --profile development --platform android
```

## Production builds

Android APK/AAB:

```bash
eas build --profile production --platform android
```

iOS:

```bash
eas build --profile production --platform ios
```

## Important backend requirement

The mobile app intentionally does not create a second backend. It uses the existing endpoints from the web application:

- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/me`
- `/api/auth/logout`
- `/api/tracks/library`
- `/api/tracks/search`
- `/api/tracks/:id/play`
- `/api/share/youtube/audio`
- `/api/tracks/:id/save`
- `/api/favorites`
- `/api/artists`
- `/api/artists/:id`
- `/api/admin/tracks`

Your backend must be reachable from the phone and should use HTTPS in production.

## Background audio

Expo Audio is configured with `enableBackgroundPlayback: true` and the player enables lock-screen metadata when a track starts. Expo documents this configuration for sustained Android background playback and iOS background audio.

## Uploads

The admin screen uses the system document picker. The selected URI is sent as multipart form data to the same admin track endpoint. The backend remains responsible for metadata extraction, deduplication, MEGA upload, and database persistence.

## Share modal

Every track row exposes a three-dot action. The bottom-sheet modal provides:

1. Share — native Android/iOS share sheet.
2. Copy link — copies a playable backend URL.
3. Cancel.

For YouTube tracks the copied/shared URL uses the existing YouTube audio endpoint. For normal library tracks it uses the existing track playback endpoint with the authenticated token.
