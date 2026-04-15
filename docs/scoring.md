# Scoring

Zentra computes two composite scores for each unified-timeline bucket: an
**Intensity Score** (how physically active the user was) and a **Rest Composite
Score** (how restful the period was). Both scores are integers on a **0–100**
scale.

---

## Normalization

All raw signal values are normalized relative to observed maxima over a
configurable window (month, year, or all-time). For each signal `s`:

```text
norm(s) = clamp(s / max(s), 0, 1)
```

If the observed maximum for a signal is zero (no data for that signal across
the window), that signal is excluded from the computation entirely. This means
scores adapt gracefully to whichever collectors are active.

Maxima are computed once per window via `buildActivityScoreMaxima()` using the
following bucket fields:

| Signal                       | Bucket field                 |
| ---------------------------- | ---------------------------- |
| Steps                        | `steps`                      |
| Movement signals             | `movementSignals`            |
| Non-sedentary activity count | `nonSedentaryActivityCount`  |
| Heart-rate load              | `heartRateLoad`              |
| Exercise seconds             | `exerciseSeconds`            |
| Sleep minutes                | `sleepMinutes`               |
| Idle signals                 | `idleSignals`                |
| Unlock count                 | `unlockCount`                |

---

## Intensity Score

The intensity score measures physical activity relative to the user's own
baseline. It is the mean of all available normalized activity signals, scaled to
0–100:

```text
I = mean(norm(steps), norm(movement), norm(nonSedentary), norm(heartRate), norm(exercise))

intensityScore = round(I × 100)
```

Only signals with a non-zero maximum contribute to the mean. For example, if
heart-rate data is unavailable, the score is the average of the remaining four
signals.

---

## Daily Rhythm Movement Score

The Daily rhythm chart's Movement line uses a narrower hourly movement score.
It is separate from `intensityScore` and intentionally excludes heart-rate
load so the line reflects movement evidence only.

For each hourly bucket:

```text
M = mean(norm(steps), norm(movementSignals), norm(nonSedentaryActivityCount), norm(exerciseSeconds))

dailyRhythmMovementScore = round(M × 100)
```

Only signals with a non-zero maximum contribute to the mean. A heart-rate-only
hour does not increase the Daily rhythm Movement line.

The raw `movementScore` field in the unified timeline remains a separate
heuristic accumulator used for bucket dominance logic. It is not the same value
as the Daily rhythm Movement line.

---

## Rest Composite Score

The rest score estimates how restful a time bucket was. It combines two groups
of evidence:

### Group A - Inverse Intensity

```text
inverseIntensity = 1 − I
```

Low physical activity suggests the user is at rest.

### Group B — Rest Signals

Three normalized rest indicators are averaged:

- `sleepMinutes`: Higher sleep duration means more rest.
- `idleSignals`: Higher idle signals mean the device or user is inactive.
- `1 − unlockCount`: Fewer unlocks mean less screen interaction and more rest.

```text
S_rest = mean(norm(sleep), norm(idle), 1 − norm(unlock))
```

### Combining the groups

When both groups have data, the rest score is computed as:

```text
restScore = inverseIntensity × S_rest × k
```

where `k = 0.5` is an awake-state dampening constant. The multiplication acts
as a logical AND — rest is high only when physical activity is low **and**
rest signals are strong. The constant `k` compresses the range to account for
the fact that a multiplicative combination of two [0, 1] values naturally
clusters toward lower values.

### Fallback behaviour

- Both groups present: `inverseIntensity × S_rest × k`
- Only intensity data: `inverseIntensity`
- Only rest signals: `S_rest`
- No data at all: `0`

### No-data buckets

Buckets where `hasAnyData` is `false` (no events recorded) are treated as full
rest: `intensityScore = 0`, `restCompositeScore = 100`. The absence of any
device activity is the strongest rest signal available.

### Final scaling

```text
restCompositeScore = round(restScore × 100)
```

---

## Output Range

- `intensityScore`: `0–100`, where `0` means no activity and `100` means peak activity.
- `restCompositeScore`: `0–100`, where `0` means no rest and `100` means full rest.

---

## Daily Rhythm Screen Series

The Daily rhythm chart's screen line uses the same historical normalization
window as intensity and rest. Raw `screenScore` values are accumulated per
bucket from app-usage duration, screen-state transitions, and unlock events,
then normalized against the strongest observed `screenScore` bucket in the
selected normalization window (month, year, or all-time).

This makes the screen line comparable across days instead of rescaling each day
to its own local maximum.

---

## Activity Pattern Visualization

The activity pattern grid (heatmap) maps each cell's color using two
dimensions:

### Hue - Dominant Kind

Each time bucket is classified by its dominant activity kind. The hue of the
cell reflects this:

- `movement`: `signalPhysical`, meaning physical activity dominated.
- `screen`: `signalCool`, meaning screen usage dominated.
- `rest`: `signalHuman`, meaning rest or inactivity dominated.

### Opacity — Intensity

The alpha (opacity) of the cell color scales linearly with the bucket's
intensity score:

```text
alpha = 0.16 + (intensity / 100) × 0.70
```

- A faintly colored cell indicates low activity in that period.
- A deeply saturated cell indicates high activity.
- Placeholder cells (no data) render as dashed, transparent outlines.

Light and dark modes apply a small alpha offset (+0.04 in dark mode) and
different caps (0.82 light, 0.88 dark) to maintain contrast.

### Source

Visualization logic lives in [`components/zentra/ActivityPatternCard.tsx`](../components/zentra/ActivityPatternCard.tsx).

---

## Scoring Source

Scoring logic lives in [`utils/activity-intensity.ts`](../utils/activity-intensity.ts).
