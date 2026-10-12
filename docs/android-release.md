# Android Release Guide

This document describes how to produce a signed Android APK and publish it to GitHub Releases.

## What this covers

- Local signed release builds
- GitHub Actions APK publishing
- Required signing secrets
- Release checklist for each tag

## Local signed release build

Create or obtain a release keystore, then provide these environment variables. Use an absolute keystore path:

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

With `-Pzentra.requireReleaseSigning=true` the build fails unless all four variables are set and the keystore file exists. Without the flag a release build is signed with the debug key, which is what local phone installs use and must never be published.

Check which key signed an APK:

```bash
node ./scripts/verify-android-release-signature.mjs android/app/build/outputs/apk/release/app-release.apk
```

It prints the signer certificate's SHA-256 digest and exits with an error if the APK is signed with the debug key. When the signing variables are set, it also fails unless the APK is signed with that keystore.

## GitHub Actions release build

The repository release workflow is:

- `.github/workflows/release-android.yml`

It runs on tags matching `v*`. It runs lint, typecheck and the regression tests, builds with `-Pzentra.requireReleaseSigning=true`, and then runs the signature check above. Nothing is published unless the APK is signed with the release keystore. The signer digest appears in the job summary and at the top of the release notes.

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
- Run `npm test`
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

## Updating a phone that has a differently signed build

Android refuses to install an update that is signed with a different key from the installed app. A phone with a debug-signed build cannot be updated in place to a release-signed one. Builds made before the signing flag was read by Gradle were signed with the debug key whatever the flag said.

Uninstalling removes the app's on-device data, and Zentra keeps its data only on the phone. Export from the Export tab first, then uninstall and install the new build.

## Release notes guidance

Each GitHub release should state:

- What changed in the app
- Whether any collector support changed by platform
- Any privacy-relevant changes
- Known limitations
- That the APK was built from the tagged commit

## What this does not claim

This workflow does not yet prove reproducible builds, F-Droid publication, or App Store parity. Those remain follow-up milestones.
