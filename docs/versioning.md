# Versioning Policy

Zentra uses semantic versioning for public releases.

## Format

`MAJOR.MINOR.PATCH`

Examples:

- `1.0.0`
- `1.1.0`
- `1.1.1`

## Meaning

- `MAJOR`: breaking changes to public behavior, exported data expectations, or compatibility guarantees
- `MINOR`: backward-compatible feature additions and meaningful UX or collector improvements
- `PATCH`: backward-compatible bug fixes, documentation fixes, or release-process fixes

## Release tagging

Git tags must use a `v` prefix:

- `v1.0.0`
- `v1.1.0`
- `v1.1.1`

The Android release workflow publishes APK assets from tags matching `v*`.

## Version fields to update together

For every public release, keep these in sync:

- `package.json` version
- `app.json` Expo version
- `android/app/build.gradle` `versionName`
- `android/app/build.gradle` `versionCode`

`versionCode` must increase for every Android release, even when the human-readable version is only a patch change.

## Changelog policy

Every tagged public release must have:

- An entry in `CHANGELOG.md`
- GitHub release notes
- A short note if any privacy, permissions, or collector-support behavior changed
