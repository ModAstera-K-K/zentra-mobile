# Existing phone data and responsive navigation

Implementation date: 2026-09-27. Local changes; not installed or deployed.

## Behavior

- SQLite schema v2 records committed event revisions, affected local dates and signal types. Inserts, corrections and deletions invalidate derived data, including changes that preserve event count and final ID. Range screens check their own revisions before loading again.
- Today normalization runs outside render. Derived daily maxima and metric observations are cached. Timeline calculations yield around an 8 ms budget and cancel obsolete screen work. Cached screen content stays available during refresh; raw Export reuses one range read and unified calculations run only when selected.
- Health Connect uses bounded record pages and per-type change tokens. HealthKit uses anchored queries. Each page, source corrections/deletions, derived aggregates and cursor checkpoint commit together. A pass reads at most four pages per type; foreground continuation resumes pending types. Initial history requests 30 local dates including today; deeper history requests up to 90, subject to OS permission/support.
- Per-type Android permissions are independent. iOS read access stays unknown: a successful empty query does not prove a grant. Query failures remain distinct from empty results.
- Expired/corrupt cursors resnapshot. Originals absent from a completed resnapshot are retained with `stale_import` metadata and excluded from current metrics; absence alone cannot prove deletion. Explicit native deletion IDs remove only matching health records. Wipe clears cursors, resnapshot bookkeeping and derived caches, and invalidates late work.
- Platform step statistics take priority over raw overlapping providers. Phone deltas are a labeled fallback. Legacy unresolved health samples retain one origin and are labeled estimates. Raw exports retain source samples and omit synthetic statistics/query-coverage rows. Unified output uses resolved totals.
- Sleep uses one origin, unions asleep intervals, excludes explicit awake stages, and attributes adjacent stages to the final wake date. Stages from one origin separated by at most 90 minutes are grouped for nightly display; this is a presentation heuristic. Android sessions without stages are estimates and cannot qualify for measured comparisons. Workouts preserve recorded duration and avoid summing overlapping copies from different origins.
- Comparisons cover the latest seven completed local days and preceding seven, matched by weekday. At least five eligible pairs from one consistent source are required. Zero baselines have absolute changes only. Missing chart intervals are gaps. Composite scores remain secondary estimates with their existing formula; empty buckets do not imply rest.
- Today shows up to three eligible findings and Trends up to four. Details show means, periods, coverage, freshness, contributing days and up to 50 supporting records. Source controls show per-type progress, readable record dates, errors, retry and optional deeper history.

## Local switches

`EXPO_PUBLIC_PERSONAL_INSIGHTS=0` hides insights. `EXPO_PUBLIC_EXTENDED_HISTORY=0` hides deeper-history controls. Neither switch disables correctness fixes. No remote configuration or telemetry was added.

`EXPO_PUBLIC_LOCAL_PERF=1` enables local console samples:

- `navigation.press_to_frame`: JS tab-press callback to focused-screen animation frame. A scheduling proxy, not physical touch-to-present proof.
- Existing screen `focus_to_ready` and range-load timers.
- `repository.range_query` and `repository.range_decode`.
- `compute.over_budget_step` and `navigation.frame_gap.<screen>`.

Native frame tracing is still needed to distinguish rendering stalls from JavaScript scheduling gaps. Logs contain timings/counts and screen identifiers, not imported health values.

## Verification evidence

- Regression harness: `npm test` (Node 22.15+, no new test dependency), 21 tests passing. Covers matching eligibility, zero/missing, source overlap, source changes, sleep unions/night boundaries, DST, sensor deltas, pagination, interrupted checkpoints, cursor reset, cancellation, raw-export filtering, SQL migration/revisions/rollback, and stale-record resnapshot reconciliation.
- Dense synthetic calculation: 45,000 events across 90 days yielded repeatedly to event-loop work. Desktop timings are not installed-device acceptance results.
- TypeScript, Expo lint and no-network guard passed.
- Android native health module compiled in debug and release with JDK 17 and the installed Android SDK. Android JavaScript/Hermes export also passed. This does not establish a signed app release or installation.
- HealthKit controller and anchored/statistics reader passed Swift typechecking against the iOS simulator SDK.
- Full iOS release simulator build attempted: installed CoreSimulator is older than the active Xcode build, existing Pods have unsupported deployment targets, and generated React Native inputs were initially absent. Codegen was regenerated and a command-line deployment-target override tried. `pod install --deployment --no-repo-update` then rejected pre-existing lockfile/spec differences. The tracked dependency lockfiles were not changed to bypass that mismatch. Full iOS integration remains unverified.
- Local browser preview rendered Today/Trends insufficient-history states and Settings per-type controls. This is limited layout evidence, not Android/iOS touch, accessibility, populated insight or performance validation.

## Remaining release checks

Use fresh native release builds, with local timing enabled, on physical Android and iOS devices. Do not mark these complete from desktop tests:

1. Capture a baseline from the prior revision and compare empty, 30-day, 90-day and dense histories; record device/OS/build and at least 30 warm switches per direction.
2. Exercise Today → Trends → Export while importing, writing records, changing ranges and preparing exports. Target warm first content p95 ≤200 ms and first-visit shell p95 ≤500 ms. Confirm no application-owned JS calculation exceeds 50 ms; the 8 ms cooperative budget is a target, not a preemptive guarantee for every operation.
3. Exercise actual platform partial permissions, page interruption/relaunch, source corrections/deletions, expired-token recovery and 90-day access. Verify mixed phone/watch/source-app totals against platform statistics.
4. Verify populated evidence sheets, large text, screen readers, light/dark themes, native sharing, wipe during imports, midnight/timezone changes and background/resume behavior. Background runs remain best-effort.
5. Resolve the existing iOS build-environment/Pods mismatch and run a complete unsigned or correctly signed native build before distribution.

Strategy remains: reliable existing health history first, retain optional phone signals with coverage labels, deterministic personal comparisons next. Relationship analysis and AI narratives remain deferred.


## Monthly pattern loading follow-up

The activity pattern remains first on Today. Cached yearly normalization now batches its revision/cache checks into two database reads instead of 730 (date-bounds lookup excluded from both). The regression fixture verifies identical revisions and payloads; one desktop SQLite run measured 8.3 ms versus 2.7 ms, not device latency. Corrections, deletions, overnight neighbors and timezone cache keys still invalidate affected partitions.

Loading history no longer restarts live normalization or triggers a second history fetch simply because the first fetch finished. Normalization waits for navigation interactions, cached cells stay visible, unchanged history does not flash a refresh spinner, and initial readiness waits for actual calendar cells. Existing cancellation and chunked calculations remain in place. Physical-device acceptance remains pending.

## Harmonized Active Minutes (026)

The shared resolver replaces day-wide source fallbacks with time-interval evidence.
Today exposes `min · Partial`; Trends retain gaps; detail contributions are minutes,
not transition counts. The optional walking-equivalent range is based on personal
history and must never be added to supported minutes. `EXPO_PUBLIC_WALKING_EQUIVALENT=0`
disables that secondary estimate; correctness fixes remain enabled.

SQLite version 3 adds nullable `daily_aggregates.active_summary`. Existing retained
records rebuild on demand; raw rows and existing export columns remain. Aggregate
CSV adds `active_minutes_quality` and `active_minutes_calculation_version`.
For compatibility, `active_minutes=0` may represent missing timing; consumers must
read the quality field. Internal missing values are null and chart as gaps.

Android/iOS expose separate minute-statistics queries. Raw coarse records cannot
validate minute timing. Profiles live in derived_cache and never enter raw exports
or step totals. Workout pauses are retained when available; otherwise recorded
active duration is distributed proportionally for overlap accounting and labeled
estimated. Existing imported workouts may require a source update/reimport to gain
new pause metadata; original records are not silently rewritten.

The new tests cover the 15,106-step sparse-timing case, recovered fine health timing,
phone/watch duplicates, first deltas and resets, still/vehicle/idle exclusions,
duplicate starts, workout pauses and fractional overlaps, midnight/DST, missing
and stale data, personal calibration thresholds, cancellation and yielding, and
version-3 migration/revision invalidation. ADB reported no attached device, so the
actual reported day and installed-device latency remain unverified.

Validation completed for 026:

- `npm test`: 35 passing tests, including 14 activity/migration/cache regressions.
- `npm run typecheck`, `npm run lint`, `npm run check:no-network`, and
  `git diff --check`: pass.
- Android `:zentra-native-signals:compileReleaseKotlin`: pass.
- Android `NODE_ENV=production ./gradlew :app:assembleRelease`: pass with final
  sources. APK: `android/app/build/outputs/apk/release/app-release.apk`.
  This checkout uses its existing local-test signing configuration.
- iOS HealthKit controller, sync reader, and workout-interval helper: Swift
  simulator typecheck passes. Full iOS app integration/build remains unverified;
  the earlier CocoaPods/codegen/toolchain limitations have not been repaired here.
- Impeccable layout scan on the affected cards and tab screens: no findings.
  This is source-level checking, not native visual or font-scaling verification.
- No Android device attached (`adb devices`): no installation, actual-day source
  reconciliation, native screenshots, or release p95 navigation measurements.

## Tiles + rows interface

The approved interface uses six primary metric tiles with persistent “View details”
actions and full-width Signal summary disclosure rows with inset separators. The
shared typography, palette, soft groups and detail-sheet treatment apply across
Today, Trends, Export and Settings. Monthly activity pattern, findings, sleep,
background diagnostics, recent signals, source controls and signal health remain.
Optional summary metrics retain their existing availability conditions.

Daily Rhythm separates Movement, Screen and inferred Rest into traces with the same
0–100 scale and shared hour inspection. Existing scores are unchanged; missing
buckets are gaps and isolated observations stay visible. Tiles use flexible heights
and switch to one column below 360 points or at font scales of 1.5 and above.

Lazy tabs, virtualization, cached content and deferred calculations remain. The
continuous status animation and introductory fade were removed so content appears
immediately and interaction handles cannot indefinitely delay deferred calculations.
System fonts replace the old font aliases; only the remaining two local mono faces
are bundled. No new data queries, dependencies or network services were introduced.

Validation: 39 regression tests, typecheck, lint, no-network checks, and Android/iOS
Hermes exports passed. React Native web checks at 390 × 844 and 320 × 720 covered
light/dark layouts, the six live tiles, summary rows, detail actions, keyboard
activation, shared rhythm selection and tab navigation. The compact layout had no
horizontal overflow. Browser sensor support is limited and required temporary
SQLite preview configuration; these checks are not native-device validation.
Installed release performance, native screen readers, physical-device gestures and
OS font scaling still need the release checks above. CI now runs the regression
suite with Node 22.
