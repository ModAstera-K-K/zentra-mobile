# Contributing to Zentra

Thanks for your interest in Zentra. This project is a privacy-first, local-first mobile app built with Expo, React Native, and native platform modules.

## Before you start

Read these first:

- README.md
- ROADMAP.md
- docs/privacy.md
- docs/license-decision.md

If you are planning a non-trivial change, open an issue first so scope can be confirmed before you invest time.

## Hard rules

These are non-negotiable:

- No network access.
- No analytics, telemetry, crash reporting, or tracking SDKs.
- No data leaves the device except explicit user-triggered export.
- Inferred data must be labeled as inferred.
- Schema changes must be backward-compatible and documented.
- Permissions must be requested just in time.

## Development setup

Requirements:

- Node.js 18+
- npm
- Xcode for iOS work
- Android Studio / SDK for Android work

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run android
npm run ios
```

Run device-targeted builds:

```bash
npm run build-android-dev-device
npm run build-android-release-device
npm run build-ios-release-device
```

`build-android-release-device` expects the signing environment variables documented in `docs/android-release.md`. `build-ios-release-device` expects Xcode signing for a connected physical device to already be configured on your machine.

Checks:

```bash
npm run lint
npm run typecheck
npm run check:no-network
```

## Running tests

There is currently no automated `npm test` script in this repository. Before opening a pull request, run:

```bash
npm run lint
npm run typecheck
npm run check:no-network
```

## Good first issues

Issues labelled [`good first issue`](https://github.com/modastera/zentra/labels/good%20first%20issue) are a good starting point if you're new to the codebase.

## Pull requests

- Open PRs against `main`
- Keep changes focused
- Add or update tests where behavior changes
- Update docs when public behavior or contributor workflow changes
- Follow Conventional Commits where practical

## DCO sign-off

Every commit must be signed off:

```bash
git commit -s -m "fix: describe change"
```

By signing off, you certify the [Developer Certificate of Origin 1.1](https://developercertificate.org) and contribute the code under GPL-3.0. You also grant ModAstera the right to redistribute contributions under additional terms where necessary for platform distribution, including the App Store.

## Security issues

Do not file security issues publicly. See SECURITY.md.
