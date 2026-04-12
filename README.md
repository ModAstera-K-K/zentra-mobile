# Zentra

[![CI](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/ci.yml/badge.svg)](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/ci.yml)
[![Android Build Validation](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/android-build.yml/badge.svg)](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/android-build.yml)
[![iOS Build Validation](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/ios-build.yml/badge.svg)](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/ios-build.yml)
[![Android Release](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/release-android.yml/badge.svg)](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/release-android.yml)

**A private vault for your phone's health signals.**  
**Nothing leaves the device.**

Zentra passively collects the behavioral and health signals your phone already generates, normalizes them into a single local schema, shows them back through a calm dashboard, and lets you export the raw data when you want it.

The current codebase is an Expo / React Native app with native platform modules under `modules/zentra-native-signals`. It is local-first, account-free, and built around auditable privacy constraints.

## What Zentra is

Zentra is a local-first mobile app for reviewing personal device and health signals such as:

- Steps and movement context
- Sleep and rest signals
- Screen time / app usage summaries
- Device state signals
- Health Connect / HealthKit imports where supported
- Optional location-derived mobility patterns

It stores data on-device, presents it in Today and Trends views, and supports export from the app.

## What Zentra does not do

- No cloud sync
- No account system
- No analytics or telemetry SDKs
- No ads
- No social feed, coaching, streaks, or engagement loops
- No medical diagnosis or treatment claims

## Privacy model

The repository is structured so privacy claims can be audited:

- Android blocks `android.permission.INTERNET` in `app.json`
- AndroidManifest removes `INTERNET` from the final manifest
- The repository includes a no-network check script
- Export is explicit and user-triggered
- The in-app wipe action clears local repository data and persisted local preferences

See `docs/privacy.md` for what is enforced today versus what is planned later.

## Current release scope

This repository is being prepared for its first public open-source release.

What is true today:

- Source is intended for public release under GPL-3.0
- Android and iOS package identifiers remain `com.modastera.zentra`
- The app runs as an Expo / React Native project with native modules
- The project has local-only architecture goals and no intentional network path

What is not claimed yet:

- Reproducible builds
- F-Droid publication
- App Store release availability
- Public binary verification workflow

## Platform support

The current codebase does not claim full collector parity across Android and iOS. This is the public support surface the repository can honestly describe today.

| Capability | Android | iOS | Notes |
| --- | --- | --- | --- |
| Today and Trends views | Yes | Yes | Shared Expo / React Native UI |
| Local export | Yes | Yes | User-triggered export only |
| Live step / motion signals | Yes | Partial | Depends on platform sensor availability |
| Device state signals | Yes | Yes | Battery and local device-state surfaces |
| Location-derived mobility | Yes | Yes | Optional and permission-gated |
| Health records import | Health Connect | Apple Health / HealthKit | Platform-native health integration |
| App usage / screen time collector | Yes | No public support claimed | Android-specific surface in current repo |
| Ambient light collector | Yes | No public support claimed | Android-specific hardware path |
| Motion context / activity recognition | Yes | No public support claimed | Android-first implementation |
| Sleep inference | Yes | Yes | Presented as inferred data |

## Project structure

```text
zentra/
├── app/                          Expo Router screens and layouts
├── assets/                       Branding and static assets
├── components/                   Reusable UI and Zentra-specific views
├── constants/                    Theme, branding, iconography
├── hooks/                        App hooks and bootstrap flows
├── modules/zentra-native-signals/ Native signal collection module
├── stores/                       Zustand stores
├── types/                        Shared TypeScript types
├── utils/                        Repository, collectors, transforms, exports
├── android/                      Android native project
├── ios/                          iOS native project
├── scripts/                      Local guardrails and development scripts
└── docs/                         Public project documentation
```

## Build from source

Requirements:

- Node.js 18+
- npm
- Xcode for iOS development
- Android Studio / Android SDK for Android development

Install dependencies:

```bash
npm install
```

Run development builds:

```bash
npm run android
npm run ios
```

Checks:

```bash
npm run lint
npm run typecheck
npm run check:no-network
```

For signed Android APK releases and GitHub Releases publishing, see `docs/android-release.md`.

## Contributing

Contributions are welcome, but the repo has hard privacy constraints. Read `CONTRIBUTING.md` before opening a pull request.

Every commit must be signed off with the DCO:

```bash
git commit -s -m "fix: describe change"
```

## Governance

Zentra is maintained by ModAstera. Public documentation is intentionally neutral in tone, but project stewardship and release decisions remain maintainer-led. See `ROADMAP.md` and `SECURITY.md` for operational details.

## License

Zentra is licensed under **GPL-3.0**. See `LICENSE` and `docs/license-decision.md`.

Versioning and release policy are documented in `docs/versioning.md` and `CHANGELOG.md`.
