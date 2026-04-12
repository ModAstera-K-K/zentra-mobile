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

## What stays on-device

- Collected event history is stored in a local SQLite database with `events`, `daily_aggregates`, and `collector_diagnostics` tables.
- Local app state such as collector toggles, export timestamp, data mode, onboarding state, and location retention preference is stored in AsyncStorage.
- Current signal snapshots such as recent location samples and latest step or battery state are stored locally in AsyncStorage.
- Theme preference is stored locally in AsyncStorage when the user selects a non-system theme.

## Export behavior verified against the current code

- Export is always explicit and user-triggered from the Export screen.
- Bundles are written to the app cache directory first and are only shared when the platform share sheet is available and the user chooses to share them.
- Raw export bundles always include `manifest.json`, include `daily_aggregates.csv` when aggregate rows exist, and then include either `events.json` or per-signal `events_<type>.csv` files.
- Unified export bundles always include `manifest.json`, include `daily_aggregates.csv` when aggregate rows exist, and then include either `timeline.json` or `timeline.csv`.
- The current manifest records schema version, app version, date range, included data types, collector event counts, and bundle-level file metadata.

## Delete-all-data behavior verified against the current code

- The in-app wipe action clears the local SQLite repository tables used for events, aggregates, and collector diagnostics.
- It also resets locally persisted app state, including onboarding state, collector toggles, data mode, export history, location retention preference, cached signal snapshots, and theme preference.
- It does not revoke OS-level permissions already granted in Android or iOS settings. Those remain under system control.

## What is not claimed yet

These are not claimed until implemented and verified in CI:

- Reproducible builds
- F-Droid publication
- Public CI-backed proof for every privacy assertion
- App Store distribution guarantees

## Platform notes

- Android uses Health Connect and optional location access for specific collectors.
- iOS development builds may include platform capabilities needed for local development. Public documentation should distinguish development settings from release behavior.

## Development builds vs public release builds

Public privacy claims are about the shipped release artifacts and the tagged commits that produce them.

- Development builds may use Expo tooling, Metro, simulators, local USB reverse proxies, and other local development conveniences.
- Public Android release builds are expected to pass the CI privacy guardrail and be built from a tagged commit.
- The GitHub release workflow signs the Android APK with a maintainer-provided release keystore instead of the debug keystore.
- Claims about public downloads should be tied to the release workflow, the manifest configuration, and the no-network checks in CI.

This distinction matters because developer tooling can involve local machine-to-device communication, while the public privacy promise is about the shipped application artifact and its runtime permissions and dependencies.
