import { useMemo } from "react";
import { Empty, ErrorBlock, Loading, PageLoader, Panel, PositionBadge } from "@/components/Bits";
import { TrackMap } from "@/components/TrackMap";
import { teamColor } from "@/lib/colors";
import { countdown, formatClock, formatDate, formatDateTime, formatEventDate, ordinal } from "@/lib/format";
import { weekendState } from "@/lib/live";
import { useZoneMode, zoneOf, zoneShort } from "@/lib/timezone";
import { CIRCUITS } from "@/lib/staticData";
import {
  getCalendar,
  getConstructorStandings,
  getDriverStandings,
  getRaceResults,
  raceStartDate,
  type Race,
} from "@/lib/jolpica";
import { useAsync, useNow } from "@/lib/useAsync";

export function Home({ season }: { season: number }) {
  const now = useNow(30000);
  const calendar = useAsync(() => getCalendar(season), [season]);
  const drivers = useAsync(() => getDriverStandings(season), [season]);
  const teams = useAsync(() => getConstructorStandings(season), [season]);

  const { next, last } = useMemo(() => pickRaces(calendar.data ?? [], now), [calendar.data, now]);

  if (calendar.loading || drivers.loading || teams.loading) return <PageLoader label="Loading the season" />;
  if (calendar.error) return <ErrorBlock message={calendar.error} />;

  const races = calendar.data ?? [];
  const completed = races.filter((r) => (r.time ? raceStartDate(r)! < now : r.date < now.toISOString().slice(0, 10)));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <RaceBillboard race={next ?? last} isNext={Boolean(next)} now={now} season={season} total={races.length} />
        <Panel
          title={`Driver championship — ${season}`}
          action={<a href="#/drivers" className="label-caps text-[11px] text-primary hover:underline">All drivers</a>}
          bodyClassName="p-0"
        >
          {drivers.error ? (
            <div className="p-3">
              <ErrorBlock message={drivers.error} />
            </div>
          ) : (drivers.data ?? []).length === 0 ? (
            <Empty>No standings recorded for {season} yet.</Empty>
          ) : (
            <ol>
              {(drivers.data ?? []).slice(0, 10).map((s) => (
                <li
                  key={s.Driver.driverId}
                  className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-secondary/60"
                >
                  <PositionBadge position={s.position} />
                  <div className="min-w-0">
                    <a
                      href={`#/drivers/${s.Driver.driverId}`}
                      className="block truncate font-semibold hover:text-primary"
                    >
                      {s.Driver.familyName}
                      <span className="ml-1.5 font-normal text-muted-foreground">{s.Driver.code ?? ""}</span>
                    </a>
                    <span
                      className="block truncate text-[11px] text-muted-foreground"
                      style={{ borderLeft: `3px solid ${teamColor(s.Constructors[0]?.constructorId ?? "")}`, paddingLeft: 6 }}
                    >
                      {s.Constructors[0]?.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="tnum text-lg font-bold">{s.points}</span>
                    <span className="label-caps ml-1 text-[10px] text-muted-foreground">pts</span>
                    {Number(s.wins) > 0 && (
                      <span className="block text-[10px] text-muted-foreground">{s.wins} wins</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <div className="flex flex-col gap-4">
        <Panel title="Constructors" action={<a href="#/teams" className="label-caps text-[11px] text-primary hover:underline">All teams</a>} bodyClassName="p-0">
          {teams.error ? (
            <div className="p-3">
              <ErrorBlock message={teams.error} />
            </div>
          ) : (
            <ol>
              {(teams.data ?? []).slice(0, 11).map((s) => {
                const color = teamColor(s.Constructor.constructorId);
                const leader = Number((teams.data ?? [])[0]?.points) || Number(s.points) || 1;
                return (
                  <li key={s.Constructor.constructorId} className="border-b border-border/60 px-3 py-2 last:border-b-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex items-center gap-2 truncate font-semibold">
                        <span className="h-3 w-[3px] shrink-0" style={{ background: color }} aria-hidden />
                        {s.Constructor.name}
                      </span>
                      <span className="tnum text-sm font-bold">{s.points}</span>
                    </div>
                    <div className="mt-1.5 h-1 bg-muted" role="presentation">
                      <div
                        className="h-full"
                        style={{ width: `${(Number(s.points) / leader) * 100}%`, background: color }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel title="Season progress">
          <div className="flex items-baseline gap-2">
            <span className="tnum text-3xl font-bold">{completed.length}</span>
            <span className="text-sm text-muted-foreground">of {races.length} rounds run</span>
          </div>
          <div className="mt-3 flex gap-[3px]" aria-hidden>
            {races.map((r, i) => (
              <a
                key={r.round}
                href={`#/race/${season}/${r.round}`}
                title={`${ordinal(Number(r.round))} — ${r.raceName}`}
                className={`h-6 flex-1 ${i < completed.length ? "bg-primary" : "bg-secondary hover:bg-muted-foreground"}`}
              >
                <span className="sr-only">{r.raceName}</span>
              </a>
            ))}
          </div>
        </Panel>

        {last && <LastRace season={season} race={last} />}
      </div>
    </div>
  );
}

function RaceBillboard({
  race,
  isNext,
  now,
  season,
  total,
}: {
  race: Race | null;
  isNext: boolean;
  now: Date;
  season: number;
  total: number;
}) {
  const mode = useZoneMode();
  const timeZone = zoneOf(mode);
  if (!race) {
    return (
      <Panel title={isNext ? "Next race" : "Latest race"}>
        <Empty>No race found for {season}.</Empty>
      </Panel>
    );
  }
  const start = raceStartDate(race);
  const round = Number(race.round);
  const live = weekendState(race, now).live;
  return (
    <Panel
      title={isNext ? "Next race" : `Round ${round} result`}
      action={
        <a
          href={isNext ? `#/weekend/${season}/${race.round}` : `#/replay/${season}/${race.round}`}
          className="label-caps text-[11px] text-primary hover:underline"
        >
          {isNext ? "Race weekend →" : "Open replay →"}
        </a>
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{race.raceName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {race.Circuit.circuitName} · {race.Circuit.Location.locality}, {race.Circuit.Location.country}
          </p>
          <p className="tnum mt-3 text-sm">
            {start ? formatDateTime(race.date, race.time, timeZone) : formatDate(race.date)}{" "}
            <span className="text-muted-foreground">
              {zoneShort(mode)} · round {round} of {total}
            </span>
          </p>
          {live ? (
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <a
                href={`#/weekend/${season}/${race.round}`}
                className="label-caps flex items-center gap-1.5 bg-primary px-2.5 py-1 text-[11px] text-primary-foreground"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-foreground" aria-hidden />
                Live · {live.label}
              </a>
              <span className="text-[11px] text-muted-foreground">
                The lap sheet lands a few minutes after the flag.
              </span>
            </p>
          ) : isNext && start ? (
            <p className="mt-2 inline-block bg-primary px-2 py-1 text-xs font-bold uppercase tracking-wider text-primary-foreground">
              Green in {countdown(start, now)}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
            {(
              [
                ["Qualifying", race.Qualifying],
                ["Sprint", race.Sprint],
                ["FP1", race.FirstPractice],
              ] as const
            ).map(
              ([label, session]) =>
                session?.date && (
                  <span key={label}>
                    {label} {formatEventDate(session.date, session.time, timeZone)}
                    {session.time && ` ${formatClock(session.date, session.time, timeZone)}`}
                  </span>
                ),
            )}
          </div>
        </div>
        <TrackPreview circuitId={race.Circuit.circuitId} className="h-32 w-32 shrink-0 sm:h-40 sm:w-40" />
      </div>
    </Panel>
  );
}

function TrackPreview({ circuitId, className }: { circuitId: string; className?: string }) {
  const circuit = CIRCUITS.get(circuitId);
  if (!circuit) return <div className={className} />;
  return (
    <div className={className}>
      <TrackMap outline={circuit.outline} cars={[]} className="h-full w-full" />
      <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
        {circuit.outline.length ? `${(circuit.outline.length / 1000).toFixed(2)} km` : ""}
      </p>
    </div>
  );
}

function LastRace({ season, race }: { season: number; race: Race }) {
  const results = useAsync(() => getRaceResults(season, Number(race.round)), [season, race.round]);
  return (
    <Panel
      title="Last race podium"
      action={<a href={`#/race/${season}/${race.round}`} className="label-caps text-[11px] text-primary hover:underline">Full result</a>}
      bodyClassName="p-0"
    >
      {results.loading ? (
        <Loading label="Loading result" />
      ) : results.error ? (
        <div className="p-3">
          <ErrorBlock message={results.error} />
        </div>
      ) : (
        <ol className="divide-y divide-border/60">
          {(results.data ?? []).slice(0, 3).map((r) => (
            <li key={r.Driver.driverId} className="flex items-center gap-3 px-3 py-2">
              <PositionBadge position={r.position} />
              <span className="h-4 w-[3px]" style={{ background: teamColor(r.Constructor.constructorId) }} aria-hidden />
              <span className="flex-1 truncate font-semibold">{r.Driver.familyName}</span>
              <span className="tnum text-xs text-muted-foreground">{r.Time?.time ?? r.status}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function pickRaces(races: Race[], now: Date) {
  const upcoming = races.find((r) => {
    const start = raceStartDate(r);
    return start ? start > now : false;
  });
  const finished = [...races]
    .filter((r) => {
      const start = raceStartDate(r);
      return start ? start <= now : true;
    })
    .sort((a, b) => (raceStartDate(a)!.getTime() < raceStartDate(b)!.getTime() ? 1 : -1));
  return { next: upcoming ?? null, last: finished[0] ?? races.at(-1) ?? null };
}
