import { useMemo } from "react";
import { Empty, ErrorBlock, Loading, Panel } from "@/components/Bits";
import { teamColor } from "@/lib/colors";
import { formatGapSeconds, formatLapTime } from "@/lib/format";
import { getCircuitFastestLaps, getRaceResults, type Race } from "@/lib/jolpica";
import { resolveRaceSession } from "@/lib/openf1";
import { buildLapRecords, buildRoundLapTable, circuitLapContext, type RoundLapRow } from "@/lib/records";
import { useAsync } from "@/lib/useAsync";

const TH = "px-3 py-2 font-medium";
const THR = "px-3 py-2 text-right font-medium";
const HEAD_ROW = "label-caps border-b border-border text-left text-[10px] text-muted-foreground";
const ROW = "border-b border-border/50 last:border-b-0 hover:bg-secondary/50";

function TeamBar({ constructorId }: { constructorId: string }) {
  return (
    <span
      className="mr-1.5 inline-block h-2.5 w-[3px] align-middle"
      style={{ background: teamColor(constructorId) }}
      aria-hidden
    />
  );
}

export function RaceFastestLapsPanel({ season, round, race }: { season: number; round: number; race: Race }) {
  const results = useAsync(() => getRaceResults(season, round), [season, round]);
  const circuit = useAsync(() => getCircuitFastestLaps(race.Circuit.circuitId), [race.Circuit.circuitId]);
  // Only decides whether telemetry links are offered; a failure simply hides them.
  const session = useAsync(
    () => resolveRaceSession(season, race).catch(() => null),
    [season, round, race.raceName, race.date],
  );

  const rows = useMemo(() => buildRoundLapTable(results.data ?? []), [results.data]);
  const circuitRecords = useMemo(() => buildLapRecords(circuit.data ?? []), [circuit.data]);
  const fastest = rows[0] ?? null;
  const context = useMemo(
    () => circuitLapContext(fastest, circuitRecords, season, round),
    [fastest, circuitRecords, season, round],
  );
  const telemetry = Boolean(session.data);

  if (results.loading) return <Loading label="Loading fastest laps" />;
  if (results.error) return <ErrorBlock message={results.error} />;
  if (!(results.data ?? []).length) {
    return (
      <Panel title="Fastest laps">
        <Empty>Results are not published for this round yet.</Empty>
      </Panel>
    );
  }
  if (!fastest) {
    return (
      <Panel title="Fastest laps">
        <Empty>The feed publishes no fastest-lap times for this race.</Empty>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Fastest lap of the race">
          <HeadlineLap row={fastest} season={season} round={round} telemetry={telemetry} />
        </Panel>
        <Panel title="Against the circuit's best race lap">
          {circuit.loading ? (
            <Loading label="Loading the circuit's race laps" />
          ) : circuit.error ? (
            <Empty>The circuit's fastest-lap history could not be loaded.</Empty>
          ) : context.record === null ? (
            <Empty>The feed records no fastest race lap at this circuit.</Empty>
          ) : (
            <div>
              {context.isRecord ? (
                <p className="text-sm font-semibold">This race set the circuit&apos;s best recorded race lap.</p>
              ) : (
                <p className="tnum text-2xl font-bold">
                  {context.gapMillis != null ? formatGapSeconds(context.gapMillis) : "—"}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">off the circuit best</span>
                </p>
              )}
              <p className="mt-1 text-sm">
                Best: <span className="tnum font-semibold">{formatLapTime(context.record.millis)}</span>{" "}
                <a href={`#/drivers/${context.record.driverId}`} className="hover:text-primary">
                  {context.record.driverName}
                </a>
                ,{" "}
                <a href={`#/race/${context.record.season}/${context.record.round}/fastest-laps`} className="hover:text-primary">
                  {context.record.season}
                </a>
                <span className="text-muted-foreground"> · {context.record.team}</span>
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Across {context.editions} recorded editions of race fastest laps here. Track layouts and car rules change
                between seasons, so this is context, not a like-for-like pace comparison.
              </p>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Every driver's fastest lap" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Official fastest lap of every driver in this race, quickest first</caption>
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
                {telemetry && <th className={THR}>Telemetry</th>}
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
                  {telemetry && (
                    <td className="px-3 py-1.5 text-right">
                      <a
                        href={`#/race/${season}/${round}/telemetry/${row.code}/${row.lap}`}
                        className="text-[11px] text-primary hover:underline"
                        aria-label={`Telemetry for ${row.code} lap ${row.lap}`}
                      >
                        Telemetry →
                      </a>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          Official race fastest laps from Jolpica; qualifying laps are on the Qualifying tab. Drivers without a published
          fastest lap are left out rather than shown as zero.
        </p>
      </Panel>
    </div>
  );
}

function HeadlineLap({
  row,
  season,
  round,
  telemetry,
}: {
  row: RoundLapRow;
  season: number;
  round: number;
  telemetry: boolean;
}) {
  return (
    <div>
      <p className="tnum text-3xl font-bold text-[#b46cff]">{formatLapTime(row.millis)}</p>
      <p className="mt-1 text-sm">
        <a href={`#/drivers/${row.driverId}`} className="font-semibold hover:text-primary">
          {row.driverName}
        </a>{" "}
        <span className="text-muted-foreground">
          <TeamBar constructorId={row.constructorId} />
          {row.team}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        Lap {row.lap}
        {row.racePosition !== null && ` · finished P${row.racePosition}`} ·{" "}
        {row.avgSpeedKph === null ? "average speed not published" : `${row.avgSpeedKph} km/h average`}
      </p>
      {telemetry && (
        <a
          href={`#/race/${season}/${round}/telemetry/${row.code}/${row.lap}`}
          className="label-caps mt-2 inline-block text-[11px] text-primary hover:underline"
        >
          See this lap&apos;s telemetry →
        </a>
      )}
    </div>
  );
}

