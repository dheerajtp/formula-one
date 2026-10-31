import { useMemo, useState } from "react";
import { DataError, Empty, Loading, Panel } from "@/components/Bits";
import { TelemetryChart } from "@/components/TelemetryChart";
import { ChannelKey, LapEventMap, LapStory, ReadingNote } from "@/components/TelemetryGuide";
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
import { CIRCUITS, type CircuitOutline } from "@/lib/staticData";
import { buildTelemetryTrace } from "@/lib/telemetry";
import { buildLapDelta, buildLapInsights, matchZones } from "@/lib/telemetryInsights";
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

const EXPLAIN_KEY = "f1-telemetry-explain";
/** Muted stroke for the comparison lap so the selected lap stays dominant. */
const COMPARE_COLOR = "#c9d1d9";

function readExplain(): boolean {
  try {
    return localStorage.getItem(EXPLAIN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeExplain(on: boolean) {
  try {
    localStorage.setItem(EXPLAIN_KEY, on ? "1" : "0");
  } catch {
    /* storage blocked — the toggle still works for this visit */
  }
}

interface CompareTarget {
  row: DriverRow;
  lap: TimedLap;
}

function driverColor(driver: OpenF1Driver, result: RaceResult | null): string {
  const feed = driver.team_colour?.trim().replace(/^#/, "");
  if (feed) return `#${feed}`;
  return result ? teamColor(result.Constructor.constructorId) : teamColor("");
}

export function TelemetryPanel({
  season,
  round,
  race,
  initialDriverCode,
  initialLap,
}: {
  season: number;
  round: number;
  race: Race;
  /** Preselect this driver (OpenF1 `name_acronym`) until the user picks another. */
  initialDriverCode?: string;
  /** Preselect this lap of the preselected driver when it is a timed lap. */
  initialLap?: number;
}) {
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
  const [explain, setExplain] = useState<boolean>(readExplain);
  /** "none", "fastest" (session fastest lap) or a driver number as a string. */
  const [compareChoice, setCompareChoice] = useState<string>("none");
  const [compareLapNumber, setCompareLapNumber] = useState<number | null>(null);
  const [selectedLap, setSelectedLap] = useState<number | null>(null);

  // A deep link preselects a driver/lap; an unknown code or lap falls back to the default.
  const initialRow = initialDriverCode
    ? rows.find((row) => row.driver.name_acronym?.toUpperCase() === initialDriverCode.toUpperCase())
    : undefined;
  const current =
    rows.find((row) => row.driver.driver_number === selectedDriver) ??
    (selectedDriver === null ? initialRow : undefined) ??
    rows[0] ??
    null;
  const currentLap =
    current?.laps.find((lap) => lap.lap_number === selectedLap) ??
    (selectedLap === null && current === initialRow
      ? current?.laps.find((lap) => lap.lap_number === initialLap)
      : undefined) ??
    current?.fastest ??
    null;
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
  if (session.error) return <DataError message={session.error} />;
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
  const sessionFastest = rows.reduce((best, row) => (row.fastest.lap_duration < best.fastest.lap_duration ? row : best));
  const compareRow =
    compareChoice === "none"
      ? null
      : compareChoice === "fastest"
        ? sessionFastest
        : rows.find((row) => String(row.driver.driver_number) === compareChoice) ?? null;
  const compareTarget: CompareTarget | null = compareRow
    ? {
        row: compareRow,
        lap:
          (compareChoice !== "fastest" && compareRow.laps.find((lap) => lap.lap_number === compareLapNumber)) ||
          compareRow.fastest,
      }
    : null;
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
          <label htmlFor="telemetry-compare" className="flex flex-col gap-1">
            <span className="label-caps text-[10px] text-muted-foreground">Compare with</span>
            <select
              id="telemetry-compare"
              value={compareChoice}
              onChange={(event) => {
                setCompareChoice(event.target.value);
                setCompareLapNumber(null);
              }}
              className="min-w-[10rem] border border-border bg-secondary px-2 py-1.5 text-sm"
            >
              <option value="none">Nothing</option>
              <option value="fastest">Session fastest lap</option>
              {rows.map((row) => (
                <option key={row.driver.driver_number} value={String(row.driver.driver_number)}>
                  {row.driver.name_acronym}
                </option>
              ))}
            </select>
          </label>
          {compareRow && compareChoice !== "fastest" && (
            <label htmlFor="telemetry-compare-lap" className="flex flex-col gap-1">
              <span className="label-caps text-[10px] text-muted-foreground">Their lap</span>
              <select
                id="telemetry-compare-lap"
                value={compareTarget?.lap.lap_number ?? ""}
                onChange={(event) => setCompareLapNumber(Number(event.target.value))}
                className="min-w-[9rem] border border-border bg-secondary px-2 py-1.5 text-sm"
              >
                {compareRow.laps.map((lap) => (
                  <option key={lap.lap_number} value={lap.lap_number}>
                    Lap {lap.lap_number} · {formatLapTime(lap.lap_duration * 1000)}
                    {lap.lap_number === compareRow.fastest.lap_number ? " (fastest)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 self-center border border-border px-3 py-1.5 text-xs">
            <input
              type="checkbox"
              checked={explain}
              onChange={(event) => {
                setExplain(event.target.checked);
                writeExplain(event.target.checked);
              }}
              className="accent-[var(--color-primary,#e10600)]"
            />
            Explain this lap
          </label>
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
        outline={CIRCUITS.get(race.Circuit.circuitId)?.outline ?? null}
        explain={explain}
        compare={compareTarget}
      />

      <SessionTable rows={rows} selected={current.driver.driver_number} onSelect={chooseDriver} />
    </div>
  );
}

async function loadTrace(sessionKey: number, row: DriverRow, lap: TimedLap, recordedLength: number | null) {
  const end = new Date(Date.parse(lap.date_start) + lap.lap_duration * 1000).toISOString();
  const samples = await getCarData(sessionKey, row.driver.driver_number, lap.date_start, end);
  return buildTelemetryTrace(samples, lap, recordedLength);
}

function LapTrace({
  sessionKey,
  row,
  lap,
  recordedLength,
  outline,
  explain,
  compare,
}: {
  sessionKey: number;
  row: DriverRow;
  lap: TimedLap;
  recordedLength: number | null;
  outline: CircuitOutline | null;
  explain: boolean;
  compare: CompareTarget | null;
}) {
  const car = useAsync(
    () => loadTrace(sessionKey, row, lap, recordedLength),
    [sessionKey, row.driver.driver_number, lap.lap_number],
  );
  // Nothing is fetched for the comparison until one is chosen.
  const compareCar = useAsync(
    () => (compare ? loadTrace(sessionKey, compare.row, compare.lap, recordedLength) : Promise.resolve(null)),
    [sessionKey, compare?.row.driver.driver_number, compare?.lap.lap_number],
  );
  const [cursor, setCursor] = useState(-1);
  const trace = car.data ?? null;
  const compareTrace = compare ? compareCar.data ?? null : null;
  const insights = useMemo(() => (trace && explain ? buildLapInsights(trace) : null), [trace, explain]);
  const compareInsights = useMemo(
    () => (compareTrace && explain ? buildLapInsights(compareTrace) : null),
    [compareTrace, explain],
  );
  const delta = useMemo(() => (trace && compareTrace ? buildLapDelta(trace, compareTrace) : null), [trace, compareTrace]);
  const comparisons = useMemo(
    () =>
      insights && compareInsights && trace && compareTrace
        ? matchZones(insights.zones, compareInsights.zones, trace, compareTrace)
        : null,
    [insights, compareInsights, trace, compareTrace],
  );
  const compareLabel = compare ? `${compare.row.driver.name_acronym} L${compare.lap.lap_number}` : "";

  const title = `${row.driver.name_acronym} · lap ${lap.lap_number} · ${formatLapTime(lap.lap_duration * 1000)}`;

  if (car.loading) {
    return (
      <Panel title={title}>
        <Loading label="Loading car data for this lap" />
      </Panel>
    );
  }
  if (car.error) return <DataError message={car.error} />;
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
      {compare && (
        <p className="mb-2 text-[11px] text-muted-foreground" aria-live="polite">
          {compareCar.loading
            ? `Loading ${compareLabel} for comparison…`
            : compareCar.error
              ? `Comparison unavailable: ${compareCar.error}`
              : !compareTrace
                ? `OpenF1 has no car data for ${compareLabel}, so there is nothing to compare.`
                : `Compared with ${compareLabel} (${formatLapTime(compare.lap.lap_duration * 1000)}): dashed line on the speed strip; the bottom strip shows the running time gap.`}
        </p>
      )}
      <TelemetryChart
        trace={trace}
        label={title}
        color={row.color}
        annotations={insights ? { zones: insights.zones, straights: insights.straights } : undefined}
        cursorIndex={cursor}
        onCursorChange={setCursor}
        compare={compareTrace ? { trace: compareTrace, color: COMPARE_COLOR, label: compareLabel, delta } : undefined}
      />
      {insights && (
        <div className="mt-4 grid gap-4 border-t border-border pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-label="What each line means" className="flex flex-col gap-3">
            <h3 className="label-caps text-[11px] text-muted-foreground">What each line means</h3>
            <ChannelKey trace={trace} insights={insights} />
            <h3 className="label-caps text-[11px] text-muted-foreground">How to read the chart</h3>
            <ReadingNote />
            {outline && insights.zones.length > 0 && (
              <LapEventMap outline={outline} trace={trace} zones={insights.zones} activeIndex={cursor} />
            )}
          </section>
          <section aria-label="The story of this lap" className="flex flex-col gap-2">
            <h3 className="label-caps text-[11px] text-muted-foreground">The story of this lap</h3>
            <LapStory
              insights={insights}
              comparisons={comparisons}
              compareLabel={compareTrace ? compareLabel : undefined}
              onFocus={setCursor}
              activeIndex={cursor}
            />
          </section>
        </div>
      )}
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
