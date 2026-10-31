import { useMemo, useState } from "react";
import { Empty, ErrorBlock, Loading, Panel } from "@/components/Bits";
import { teamColor } from "@/lib/colors";
import { formatDate, formatGapSeconds, formatLapTime } from "@/lib/format";
import { getRaceResults, getSeasonFastestLaps, getSeasonPitStops, type SeasonPitStop } from "@/lib/jolpica";
import {
  buildLapAwards,
  buildLapRecords,
  buildPitLaneTable,
  buildRoundLapTable,
  loadCrewStops,
  seasonLapHighlights,
  type LapRecord,
} from "@/lib/records";
import { useAsync } from "@/lib/useAsync";

const TABS = ["Lap records", "Pit stops"] as const;
type Tab = (typeof TABS)[number];

/** Presentation limit for the crew leaderboard. */
const CREW_LIMIT = 20;

function secs(value: number): string {
  return `${value.toFixed(3)} s`;
}

function TeamBar({ constructorId }: { constructorId: string }) {
  return (
    <span
      className="mr-1.5 inline-block h-2.5 w-[3px] align-middle"
      style={{ background: teamColor(constructorId) }}
      aria-hidden
    />
  );
}

const TH = "px-3 py-2 font-medium";
const THR = "px-3 py-2 text-right font-medium";
const HEAD_ROW = "label-caps border-b border-border text-left text-[10px] text-muted-foreground";
const ROW = "border-b border-border/50 last:border-b-0 hover:bg-secondary/50";

export function RecordsPage({ season }: { season: number }) {
  const [tab, setTab] = useState<Tab>("Lap records");
  return (
    <div className="flex flex-col gap-4">
      <Panel bodyClassName="p-0">
        <div className="p-4">
          <p className="label-caps text-[11px] text-muted-foreground">Season {season}</p>
          <h1 className="mt-0.5 text-2xl font-bold leading-tight sm:text-3xl">Records — {season}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Fastest laps here are official <strong>race</strong> laps, not qualifying — see each race&apos;s Qualifying
            tab for those. Pit-lane transit (pit entry to pit exit) is not the same as the stationary crew time.
          </p>
        </div>
        <div role="tablist" aria-label="Record sections" className="flex overflow-x-auto border-t border-border">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() => setTab(item)}
              className={`label-caps shrink-0 border-b-2 px-4 py-2 text-[11px] transition-colors ${
                tab === item
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </Panel>
      {tab === "Lap records" && <LapRecordsTab season={season} />}
      {tab === "Pit stops" && (
        <div className="flex flex-col gap-4">
          <CrewStops season={season} />
          <PitLaneTransit season={season} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ laps */

function LapRecordsTab({ season }: { season: number }) {
  const { data, loading, error } = useAsync(() => getSeasonFastestLaps(season), [season]);
  const records = useMemo(() => buildLapRecords(data ?? []), [data]);
  const awards = useMemo(() => buildLapAwards(records), [records]);
  const highlights = useMemo(() => seasonLapHighlights(records), [records]);
  const byRound = useMemo(() => [...records].sort((a, b) => a.round - b.round), [records]);
  const latest = useMemo(
    () => [...records].sort((a, b) => b.date.localeCompare(a.date) || b.round - a.round)[0] ?? null,
    [records],
  );
  const [round, setRound] = useState<number | null>(null);

  if (loading) return <Loading label="Loading the season's fastest laps" />;
  if (error) return <ErrorBlock message={error} />;
  if (!records.length) {
    return (
      <Panel title="Lap records">
        <Empty>No official race fastest laps have been recorded for {season} yet.</Empty>
      </Panel>
    );
  }

  const selectedRound = round ?? latest?.round ?? byRound[0].round;
  const selected = byRound.find((r) => r.round === selectedRound) ?? byRound[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Shortest race lap">
          {highlights.shortest && <HighlightBody record={highlights.shortest} value={highlights.shortest.time} />}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Circuit length drives this figure — a short track gives a short lap. It is not a pace ranking.
          </p>
        </Panel>
        <Panel title="Fastest average speed">
          {highlights.fastestAverageSpeed ? (
            <HighlightBody
              record={highlights.fastestAverageSpeed}
              value={`${highlights.fastestAverageSpeed.avgSpeedKph} km/h`}
            />
          ) : (
            <Empty>The feed publishes no fastest-lap average speeds for {season}.</Empty>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Average speed over the fastest lap is the comparable figure across circuits, shown only where the feed
            publishes it.
          </p>
        </Panel>
      </div>

      <Panel title="Fastest-lap awards" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <caption className="sr-only">Fastest-lap awards by driver in {season}</caption>
            <thead>
              <tr className={HEAD_ROW}>
                <th className={TH}>Driver</th>
                <th className={TH}>Team</th>
                <th className={THR}>Awards</th>
                <th className={THR}>Best lap</th>
              </tr>
            </thead>
            <tbody>
              {awards.map((award) => (
                <tr key={award.driverId} className={ROW}>
                  <td className="px-3 py-1.5">
                    <a href={`#/drivers/${award.driverId}`} className="font-semibold hover:text-primary">
                      {award.driverName}
                    </a>
                    <span className="ml-1.5 text-xs text-muted-foreground">{award.code}</span>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    <TeamBar constructorId={award.constructorId} />
                    {award.team}
                  </td>
                  <td className="tnum px-3 py-1.5 text-right font-semibold">{award.awards}</td>
                  <td className="tnum px-3 py-1.5 text-right text-muted-foreground">{award.bestTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          Best lap is the driver&apos;s quickest award lap; it compares different circuits and is shown for reference only.
        </p>
      </Panel>

      <Panel title={`Fastest lap of each race · ${byRound.length} rounds`} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Official fastest race lap of every round in {season}, by round</caption>
            <thead>
              <tr className={HEAD_ROW}>
                <th className={TH}>Rd</th>
                <th className={TH}>Race</th>
                <th className={TH}>Driver</th>
                <th className={TH}>Team</th>
                <th className={THR}>Time</th>
                <th className={THR}>Lap</th>
                <th className={THR}>Avg speed</th>
              </tr>
            </thead>
            <tbody>
              {byRound.map((r) => (
                <tr key={r.round} className={`${ROW} ${r.round === selected.round ? "bg-secondary/60" : ""}`}>
                  <td className="tnum px-3 py-1.5 text-muted-foreground">{r.round}</td>
                  <td className="px-3 py-1.5">
                    <a href={`#/race/${r.season}/${r.round}/fastest-laps`} className="hover:text-primary">
                      {r.raceName}
                    </a>
                  </td>
                  <td className="px-3 py-1.5">
                    <a href={`#/drivers/${r.driverId}`} className="font-semibold hover:text-primary">
                      {r.code}
                    </a>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    <TeamBar constructorId={r.constructorId} />
                    {r.team}
                  </td>
                  <td className="tnum px-3 py-1.5 text-right">{r.time}</td>
                  <td className="tnum px-3 py-1.5 text-right text-muted-foreground">{r.lap}</td>
                  <td className="tnum px-3 py-1.5 text-right text-muted-foreground">
                    {r.avgSpeedKph === null ? "—" : `${r.avgSpeedKph} km/h`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          Listed by round. Lap times from different circuits are not comparable as pace.
        </p>
      </Panel>

      <Panel
        title="Every driver's fastest lap in one race"
        action={
          <label className="flex items-center gap-2 text-[11px]">
            <span className="label-caps text-[10px] text-muted-foreground">Round</span>
            <select
              value={selected.round}
              onChange={(event) => setRound(Number(event.target.value))}
              className="max-w-[14rem] border border-border bg-secondary px-2 py-1 text-xs"
            >
              {byRound.map((r) => (
                <option key={r.round} value={r.round}>
                  R{r.round} · {r.raceName}
                </option>
              ))}
            </select>
          </label>
        }
        bodyClassName="p-0"
      >
        <RoundLapTable season={season} round={selected.round} />
      </Panel>
    </div>
  );
}

function HighlightBody({ record, value }: { record: LapRecord; value: string }) {
  return (
    <div>
      <p className="tnum text-2xl font-bold">{value}</p>
      <p className="mt-1 text-sm">
        <a href={`#/drivers/${record.driverId}`} className="font-semibold hover:text-primary">
          {record.driverName}
        </a>{" "}
        <span className="text-muted-foreground">· {record.team}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        <a href={`#/race/${record.season}/${record.round}`} className="hover:text-primary">
          {record.raceName}
        </a>{" "}
        · lap {record.lap} · {formatDate(record.date)}
      </p>
    </div>
  );
}

function RoundLapTable({ season, round }: { season: number; round: number }) {
  const { data, loading, error } = useAsync(() => getRaceResults(season, round), [season, round]);
  const rows = useMemo(() => buildRoundLapTable(data ?? []), [data]);
  if (loading) return <div className="px-3"><Loading label="Loading race results" /></div>;
  if (error) return <div className="p-3"><ErrorBlock message={error} /></div>;
  if (!rows.length) {
    return <div className="px-3"><Empty>Results with fastest laps have not been published for this round.</Empty></div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">Official fastest lap of every driver in round {round}, quickest first</caption>
        <thead>
          <tr className={HEAD_ROW}>
            <th className={TH}>#</th>
            <th className={TH}>Driver</th>
            <th className={TH}>Team</th>
            <th className={THR}>Finished</th>
            <th className={THR}>Time</th>
            <th className={THR}>Gap</th>
            <th className={THR}>Lap</th>
            <th className={THR}>Avg speed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.driverId} className={ROW}>
              <td className="tnum px-3 py-1.5 text-muted-foreground">{row.rank}</td>
              <td className="px-3 py-1.5">
                <a href={`#/drivers/${row.driverId}`} className="font-semibold hover:text-primary">
                  {row.code}
                </a>
                <span className="ml-1.5 text-xs text-muted-foreground">{row.driverName}</span>
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">
                <TeamBar constructorId={row.constructorId} />
                {row.team}
              </td>
              <td className="tnum px-3 py-1.5 text-right text-muted-foreground">
                {row.racePosition === null ? "—" : `P${row.racePosition}`}
              </td>
              <td className={`tnum px-3 py-1.5 text-right ${row.rank === 1 ? "font-semibold text-[#b46cff]" : ""}`}>
                {formatLapTime(row.millis)}
              </td>
              <td className="tnum px-3 py-1.5 text-right text-muted-foreground">
                {row.rank === 1 ? "—" : formatGapSeconds(row.gapMillis)}
              </td>
              <td className="tnum px-3 py-1.5 text-right text-muted-foreground">{row.lap}</td>
              <td className="tnum px-3 py-1.5 text-right text-muted-foreground">
                {row.avgSpeedKph === null ? "—" : `${row.avgSpeedKph} km/h`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------- pit stops */

function CrewStops({ season }: { season: number }) {
  const { data, loading, error } = useAsync(() => loadCrewStops(season, CREW_LIMIT), [season]);
  const title = `Quickest crew stops — stationary time · ${season}`;
  if (loading) {
    return (
      <Panel title={title}>
        <Loading label="Reading every completed OpenF1 race session — the free feed allows 30 requests a minute, so a full season can take a minute or two the first time" />
      </Panel>
    );
  }
  if (error) {
    return (
      <Panel title={title}>
        <ErrorBlock message={error} />
      </Panel>
    );
  }
  const result = data!;
  const { coverage } = result;
  return (
    <Panel title={title} bodyClassName="p-0">
      {coverage.published === 0 ? (
        <div className="px-3">
          <Empty>
            {coverage.total === 0
              ? `OpenF1 has no race pit rows for ${season}, so no crew stop times are available.`
              : `OpenF1 has ${coverage.total} pit rows across ${coverage.sessions} race sessions for ${season}, but publishes no stationary crew time for any of them.`}
          </Empty>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Quickest {CREW_LIMIT} published stationary crew stops in {season}</caption>
            <thead>
              <tr className={HEAD_ROW}>
                <th className={TH}>#</th>
                <th className={THR}>Stationary</th>
                <th className={TH}>Driver</th>
                <th className={TH}>Team</th>
                <th className={TH}>Race</th>
                <th className={TH}>Date</th>
                <th className={THR}>Lap</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, index) => (
                <tr key={`${row.sessionKey}:${row.driverNumber}:${row.lap}`} className={ROW}>
                  <td className="tnum px-3 py-1.5 text-muted-foreground">{index + 1}</td>
                  <td className="tnum px-3 py-1.5 text-right font-semibold">{secs(row.stopSeconds)}</td>
                  <td className="px-3 py-1.5">
                    <span className="font-semibold">{row.code}</span>
                    {row.driverName && <span className="ml-1.5 text-xs text-muted-foreground">{row.driverName}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{row.team || "—"}</td>
                  <td className="px-3 py-1.5">{row.location}</td>
                  <td className="tnum px-3 py-1.5 text-muted-foreground">{formatDate(row.dateStart.slice(0, 10))}</td>
                  <td className="tnum px-3 py-1.5 text-right text-muted-foreground">{row.lap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Coverage: {coverage.published} of {coverage.total} pit rows across {coverage.sessions} race sessions publish a
        stationary time. Crew time is OpenF1&apos;s <code>stop_duration</code> — wheels stopped to wheels moving — and is
        comparable across circuits. Stops without a published time are left out, never counted as zero.
      </p>
    </Panel>
  );
}

function PitLaneTransit({ season }: { season: number }) {
  const { data, loading, error } = useAsync(() => getSeasonPitStops(season), [season]);
  const rounds = useMemo(() => {
    const map = new Map<number, SeasonPitStop[]>();
    for (const stop of data ?? []) {
      const list = map.get(stop.round) ?? [];
      list.push(stop);
      map.set(stop.round, list);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [data]);
  const [round, setRound] = useState<number | null>(null);
  const title = "Pit-lane transit — time from pit entry to pit exit, not stationary crew time";

  if (loading) {
    return (
      <Panel title={title}>
        <Loading label="Loading official pit rows, one race at a time" />
      </Panel>
    );
  }
  if (error) {
    return (
      <Panel title={title}>
        <ErrorBlock message={error} />
      </Panel>
    );
  }
  if (!rounds.length) {
    return (
      <Panel title={title}>
        <Empty>No official pit rows are recorded for {season}.</Empty>
      </Panel>
    );
  }

  const selectedRound = round ?? rounds[rounds.length - 1][0];
  const stops = rounds.find(([r]) => r === selectedRound)?.[1] ?? rounds[rounds.length - 1][1];
  const meta = stops[0];

  return (
    <Panel title={title} bodyClassName="p-0">
      <div className="border-b border-border px-3 py-2">
        <label className="flex items-center gap-2 text-[11px]">
          <span className="label-caps text-[10px] text-muted-foreground">Round</span>
          <select
            value={meta.round}
            onChange={(event) => setRound(Number(event.target.value))}
            className="max-w-[12rem] border border-border bg-secondary px-2 py-1 text-xs"
          >
            {rounds.map(([r, list]) => (
              <option key={r} value={r}>
                R{r} · {list[0].raceName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <TransitTable season={season} round={meta.round} stops={stops} />
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Official Jolpica pit rows for{" "}
        <a href={`#/race/${season}/${meta.round}/pit-stops`} className="text-primary hover:underline">
          {meta.raceName}
        </a>
        . Pit-lane transit runs from pit entry to pit exit, so it includes the drive through the lane; pit lanes differ
        in length, so these times are compared only within this race.
      </p>
    </Panel>
  );
}

function TransitTable({ season, round, stops }: { season: number; round: number; stops: SeasonPitStop[] }) {
  const results = useAsync(() => getRaceResults(season, round), [season, round]);
  const rows = useMemo(() => buildPitLaneTable(stops), [stops]);
  const byDriver = useMemo(
    () => new Map((results.data ?? []).map((r) => [r.Driver.driverId, r])),
    [results.data],
  );
  if (!rows.length) return <div className="px-3"><Empty>No pit row in this race has a published duration.</Empty></div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <caption className="sr-only">Pit-lane transit times for round {round}, quickest first</caption>
        <thead>
          <tr className={HEAD_ROW}>
            <th className={TH}>Driver</th>
            <th className={TH}>Team</th>
            <th className={THR}>Lap</th>
            <th className={THR}>Stop</th>
            <th className={THR}>Pit-lane transit</th>
            <th className={THR}>Gap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const result = byDriver.get(row.driverId);
            return (
              <tr key={`${row.driverId}:${row.stop}`} className={ROW}>
                <td className="px-3 py-1.5">
                  <a href={`#/drivers/${row.driverId}`} className="font-semibold hover:text-primary">
                    {result?.Driver.code ?? result?.Driver.familyName ?? row.driverId}
                  </a>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {result ? (
                    <>
                      <TeamBar constructorId={result.Constructor.constructorId} />
                      {result.Constructor.name}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="tnum px-3 py-1.5 text-right text-muted-foreground">{row.lap}</td>
                <td className="tnum px-3 py-1.5 text-right text-muted-foreground">{row.stop}</td>
                <td className="tnum px-3 py-1.5 text-right font-semibold">{secs(row.durationSeconds)}</td>
                <td className="tnum px-3 py-1.5 text-right text-muted-foreground">
                  {row.gapSeconds === 0 ? "—" : `+${row.gapSeconds.toFixed(3)} s`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
