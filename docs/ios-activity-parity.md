# iOS activity recovery on the shared insights foundation

Implementation and local validation: 2026-09-28. PR #10 follows PR #11; neither
device correctness nor release responsiveness is established by desktop checks.

## Behavior

Core Motion live updates and recovered history use one activity-stream identity.
Delivery remains provenance, so an entry received live can pair with an exit
recovered later. Equivalent transitions, including legacy ISO timestamps with or
without fractional seconds, contribute only once. Original raw identity and source
are retained, with optional platform, stream, delivery and boundary metadata.

Unknown and conflicting classifications terminate supported activity. Vehicle,
stationary and unsupported periods do not extend walking. Duplicate starts retain
the first start, real exits across midnight close the preceding day's interval,
and an unfinished start never extends automatically to the current time. Daily
boundaries use local calendar arithmetic, including DST. Shared source resolution,
HealthKit synchronization, step totals, workout overlap handling, personal
calibration and export columns from PR #11 are preserved.

History recovery reads Today first and then older local days within Core Motion's
rolling seven-day availability limit. It runs one native day query at a time and
returns at most 250 transitions per page. The opaque cursor resumes after the last
transition; the native reader retains one query snapshot between pages. A query
failure rejects separately from a successful empty window. Expired requests are
clamped and expose unavailable history. Missing evidence remains partial.

This is historical recovery, not an iOS durable queue. Existing Today and Settings
source-status rows show queried coverage, freshness, pending windows, permission
and errors. Android's existing buffered-event cursor/acknowledgement protocol is
unchanged. No permissions, collectors, services or feature flags were added.

## Durability and loading

SQLite migration 4 adds `activity_history_state` and `activity_history_records`.
Each page commits its records, snapshot bookkeeping and checkpoint in one
transaction, including successful empty windows. Interrupted transactions cannot
advance the cursor. A completed nonempty OS snapshot can mark superseded Core
Motion classifications `stale_import`, preserving the raw rows for inspection.
Empty, failed and incomplete snapshots do not retire retained evidence.

Active Minutes calculation version 3 pairs streams independently of delivery.
Old version-2 summary caches are discarded and aggregate summaries rebuild from
retained records. Revision checks include adjacent days and dependent calibration.
Timing-profile caches remain at version 2 because their calculation did not change.
Raw records and existing numeric export fields remain compatible; optional quality
and calculation-version metadata continue to describe missing/partial values.

Collector startup, resume and background opportunities join one guarded recovery
job. A pass has page/time limits and resumes pending windows later. Disabling the
collector or wiping data invalidates late work; wipe also cancels the native reader
and clears checkpoint/snapshot state. Other collectors can start while iOS history
loads. Native reads stay off the JavaScript thread; activity preparation uses
bounded sorts and cooperative calculation with an 8 ms target. Tabs do not await
history queries. Cached screen content, monthly pattern, Daily Rhythm and the
approved Tiles + rows interface remain in place.

## Verification

Run the shared regression suite on Node 22.15+ and the native helper suite on macOS:

```sh
npm test
npm run test:ios-activity
npm run typecheck
npm run lint
npm run check:no-network
```

Local results on 2026-09-28:

- 52 JavaScript/SQLite tests pass. The 13 new history regressions cover mixed
  delivery, legacy identity, unknown boundaries, midnight/DST, empty/paged/expired
  queries, permission failures, interrupted commits, snapshot corrections, source
  resolution, revision/calibration invalidation, cancellation and cooperative work.
- Swift helper tests pass, including 999 transitions crossing page boundaries,
  ambiguous flags, confidence changes, unknown gaps, expiry and boundary context.
  The iOS CI workflow now runs these tests before its native app build.
- Typecheck, lint, no-network and whitespace checks pass.
- The Core Motion adapter, live controller and history reader pass Swift
  typechecking against the installed iOS simulator SDK.
- Android and iOS production JavaScript/Hermes exports pass.
- A desktop synthetic check of 3,000 and 30,000 activity transitions yielded
  repeatedly; the longest generator step across three runs per size was 1.72 ms
  and 9.61 ms respectively. This is calculation evidence, not device navigation
  latency or proof of the release targets.
- Android `:app:assembleDebug` passes with JDK 17 and the installed Android SDK.
  This is build evidence, not a signed release installation or profiling result.
- Full iOS app integration is locally blocked: `pod install --deployment
  --no-repo-update` rejects pre-existing lockfile/spec differences. The installed
  Xcode requires CoreSimulator 1171.7.0 while this host has 1051.55.0, and existing
  Pods target iOS 12.4/13.4 below this SDK's supported minimum. `xcodebuild` exits
  65. Dependency lockfiles were not changed to bypass these environment issues.

## Required device checks

No Android device was attached; iOS enumeration is blocked by the local toolchain.
Keep PR #10 a draft pending required native/device validation. On a compatible
Xcode host, build the combined branch and exercise:

1. Motion permission denial/regrant, foreground live activity, background/resume
   recovery, query failures, interrupted page/relaunch, and seven-day expiry.
2. Walking followed by unknown motion, a live start with a recovered exit,
   phone/watch/HealthKit overlap, midnight/timezone/DST, and source corrections.
   Confirm contributions equal the headline and exports use the same summary.
3. Disable/re-enable and wipe during an in-flight query. Confirm neither late
   callbacks nor persisted checkpoints restore wiped records.
4. Rapid Today → Trends → Export switches during imports and calculations, using
   empty, 30-day, 90-day and dense histories. Record release device/OS/build and
   at least 30 warm switches per direction. Targets: warm content p95 ≤200 ms,
   first shell p95 ≤500 ms, and no application calculation blocking JS >50 ms.
   An 8 ms cooperative target is not a preemptive guarantee.
5. Native status-row layout with large fonts, VoiceOver/TalkBack and both themes.

See [the shared validation record](phone-data-validation.md) for outstanding
health import, mixed-source and release checks inherited from PR #11.
