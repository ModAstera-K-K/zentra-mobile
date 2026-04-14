# Scoring

Zentra computes two composite scores for each unified-timeline bucket: an
**Intensity Score** (how physically active the user was) and a **Rest Composite
Score** (how restful the period was). Both scores are integers on a **0–100**
scale.

---

## Normalization

All raw signal values are normalized relative to observed maxima over a
configurable window (month, year, or all-time). For each signal `s`:

```
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

```
I = mean(norm(steps), norm(movement), norm(nonSedentary), norm(heartRate), norm(exercise))

intensityScore = round(I × 100)
```

Only signals with a non-zero maximum contribute to the mean. For example, if
heart-rate data is unavailable, the score is the average of the remaining four
signals.

---

## Rest Composite Score

The rest score estimates how restful a time bucket was. It combines two groups
of evidence:

### Group A — Inverse Intensity

```
inverseIntensity = 1 − I
```

Low physical activity suggests the user is at rest.

### Group B — Rest Signals

Three normalized rest indicators are averaged:

| Signal            | Interpretation                                          |
| ----------------- | ------------------------------------------------------- |
| `sleepMinutes`    | Higher sleep duration → more rest                       |
| `idleSignals`     | Higher idle signals → device/user inactive              |
| `1 − unlockCount` | Fewer unlocks → less screen interaction → more rest    |

```
S_rest = mean(norm(sleep), norm(idle), 1 − norm(unlock))
```

### Combining the groups

When both groups have data, the rest score is computed as:

```
restScore = inverseIntensity × S_rest × k
```

where `k = 0.5` is an awake-state dampening constant. The multiplication acts
as a logical AND — rest is high only when physical activity is low **and**
rest signals are strong. The constant `k` compresses the range to account for
the fact that a multiplicative combination of two [0, 1] values naturally
clusters toward lower values.

### Fallback behaviour

| Available data        | Formula                        |
| --------------------- | ------------------------------ |
| Both groups present   | `inverseIntensity × S_rest × k` |
| Only intensity data   | `inverseIntensity`             |
| Only rest signals     | `S_rest`                       |
| No data at all        | 0                              |

### No-data buckets

Buckets where `hasAnyData` is `false` (no events recorded) are treated as full
rest: `intensityScore = 0`, `restCompositeScore = 100`. The absence of any
device activity is the strongest rest signal available.

### Final scaling

```
restCompositeScore = round(restScore × 100)
```

---

## Output Range

| Score                | Range  | Meaning                   |
| -------------------- | ------ | ------------------------- |
| `intensityScore`     | 0–100  | 0 = no activity, 100 = peak activity |
| `restCompositeScore` | 0–100  | 0 = no rest, 100 = full rest         |

---

## Activity Pattern Visualization

The activity pattern grid (heatmap) maps each cell's color using two
dimensions:

### Hue — Dominant Kind

Each time bucket is classified by its dominant activity kind. The hue of the
cell reflects this:

| Dominant kind | Theme token      | Meaning                    |
| ------------- | ---------------- | -------------------------- |
| `movement`    | `signalPhysical` | Physical activity dominated |
| `screen`      | `signalCool`     | Screen usage dominated      |
| `rest`        | `signalHuman`    | Rest / inactivity dominated |

### Opacity — Intensity

The alpha (opacity) of the cell color scales linearly with the bucket's
intensity score:

```
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

## Source

Scoring logic lives in [`utils/activity-intensity.ts`](../utils/activity-intensity.ts).
