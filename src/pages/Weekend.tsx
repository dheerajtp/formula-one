import { Empty, ErrorBlock, Loading, PageLoader, Panel } from "@/components/Bits";
import { TrackMap } from "@/components/TrackMap";
import { teamColor } from "@/lib/colors";
import { countdown, formatClock, formatEventDate, formatLapTime, parseLapTime } from "@/lib/format";
import {
  IN_PROGRESS_NOTE,
  LIVE_FEED_UNAVAILABLE,
  sessionPhase,
  useTimingArrival,
  weekendState,
  worthWatching,
  pickWeekend,
  type SessionPhase,
  type WeekendSession,
  type WeekendState,
} from "@/lib/live";
import { getCalendar, getQualifying, raceStartDate, type Race } from "@/lib/jolpica";
import { CIRCUITS, TYRES, WEATHER, compoundAppearance } from "@/lib/staticData";
import { useZoneMode, zoneOf, zoneShort } from "@/lib/timezone";
import { useAsync, useNow } from "@/lib/useAsync";
import { describeForecast, forecastFor } from "@/lib/weather";

export function WeekendPage({ season, round }: { season: number; round?: number }) {
  const now = useNow(30000);
  const calendar = useAsync(() => getCalendar(season), [season]);

  if (calendar.loading) return <PageLoader label="Loading the weekend" />;
  if (calendar.error) return <ErrorBlock message={calendar.error} />;

  const races = calendar.data ?? [];
  const pinned = round == null ? null : races.find((r) => Number(r.round) === round);
  if (round != null && !pinned) return <ErrorBlock message={`Round ${round} of ${season} was not found.`} />;

  const state = pinned ? weekendState(pinned, now) : pickWeekend(races, now);
  if (!state) return <Empty>Nothing is scheduled for {season}.</Empty>;

  return <Weekend season={season} state={state} now={now} total={races.length} />;
}

const PHASE_STYLE: Record<SessionPhase, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-primary text-primary-foreground" },
  done: { label: "Done", className: "bg-secondary text-muted-foreground" },
  upcoming: { label: "Upcoming", className: "border border-border text-muted-foreground" },
};

function Weekend({
  season,
  state,
  now,
  total,
}: {
  season: number;
  state: WeekendState;
  now: Date;
  total: number;
}) {
  const mode = useZoneMode();
  const timeZone = zoneOf(mode);
  const race = state.race;
  const round = Number(race.round);
  const circuit = CIRCUITS.get(race.Circuit.circuitId);
  const raceStart = raceStartDate(race);
  const sessions = state.sessions;
  const raceSession = sessions.find((s) => s.kind === "Race");
  const racePhase = raceSession ? sessionPhase(raceSession, now) : "upcoming";
  const qualiSession = sessions.find((s) => s.kind === "Qualifying");
  const qualiDone = qualiSession ? sessionPhase(qualiSession, now) === "done" : false;

  // The grid only exists once qualifying has closed, so refetch on that flip alone.
  const grid = useAsync(
    () => (qualiDone ? getQualifying(season, round) : Promise.resolve([])),
    [season, round, qualiDone],
  );
  const timing = useTimingArrival(season, round, worthWatching(raceStart, now));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Panel
          title={`Round ${round} of ${total} · ${season}`}
          action={
            <a href={`#/race/${season}/${round}`} className="label-caps text-[11px] text-primary hover:underline">
              Race entry →
            </a>
          }
          bodyClassName="p-0"
        >
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{race.raceName}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {race.Circuit.circuitName} · {race.Circuit.Location.locality}, {race.Circuit.Location.country}
              </p>

              {state.live ? (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="label-caps flex items-center gap-1.5 bg-primary px-2 py-1 text-[11px] text-primary-foreground">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-foreground" aria-hidden />
                    Live
                  </span>
                  <span className="font-semibold">{state.live.label} is running</span>
                  {state.live.time ? (
                    <span className="tnum text-muted-foreground">
                      from {formatClock(isoOf(state.live.start), state.live.time, timeZone)}
                    </span>
                  ) : null}
                </p>
              ) : state.next && raceStart && raceStart > now ? (
                <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="label-caps text-[10px] text-muted-foreground">
                    Next up · {state.next.label}
                  </span>
                  <span className="tnum text-lg font-bold">{countdown(state.next.start, now)}</span>
                  <span className="tnum text-sm text-muted-foreground">
                    {when(state.next.start, state.next.time, timeZone)} {zoneShort(mode)}
                  </span>
                </p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  This weekend is complete ·{" "}
                  <a href={`#/replay/${season}/${round}`} className="text-primary hover:underline">
                    open the replay
                  </a>
                </p>
              )}

              <p className="mt-3 text-[11px] text-muted-foreground">
                Lights out{" "}
                <span className="tnum">
                  {raceStart ? when(raceStart, race.time, timeZone) : race.date}
                </span>{" "}
                {zoneShort(mode)}
              </p>
            </div>
            {circuit?.outline.length ? (
              <div className="h-32 w-32 shrink-0 sm:h-36 sm:w-36">
                <TrackMap outline={circuit.outline} cars={[]} className="h-full w-full" />
                <p className="tnum text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                  {(circuit.outline.length / 1000).toFixed(2)} km
                </p>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Weekend schedule" bodyClassName="p-0">
          <ul className="divide-y divide-border">
            {sessions.map((session) => {
              const phase = sessionPhase(session, now);
              const style = PHASE_STYLE[phase];
              return (
                <li key={session.kind} className="flex items-center gap-3 px-3 py-2">
                  <span
                    className={`label-caps w-16 shrink-0 px-1.5 py-0.5 text-center text-[9px] ${style.className}`}
                  >
                    {phase === "live" ? (
                      <span className="flex items-center justify-center gap-1">
                        <span className="h-1 w-1 animate-pulse rounded-full bg-primary-foreground" aria-hidden />
                        Live
                      </span>
                    ) : (
                      style.label
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{session.label}</span>
                    <span className="tnum block truncate text-[11px] text-muted-foreground">
                      {when(session.start, session.time, timeZone)}
                    </span>
                  </span>
                  {phase === "done" && <SessionLink season={season} round={round} session={session} />}
                </li>
              );
            })}
          </ul>
        </Panel>

        <TimingPanel
          season={season}
          round={round}
          racePhase={racePhase}
          polling={worthWatching(raceStart, now)}
          timing={timing}
          now={now}
        />
      </div>

      <div className="flex flex-col gap-4">
        <Panel
          title="Starting grid"
          action={
            <a href={`#/qualifying/${season}/${round}`} className="label-caps text-[11px] text-primary hover:underline">
              Qualifying board →
            </a>
          }
          bodyClassName="p-0"
        >
          {qualiDone === false ? (
            <Empty>
              {state.live || state.next
                ? "Qualifying has not run yet. The grid appears here as soon as it closes."
                : "No qualifying result published for this round."}
            </Empty>
          ) : grid.loading ? (
            <Loading label="Loading qualifying" />
          ) : grid.error ? (
            <div className="p-3">
              <ErrorBlock message={grid.error} />
            </div>
          ) : (grid.data ?? []).length === 0 ? (
            <Empty>No qualifying result published for this round.</Empty>
          ) : (
            <ol className="divide-y divide-border/60">
              {(grid.data ?? []).slice(0, 10).map((q) => (
                <li key={q.Driver.driverId} className="flex items-center gap-2.5 px-3 py-1.5">
                  <span className="tnum w-5 text-sm text-muted-foreground">{q.position}</span>
                  <span
                    className="h-4 w-[3px] shrink-0"
                    style={{ background: teamColor(q.Constructor.constructorId) }}
                    aria-hidden
                  />
                  <a
                    href={`#/drivers/${q.Driver.driverId}`}
                    className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-primary"
                  >
                    {q.Driver.familyName}
                    <span className="ml-1.5 font-normal text-muted-foreground">{q.Driver.code ?? ""}</span>
                  </a>
                  <span className="tnum text-xs text-muted-foreground">
                    {formatLapTime(parseLapTime(q.Q3 ?? q.Q2 ?? q.Q1))}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {(grid.data ?? []).length > 0 && (
            <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              Where the field sets off. The order the race produces is what the replay shows lap by lap.
            </p>
          )}
        </Panel>

        <Conditions race={race} circuit={circuit} raceStart={raceStart} now={now} />

        <Panel title="What this page can honestly show">
          <p className="text-[11px] leading-relaxed text-muted-foreground">{LIVE_FEED_UNAVAILABLE}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{IN_PROGRESS_NOTE}</p>
        </Panel>
      </div>
    </div>
  );
}

function SessionLink({
  season,
  round,
  session,
}: {
  season: number;
  round: number;
  session: WeekendSession;
}) {
  if (session.kind === "Qualifying") {
    return (
      <a href={`#/qualifying/${season}/${round}`} className="label-caps text-[10px] text-primary hover:underline">
        Board →
      </a>
    );
  }
  if (session.kind === "Race") {
    return (
      <a href={`#/replay/${season}/${round}`} className="label-caps text-[10px] text-primary hover:underline">
        Replay →
      </a>
    );
  }
  return <span className="label-caps text-[10px] text-muted-foreground">Practice</span>;
}

/**
 * The part that replaces refreshing the page: while the race runs, this polls the
 * feed for its lap sheet and hands over to the replay the moment it exists.
 */
function TimingPanel({
  season,
  round,
  racePhase,
  polling,
  timing,
  now,
}: {
  season: number;
  round: number;
  racePhase: SessionPhase;
  polling: boolean;
  timing: { landed: boolean; lastChecked: Date | null; probeFailed: boolean };
  now: Date;
}) {
  const checked = timing.lastChecked ? timing.lastChecked.toLocaleTimeString() : null;
  return (
    <Panel title="Lap timing" bodyClassName="p-3">
      {timing.landed ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="label-caps bg-primary px-2 py-1 text-[10px] text-primary-foreground">In</span>
          <p className="min-w-0 flex-1 text-sm">
            The classification is published. The replay is built from every lap the feed recorded.
          </p>
          <a
            href={`#/replay/${season}/${round}`}
            className="label-caps border border-primary px-3 py-1.5 text-[11px] text-primary hover:bg-primary hover:text-primary-foreground"
          >
            Open replay →
          </a>
        </div>
      ) : racePhase === "upcoming" ? (
        <p className="text-sm text-muted-foreground">
          Nothing has been flagged yet this weekend. Once the race ends the feed publishes its lap sheet a few minutes
          later, and this page picks it up without a refresh.
        </p>
      ) : !polling ? (
        <p className="text-sm text-muted-foreground">
          No lap sheet was ever published for this round. Some early seasons have results but no lap-by-lap timing, so
          there is nothing for a replay to be built from.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            {racePhase === "live"
              ? "The Grand Prix is running. Positions are not published live on a free feed, so this page waits for the official sheet instead of guessing at it."
              : "The race has finished, but the feed has not written its lap sheet yet. That usually lands within a few minutes of the flag."}
          </p>
          <p className="tnum flex items-center gap-2 text-[11px] text-muted-foreground" role="status">
            <span
              className={`h-1.5 w-1.5 rounded-full ${timing.probeFailed ? "bg-muted-foreground" : "animate-pulse bg-primary"}`}
              aria-hidden
            />
            {checked
              ? `Checked ${checked}${timing.probeFailed ? " · feed unreachable, retrying" : " · not published yet"}`
              : "Checking the feed now…"}
          </p>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        <span className="label-caps">Now</span> <span className="tnum">{now.toLocaleTimeString()}</span>
      </p>
    </Panel>
  );
}

function Conditions({
  race,
  circuit,
  raceStart,
  now,
}: {
  race: Race;
  circuit: ReturnType<typeof CIRCUITS.get>;
  raceStart: Date | null;
  now: Date;
}) {
  const mode = useZoneMode();
  const timeZone = zoneOf(mode);
  const allocation = TYRES.get(race.raceName);
  const recorded = WEATHER.get(`${race.Circuit.circuitId}:${race.date}`);
  const upcoming = Boolean(raceStart && raceStart > now);
  const forecast = useAsync(
    () =>
      upcoming && circuit && raceStart ? forecastFor(circuit, raceStart) : Promise.resolve(null),
    [circuit?.id, raceStart?.getTime(), upcoming],
  );

  return (
    <Panel title="Conditions and tyres">
      <div className="space-y-3">
        <div>
          <p className="label-caps text-[10px] text-muted-foreground">Nominated compounds</p>
          {allocation ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {[allocation.hard, allocation.medium, allocation.soft].map((code) => {
                const look = compoundAppearance(code, allocation);
                return (
                  <span
                    key={code}
                    className="tnum rounded-full px-2 py-0.5 text-[11px] font-bold text-black"
                    style={{ background: look.color }}
                  >
                    {look.label} {code}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Not published for this round yet — the nomination comes out in the week before it.
            </p>
          )}
        </div>

        <div>
          <p className="label-caps text-[10px] text-muted-foreground">
            {recorded
              ? "Recorded at the track"
              : upcoming
                ? `Forecast for lights out · ${zoneShort(mode)}`
                : "Weather"}
          </p>
          {recorded ? (
            <p className="tnum mt-1 text-sm">
              {recorded.tempMax != null && `${Math.round(recorded.tempMax)}°C max`}
              {recorded.precipitation != null &&
                ` · ${recorded.precipitation > 0 ? `${recorded.precipitation} mm rain` : "dry"}`}
              {recorded.windMax != null && ` · gusts ${Math.round(recorded.windMax)} km/h`}
            </p>
          ) : forecast.loading && upcoming ? (
            <Loading label="Loading forecast" />
          ) : forecast.error ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{forecast.error}</p>
          ) : forecast.data?.around.length ? (
            <>
              <p className="tnum mt-1 text-sm">{describeForecast(forecast.data)}</p>
              <ul className="mt-1.5 space-y-0.5">
                {forecast.data.around.map((point) => (
                  <li key={point.time.toISOString()} className="tnum flex gap-3 text-[11px] text-muted-foreground">
                    <span>
                      {point.time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone })}
                    </span>
                    <span>{Math.round(point.tempC)}°C</span>
                    <span>{Math.round(point.rainChance)}% rain</span>
                    <span>{Math.round(point.windKph)} km/h</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {upcoming
                ? "Too far ahead for a forecast — it appears in the week of the race."
                : "No weather recorded for this round."}
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

/* A session start is a Date here, but the formatters take the feed's date/time pair. */
const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/** "31 Oct 2026 20:00" in the visitor's zone; the date alone when the feed published no clock. */
function when(start: Date, time: string | undefined, timeZone: string) {
  const day = formatEventDate(isoOf(start), time, timeZone);
  const clock = formatClock(isoOf(start), time, timeZone);
  return clock ? `${day} ${clock}` : day;
}
