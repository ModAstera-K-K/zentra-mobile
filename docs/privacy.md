# Privacy

Zentra is designed to run locally on the device.

## What is enforced today

- Android blocks `android.permission.INTERNET` in app.json.
- AndroidManifest removes `INTERNET` at the manifest level.
- The repository includes a `check:no-network` script.
- The app does not include analytics or crash-reporting SDKs.
- Data export is explicit and user-triggered.

## What is true today

- No account system
- No cloud sync
- No telemetry or analytics SDKs in the current dependency graph
- No background upload path in the app architecture

## What is not claimed yet

These are not claimed until implemented and verified in CI:

- Reproducible builds
- F-Droid publication
- Public CI-backed proof for every privacy assertion
- App Store distribution guarantees

## Platform notes

- Android uses Health Connect and optional location access for specific collectors.
- iOS development builds may include platform capabilities needed for local development. Public documentation should distinguish development settings from release behavior.
