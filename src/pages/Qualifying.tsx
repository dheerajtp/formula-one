import { useState } from "react";
import { Empty, ErrorBlock, PageLoader, Panel, PositionBadge } from "@/components/Bits";
import { TrackMap } from "@/components/TrackMap";
import { teamColor } from "@/lib/colors";
import { formatClock, formatEventDate, parseLapTime } from "@/lib/format";
import { useZoneMode, zoneOf } from "@/lib/timezone";
import { getCalendar, getQualifying, type QualifyingResult, type Race } from "@/lib/jolpica";
import { CIRCUITS } from "@/lib/staticData";
import { useAsync } from "@/lib/useAsync";

const SEGMENTS = ["Q1", "Q2", "Q3"] as const;
type Segment = (typeof SEGMENTS)[number];
type View = "All" | Segment;

export function QualifyingPage({ season, round }: { season: number; round: number }) {
  const calendar = useAsync(() => getCalendar(season), [season]);
  const race = (calendar.data ?? []).find((r) => Number(r.round) === round);

  if (calendar.loading) return <PageLoader label="Loading qualifying" />;
  if (calendar.error) return <ErrorBlock message={calendar.error} />;
  if (!race) return <ErrorBlock message={`Round ${round} of ${season} was not found.`} />;

  return <QualifyingBoard season={season} round={round} race={race} />;
}

/**
 * The qualifying result, split by segment.
 *
 * Order is the official classification. A gap is measured against the fastest lap of the
 * segment being viewed, which is the only comparison the feed supports: no free source
 * publishes qualifying lap-by-lap timing, so there is nothing to reconstruct a replay from.
 */
export function QualifyingBoard({
  season,
  round,
  race,
}: {
  season: number;
  round: number;
  race?: Race;
}) {
  const [view, setView] = useState<View>("All");
  const timeZone = zoneOf(useZoneMode());
  const { data, loading, error } = useAsync(() => getQualifying(season, round), [season, round]);
  const circuit = race ? CIRCUITS.get(race.Circuit.circuitId) : undefined;

  if (loading) return <PageLoader label="Loading qualifying" />;
  if (error) return <ErrorBlock message={error} />;
  const rows = data ?? [];
  if (!rows.length)
    return (
      <Panel title={race?.raceName ?? "Qualifying"}>
        <Empty>
          No qualifying result is recorded for this round yet.
          {race?.Qualifying?.date
            ? ` Qualifying runs ${qualifyingStamp(race, timeZone)}.`
            : ""}
        </Empty>
      </Panel>
    );

  const present = SEGMENTS.filter((segment) => rows.some((r) => r[segment]));
  const final = present[present.length - 1];
  const fastestIn = new Map(
    present.map((segment) => [
      segment,
      Math.min(
        ...rows.map((r) => parseLapTime(r[segment])).filter((ms): ms is number => ms != null),
        Infinity,
      ),
    ]),
  );
  // A segment picked on a previous round need not exist here, so fall back to the full board.
  const active: View = view !== "All" && !present.includes(view) ? "All" : view;
  const shown = active === "All" ? rows : rows.filter((r) => r[active]);
  // A single-session era has nothing to split, so only the full classification is offered.
  const views: View[] = present.length > 1 ? ["All", ...present] : ["All"];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-caps text-[11px] text-muted-foreground">
            Round {round} · {season} · Qualifying
          </p>
          <h1 className="mt-0.5 text-xl font-bold leading-tight sm:text-2xl">
            {race?.raceName ?? `Round ${round}`} — qualifying
          </h1>
          <p className="text-xs text-muted-foreground">
            {circuit ? `${circuit.name} · ${circuit.locality}, ${circuit.country}` : race?.Circuit.circuitName}
            {race?.Qualifying?.date ? ` · ${qualifyingStamp(race, timeZone)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SessionLink href={`#/race/${season}/${round}`} label="Race meeting" />
          <SessionLink href={`#/replay/${season}/${round}`} label="Race replay" />
          {circuit && <TrackMap outline={circuit.outline} cars={[]} className="h-14 w-14 border border-border bg-card" />}
        </div>
      </div>

      <Panel
        title={active === "All" ? "Classification" : `${active} — cars that set a time`}
        action={
          <div className="flex border border-border" role="group" aria-label="Qualifying segment">
            {views.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                aria-pressed={option === active}
                className={`label-caps px-2.5 py-1 text-[10px] transition-colors ${
                  option === active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="label-caps border-b border-border text-left text-[10px] text-muted-foreground">
                <th className="px-3 py-2 font-medium">Pos</th>
                <th className="px-3 py-2 font-medium">Driver</th>
                <th className="px-2 py-2 text-right font-medium">Team</th>
                {present.map((segment) => (
                  <th key={segment} className="px-3 py-2 text-right font-medium">
                    {segment}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Gap</th>
                {present.length > 1 && <th className="px-3 py-2 text-right font-medium">Last ran</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((q) => {
                const last = lastSegment(q, present);
                // Each gap is measured inside the segment it belongs to, which is how a
                // qualifying board is read: a Q2 time is never compared with a Q3 lap.
                const refSegment: Segment = active === "All" ? last : active;
                const timeMs = parseLapTime(q[refSegment]);
                const reference = fastestIn.get(refSegment) ?? Infinity;
                const gap = timeMs != null && Number.isFinite(reference) ? timeMs - reference : null;
                return (
                  <tr
                    key={q.Driver.driverId}
                    className="border-b border-border/50 last:border-b-0 hover:bg-secondary/50"
                  >
                    <td className="px-3 py-1.5">
                      <PositionBadge position={q.position} />
                    </td>
                    <td className="px-3 py-1.5">
                      <a href={`#/drivers/${q.Driver.driverId}`} className="font-semibold hover:text-primary">
                        {q.Driver.familyName}
                      </a>
                      <span className="ml-1.5 text-xs text-muted-foreground">{q.Driver.code}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-xs text-muted-foreground">
                      <span
                        className="mr-1.5 inline-block h-2.5 w-[3px] align-middle"
                        style={{ background: teamColor(q.Constructor.constructorId) }}
                        aria-hidden
                      />
                      {q.Constructor.name}
                    </td>
                    {present.map((segment) => (
                      <td
                        key={segment}
                        className={`tnum px-3 py-1.5 text-right ${
                          segment === last ? "text-foreground" : "text-muted-foreground/70"
                        }`}
                      >
                        {q[segment] ?? "—"}
                      </td>
                    ))}
                    <td className="tnum px-3 py-1.5 text-right">
                      {gap == null
                        ? "—"
                        : gap <= 0
                          ? Number(q.position) === 1
                            ? "POLE"
                            : `FASTEST ${refSegment}`
                          : gapText(gap)}
                    </td>
                    {present.length > 1 && (
                      <td className="px-3 py-1.5 text-right">
                        <span className="label-caps text-[10px] text-muted-foreground">
                          {last === final ? final : `OUT ${last}`}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-[11px] text-muted-foreground">
        {active === "All"
          ? "Times are each driver's best lap in every segment they reached. Each gap is measured against the fastest lap of the segment that driver last ran, so a Q2 lap is never compared with a Q3 lap."
          : `Gap is measured against the fastest lap set in ${active}.`}{" "}
        Qualifying lap-by-lap timing is not published on a free feed, so the session is shown as the official board
        rather than replayed.
      </p>
    </div>
  );
}

/** The segment a driver's last timed lap came from, which is also where their session ended. */
/** "11 Apr 2026 from 15:00" in whichever clock the visitor is reading the site in. */
function qualifyingStamp(race: Race, timeZone: string): string {
  const session = race.Qualifying;
  if (!session?.date) return "";
  const clock = session.time ? formatClock(session.date, session.time, timeZone) : "";
  return `${formatEventDate(session.date, session.time, timeZone)}${clock ? ` from ${clock}` : ""}`;
}

function lastSegment(row: QualifyingResult, present: readonly Segment[]): Segment {
  for (let i = present.length - 1; i >= 0; i--) {
    if (row[present[i]]) return present[i];
  }
  return present[0] ?? "Q1";
}

/** Qualifying gaps are quoted to the thousandth, unlike race intervals. */
function gapText(millis: number): string {
  return `+${(millis / 1000).toFixed(3)}`;
}

function SessionLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="label-caps border border-border bg-secondary px-2.5 py-1.5 text-[10px] text-muted-foreground hover:border-muted-foreground hover:text-foreground"
    >
      {label}
    </a>
  );
}
