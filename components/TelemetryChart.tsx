import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { TelemetryPoint, TelemetryTrace } from "@/lib/telemetry";
import type { BrakingZone, DeltaPoint, Straight } from "@/lib/telemetryInsights";

/** Presentation layout only: viewBox size, strip heights and gutters. */
const W = 900;
const PAD_L = 44;
const PAD_R = 44;
const STRIP_GAP = 14;
const SPEED_H = 150;
const PEDAL_H = 70;
const GEAR_H = 80;
const AXIS_H = 22;
const DELTA_H = 70;
const TOP = 6;

const GRID = "#ffffff14";
const MUTED = "#8b949f";
const THROTTLE = "#3ac55a";
const BRAKE = "#ff4d4d";
const RPM = "#8b93a1";
/** The API's published pedal scale. */
const PEDAL_MAX = 100;

const SPEED_TOP = TOP;
const PEDAL_TOP = SPEED_TOP + SPEED_H + STRIP_GAP;
const GEAR_TOP = PEDAL_TOP + PEDAL_H + STRIP_GAP;
const DELTA_TOP = GEAR_TOP + GEAR_H + STRIP_GAP;

function finiteRange(values: number[]): [number, number] | null {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  return [Math.min(...finite), Math.max(...finite)];
}

/** Rough "nice" tick step so the axis reads in round units. */
function niceStep(span: number, targetTicks: number): number {
  if (!(span > 0)) return 1;
  const raw = span / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const nice = normalised < 1.5 ? 1 : normalised < 3.5 ? 2 : normalised < 7.5 ? 5 : 10;
  return nice * magnitude;
}

function nearestByDistance(points: TelemetryPoint[], distanceM: number): number {
  if (!points.length) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].distanceM < distanceM) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && distanceM - points[lo - 1].distanceM <= points[lo].distanceM - distanceM) return lo - 1;
  return lo;
}

function path(points: TelemetryPoint[], x: (p: TelemetryPoint) => number, y: (p: TelemetryPoint) => number, step = false) {
  let d = "";
  points.forEach((p) => {
    const px = x(p);
    const py = y(p);
    if (!Number.isFinite(py)) return;
    if (!d) d = `M${px.toFixed(1)},${py.toFixed(1)}`;
    else if (step) d += `H${px.toFixed(1)}V${py.toFixed(1)}`;
    else d += `L${px.toFixed(1)},${py.toFixed(1)}`;
  });
  return d;
}

export interface ChartCompare {
  trace: TelemetryTrace;
  color: string;
  label: string;
  delta: DeltaPoint[] | null;
}

export function TelemetryChart({
  trace,
  label,
  color,
  annotations,
  cursorIndex,
  onCursorChange,
  compare,
}: {
  trace: TelemetryTrace;
  label: string;
  color: string;
  /** Numbered braking-zone markers and shaded full-throttle stretches (guide mode). */
  annotations?: { zones: BrakingZone[]; straights: Straight[] };
  /** Controlled cursor; when omitted the chart keeps its own. */
  cursorIndex?: number;
  onCursorChange?: (index: number) => void;
  /** A second lap drawn on the speed strip, plus a time-delta strip. */
  compare?: ChartCompare;
}) {
  const points = trace.points;
  const [ownCursor, setOwnCursor] = useState<number>(-1);
  const cursor = cursorIndex ?? ownCursor;
  const setCursor = (next: number | ((c: number) => number)) => {
    const value = typeof next === "function" ? next(cursor) : next;
    if (onCursorChange) onCursorChange(value);
    else setOwnCursor(value);
  };
  const svgRef = useRef<SVGSVGElement>(null);
  const delta = compare?.delta && compare.delta.length > 1 ? compare.delta : null;
  const AXIS_TOP = delta ? DELTA_TOP + DELTA_H : GEAR_TOP + GEAR_H;
  const H = AXIS_TOP + AXIS_H;

  const scales = useMemo(() => {
    const maxDistance = trace.distanceM > 0 ? trace.distanceM : 1;
    const speed =
      finiteRange([...points, ...(compare?.trace.points ?? [])].map((p) => p.speedKph)) ?? [0, 1];
    const gear = finiteRange(points.map((p) => p.gear)) ?? [0, 1];
    const rpm = finiteRange(points.map((p) => p.rpm)) ?? [0, 1];
    const speedMin = Math.min(0, speed[0]);
    const speedMax = speed[1] > speedMin ? speed[1] : speedMin + 1;
    const gearMin = Math.min(0, gear[0]);
    const gearMax = gear[1] > gearMin ? gear[1] : gearMin + 1;
    const rpmMin = Math.min(0, rpm[0]);
    const rpmMax = rpm[1] > rpmMin ? rpm[1] : rpmMin + 1;
    const x = (distance: number) => PAD_L + (distance / maxDistance) * (W - PAD_L - PAD_R);
    return {
      maxDistance,
      speedMax,
      speedMin,
      gearMax,
      gearMin,
      rpmMax,
      rpmMin,
      x,
      ySpeed: (v: number) => SPEED_TOP + SPEED_H - ((v - speedMin) / (speedMax - speedMin)) * SPEED_H,
      yPedal: (v: number) => PEDAL_TOP + PEDAL_H - (v / PEDAL_MAX) * PEDAL_H,
      yGear: (v: number) => GEAR_TOP + GEAR_H - ((v - gearMin) / (gearMax - gearMin)) * GEAR_H,
      yRpm: (v: number) => GEAR_TOP + GEAR_H - ((v - rpmMin) / (rpmMax - rpmMin)) * GEAR_H,
    };
  }, [points, trace.distanceM, compare?.trace]);

  const deltaScale = useMemo(() => {
    if (!delta) return null;
    const range = finiteRange(delta.map((d) => d.deltaS)) ?? [0, 0];
    const extent = Math.max(Math.abs(range[0]), Math.abs(range[1])) || 1;
    return { extent, y: (v: number) => DELTA_TOP + DELTA_H / 2 - (v / extent) * (DELTA_H / 2) };
  }, [delta]);

  const distanceTicks = useMemo(() => {
    const step = niceStep(scales.maxDistance, 6);
    const ticks: number[] = [];
    for (let d = 0; d <= scales.maxDistance + 1e-6; d += step) ticks.push(d);
    return ticks;
  }, [scales.maxDistance]);

  const speedTicks = useMemo(() => {
    const step = niceStep(scales.speedMax - scales.speedMin, 4);
    const ticks: number[] = [];
    for (let v = Math.ceil(scales.speedMin / step) * step; v <= scales.speedMax; v += step) ticks.push(v);
    return ticks;
  }, [scales.speedMax, scales.speedMin]);

  const active = cursor >= 0 && cursor < points.length ? points[cursor] : null;

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || !points.length) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;
    const vx = ((event.clientX - rect.left) / rect.width) * W;
    const distance = ((vx - PAD_L) / (W - PAD_L - PAD_R)) * scales.maxDistance;
    setCursor(nearestByDistance(points, Math.max(0, Math.min(scales.maxDistance, distance))));
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (!points.length) return;
    const jump = event.shiftKey ? Math.max(1, Math.round(points.length / 20)) : 1;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setCursor((c) => Math.min(points.length - 1, (c < 0 ? -1 : c) + jump));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setCursor((c) => Math.max(0, (c < 0 ? points.length : c) - jump));
    } else if (event.key === "Home") {
      event.preventDefault();
      setCursor(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setCursor(points.length - 1);
    } else if (event.key === "Escape") {
      setCursor(-1);
    }
  }

  const ariaLabel = `${label}: speed, throttle, brake, gear and RPM against lap distance. Top speed ${Math.round(
    trace.maxSpeedKph,
  )} km/h over ${(trace.distanceM / 1000).toFixed(2)} km from ${trace.sampleCount} samples. Use left and right arrow keys to move the cursor.`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <LegendSwatch color={color} label="Speed (km/h)" />
        <LegendSwatch color={THROTTLE} label="Throttle %" />
        <LegendSwatch color={BRAKE} label="Brake %" />
        <LegendSwatch color={color} label="Gear" dashed={false} thin />
        <LegendSwatch color={RPM} label="RPM" dashed />
        {compare && <LegendSwatch color={compare.color} label={`${compare.label} speed`} dashed />}
        {delta && compare && <LegendSwatch color={compare.color} label={`Δ time (+ = ${compare.label} behind)`} />}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none outline-none focus-visible:ring-1 focus-visible:ring-primary"
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setCursor(-1)}
        onKeyDown={onKeyDown}
      >
        {/* Speed strip */}
        {speedTicks.map((v) => (
          <g key={`s${v}`}>
            <line x1={PAD_L} x2={W - PAD_R} y1={scales.ySpeed(v)} y2={scales.ySpeed(v)} stroke={GRID} />
            <text x={PAD_L - 6} y={scales.ySpeed(v) + 3} fontSize={9} textAnchor="end" fill={MUTED}>
              {Math.round(v)}
            </text>
          </g>
        ))}
        {annotations?.straights.map((s) => (
          <rect
            key={s.id}
            x={scales.x(s.startDistanceM)}
            y={SPEED_TOP}
            width={Math.max(0, scales.x(s.endDistanceM) - scales.x(s.startDistanceM))}
            height={SPEED_H}
            fill="#3ac55a14"
          />
        ))}
        {compare && (
          <path
            d={path(
              compare.trace.points,
              (p) => scales.x((compare.trace.distanceM > 0 ? p.distanceM / compare.trace.distanceM : 0) * scales.maxDistance),
              (p) => scales.ySpeed(p.speedKph),
            )}
            fill="none"
            stroke={compare.color}
            strokeWidth={1.2}
            strokeOpacity={0.75}
            strokeDasharray="4 2"
          />
        )}
        <path d={path(points, (p) => scales.x(p.distanceM), (p) => scales.ySpeed(p.speedKph))} fill="none" stroke={color} strokeWidth={1.6} />
        {annotations?.zones.map((z) => (
          <g key={z.id} aria-label={`${z.id}: braking from ${Math.round(z.entrySpeedKph)} km/h`}>
            <line
              x1={scales.x(z.startDistanceM)}
              x2={scales.x(z.startDistanceM)}
              y1={SPEED_TOP + 12}
              y2={SPEED_TOP + SPEED_H}
              stroke={BRAKE}
              strokeOpacity={0.5}
              strokeDasharray="2 2"
            />
            <text x={scales.x(z.startDistanceM)} y={SPEED_TOP + 9} fontSize={9} textAnchor="middle" fill={BRAKE}>
              {z.id}
            </text>
          </g>
        ))}

        {/* Pedal strip */}
        {[0, PEDAL_MAX / 2, PEDAL_MAX].map((v) => (
          <g key={`p${v}`}>
            <line x1={PAD_L} x2={W - PAD_R} y1={scales.yPedal(v)} y2={scales.yPedal(v)} stroke={GRID} />
            <text x={PAD_L - 6} y={scales.yPedal(v) + 3} fontSize={9} textAnchor="end" fill={MUTED}>
              {v}
            </text>
          </g>
        ))}
        <path d={path(points, (p) => scales.x(p.distanceM), (p) => scales.yPedal(p.throttlePct))} fill="none" stroke={THROTTLE} strokeWidth={1.3} />
        <path d={path(points, (p) => scales.x(p.distanceM), (p) => scales.yPedal(p.brakePct), true)} fill="none" stroke={BRAKE} strokeWidth={1.3} />

        {/* Gear + RPM strip */}
        <line x1={PAD_L} x2={W - PAD_R} y1={GEAR_TOP} y2={GEAR_TOP} stroke={GRID} />
        <line x1={PAD_L} x2={W - PAD_R} y1={GEAR_TOP + GEAR_H} y2={GEAR_TOP + GEAR_H} stroke={GRID} />
        <text x={PAD_L - 6} y={GEAR_TOP + 9} fontSize={9} textAnchor="end" fill={MUTED}>
          G{Math.round(scales.gearMax)}
        </text>
        <text x={W - PAD_R + 6} y={GEAR_TOP + 9} fontSize={9} fill={MUTED}>
          {Math.round(scales.rpmMax / 1000)}k
        </text>
        <path d={path(points, (p) => scales.x(p.distanceM), (p) => scales.yRpm(p.rpm))} fill="none" stroke={RPM} strokeWidth={1} strokeDasharray="3 2" />
        <path d={path(points, (p) => scales.x(p.distanceM), (p) => scales.yGear(p.gear), true)} fill="none" stroke={color} strokeWidth={1.2} />

        {delta && deltaScale && compare && (
          <g>
            <line x1={PAD_L} x2={W - PAD_R} y1={deltaScale.y(0)} y2={deltaScale.y(0)} stroke={GRID} />
            <text x={PAD_L - 6} y={DELTA_TOP + 9} fontSize={9} textAnchor="end" fill={MUTED}>
              +{deltaScale.extent.toFixed(1)}
            </text>
            <text x={PAD_L - 6} y={DELTA_TOP + DELTA_H} fontSize={9} textAnchor="end" fill={MUTED}>
              −{deltaScale.extent.toFixed(1)}
            </text>
            <text x={W - PAD_R + 6} y={deltaScale.y(0) + 3} fontSize={9} fill={MUTED}>
              Δ s
            </text>
            <path
              d={delta
                .map((d, i) => `${i ? "L" : "M"}${scales.x(d.distanceM).toFixed(1)},${deltaScale.y(d.deltaS).toFixed(1)}`)
                .join("")}
              fill="none"
              stroke={compare.color}
              strokeWidth={1.4}
            />
          </g>
        )}

        {/* Distance axis */}
        {distanceTicks.map((d) => (
          <g key={`d${d}`}>
            <line x1={scales.x(d)} x2={scales.x(d)} y1={TOP} y2={AXIS_TOP} stroke={GRID} />
            <text x={scales.x(d)} y={AXIS_TOP + 14} fontSize={9} textAnchor="middle" fill={MUTED}>
              {d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`}
            </text>
          </g>
        ))}

        {active && (
          <line
            x1={scales.x(active.distanceM)}
            x2={scales.x(active.distanceM)}
            y1={TOP}
            y2={AXIS_TOP}
            stroke="#ffffff80"
            strokeWidth={1}
          />
        )}
      </svg>
      <div className="tnum min-h-[1.25rem] text-[11px] text-muted-foreground" aria-live="polite">
        {active ? (
          <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-foreground">
            <span>{(active.distanceM / 1000).toFixed(3)} km</span>
            <span>t {active.timeS.toFixed(2)} s</span>
            <span>{Math.round(active.speedKph)} km/h</span>
            <span>throttle {active.throttlePct}%</span>
            <span>brake {active.brakePct}%</span>
            <span>gear {active.gear}</span>
            <span>{active.rpm} rpm</span>
          </span>
        ) : (
          "Hover the chart or focus it and use the arrow keys to read individual samples."
        )}
      </div>
    </div>
  );
}

function LegendSwatch({ color, label, dashed, thin }: { color: string; label: string; dashed?: boolean; thin?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block w-4"
        style={{ borderTop: `${thin ? 1 : 2}px ${dashed ? "dashed" : "solid"} ${color}` }}
        aria-hidden
      />
      {label}
    </span>
  );
}
