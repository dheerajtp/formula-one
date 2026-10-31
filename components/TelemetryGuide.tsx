import { useMemo } from "react";
import { outlinePath, pointAt, type CircuitOutline } from "@/lib/staticData";
import type { TelemetryTrace } from "@/lib/telemetry";
import type { BrakingZone, LapInsights, Straight, ZoneComparison } from "@/lib/telemetryInsights";

function km(m: number) {
  return `${(m / 1000).toFixed(2)} km`;
}
function kph(v: number) {
  return `${Math.round(v)} km/h`;
}
function s1(v: number) {
  return `${v.toFixed(1)} s`;
}
function pct(v: number) {
  return `${Math.round(v)} %`;
}

/** One line per channel, each completed with this lap's own numbers. */
export function ChannelKey({ trace, insights }: { trace: TelemetryTrace; insights: LapInsights }) {
  const items: { name: string; text: string }[] = [
    {
      name: "Speed",
      text: `How fast the car is going, in km/h. It dips into every corner and climbs on the straights. This lap peaked at ${kph(
        trace.maxSpeedKph,
      )} and averaged ${kph(trace.averageSpeedKph)}.`,
    },
    {
      name: "Throttle",
      text: `How far the accelerator is pressed, 0–100 %. A flat line at the top means flat out. This lap was flat out for ${s1(
        trace.fullThrottleS,
      )}, ${pct(insights.shares.fullThrottlePct)} of the lap.`,
    },
    {
      name: "Brake",
      text: insights.hasBrakeData
        ? `When the brake pedal is pressed. Each block is one braking point. This lap braked ${
            insights.zones.length
          } times for ${s1(trace.brakingS)} in total, ${pct(insights.shares.brakingPct)} of the lap.`
        : "When the brake pedal is pressed. The feed carries no braking data for this lap.",
    },
    {
      name: "Gear",
      text: `Which gear is engaged; the steps down mark corners, the steps up mark acceleration. This lap made ${
        trace.gearChanges
      } gear changes${insights.highestGear !== null ? ` and reached gear ${insights.highestGear}` : ""}.`,
    },
    {
      name: "RPM",
      text: `Engine revolutions per minute; it rises through each gear and drops at every upshift.${
        insights.maxRpm !== null ? ` This lap peaked at ${Math.round(insights.maxRpm).toLocaleString()} rpm.` : ""
      }`,
    },
  ];
  if (insights.hasDrsData) {
    items.push({
      name: "DRS",
      text: "Drag-reduction system state as the feed publishes it; it changes on the straights where the rear wing may open.",
    });
  }
  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.name}>
          <dt className="label-caps text-[10px] text-muted-foreground">{item.name}</dt>
          <dd className="text-xs leading-relaxed">{item.text}</dd>
        </div>
      ))}
    </dl>
  );
}

type StoryEvent = { kind: "zone"; zone: BrakingZone; order: number } | { kind: "straight"; straight: Straight; order: number };

/** Braking zones and the three longest straights, in lap order, each a button that moves the chart cursor. */
export function LapStory({
  insights,
  comparisons,
  compareLabel,
  onFocus,
  activeIndex,
}: {
  insights: LapInsights;
  comparisons?: ZoneComparison[] | null;
  compareLabel?: string;
  onFocus: (index: number) => void;
  activeIndex: number;
}) {
  const events = useMemo<StoryEvent[]>(() => {
    const longest = [...insights.straights].sort((a, b) => b.lengthM - a.lengthM).slice(0, 3);
    return [
      ...insights.zones.map((zone) => ({ kind: "zone" as const, zone, order: zone.startDistanceM })),
      ...longest.map((straight) => ({ kind: "straight" as const, straight, order: straight.startDistanceM })),
    ].sort((a, b) => a.order - b.order);
  }, [insights]);
  const byZone = new Map((comparisons ?? []).map((c) => [c.base.id, c]));

  if (!insights.hasBrakeData && !insights.straights.length) {
    return <p className="text-xs text-muted-foreground">This lap has no braking or throttle data in the feed.</p>;
  }

  return (
    <ol className="flex flex-col gap-1">
      {!insights.hasBrakeData && (
        <li className="text-xs text-muted-foreground">This lap has no braking data in the feed.</li>
      )}
      {events.map((event) => {
        if (event.kind === "zone") {
          const z = event.zone;
          const cmp = byZone.get(z.id);
          const active = activeIndex >= z.startIndex && activeIndex <= z.minIndex;
          return (
            <li key={z.id}>
              <button
                type="button"
                onClick={() => onFocus(z.minIndex)}
                onFocus={() => onFocus(z.minIndex)}
                className={`w-full border px-2 py-1 text-left text-xs ${active ? "border-primary bg-secondary" : "border-border hover:bg-secondary/60"}`}
              >
                <span className="mr-1.5 font-bold text-[#ff4d4d]">{z.id}</span>
                At {km(z.startDistanceM)}: brakes from {kph(z.entrySpeedKph)} down to {kph(z.minSpeedKph)} (−
                {Math.round(z.speedLostKph)} km/h) over {s1(z.brakingS)}, slowest in gear {z.gearAtMin}.
                {cmp && compareLabel && (
                  <span className="mt-0.5 block text-muted-foreground">
                    {cmp.compare
                      ? `vs ${compareLabel}: brakes ${Math.abs(Math.round(cmp.brakesLaterM ?? 0))} m ${
                          (cmp.brakesLaterM ?? 0) >= 0 ? "later" : "earlier"
                        }, ${Math.abs(Math.round(cmp.minSpeedDiffKph ?? 0))} km/h ${
                          (cmp.minSpeedDiffKph ?? 0) >= 0 ? "more" : "less"
                        } minimum speed.`
                      : `vs ${compareLabel}: no matching braking point on that lap.`}
                  </span>
                )}
              </button>
            </li>
          );
        }
        const st = event.straight;
        const active = activeIndex >= st.startIndex && activeIndex <= st.endIndex;
        return (
          <li key={st.id}>
            <button
              type="button"
              onClick={() => onFocus(st.endIndex)}
              onFocus={() => onFocus(st.endIndex)}
              className={`w-full border px-2 py-1 text-left text-xs ${active ? "border-primary bg-secondary" : "border-border hover:bg-secondary/60"}`}
            >
              <span className="mr-1.5 font-bold text-[#3ac55a]">Flat out</span>
              From {km(st.startDistanceM)} for {Math.round(st.lengthM)} m ({s1(st.durationS)}), reaching{" "}
              {kph(st.exitSpeedKph)} before the next lift.
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Static guidance with no numbers in it. */
export function ReadingNote() {
  return (
    <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
      <li>Read left to right: the horizontal axis is distance around the lap, from the start line to the finish.</li>
      <li>Every dip in the speed line is a corner. The deeper the dip, the slower the corner.</li>
      <li>Red blocks in the pedal strip are braking; they sit just before each dip. Green at the top is flat out.</li>
      <li>Gear steps down into a corner and back up out of it; RPM saw-tooths with every upshift.</li>
      <li>Click a numbered item in the lap story to jump the cursor there and read the exact values.</li>
    </ul>
  );
}

/** The circuit outline with numbered braking points placed by lap distance. */
export function LapEventMap({
  outline,
  trace,
  zones,
  activeIndex,
}: {
  outline: CircuitOutline;
  trace: TelemetryTrace;
  zones: BrakingZone[];
  activeIndex: number;
}) {
  const VIEW = 100;
  const path = useMemo(() => outlinePath(outline, VIEW), [outline]);
  const total = trace.distanceM > 0 ? trace.distanceM : 1;
  const cursor = activeIndex >= 0 && activeIndex < trace.points.length ? trace.points[activeIndex] : null;
  const cursorPoint = cursor ? pointAt(outline, cursor.distanceM / total) : null;
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg
        viewBox={`-6 -6 ${VIEW + 12} ${VIEW + 12}`}
        className="h-auto w-full max-w-[16rem]"
        role="img"
        aria-label={`Circuit map with ${zones.length} numbered braking points`}
      >
        <path d={path} fill="none" stroke="#ffffff40" strokeWidth={1.6} strokeLinejoin="round" />
        {zones.map((z) => {
          const p = pointAt(outline, z.startDistanceM / total);
          return (
            <g key={z.id}>
              <circle cx={p.x * VIEW} cy={p.y * VIEW} r={2.2} fill="#ff4d4d" />
              <text x={p.x * VIEW + 3} y={p.y * VIEW - 2} fontSize={4.5} fill="#ff9a9a">
                {z.id}
              </text>
            </g>
          );
        })}
        {cursorPoint && <circle cx={cursorPoint.x * VIEW} cy={cursorPoint.y * VIEW} r={2.6} fill="none" stroke="#fff" strokeWidth={0.9} />}
      </svg>
      <figcaption className="text-center text-[10px] text-muted-foreground">
        Positions are placed by distance along the lap, not GPS.
      </figcaption>
    </figure>
  );
}
