import { Empty, ErrorBlock, Loading, Panel } from "@/components/Bits";
import { teamColor } from "@/lib/colors";
import type { Race } from "@/lib/jolpica";
import { loadRacePitStops, type RacePitRow } from "@/lib/records";
import { useAsync } from "@/lib/useAsync";

const TH = "px-3 py-2 font-medium";
const THR = "px-3 py-2 text-right font-medium";
const HEAD_ROW = "label-caps border-b border-border text-left text-[10px] text-muted-foreground";
const ROW = "border-b border-border/50 last:border-b-0 hover:bg-secondary/50";

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

export function RacePitStopsPanel({ season, round, race }: { season: number; round: number; race: Race }) {
  const state = useAsync(() => loadRacePitStops(season, round, race), [season, round]);

  if (state.loading) return <Loading label="Loading official pit stops" />;
  if (state.error) return <ErrorBlock message={state.error} />;
  const data = state.data!;
  if (!data.rows.length) {
    return (
      <Panel title="Pit stops">
        <Empty>No official pit stops are recorded for this race.</Empty>
      </Panel>
    );
  }

  const quickestTransit = data.rows[0];
  const quickestStationary = data.rows
    .filter((r): r is RacePitRow & { stationaryS: number } => r.stationaryS !== null)
    .sort((a, b) => a.stationaryS - b.stationaryS)[0];
  const stationaryNote =
    data.openf1 === "no-session"
      ? "OpenF1 does not cover this race, so stationary crew times are unavailable."
      : data.openf1 === "pending"
        ? "OpenF1 publishes stationary crew times after the race ends."
        : data.openf1 === "error"
          ? data.openf1Error ?? "OpenF1 could not be reached."
          : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Quickest pit-lane transit">
          <StopHeadline row={quickestTransit} value={secs(quickestTransit.transitS)} />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Pit entry to pit exit, from the official Jolpica pit rows. Includes the drive through the pit lane.
          </p>
        </Panel>
        <Panel title="Quickest stationary stop">
          {quickestStationary ? (
            <StopHeadline row={quickestStationary} value={secs(quickestStationary.stationaryS)} />
          ) : (
            <Empty>{stationaryNote ?? "OpenF1 publishes no stationary crew time for any stop in this race."}</Empty>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Car stopped to car moving: OpenF1&apos;s <code>stop_duration</code>, where published.
          </p>
        </Panel>
      </div>

      <Panel title="Every pit stop" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Every official pit stop in this race, quickest pit-lane transit first</caption>
            <thead>
              <tr className={HEAD_ROW}>
                <th className={TH}>Driver</th>
                <th className={TH}>Team</th>
                <th className={THR}>Stop</th>
                <th className={THR}>Lap</th>
                <th className={THR}>Pit-lane transit</th>
                <th className={THR}>Gap</th>
                <th className={THR}>Stationary</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={`${row.driverId}:${row.stop}`} className={ROW}>
                  <td className="px-3 py-1.5">
                    <a href={`#/drivers/${row.driverId}`} className="font-semibold hover:text-primary">
                      {row.code}
                    </a>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {row.team ? (
                      <>
                        <TeamBar constructorId={row.constructorId} />
                        {row.team}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="tnum px-3 py-1.5 text-right text-muted-foreground">{row.stop}</td>
                  <td className="tnum px-3 py-1.5 text-right text-muted-foreground">{row.lap}</td>
                  <td className="tnum px-3 py-1.5 text-right font-semibold">{secs(row.transitS)}</td>
                  <td className="tnum px-3 py-1.5 text-right text-muted-foreground">
                    {row.transitGapS === 0 ? "—" : `+${row.transitGapS.toFixed(3)} s`}
                  </td>
                  <td className="tnum px-3 py-1.5 text-right">
                    {row.stationaryS === null ? (
                      <span className="text-xs text-muted-foreground">
                        {data.openf1 === "ok" ? "not published" : "—"}
                      </span>
                    ) : (
                      secs(row.stationaryS)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <p>
            Pit-lane transit (entry to exit) and stationary time (car stopped) are different measures. Transit is
            compared only within this race; stationary time is comparable across circuits.
            {data.openf1 === "ok" &&
              ` ${data.summary.published} of ${data.summary.total} stops have a published stationary time.`}
          </p>
          {stationaryNote && <p className="mt-1">{stationaryNote}</p>}
          <p className="mt-1">
            Time lost in the pits and tyre stints are on the{" "}
            <a href={`#/race/${season}/${round}/strategy`} className="text-primary hover:underline">
              Strategy tab
            </a>
            .
          </p>
        </div>
      </Panel>

      {data.openf1 === "ok" && (
        <Panel title="Crew speed by team" bodyClassName="p-0">
          {data.summary.teams.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-sm">
                <caption className="sr-only">Stationary pit-stop times by team, quickest median first</caption>
                <thead>
                  <tr className={HEAD_ROW}>
                    <th className={TH}>Team</th>
                    <th className={THR}>Timed stops</th>
                    <th className={THR}>Best</th>
                    <th className={THR}>Median</th>
                  </tr>
                </thead>
                <tbody>
                  {data.summary.teams.map((team) => (
                    <tr key={team.team} className={ROW}>
                      <td className="px-3 py-1.5">
                        <TeamBar constructorId={team.constructorId} />
                        {team.team}
                      </td>
                      <td className="tnum px-3 py-1.5 text-right text-muted-foreground">{team.timed}</td>
                      <td className="tnum px-3 py-1.5 text-right">{secs(team.bestS)}</td>
                      <td className="tnum px-3 py-1.5 text-right font-semibold">{secs(team.medianS)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-3">
              <Empty>OpenF1 publishes no stationary crew time for any stop in this race.</Empty>
            </div>
          )}
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Built only from published stationary times.
            {data.summary.untimedTeams.length > 0 &&
              ` No stationary time published for: ${data.summary.untimedTeams.join(", ")}.`}
          </p>
        </Panel>
      )}
    </div>
  );
}

function StopHeadline({ row, value }: { row: RacePitRow; value: string }) {
  return (
    <div>
      <p className="tnum text-3xl font-bold">{value}</p>
      <p className="mt-1 text-sm">
        <a href={`#/drivers/${row.driverId}`} className="font-semibold hover:text-primary">
          {row.driverName}
        </a>
        {row.team && (
          <span className="text-muted-foreground">
            {" "}
            · <TeamBar constructorId={row.constructorId} />
            {row.team}
          </span>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        Stop {row.stop} · lap {row.lap}
      </p>
    </div>
  );
}
