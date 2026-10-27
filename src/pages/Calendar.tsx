import { useMemo } from "react";
import { Empty, ErrorBlock, PageLoader, Panel } from "@/components/Bits";
import { countdown, formatClock, formatDate, formatEventDate } from "@/lib/format";
import { useZoneMode, zoneOf } from "@/lib/timezone";
import { getCalendar, raceStartDate, type Race } from "@/lib/jolpica";
import { CIRCUITS, loadWorld } from "@/lib/staticData";
import { useAsync, useNow } from "@/lib/useAsync";

/** Equirectangular projection into a 360x180 degree-space viewBox. */
function project(lat: number, lng: number) {
  return { x: lng + 180, y: 90 - lat };
}

export function CalendarPage({ season }: { season: number }) {
  const now = useNow(60000);
  const { data, loading, error } = useAsync(() => getCalendar(season), [season]);
  const races = data ?? [];

  const grouped = useMemo(() => {
    const upcoming: Race[] = [];
    const completed: Race[] = [];
    for (const race of races) {
      const start = raceStartDate(race);
      (start && start > now ? upcoming : completed).push(race);
    }
    return { upcoming, completed };
  }, [races, now]);

  if (loading) return <PageLoader label="Loading the calendar" />;
  if (error) return <ErrorBlock message={error} />;
  if (!races.length) return <Empty>No calendar found for {season}.</Empty>;

  return (
    <div className="flex flex-col gap-4">
      <Panel title={`${season} world tour`} bodyClassName="p-0">
        <WorldMap races={races} now={now} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <RaceList
          heading="Remaining rounds"
          races={grouped.upcoming}
          season={season}
          now={now}
          empty="The season is complete."
        />
        <RaceList
          heading="Completed rounds"
          races={[...grouped.completed].reverse()}
          season={season}
          now={now}
          showResult
          empty="No rounds have been run yet."
        />
      </div>
    </div>
  );
}

function WorldMap({ races, now }: { races: Race[]; now: Date }) {
  const { data: world } = useAsync(loadWorld, []);
  const land = useMemo(
    () =>
      (world ?? []).map((polygon) => {
        const coords = polygon.map(([lng, lat]) => project(lat, lng));
        return `M${coords.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L")}Z`;
      }),
    [world],
  );

  const points = useMemo(() => {
    const seen = new Set<string>();
    const out: { race: Race; x: number; y: number; next: boolean }[] = [];
    for (const race of races) {
      const id = race.Circuit.circuitId;
      if (seen.has(id)) continue;
      const circuit = CIRCUITS.get(id);
      if (!circuit || Number.isNaN(circuit.lat) || Number.isNaN(circuit.lng)) continue;
      seen.add(id);
      const start = raceStartDate(race);
      out.push({ race, ...project(circuit.lat, circuit.lng), next: Boolean(start && start > now) });
    }
    return out;
  }, [races, now]);

  return (
    <div className="relative">
      <svg viewBox="0 0 360 180" className="h-auto w-full" role="img" aria-label="Map of Grand Prix circuit locations">
        <rect width="360" height="180" fill="#080a0d" />
        {land.map((d, i) => (
          <path key={i} d={d} fill="#161c25" stroke="#242c38" strokeWidth={0.25} />
        ))}
        <line x1="0" y1="90" x2="360" y2="90" stroke="#ffffff10" strokeWidth={0.3} />
        {points.map(({ race, x, y, next }) => (
          <a key={race.round} href={`#/race/${race.season}/${race.round}`} aria-label={race.raceName}>
            <circle
              cx={x}
              cy={y}
              r={next ? 3 : 2.2}
              fill={next ? "#e10600" : "#8b949f"}
              stroke="#07080a"
              strokeWidth={0.5}
            />
            {next && <circle cx={x} cy={y} r={5.5} fill="none" stroke="#e10600" strokeWidth={0.4} opacity={0.5} />}
          </a>
        ))}
      </svg>
      <div className="absolute bottom-2 left-3 flex gap-4 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden /> upcoming
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-muted-foreground" aria-hidden /> completed
        </span>
      </div>
    </div>
  );
}

function RaceList({
  heading,
  races,
  season,
  now,
  showResult = false,
  empty,
}: {
  heading: string;
  races: Race[];
  season: number;
  now: Date;
  showResult?: boolean;
  empty: string;
}) {
  const timeZone = zoneOf(useZoneMode());
  return (
    <Panel title={heading} bodyClassName="p-0">
      {races.length === 0 ? (
        <div className="p-3">
          <Empty>{empty}</Empty>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {races.map((race) => {
            const circuit = CIRCUITS.get(race.Circuit.circuitId);
            const start = raceStartDate(race);
            return (
              <li key={race.round} className="grid grid-cols-[2.75rem_1fr_auto] items-center gap-3 px-3 py-2.5 hover:bg-secondary/60">
                <span className="tnum text-xs text-muted-foreground">R{race.round}</span>
                <div className="min-w-0">
                  <a href={`#/race/${season}/${race.round}`} className="block truncate font-semibold hover:text-primary">
                    {race.raceName}
                  </a>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {circuit?.locality ?? race.Circuit.Location.locality}, {circuit?.country ?? race.Circuit.Location.country}
                    {circuit?.outline.length ? ` · ${(circuit.outline.length / 1000).toFixed(2)} km` : ""}
                  </span>
                </div>
                <div className="text-right">
                  <span className="tnum block text-xs">
                    {race.time ? formatEventDate(race.date, race.time, timeZone) : formatDate(race.date)}
                    {race.time && (
                      <span className="text-muted-foreground"> · {formatClock(race.date, race.time, timeZone)}</span>
                    )}
                  </span>
                  {showResult ? (
                    <span className="label-caps flex justify-end gap-2 text-[10px] text-primary">
                      <a href={`#/replay/${season}/${race.round}`} className="hover:underline">
                        replay
                      </a>
                      <span aria-hidden className="text-muted-foreground">·</span>
                      <a href={`#/qualifying/${season}/${race.round}`} className="hover:underline">
                        qualifying
                      </a>
                    </span>
                  ) : (
                    start && <span className="text-[10px] text-muted-foreground">{countdown(start, now)}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
