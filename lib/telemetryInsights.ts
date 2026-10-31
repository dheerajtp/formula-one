/**
 * Plain-language insights for one telemetry lap: braking zones, the corners they
 * lead into, full-throttle straights, how the lap time splits between pedals, and
 * a distance-aligned time delta against a second lap.
 *
 * Every event is detected from the samples themselves — brake pressed, throttle
 * flat out — with no tuned speed, distance or duration threshold. The only fixed
 * number is the API's 0–100 pedal scale. Pure functions; no fetching, no UI.
 */
import type { TelemetryPoint, TelemetryTrace } from "./telemetry";

/** The API's published full-throttle value. */
const FULL_THROTTLE = 100;

export interface BrakingZone {
  id: string;
  startIndex: number;
  /** Slowest point between the brake application and the return to full throttle. */
  minIndex: number;
  /** Last braking sample. */
  endIndex: number;
  startDistanceM: number;
  entrySpeedKph: number;
  minSpeedKph: number;
  speedLostKph: number;
  brakingS: number;
  gearAtMin: number;
}

export interface Straight {
  id: string;
  startIndex: number;
  endIndex: number;
  startDistanceM: number;
  endDistanceM: number;
  lengthM: number;
  durationS: number;
  exitSpeedKph: number;
}

export interface LapShares {
  fullThrottlePct: number;
  brakingPct: number;
  /** Neither braking nor at full throttle: lifting, partial throttle or coasting. */
  partialPct: number;
}

export interface LapInsights {
  zones: BrakingZone[];
  straights: Straight[];
  shares: LapShares;
  topSpeed: { index: number; distanceM: number; speedKph: number };
  highestGear: number | null;
  maxRpm: number | null;
  hasBrakeData: boolean;
  /** True when the feed carried any non-zero DRS value on this lap. */
  hasDrsData: boolean;
}

/** Maximal runs of consecutive point indices for which `test` holds. */
function runs(points: TelemetryPoint[], test: (p: TelemetryPoint) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  points.forEach((point, i) => {
    if (test(point)) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      out.push([start, i - 1]);
      start = -1;
    }
  });
  if (start >= 0) out.push([start, points.length - 1]);
  return out;
}

/** Time from the first sample of a run to the sample after it (leading-sample rule, as `buildTelemetryTrace`). */
function runDuration(points: TelemetryPoint[], start: number, end: number): number {
  const after = Math.min(points.length - 1, end + 1);
  return points[after].timeS - points[start].timeS;
}

export function buildLapInsights(trace: TelemetryTrace): LapInsights {
  const points = trace.points;

  const zones: BrakingZone[] = runs(points, (p) => p.brakePct > 0).map(([start, end], n) => {
    // The corner lasts until the driver is flat out again, or the lap ends.
    let cornerEnd = points.length - 1;
    for (let i = end + 1; i < points.length; i++) {
      if (points[i].throttlePct >= FULL_THROTTLE) {
        cornerEnd = i;
        break;
      }
    }
    let minIndex = start;
    for (let i = start; i <= cornerEnd; i++) if (points[i].speedKph < points[minIndex].speedKph) minIndex = i;
    return {
      id: `B${n + 1}`,
      startIndex: start,
      minIndex,
      endIndex: end,
      startDistanceM: points[start].distanceM,
      entrySpeedKph: points[start].speedKph,
      minSpeedKph: points[minIndex].speedKph,
      speedLostKph: points[start].speedKph - points[minIndex].speedKph,
      brakingS: runDuration(points, start, end),
      gearAtMin: points[minIndex].gear,
    };
  });

  const straights: Straight[] = runs(points, (p) => p.throttlePct >= FULL_THROTTLE).map(([start, end], n) => ({
    id: `S${n + 1}`,
    startIndex: start,
    endIndex: end,
    startDistanceM: points[start].distanceM,
    endDistanceM: points[end].distanceM,
    lengthM: points[end].distanceM - points[start].distanceM,
    durationS: runDuration(points, start, end),
    exitSpeedKph: points[end].speedKph,
  }));

  const total = trace.durationS > 0 ? trace.durationS : 0;
  const pct = (s: number) => (total > 0 ? (s / total) * 100 : 0);
  const fullThrottlePct = pct(trace.fullThrottleS);
  const brakingPct = pct(trace.brakingS);

  let top = 0;
  let highestGear: number | null = null;
  let maxRpm: number | null = null;
  points.forEach((p, i) => {
    if (p.speedKph > points[top].speedKph) top = i;
    if (Number.isFinite(p.gear)) highestGear = highestGear === null ? p.gear : Math.max(highestGear, p.gear);
    if (Number.isFinite(p.rpm)) maxRpm = maxRpm === null ? p.rpm : Math.max(maxRpm, p.rpm);
  });

  return {
    zones,
    straights,
    shares: { fullThrottlePct, brakingPct, partialPct: Math.max(0, 100 - fullThrottlePct - brakingPct) },
    topSpeed: { index: top, distanceM: points[top]?.distanceM ?? 0, speedKph: points[top]?.speedKph ?? 0 },
    highestGear,
    maxRpm,
    hasBrakeData: points.some((p) => Number.isFinite(p.brakePct)) && zones.length > 0,
    hasDrsData: points.some((p) => Number.isFinite(p.drs) && p.drs !== 0),
  };
}

export interface DeltaPoint {
  fraction: number;
  /** Distance along the base lap. */
  distanceM: number;
  /** Compare time minus base time at the same fraction of the lap: positive = compare lap slower here. */
  deltaS: number;
}

/** Linear interpolation of `timeS` at a 0..1 lap fraction. */
function timeAtFraction(points: TelemetryPoint[], total: number, fraction: number): number {
  const target = fraction * total;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].distanceM < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return points[0].timeS;
  const a = points[lo - 1];
  const b = points[lo];
  const span = b.distanceM - a.distanceM;
  const t = span > 0 ? (target - a.distanceM) / span : 0;
  return a.timeS + (b.timeS - a.timeS) * t;
}

/**
 * Cumulative time difference along the lap. Each trace is normalised by its own
 * distance, so two laps of the same circuit line up even when their integrated
 * lengths differ slightly. Null when either trace cannot be aligned.
 */
export function buildLapDelta(base: TelemetryTrace, compare: TelemetryTrace): DeltaPoint[] | null {
  if (base.points.length < 2 || compare.points.length < 2) return null;
  if (!(base.distanceM > 0) || !(compare.distanceM > 0)) return null;
  const baseStart = base.points[0].timeS;
  const compareStart = compare.points[0].timeS;
  return base.points.map((p) => {
    const fraction = p.distanceM / base.distanceM;
    const compareTime = timeAtFraction(compare.points, compare.distanceM, fraction) - compareStart;
    return { fraction, distanceM: p.distanceM, deltaS: compareTime - (p.timeS - baseStart) };
  });
}

export interface ZoneComparison {
  base: BrakingZone;
  compare: BrakingZone | null;
  /** Positive: the compare driver starts braking later, in base-lap metres. */
  brakesLaterM: number | null;
  /** Positive: the compare driver carries more minimum speed. */
  minSpeedDiffKph: number | null;
}

/**
 * Pair each base braking zone with the compare zone nearest to it by lap fraction,
 * never reusing a compare zone. A base zone whose nearest free compare zone is
 * closer to another base zone stays unpaired rather than being forced.
 */
export function matchZones(
  base: BrakingZone[],
  compare: BrakingZone[],
  baseTrace: TelemetryTrace,
  compareTrace: TelemetryTrace,
): ZoneComparison[] {
  const frac = (z: BrakingZone, t: TelemetryTrace) => (t.distanceM > 0 ? z.startDistanceM / t.distanceM : 0);
  const used = new Set<number>();
  return base.map((zone, bi) => {
    const f = frac(zone, baseTrace);
    let best = -1;
    let bestDist = Infinity;
    compare.forEach((c, ci) => {
      if (used.has(ci)) return;
      const d = Math.abs(frac(c, compareTrace) - f);
      if (d < bestDist) {
        bestDist = d;
        best = ci;
      }
    });
    if (best >= 0) {
      const cf = frac(compare[best], compareTrace);
      const closerBase = base.some((other, oi) => oi !== bi && Math.abs(frac(other, baseTrace) - cf) < bestDist);
      if (closerBase) best = -1;
    }
    if (best < 0) return { base: zone, compare: null, brakesLaterM: null, minSpeedDiffKph: null };
    used.add(best);
    const match = compare[best];
    return {
      base: zone,
      compare: match,
      brakesLaterM: (frac(match, compareTrace) - f) * baseTrace.distanceM,
      minSpeedDiffKph: match.minSpeedKph - zone.minSpeedKph,
    };
  });
}
