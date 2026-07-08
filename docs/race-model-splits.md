# Race Model Split Tables

> Lookup tables for the Race Pace Calculator's "Race model" split strategy.
> Generated from a velocity-decay model calibrated against elite/sub-elite pacing data.
> These tables provide the expected 100m split targets for every goal time.

---

## Methodology

The race model uses a **multi-segment velocity-decay** approach rather than fixed percentage weights. This captures the physiological reality that pacing patterns shift with ability level — elite runners have different decay curves than developing runners.

### 400m Model

Four 100m segments, each with a velocity expressed as a ratio of the peak segment (100–200m "float" phase):

| Segment | Description | Velocity Ratio at 48.0s | Velocity Ratio at 65.0s |
|---------|-------------|:------------------------:|:-------------------------:|
| 0–100m | Block start + acceleration into curve | 0.92 × v_peak | 0.89 × v_peak |
| 100–200m | Peak velocity / "float" backstretch | 1.00 (reference) | 1.00 (reference) |
| 200–300m | First decay — lactate accumulation begins | 0.96 × v_peak | 0.92 × v_peak |
| 300–400m | Severe decay — acidosis limits force production | 0.90 × v_peak | 0.82 × v_peak |

Velocity ratios shift linearly between the endpoints as total time increases. As ability drops, the decay steepness increases: slower runners decelerate more sharply in the final 200m.

Segment times are computed as `t_i = T × (1/v_i) / Σ(1/v_j)`, ensuring all four segments always sum to the total time `T`.

### 200m Model

Four 50m segments capturing the sprint-specific velocity profile. The model captures a key physiological crossover:

| Segment | Description | Velocity Ratio at 20.0s | Velocity Ratio at 28.0s |
|---------|-------------|:------------------------:|:-------------------------:|
| 0–50m | Block start + drive phase | 0.82 × v_peak | 0.79 × v_peak |
| 50–100m | Peak velocity zone | 1.00 (reference) | 1.00 (reference) |
| 100–150m | Near-peak, slight decay begins | 0.97 × v_peak | 0.93 × v_peak |
| 150–200m | Fatigue-driven deceleration | 0.93 × v_peak | 0.83 × v_peak |

**The crossover:** For elite sprinters (~20–26s), the acceleration penalty of the first 100m (block start) outweighs the fatigue penalty, producing a **negative split** — the second 100m is faster. For developing runners (~27s+), fatigue dominates and produces a **positive split** — the second 100m is slower. The model crossover occurs around 27.0s.

### Sources

- Hanon, C. & Gajer, B. (2009). "Velocity and stride parameters of world-class 400-meter athletes compared with less experienced runners." *Journal of Strength and Conditioning Research.*
- Yoshimoto, T., et al. (2025). "Race development in men's 400 m track and field events." *Scientific Journal of Sport and Performance.*
- World Athletics biomechanics reports (2015 Beijing, 2017 London, 2019 Doha Championships).
- BrianMac Sports Coach: [400 Metre Pace](https://www.brianmac.co.uk/sprints/pred400.htm)
- PMC: [Modelling the optimisation of world-class 400 m performance](https://pmc.ncbi.nlm.nih.gov/articles/PMC10948471/)
- TopEndSports performance benchmarks and 100m split percentage models.
- Clyde Hart (Baylor University) 400m coaching philosophy — the "float" phase concept.

---

## 400m Race Model — Full Split Table

100m splits for goal times from 48.0s to 65.0s in 1-second increments.
Times shown in seconds. Segment 2 (100–200m) is the fastest; segment 4 (300–400m) shows the steepest decay.

| Goal | 0–100m | 100–200m | 200–300m | 300–400m | 1st 200m | 2nd 200m | Diff |
|-----:|-------:|---------:|---------:|---------:|---------:|---------:|-----:|
| 48.0 | 12.31 | 11.32 | 11.79 | 12.58 | 23.63 | 24.37 | +0.75 |
| 49.0 | 12.56 | 11.53 | 12.04 | 12.88 | 24.08 | 24.92 | +0.83 |
| 50.0 | 12.80 | 11.73 | 12.28 | 13.18 | 24.54 | 25.46 | +0.92 |
| 51.0 | 13.05 | 11.94 | 12.53 | 13.48 | 24.99 | 26.01 | +1.01 |
| 52.0 | 13.30 | 12.14 | 12.77 | 13.78 | 25.44 | 26.56 | +1.11 |
| 53.0 | 13.55 | 12.35 | 13.02 | 14.09 | 25.89 | 27.11 | +1.21 |
| 54.0 | 13.80 | 12.55 | 13.26 | 14.39 | 26.34 | 27.66 | +1.31 |
| 55.0 | 14.04 | 12.75 | 13.51 | 14.70 | 26.79 | 28.21 | +1.42 |
| 56.0 | 14.29 | 12.94 | 13.75 | 15.01 | 27.23 | 28.77 | +1.53 |
| 57.0 | 14.54 | 13.14 | 14.00 | 15.32 | 27.68 | 29.32 | +1.64 |
| 58.0 | 14.78 | 13.34 | 14.24 | 15.64 | 28.12 | 29.88 | +1.76 |
| 59.0 | 15.03 | 13.53 | 14.49 | 15.95 | 28.56 | 30.44 | +1.88 |
| 60.0 | 15.27 | 13.73 | 14.73 | 16.27 | 29.00 | 31.00 | +2.01 |
| 61.0 | 15.52 | 13.92 | 14.97 | 16.59 | 29.43 | 31.57 | +2.13 |
| 62.0 | 15.76 | 14.11 | 15.22 | 16.91 | 29.87 | 32.13 | +2.27 |
| 63.0 | 16.00 | 14.30 | 15.46 | 17.24 | 30.30 | 32.70 | +2.40 |
| 64.0 | 16.24 | 14.49 | 15.71 | 17.56 | 30.73 | 33.27 | +2.54 |
| 65.0 | 16.49 | 14.67 | 15.95 | 17.89 | 31.16 | 33.84 | +2.68 |

### Segment Weight Percentages

For interpolation or programmatic use, here are the percentage weights for every 2-second increment:

| Goal | w1 (0–100m) | w2 (100–200m) | w3 (200–300m) | w4 (300–400m) |
|-----:|:-----------:|:-------------:|:-------------:|:-------------:|
| 48.0 | 25.64% | 23.58% | 24.56% | 26.21% |
| 50.0 | 25.61% | 23.47% | 24.56% | 26.36% |
| 52.0 | 25.58% | 23.35% | 24.56% | 26.51% |
| 54.0 | 25.55% | 23.24% | 24.56% | 26.65% |
| 56.0 | 25.52% | 23.12% | 24.56% | 26.80% |
| 58.0 | 25.49% | 23.00% | 24.56% | 26.95% |
| 60.0 | 25.46% | 22.88% | 24.56% | 27.10% |
| 62.0 | 25.42% | 22.76% | 24.55% | 27.26% |
| 64.0 | 25.39% | 22.64% | 24.55% | 27.42% |
| 65.0 | 25.37% | 22.58% | 24.55% | 27.50% |

**Key pattern:** w2 (the "float") grows as a *smaller* share for slower runners — elite athletes spend relatively more time in their peak-velocity phase. w4 (the final 100m) grows as a *larger* share — slower runners decelerate more severely.

---

## 200m Race Model — Full Split Table

50m and 100m splits for goal times from 20.0s to 28.0s in 0.5-second increments.
Times shown in seconds. Note the **split direction flips** around 27.0s.

| Goal | 0–50m | 50–100m | 100–150m | 150–200m | 0–100m | 100–200m | Diff |
|-----:|------:|--------:|---------:|---------:|-------:|---------:|-----:|
| 20.0 | 5.64 | 4.62 | 4.77 | 4.97 | 10.26 | 9.74 | −0.52 |
| 20.5 | 5.78 | 4.73 | 4.88 | 5.12 | 10.50 | 10.00 | −0.50 |
| 21.0 | 5.91 | 4.83 | 5.00 | 5.26 | 10.74 | 10.26 | −0.48 |
| 21.5 | 6.05 | 4.93 | 5.12 | 5.41 | 10.98 | 10.52 | −0.45 |
| 22.0 | 6.19 | 5.03 | 5.24 | 5.55 | 11.21 | 10.79 | −0.42 |
| 22.5 | 6.32 | 5.12 | 5.35 | 5.70 | 11.45 | 11.05 | −0.39 |
| 23.0 | 6.46 | 5.22 | 5.47 | 5.85 | 11.68 | 11.32 | −0.36 |
| 23.5 | 6.59 | 5.32 | 5.58 | 6.00 | 11.91 | 11.59 | −0.33 |
| 24.0 | 6.73 | 5.42 | 5.70 | 6.15 | 12.14 | 11.86 | −0.29 |
| 24.5 | 6.86 | 5.51 | 5.82 | 6.31 | 12.37 | 12.13 | −0.25 |
| 25.0 | 7.00 | 5.61 | 5.93 | 6.46 | 12.60 | 12.40 | −0.21 |
| 25.5 | 7.13 | 5.70 | 6.05 | 6.62 | 12.83 | 12.67 | −0.16 |
| 26.0 | 7.27 | 5.79 | 6.16 | 6.78 | 13.06 | 12.94 | −0.12 |
| 26.5 | 7.40 | 5.89 | 6.28 | 6.94 | 13.29 | 13.21 | −0.07 |
| 27.0 | 7.53 | 5.98 | 6.39 | 7.10 | 13.51 | 13.49 | −0.02 |
| 27.5 | 7.66 | 6.07 | 6.51 | 7.26 | 13.73 | 13.77 | +0.03 |
| 28.0 | 7.80 | 6.16 | 6.62 | 7.42 | 13.96 | 14.04 | +0.09 |

### Segment Weight Percentages

| Goal | w1 (0–50m) | w2 (50–100m) | w3 (100–150m) | w4 (150–200m) |
|-----:|:----------:|:------------:|:-------------:|:-------------:|
| 20.0 | 28.20% | 23.11% | 23.83% | 24.86% |
| 22.0 | 28.12% | 22.86% | 23.80% | 25.22% |
| 24.0 | 28.03% | 22.57% | 23.75% | 25.64% |
| 26.0 | 27.95% | 22.29% | 23.71% | 26.05% |
| 28.0 | 27.86% | 22.01% | 23.66% | 26.47% |

**Key patterns:**
- **0–50m (start):** Always the slowest 50m segment. Its weight barely changes with ability — the block start penalty is relatively constant.
- **50–100m (peak):** Always the fastest segment. Its weight *decreases* for slower runners because they spend less of their total race time at peak velocity.
- **150–200m (final stretch):** The weight *increases* significantly for slower runners — fatigue-driven deceleration is the defining constraint.
- **Crossover:** The 0–100m vs 100–200m differential crosses from negative (second half faster) to positive around **27.0s**. Below this, the acceleration penalty dominates; above it, fatigue dominates.

---

## Usage Notes

### For the Race Pace Calculator Implementation

To compute race model splits for any goal time:

1. **400m:** Linearly interpolate the four velocity ratios between the 48.0s and 65.0s endpoints based on `T`. Compute segment times from the ratios. The resulting 4-segment weights will always sum to `T`.

2. **200m:** Similarly interpolate the four velocity ratios between 20.0s and 28.0s endpoints. The model naturally handles the negative→positive split crossover.

3. **For times outside these ranges,** clamp to the nearest endpoint (e.g., a 42.0s 400m uses the 48.0s ratios; a 30.0s 200m uses the 28.0s ratios). The velocity ratios stay constant at the boundary.

4. **Compared to fixed weights:** The current codebase uses `RACE_MODEL_WEIGHTS` with fixed percentages (e.g., 400m = `[0.235, 0.245, 0.255, 0.265]`). The velocity-decay model here is more accurate because it accounts for the *shifting* decay curve across ability levels. The fixed-weight approach produces the same decay steepness for a 48.0s and 65.0s runner, which is physiologically incorrect.

### Implementation Sketch (TypeScript)

```ts
function raceModel400mSplits(totalSecs: number): number[] {
  const T_MIN = 48.0, T_MAX = 65.0
  const x = Math.max(0, Math.min(1, (totalSecs - T_MIN) / (T_MAX - T_MIN)))

  // Velocity ratios relative to peak segment
  const v = [
    0.92 - 0.03 * x,  // 0-100m
    1.00,              // 100-200m (peak)
    0.96 - 0.04 * x,  // 200-300m
    0.90 - 0.08 * x,  // 300-400m
  ]

  const invSum = v.reduce((s, vi) => s + 1 / vi, 0)
  const times = v.map(vi => totalSecs * (1 / vi) / invSum)

  // Return cumulative times at each 100m checkpoint
  let cum = 0
  return times.map(t => { cum += t; return cum })
}
```

### For the 200m, use 50m segments and accumulate to 100m

```ts
function raceModel200mSplits(totalSecs: number): { splits50m: number[]; split100m: [number, number] } {
  const T_MIN = 20.0, T_MAX = 28.0
  const x = Math.max(0, Math.min(1, (totalSecs - T_MIN) / (T_MAX - T_MIN)))

  const v = [
    0.82 - 0.03 * x,  // 0-50m
    1.00,              // 50-100m (peak)
    0.97 - 0.04 * x,  // 100-150m
    0.93 - 0.10 * x,  // 150-200m
  ]

  const invSum = v.reduce((s, vi) => s + 1 / vi, 0)
  const times50m = v.map(vi => totalSecs * (1 / vi) / invSum)

  return {
    splits50m: times50m,
    split100m: [times50m[0] + times50m[1], times50m[2] + times50m[3]],
  }
}
```
