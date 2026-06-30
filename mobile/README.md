# Nexus Federation — native app (Expo / React Native)

A real iOS + Android app (not a web bookmark) that talks to the existing Nexus
Federation web backend over a Bearer-token API. The Next.js app stays the server;
this is the native client.

## What's here (v0.1 foundation)

- **Auth** — email/password login against `POST /api/mobile/login`, token stored in
  the device keychain (`expo-secure-store`).
- **Bottom tab navigation** (Expo Router): **Wire**, **Standings**, **Account**.
- **Wire** — the live Federation ticker (scores strip + scrolling-free news list),
  pull-to-refresh, auto-refresh every 45s.
- **Standings** — per-sport standings from `GET /api/mobile/league/[id]`.
- **Account** — profile, your leagues, sign out.

## Prerequisites

- Node 18+ and the Expo CLI (`npx expo`).
- The **web backend deployed to a public HTTPS URL** (the phone must reach it).
- For store builds: an **Apple Developer** account ($99/yr) and **Google Play
  Console** ($25 one-time). iOS builds run on a Mac or via **EAS Build** (cloud).

## Configure

Set your backend URL in `app.json` → `expo.extra.apiUrl` (no trailing slash):

```json
"extra": { "apiUrl": "https://your-app.example.com" }
```

For local dev against the web app on your computer, use the computer's LAN IP
(e.g. `http://192.168.1.20:3000`) — `localhost` won't resolve from a phone.

## Run (development)

```bash
cd mobile
npm install
npx expo start          # press i (iOS sim), a (Android), or scan the QR in Expo Go
```

Log in with the same credentials you use on the web.

## Build real app binaries (EAS)

```bash
npm i -g eas-cli
eas login
eas build:configure                 # sets expo.extra.eas.projectId
eas build --platform ios            # produces a real .ipa  (needs Apple account)
eas build --platform android        # produces a real .apk/.aab
eas submit --platform ios           # upload to App Store Connect / TestFlight
eas submit --platform android       # upload to Google Play
```

Add an `assets/icon.png` (1024×1024) and a splash image before submitting, and
reference them in `app.json` (`icon`, `splash`, `android.adaptiveIcon`).

## Roadmap (next phases)

1. **My Team** — full roster + set lineup (the roster API already accepts the
   mobile Bearer token; add the screen + a `POST` for lineup changes).
2. **Scores / matchup detail** — reuse `/api/leagues/[id]/ticker` scores + a
   matchup endpoint for the game tracker.
3. **Push notifications** — `expo-notifications` + a device-token table, fired on
   score finals / trades / waiver results.
4. **League switcher** — when a user is in multiple leagues (currently uses the
   first).
5. **App icon, splash, store listings.**
