# Android Release Guide

This document describes how to produce a signed Android APK and publish it to GitHub Releases.

## What this covers

- Local signed release builds
- GitHub Actions APK publishing
- Required signing secrets
- Release checklist for each tag

## Local signed release build

Create or obtain a release keystore, then provide these environment variables:

```bash
export ANDROID_KEYSTORE_PATH="$PWD/android/app/zentra-release.keystore"
export ANDROID_KEYSTORE_PASSWORD="<keystore-password>"
export ANDROID_KEY_ALIAS="<key-alias>"
export ANDROID_KEY_PASSWORD="<key-password>"
```

Build the APK:

```bash
./android/gradlew -p android assembleRelease -Pzentra.requireReleaseSigning=true
```

Output:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## GitHub Actions release build

The repository release workflow is:

- `.github/workflows/release-android.yml`

It runs on tags matching `v*`.

Required GitHub repository secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Create the base64 keystore payload locally:

```bash
base64 < android/app/zentra-release.keystore | tr -d '\n'
```

Paste the resulting string into `ANDROID_KEYSTORE_BASE64`.

## Release checklist

Before tagging a release:

- Run `npm run lint`
- Run `npm run typecheck`
- Run `npm run check:no-network`
- Confirm `package.json`, `app.json`, and Android version fields match the intended release version
- Confirm release signing secrets are configured in GitHub
- Confirm the README and privacy docs still match reality
- Confirm no debug or local-only artifacts are tracked

Create a release tag:

```bash
git checkout main
git pull
git tag v1.0.0
git push origin v1.0.0
```

Workflow outputs:

- `zentra-v1.0.0.apk`
- `zentra-v1.0.0.apk.sha256`

## Release notes guidance

Each GitHub release should state:

- What changed in the app
- Whether any collector support changed by platform
- Any privacy-relevant changes
- Known limitations
- That the APK was built from the tagged commit

## What this does not claim

This workflow does not yet prove reproducible builds, F-Droid publication, or App Store parity. Those remain follow-up milestones.
