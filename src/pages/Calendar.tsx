import { useMemo } from "react";
import { Empty, ErrorBlock, PageLoader, Panel } from "@/components/Bits";
import { WorldMap, type WorldPoint } from "@/components/WorldMap";
import { countdown, formatClock, formatDate, formatEventDate } from "@/lib/format";
import { useZoneMode, zoneOf } from "@/lib/timezone";
import { getCalendar, raceStartDate, type Race } from "@/lib/jolpica";
import { CIRCUITS } from "@/lib/staticData";
import { useAsync, useNow } from "@/lib/useAsync";

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
        <RaceMap races={races} now={now} />
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

function RaceMap({ races, now }: { races: Race[]; now: Date }) {
  const points = useMemo(() => {
    const seen = new Set<string>();
    const out: WorldPoint[] = [];
    for (const race of races) {
      const id = race.Circuit.circuitId;
      if (seen.has(id)) continue;
      const circuit = CIRCUITS.get(id);
      if (!circuit) continue;
      seen.add(id);
      const start = raceStartDate(race);
      out.push({
        id,
        lat: circuit.lat,
        lng: circuit.lng,
        label: `${race.raceName} — ${circuit.locality}, ${circuit.country}`,
        href: `#/race/${race.season}/${race.round}`,
        highlight: Boolean(start && start > now),
      });
    }
    return out;
  }, [races, now]);

  return (
    <WorldMap
      points={points}
      ariaLabel="Map of Grand Prix circuit locations"
      legend={[
        { label: "upcoming", highlight: true },
        { label: "completed", highlight: false },
      ]}
    />
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
                  {circuit ? (
                    <a
                      href={`#/circuits/${circuit.id}`}
                      className="block truncate text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {circuit.locality}, {circuit.country}
                      {circuit.outline.length ? ` · ${(circuit.outline.length / 1000).toFixed(2)} km` : ""}
                    </a>
                  ) : (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {race.Circuit.Location.locality}, {race.Circuit.Location.country}
                    </span>
                  )}
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
