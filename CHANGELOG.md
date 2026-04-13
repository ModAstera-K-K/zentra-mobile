# Changelog

All notable changes to Zentra are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

[Unreleased]: https://github.com/modastera/zentra/compare/v1.0.0...HEAD

## [1.0.0] - 2026-04-13

First public open-source release.

### Added

- Today and Trends views for passive device and health signals
- Local export to CSV and JSON (user-triggered only)
- Health Connect (Android) and HealthKit (iOS) integration
- Sleep inference from device state, labeled as inferred with confidence scores
- Optional location-derived mobility patterns (permission-gated)
- Android-specific collectors: app usage / screen time, ambient light, motion context / activity recognition
- Native signal collection module (`modules/zentra-native-signals`) for Android and iOS
- In-app wipe: Settings → Delete all data clears all local data and preferences
- Public open-source governance documents (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, LICENSE)
- Privacy guardrails with CI-enforced no-network check (`npm run check:no-network`)
- Android GitHub Releases workflow and signed APK publishing
- GPL-3.0 license with documented reasoning in `docs/license-decision.md`

### Changed

- Android release builds support real signing configuration via environment variables
- Privacy posture fully documented and auditable in `docs/privacy.md`

### Removed

- Outbound connectivity probing from the collector surface

[1.0.0]: https://github.com/modastera/zentra/releases/tag/v1.0.0
