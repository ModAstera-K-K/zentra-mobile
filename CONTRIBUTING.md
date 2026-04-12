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

Checks:

```bash
npm run lint
npm run typecheck
npm run check:no-network
```

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

By signing off, you certify the Developer Certificate of Origin 1.1 and contribute the code under GPL-3.0. You also grant ModAstera the right to redistribute contributions under additional terms where necessary for platform distribution, including the App Store.

## Security issues

Do not file security issues publicly. See SECURITY.md.
