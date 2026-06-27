<div align="center">

# Zentra

**A private vault for your phone's health signals.**
**Nothing leaves the device.**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![CI](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/ci.yml/badge.svg)](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/ci.yml)
[![Android Build](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/android-build.yml/badge.svg)](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/android-build.yml)
[![iOS Build](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/ios-build.yml/badge.svg)](https://github.com/ModAstera-K-K/zentra-mobile/actions/workflows/ios-build.yml)

</div>

---

Zentra passively collects the behavioral and health signals your phone already generates, normalizes them into a single local schema, shows them back through a calm dashboard, and lets you export the raw data when you want it.

It runs **entirely on-device**. There are no servers, no accounts, no cloud sync, no telemetry, no analytics. The app is open source specifically so you don't have to take that on faith.

## What Zentra is

Zentra is a local-first mobile app for reviewing personal device and health signals:

- Steps and movement context
- Sleep and rest signals
- Screen time and app usage summaries
- Device state signals
- Health Connect (Android) and HealthKit (iOS) imports
- Optional location-derived mobility patterns

It stores data on-device, presents it in Today and Trends views, and supports export from the app.

## What Zentra does not do

- No cloud sync
- No account system
- No analytics or telemetry SDKs
- No ads — not now, not ever
- No social feed, coaching, streaks, or engagement loops
- No medical diagnosis or treatment claims

## Privacy model

The repository is structured so privacy claims can be audited:

- Android blocks `android.permission.INTERNET` in `app.json` and removes it from the final `AndroidManifest.xml`
- CI enforces a no-network check (`npm run check:no-network`) — the build fails if any network path is introduced
- No analytics, crash reporters, or telemetry SDKs in the dependency graph
- Export is explicit and user-triggered only
- The in-app wipe clears all local data and persisted preferences

See [`docs/privacy.md`](docs/privacy.md) for the full breakdown of what is enforced today and what is planned.

## Install

### Android

| Channel | For | Signing |
|---|---|---|
| **[GitHub Releases](https://github.com/ModAstera-K-K/zentra-mobile/releases/latest)** | Most users | ModAstera key |
| **F-Droid** | Maximum trust (coming soon) | F-Droid key (built from source on F-Droid infra) |
| **Google Play** | Convenience (coming soon) | ModAstera key |

Because F-Droid and Google Play use different signing keys, they install as separate apps and cannot upgrade each other. Pick one and stick with it.

**Minimum Android version:** 10 (API 29).

### iOS

| Channel | For |
|---|---|
| **App Store** | Most users (coming soon) |
| **TestFlight** | Beta testers (coming soon) |
| **Build from source** | Developers with Xcode |

**Minimum iOS version:** 15.1.

## Platform support

| Capability | Android | iOS | Notes |
| --- | --- | --- | --- |
| Today and Trends views | Yes | Yes | Shared Expo / React Native UI |
| Local export | Yes | Yes | User-triggered only |
| Live step / motion signals | Yes | Yes | Depends on platform sensor availability |
| Device state signals | Yes | Yes | Battery and local device-state surfaces |
| Location-derived mobility | Yes | Yes | Optional, permission-gated |
| Health records import | Health Connect | HealthKit | Platform-native health integration |
| App usage / screen time | Yes | No | Android-specific surface |
| Ambient light | Yes | No | Android-specific hardware path |
| Motion context / activity recognition | Yes | Yes | Activity Recognition on Android, Core Motion on iOS |
| Sleep inference | Yes | Yes | Labeled as inferred, with confidence scores |

## Project structure

```text
zentra/
├── app/                           Expo Router screens and layouts
├── assets/                        Branding and static assets
├── components/                    Reusable UI and Zentra-specific views
├── constants/                     Theme, branding, iconography
├── hooks/                         App hooks and bootstrap flows
├── modules/zentra-native-signals/ Native signal collection module
├── stores/                        Zustand stores
├── types/                         Shared TypeScript types
├── utils/                         Repository, collectors, transforms, exports
├── android/                       Android native project
├── ios/                           iOS native project
├── scripts/                       Local guardrails and development scripts
└── docs/                          Public project documentation
```

## Build from source

### Requirements

- Node.js 18+
- npm
- Xcode (iOS development)
- Android Studio / Android SDK (Android development)

```bash
git clone https://github.com/ModAstera-K-K/zentra-mobile.git
cd zentra
npm install
```

### Run development builds

```bash
npm run android
npm run ios
```

### Run device builds

```bash
npm run build-android-dev-device
npm run build-android-release-device
npm run build-ios-release-device
```

Android release-device builds require the release signing environment variables from `docs/android-release.md`. iOS release-device builds require a connected device with Xcode signing already configured for your Apple account.

### Run checks

```bash
npm run lint
npm run typecheck
npm run check:no-network   # CI-enforced: fails if any network path is detected
```

There is currently no automated `npm test` script in this repository.

For signed Android APK releases and GitHub Releases publishing, see [`docs/android-release.md`](docs/android-release.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request — it covers the development setup, coding standards, the DCO sign-off requirement, and the hard architectural rules that no PR may violate.

For bug reports and feature requests, use [GitHub Issues](https://github.com/ModAstera-K-K/zentra-mobile/issues). For security issues, see [SECURITY.md](SECURITY.md) — do not report security issues through public issues.

## Community

Join the [CareTech Catalyst community](https://discord.gg/uTxB4rRE) to connect with healthcare and healthtech innovators, share feedback, and help shape suggestions for the app's roadmap.

## Governance

Zentra is maintained by **[ModAstera Inc.](https://modastera.com)**, a medical AI company based in Tokyo. ModAstera holds copyright and makes final decisions on roadmap, releases, and merged contributions.

Community contributions go through pull requests reviewed by maintainers. The project roadmap is in [ROADMAP.md](ROADMAP.md).

## License

Zentra is licensed under the **GNU General Public License v3.0**. See [LICENSE](LICENSE) for the full text and [`docs/license-decision.md`](docs/license-decision.md) for the reasoning.

In short: you can use, modify, and redistribute Zentra freely, but any distributed modifications must also be released under GPL-3.0. This prevents anyone from forking Zentra, adding telemetry or a data-exfiltration sync feature, and shipping it under a different name without publishing that code.

ModAstera retains copyright and reserves the right to distribute Zentra under additional terms where necessary — specifically for App Store distribution, whose terms conflict with strict GPL-3.0 in some interpretations. Contributors grant ModAstera the right to redistribute their contributions under those additional terms via the DCO sign-off described in [CONTRIBUTING.md](CONTRIBUTING.md).

## Acknowledgments

Zentra is built on and grateful for:

- [Health Connect](https://developer.android.com/health-and-fitness/guides/health-connect) and [HealthKit](https://developer.apple.com/documentation/healthkit)
- [Expo](https://expo.dev), [React Native](https://reactnative.dev), [Jetpack Compose](https://developer.android.com/jetpack/compose), and [SwiftUI](https://developer.apple.com/xcode/swiftui/)
- Every privacy-focused open source project that proved this approach could work

---

<div align="center">

**Zentra is a [ModAstera](https://modastera.com) project.**

</div>
