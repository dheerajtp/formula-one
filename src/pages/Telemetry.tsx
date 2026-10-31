import { useMemo, useState } from "react";
import { Empty, ErrorBlock, Loading, Panel } from "@/components/Bits";
import { TelemetryChart } from "@/components/TelemetryChart";
import { teamColor } from "@/lib/colors";
import { formatLapTime } from "@/lib/format";
import { getRaceResults, type Race, type RaceResult } from "@/lib/jolpica";
import {
  getCarData,
  getSessionDrivers,
  getSessionLaps,
  resolveRaceSession,
  type OpenF1Driver,
  type OpenF1Lap,
} from "@/lib/openf1";
import { CIRCUITS } from "@/lib/staticData";
import { buildTelemetryTrace } from "@/lib/telemetry";
import { useAsync } from "@/lib/useAsync";

type TimedLap = OpenF1Lap & { lap_duration: number };

interface DriverRow {
  driver: OpenF1Driver;
  result: RaceResult | null;
  position: number | null;
  color: string;
  laps: TimedLap[];
  fastest: TimedLap;
}

function isTimed(lap: OpenF1Lap): lap is TimedLap {
  return typeof lap.lap_duration === "number" && Number.isFinite(lap.lap_duration) && lap.lap_duration > 0;
}

function driverColor(driver: OpenF1Driver, result: RaceResult | null): string {
  const feed = driver.team_colour?.trim().replace(/^#/, "");
  if (feed) return `#${feed}`;
  return result ? teamColor(result.Constructor.constructorId) : teamColor("");
}

export function TelemetryPanel({ season, round, race }: { season: number; round: number; race: Race }) {
  const session = useAsync(async () => {
    const resolved = await resolveRaceSession(season, race);
    if (!resolved) return { resolved: null, drivers: [], laps: [], results: [] };
    const [drivers, laps, results] = await Promise.all([
      getSessionDrivers(resolved.session.session_key),
      getSessionLaps(resolved.session.session_key),
      getRaceResults(season, round),
    ]);
    return { resolved, drivers, laps, results };
  }, [season, round, race.raceName, race.date]);

  const rows = useMemo<DriverRow[]>(() => {
    const data = session.data;
    if (!data?.resolved) return [];
    const byCode = new Map<string, RaceResult>();
    for (const result of data.results) {
      if (result.Driver.code) byCode.set(result.Driver.code.toUpperCase(), result);
    }
    const lapsByDriver = new Map<number, TimedLap[]>();
    for (const lap of data.laps) {
      if (!isTimed(lap)) continue;
      const list = lapsByDriver.get(lap.driver_number) ?? [];
      list.push(lap);
      lapsByDriver.set(lap.driver_number, list);
    }
    const out: DriverRow[] = [];
    for (const driver of data.drivers) {
      const laps = (lapsByDriver.get(driver.driver_number) ?? []).sort((a, b) => a.lap_number - b.lap_number);
      if (!laps.length) continue;
      const result = byCode.get(driver.name_acronym?.toUpperCase() ?? "") ?? null;
      const position = result ? Number(result.position) : Number.NaN;
      const fastest = laps.reduce((best, lap) => (lap.lap_duration < best.lap_duration ? lap : best));
      out.push({
        driver,
        result,
        position: Number.isFinite(position) ? position : null,
        color: driverColor(driver, result),
        laps,
        fastest,
      });
    }
    return out.sort(
      (a, b) =>
        (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY) ||
        (a.position === null && b.position === null ? a.fastest.lap_duration - b.fastest.lap_duration : 0) ||
        a.driver.name_acronym.localeCompare(b.driver.name_acronym),
    );
  }, [session.data]);

  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [selectedLap, setSelectedLap] = useState<number | null>(null);

  const current = rows.find((row) => row.driver.driver_number === selectedDriver) ?? rows[0] ?? null;
  const currentLap =
    current?.laps.find((lap) => lap.lap_number === selectedLap) ?? current?.fastest ?? null;
  const lapIndex = current && currentLap ? current.laps.indexOf(currentLap) : -1;

  function chooseDriver(driverNumber: number) {
    setSelectedDriver(driverNumber);
    const row = rows.find((r) => r.driver.driver_number === driverNumber);
    setSelectedLap(row ? row.fastest.lap_number : null);
  }

  if (session.loading) {
    return (
      <Panel title="Telemetry">
        <Loading label="Finding the OpenF1 session" />
      </Panel>
    );
  }
  if (session.error) return <ErrorBlock message={session.error} />;
  if (!session.data?.resolved) {
    return (
      <Panel title="Telemetry">
        <Empty>OpenF1 has no session data for this race, so there is no car telemetry to show.</Empty>
      </Panel>
    );
  }
  if (!rows.length || !current || !currentLap) {
    return (
      <Panel title="Telemetry">
        <Empty>
          This session is not final: OpenF1 has no timed laps for it yet. Telemetry appears once the session has been
          published.
        </Empty>
      </Panel>
    );
  }

  const sessionKey = session.data.resolved.session.session_key;
  const recordedLength = CIRCUITS.get(race.Circuit.circuitId)?.outline.length ?? null;
  const driverLabelId = "telemetry-driver";
  const lapLabelId = "telemetry-lap";

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Driver and lap" bodyClassName="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor={driverLabelId} className="flex flex-col gap-1">
            <span className="label-caps text-[10px] text-muted-foreground">Driver</span>
            <select
              id={driverLabelId}
              value={current.driver.driver_number}
              onChange={(event) => chooseDriver(Number(event.target.value))}
              className="min-w-[12rem] border border-border bg-secondary px-2 py-1.5 text-sm"
            >
              {rows.map((row) => (
                <option key={row.driver.driver_number} value={row.driver.driver_number}>
                  {row.position !== null ? `P${row.position} · ` : ""}
                  {row.driver.name_acronym} — {row.driver.full_name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={lapLabelId} className="flex flex-col gap-1">
            <span className="label-caps text-[10px] text-muted-foreground">Lap</span>
            <select
              id={lapLabelId}
              value={currentLap.lap_number}
              onChange={(event) => setSelectedLap(Number(event.target.value))}
              className="min-w-[10rem] border border-border bg-secondary px-2 py-1.5 text-sm"
            >
              {current.laps.map((lap) => (
                <option key={lap.lap_number} value={lap.lap_number}>
                  Lap {lap.lap_number} · {formatLapTime(lap.lap_duration * 1000)}
                  {lap.lap_number === current.fastest.lap_number ? " (fastest)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={lapIndex <= 0}
              onClick={() => setSelectedLap(current.laps[lapIndex - 1].lap_number)}
              className="label-caps border border-border px-3 py-1.5 text-[11px] hover:bg-secondary disabled:opacity-40"
            >
              ← Previous lap
            </button>
            <button
              type="button"
              disabled={lapIndex < 0 || lapIndex >= current.laps.length - 1}
              onClick={() => setSelectedLap(current.laps[lapIndex + 1].lap_number)}
              className="label-caps border border-border px-3 py-1.5 text-[11px] hover:bg-secondary disabled:opacity-40"
            >
              Next lap →
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {current.laps.length} timed laps for {current.driver.name_acronym}. Car data is fetched for one lap at a time.
        </p>
      </Panel>

      <LapTrace
        key={`${sessionKey}:${current.driver.driver_number}:${currentLap.lap_number}`}
        sessionKey={sessionKey}
        row={current}
        lap={currentLap}
        recordedLength={recordedLength}
      />

      <SessionTable rows={rows} selected={current.driver.driver_number} onSelect={chooseDriver} />
    </div>
  );
}

function LapTrace({
  sessionKey,
  row,
  lap,
  recordedLength,
}: {
  sessionKey: number;
  row: DriverRow;
  lap: TimedLap;
  recordedLength: number | null;
}) {
  const car = useAsync(async () => {
    const end = new Date(Date.parse(lap.date_start) + lap.lap_duration * 1000).toISOString();
    const samples = await getCarData(sessionKey, row.driver.driver_number, lap.date_start, end);
    return buildTelemetryTrace(samples, lap, recordedLength);
  }, [sessionKey, row.driver.driver_number, lap.lap_number]);

  const title = `${row.driver.name_acronym} · lap ${lap.lap_number} · ${formatLapTime(lap.lap_duration * 1000)}`;

  if (car.loading) {
    return (
      <Panel title={title}>
        <Loading label="Loading car data for this lap" />
      </Panel>
    );
  }
  if (car.error) return <ErrorBlock message={car.error} />;
  const trace = car.data;
  if (!trace) {
    return (
      <Panel title={title}>
        <Empty>OpenF1 has no car data for this lap. Pick another lap or driver.</Empty>
      </Panel>
    );
  }

  const stats: { label: string; value: string }[] = [
    { label: "Top speed", value: `${Math.round(trace.maxSpeedKph)} km/h` },
    { label: "Average speed", value: `${Math.round(trace.averageSpeedKph)} km/h` },
    { label: "Full throttle", value: `${trace.fullThrottleS.toFixed(1)} s` },
    { label: "Braking", value: `${trace.brakingS.toFixed(1)} s` },
    { label: "Gear changes", value: String(trace.gearChanges) },
    { label: "Samples", value: String(trace.sampleCount) },
  ];

  return (
    <Panel title={title} bodyClassName="p-3">
      <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="border border-border px-2 py-1.5">
            <dt className="label-caps text-[10px] text-muted-foreground">{stat.label}</dt>
            <dd className="tnum text-sm font-semibold">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <TelemetryChart trace={trace} label={title} color={row.color} />
      <p className="mt-2 text-[11px] text-muted-foreground">
        Distance is integrated from the car&apos;s speed trace, not GPS
        {recordedLength
          ? `, then scaled so the lap ends on the recorded lap length of ${(recordedLength / 1000).toFixed(3)} km.`
          : "; no recorded lap length is available for this circuit, so the integrated distance is shown unscaled."}{" "}
        Data: OpenF1 car data.
      </p>
    </Panel>
  );
}

function SessionTable({
  rows,
  selected,
  onSelect,
}: {
  rows: DriverRow[];
  selected: number;
  onSelect: (driverNumber: number) => void;
}) {
  const sessionBest = Math.min(...rows.map((row) => row.fastest.lap_duration));
  const hasSpeedTrap = rows.some((row) => typeof row.fastest.st_speed === "number");
  return (
    <Panel title="Session fastest laps" bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Every driver&apos;s fastest timed lap in this session</caption>
          <thead>
            <tr className="label-caps border-b border-border text-left text-[10px] text-muted-foreground">
              <th className="px-3 py-2 font-medium">Pos</th>
              <th className="px-3 py-2 font-medium">Driver</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 text-right font-medium">Fastest lap</th>
              <th className="px-2 py-2 text-right font-medium">Lap</th>
              {hasSpeedTrap && <th className="px-3 py-2 text-right font-medium">Speed trap</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected = row.driver.driver_number === selected;
              const best = row.fastest.lap_duration === sessionBest;
              return (
                <tr
                  key={row.driver.driver_number}
                  className={`border-b border-border/50 last:border-b-0 ${isSelected ? "bg-secondary" : "hover:bg-secondary/50"}`}
                >
                  <td className="tnum px-3 py-1.5 text-muted-foreground">{row.position ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => onSelect(row.driver.driver_number)}
                      aria-pressed={isSelected}
                      className="font-semibold hover:text-primary"
                      title={`Show ${row.driver.name_acronym}'s fastest lap`}
                    >
                      {row.driver.name_acronym}
                    </button>
                    <span className="ml-1.5 text-xs text-muted-foreground">{row.driver.last_name}</span>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    <span className="mr-1.5 inline-block h-2.5 w-[3px] align-middle" style={{ background: row.color }} aria-hidden />
                    {row.result?.Constructor.name ?? row.driver.team_name}
                  </td>
                  <td className={`tnum px-3 py-1.5 text-right ${best ? "font-semibold text-[#b46cff]" : ""}`}>
                    {formatLapTime(row.fastest.lap_duration * 1000)}
                  </td>
                  <td className="tnum px-2 py-1.5 text-right text-muted-foreground">{row.fastest.lap_number}</td>
                  {hasSpeedTrap && (
                    <td className="tnum px-3 py-1.5 text-right text-muted-foreground">
                      {typeof row.fastest.st_speed === "number" ? `${row.fastest.st_speed} km/h` : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
