# Overnight rest inference

Implemented locally on 2026-09-30 for the shared Android and iOS application.

## User-visible behavior

Today distinguishes imported sleep, estimated rest, and a user-adjusted rest window.
Estimated duration counts only supported rest intervals. Brief recorded activity and
unknown gaps can remain inside the outer window, but their minutes are excluded.
The card shows categorical evidence quality and signal coverage, not a calibrated
probability of sleep. An immobile phone cannot establish that its owner was asleep.

Imported Health Connect or HealthKit sleep retains precedence. A user can adjust an
inferred window using local dates and 24-hour times, or reset it to the automatic
estimate. Corrections are explicitly user-reported, preserve the automatic record,
and never write to or change imported health data. Editing is unavailable in demo mode.

## Platform evidence

- Android: closed screen-off/on history within successful usage-query coverage, or
  matched activity transitions. Initial usage sync includes yesterday so the first
  morning open can inspect the preceding evening.
- iOS: closed Core Motion classifications, including OS-retained recovered history.
  Pending history windows remain unknown until their pages finish. No screen/unlock
  or ambient-light access is introduced.
- Both: conflicting physical activity, vehicle motion, workouts, app sessions where
  available, timed steps and motion bursts interrupt rest. Charging/Full snapshots
  and stable location samples provide context only. Sparse steps, battery level,
  absent events and empty queries do not create rest. Live raw motion, steps and
  battery collection still have their existing foreground limitations.

## Initial engineering rules

Search from the prior local date at 18:00 to the wake date at 12:00, bounded by now.
Never invent a closing endpoint at midnight, noon or query end. Require an eligible
window of 3–12 elapsed hours with at least three hours supported rest and at least
80% covered time. Connect rest segments only across activity gaps up to 15 minutes
and unknown gaps up to 10 minutes; exclude the gaps from supported duration. These
thresholds are conservative product rules, not clinically validated sleep cutoffs.
The supported interval with the most rest minutes wins; coverage and time break ties.

The calculation uses current device-local calendar rules (including DST). It does
not reconstruct a historical travel timezone. Source changes, uncertain motion,
unmatched transitions, incomplete history and long collection gaps can legitimately
leave the card without an estimate. Shift-work daytime sleep and naps are not inferred.

## Storage and source resolution

Existing `sleep_inferred` / `inferred` event and raw export schemas stay compatible.
Automatic IDs are `rest-inferred-v2-<wake-date>`; adjustments use
`rest-adjusted-<wake-date>`. Added metadata:

- `rest_algorithm_version`, `rest_wake_date`, `rest_timezone`, `rest_timezone_offset`
- `rest_intervals` (JSON timestamp pairs), `rest_coverage`,
  `rest_unknown_minutes`, `rest_interruption_minutes`
- `rest_evidence_quality`, `rest_evidence`, `rest_record_ids`
- `rest_user_adjusted`, `rest_original_event` for corrections

Automatic `valueNumeric` is supported rest minutes. Adjustment duration is explicitly
user-reported elapsed time and does not claim observed coverage. The existing
numeric confidence field is a compatibility score, never a sleep probability.

Reconciliation recalculates seven wake dates after available activity/usage/health
imports, upserts owned automatic records, and skips unchanged payloads. Owned legacy
or invalidated automatic results in that window are retained as stale provenance.
Raw records, imports and user adjustments are preserved. Transactional event changes
invalidate revisions and both affected daily aggregates. An obsolete adjustment is
soft-invalidated on reset. Existing data wipe removes these events through the normal
wipe path; the repository epoch guard rejects work after wipe.

Today, daily totals and unified timeline/export choose imported sleep first, then
an adjustment, then automatic rest. Timeline attribution uses supported intervals
and excludes overlaps. Trends retain separate imported/estimated series, keep missing
dates as gaps, and select one current window per wake date for the timing chart.

`EXPO_PUBLIC_REST_INFERENCE=0` suppresses inferred rest and editing; imported sleep
still works. The existing sleep collector is the user control. Disabling this build
switch does not restore the previous missing-data-as-rest heuristic. No network,
telemetry, new runtime permission or native bridge change is introduced.

## Validation and remaining checks

Automated evidence and final command results are recorded in the accompanying
repository plan, `.notes/028_overnight_rest_inference_android_and_ios_plan_2026-09-30.md`.
All 79 tests pass, including 27 added for this feature. Typecheck, lint, the no-network
guard, diff checks, and Android/iOS production Hermes bundle exports pass.
The tests cover platform evidence, unknown gaps, interruptions, source precedence,
local calendar/DST, corrections/reset, persistence, revisions and cancellation.
A dense overlapping-query fixture checks cooperative event-loop opportunities.

Required release checks on physical Android and iPhone:

1. Collect overnight, suspend the app, and reopen after morning movement.
2. Compare displayed boundaries/supporting intervals to raw exported records.
3. Test denied access, partial history, app termination and late source corrections.
4. Test mixed imported/automatic/user-adjusted data, save/reset and data wipe.
5. Inspect empty/error/imported/adjusted cards, large text, light/dark themes, keyboard
   access and VoiceOver/TalkBack. Review native local-time entry around DST.
6. Profile foreground navigation during history recovery and dense reconciliation.

JavaScript/Hermes bundle exports do not prove native installed-device behavior or
clinical validity. The local HTML design preview was blocked by browser URL policy;
visual/native interaction review remains outstanding.
