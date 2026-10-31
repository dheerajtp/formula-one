/**
 * Telemetry trace maths for one driver and one timed lap: cumulative distance
 * integrated from speed, time-at-throttle/braking, gear changes and the summary
 * values the Telemetry view renders.
 *
 * Pure functions only. The caller fetches the car-data window, supplies the
 * recorded lap length when the circuit data has one, and formats everything for
 * display. Values are kept in the feed's units: seconds, km/h and metres.
 */
import type { OpenF1CarData, OpenF1Lap } from "./openf1";

export interface TelemetryPoint {
  /** Seconds since the lap's `date_start`. */
  timeS: number;
  /** Metres from the first sample, integrated from speed and optionally scaled to the recorded lap length. */
  distanceM: number;
  speedKph: number;
  throttlePct: number;
  brakePct: number;
  gear: number;
  rpm: number;
  /** Drag-reduction-system state exactly as the feed publishes it. */
  drs: number;
}

export interface TelemetryTrace {
  points: TelemetryPoint[];
  /** Span between the first and the last sample, in seconds. */
  durationS: number;
  /** Distance covered by the samples; equals the recorded lap length when one was supplied. */
  distanceM: number;
  maxSpeedKph: number;
  averageSpeedKph: number;
  /** Summed interval time where the sample leading the interval was at full throttle. */
  fullThrottleS: number;
  /** Summed interval time where the sample leading the interval was braking. */
  brakingS: number;
  gearChanges: number;
  sampleCount: number;
}

const MS_PER_S = 1000;
const KMH_TO_MPS = 1000 / 3600;
/** The API's published full-throttle scale. */
const FULL_THROTTLE = 100;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

interface TimedSample {
  t: number;
  data: OpenF1CarData;
}

/**
 * Build the trace for `lap` from the car-data samples that actually fall inside
 * the lap window. Returns null when the lap has no usable duration or when fewer
 * than two samples carry a finite timestamp and speed — a trace cannot be drawn
 * (or averaged) from a single point, and no samples are invented to fill it.
 *
 * Distance is the trapezoidal integral of the speed trace. When the caller knows
 * the recorded lap length, every distance is scaled by one factor so the axis
 * ends exactly on that length; without it the integrated distance is returned
 * untouched, never replaced by an assumed lap length.
 */
export function buildTelemetryTrace(
  samples: OpenF1CarData[],
  lap: OpenF1Lap,
  recordedLapLengthM: number | null,
): TelemetryTrace | null {
  const start = Date.parse(lap.date_start);
  const lapDurationS = lap.lap_duration;
  if (!Number.isFinite(start) || !isFiniteNumber(lapDurationS) || lapDurationS <= 0) return null;

  const end = start + lapDurationS * MS_PER_S;
  const inside: TimedSample[] = [];
  for (const data of samples) {
    const t = Date.parse(data.date);
    if (!Number.isFinite(t) || t < start || t > end) continue;
    if (!isFiniteNumber(data.speed)) continue;
    inside.push({ t, data });
  }
  if (inside.length < 2) return null;

  inside.sort((a, b) => a.t - b.t);

  const points: TelemetryPoint[] = [];
  let distanceM = 0;
  let fullThrottleS = 0;
  let brakingS = 0;
  let gearChanges = 0;

  for (let i = 0; i < inside.length; i++) {
    const { t, data } = inside[i];
    const previous = i > 0 ? inside[i - 1] : null;

    if (previous) {
      const dtS = (t - previous.t) / MS_PER_S;
      const meanSpeedMps = ((previous.data.speed + data.speed) / 2) * KMH_TO_MPS;
      distanceM += meanSpeedMps * dtS;
      if (previous.data.throttle >= FULL_THROTTLE) fullThrottleS += dtS;
      if (previous.data.brake > 0) brakingS += dtS;
      if (
        isFiniteNumber(previous.data.n_gear) &&
        isFiniteNumber(data.n_gear) &&
        data.n_gear !== previous.data.n_gear
      ) {
        gearChanges += 1;
      }
    }

    points.push({
      timeS: (t - start) / MS_PER_S,
      distanceM,
      speedKph: data.speed,
      throttlePct: data.throttle,
      brakePct: data.brake,
      gear: data.n_gear,
      rpm: data.rpm,
      drs: data.drs,
    });
  }

  const integratedM = points[points.length - 1].distanceM;
  const recordedM =
    isFiniteNumber(recordedLapLengthM) && recordedLapLengthM > 0 ? recordedLapLengthM : null;
  if (recordedM !== null && integratedM > 0) {
    const scale = recordedM / integratedM;
    for (const point of points) point.distanceM *= scale;
    // Anchor the final sample on the published length so the axis ends exactly there.
    points[points.length - 1].distanceM = recordedM;
  }

  const durationS = points[points.length - 1].timeS - points[0].timeS;
  let maxSpeedKph = points[0].speedKph;
  for (const point of points) if (point.speedKph > maxSpeedKph) maxSpeedKph = point.speedKph;

  return {
    points,
    durationS,
    distanceM: points[points.length - 1].distanceM,
    maxSpeedKph,
    averageSpeedKph: durationS > 0 ? (points[points.length - 1].distanceM / durationS) * 3.6 : 0,
    fullThrottleS,
    brakingS,
    gearChanges,
    sampleCount: points.length,
  };
}

/**
 * Index of the point closest to `timeS` for a chart cursor. Ties resolve to the
 * earlier sample; an empty trace or a non-finite cursor returns -1.
 */
export function nearestPointIndex(points: TelemetryPoint[], timeS: number): number {
  if (points.length === 0 || !Number.isFinite(timeS)) return -1;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].timeS < timeS) lo = mid + 1;
    else hi = mid;
  }

  if (lo === 0) return 0;
  const before = points[lo - 1];
  const after = points[lo];
  return timeS - before.timeS <= after.timeS - timeS ? lo - 1 : lo;
}
