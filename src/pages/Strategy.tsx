import type { ReactNode } from "react";
import { DataError, Empty, Loading, Panel } from "@/components/Bits";
import type { Race } from "@/lib/jolpica";
import { COMPOUND_STYLE, TYRES, compoundAppearance } from "@/lib/staticData";
import {
  type CompoundSummary,
  type StrategyBaseline,
  type StrategyReport,
  type TrackState,
} from "@/lib/strategy";
import { loadStrategy } from "@/lib/strategyLoader";
import { useAsync } from "@/lib/useAsync";

const UNKNOWN_COMPOUND = { label: "Unknown", color: "#5b6170" };

function compoundLook(compound: string) {
  return COMPOUND_STYLE[compound?.toUpperCase()] ?? { ...UNKNOWN_COMPOUND, label: compound || UNKNOWN_COMPOUND.label };
}

function seconds(value: number | null | undefined, digits = 3): string {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)} s`;
}

function signedSeconds(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : "±"}${Math.abs(value).toFixed(digits)} s`;
}

const STATE_LABEL: Record<TrackState, string> = {
  green: "Green",
  "not-green": "Neutralised",
  unknown: "Unknown",
};

export function StrategyPanel({ season, round, race }: { season: number; round: number; race: Race }) {
  const state = useAsync(() => loadStrategy(season, round, race), [season, round, race.raceName, race.date]);

  if (state.loading) {
    return (
      <Panel title="Strategy">
        <Loading label="Loading stints, stops and race control" />
      </Panel>
    );
  }
  if (state.error) return <DataError message={state.error} />;
  const data = state.data;
  if (!data || data.mode === "missing") {
    return (
      <Panel title="Strategy">
        <Empty>OpenF1 has no session data for this race.</Empty>
      </Panel>
    );
  }
  if (data.mode === "actual") return <ActualStrategy report={data.report} />;

  return (
    <div className="flex flex-col gap-4">
      {data.mode === "no-history" || (data.mode === "awaiting" && !data.baseline) ? (
        <Panel title="Strategy baseline">
          <Empty>
            This race has not run yet, and OpenF1 has no completed race at this circuit to build a historical baseline
            from. Nothing is estimated in its place.
          </Empty>
        </Panel>
      ) : (
        <BaselineStrategy baseline={data.baseline!} />
      )}
      <AllocationPanel raceName={race.raceName} />
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="border border-border px-3 py-2">
      <p className="label-caps text-[10px] text-muted-foreground">{label}</p>
      <p className="tnum text-lg font-semibold leading-tight">{value}</p>
      {detail && <p className="tnum text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

function ActualStrategy({ report }: { report: StrategyReport }) {
  const hasStints = report.drivers.some((driver) => driver.stints.length > 0);
  const stops = report.drivers.flatMap((driver) => driver.stops.map((stop) => ({ driver, stop })));
  const recordedStops = stops.length;
  const compoundsUsed = report.compounds.map((c) => c.compound);
  const zeroStop = report.drivers.filter((driver) => driver.stops.length === 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryCard label="Race laps" value={report.totalLaps ?? "—"} detail="Highest timed lap in OpenF1" />
        <SummaryCard
          label="Recorded stops"
          value={recordedStops}
          detail={report.excludedStops ? `${report.excludedStops} under neutralised running` : "none neutralised"}
        />
        <SummaryCard
          label="Median pit loss"
          value={seconds(report.pitLossMedianS, 2)}
          detail={`${report.pitLossSamples} measured stop${report.pitLossSamples === 1 ? "" : "s"}`}
        />
        <SummaryCard
          label="Compounds used"
          value={compoundsUsed.length ? compoundsUsed.map((c) => compoundLook(c).label).join(" · ") : "—"}
        />
      </div>

      {hasStints ? (
        <StintTimeline report={report} />
      ) : (
        <Panel title="Stint timeline">
          <Empty>OpenF1 has published no stints for this session, so tyre compounds are unavailable.</Empty>
        </Panel>
      )}

      <Panel title="Pit stops" bodyClassName="p-0">
        {recordedStops ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Every recorded pit stop with published duration and measured time loss</caption>
              <thead>
                <tr className="label-caps border-b border-border text-left text-[10px] text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Driver</th>
                  <th className="px-2 py-2 text-right font-medium">Stop</th>
                  <th className="px-2 py-2 text-right font-medium">Lap</th>
                  <th className="px-3 py-2 text-right font-medium">Published duration</th>
                  <th className="px-3 py-2 text-right font-medium">Measured loss</th>
                  <th className="px-3 py-2 text-right font-medium">vs field median</th>
                  <th className="px-3 py-2 font-medium">Track</th>
                </tr>
              </thead>
              <tbody>
                {stops.map(({ driver, stop }) => (
                  <tr
                    key={`${driver.driverNumber}:${stop.stopNumber}`}
                    className={`border-b border-border/50 last:border-b-0 ${stop.excluded ? "text-muted-foreground" : ""}`}
                  >
                    <td className="px-3 py-1.5">
                      <span
                        className="mr-1.5 inline-block h-2.5 w-[3px] align-middle"
                        style={{ background: driver.teamColor ?? UNKNOWN_COMPOUND.color }}
                        aria-hidden
                      />
                      <span className="tnum mr-1 text-xs text-muted-foreground">{driver.position ? `P${driver.position}` : ""}</span>
                      <span className="font-semibold">{driver.code}</span>
                    </td>
                    <td className="tnum px-2 py-1.5 text-right">{stop.stopNumber}</td>
                    <td className="tnum px-2 py-1.5 text-right">{stop.lap}</td>
                    <td className="tnum px-3 py-1.5 text-right">{stop.durationLabel ? `${stop.durationLabel} s` : "—"}</td>
                    <td className="tnum px-3 py-1.5 text-right">{stop.excluded ? "—" : seconds(stop.measuredLossS, 2)}</td>
                    <td className="tnum px-3 py-1.5 text-right">
                      {!stop.excluded && stop.measuredLossS != null && report.pitLossMedianS != null
                        ? signedSeconds(stop.measuredLossS - report.pitLossMedianS, 2)
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {STATE_LABEL[stop.trackState]}
                      {stop.excluded && <span className="ml-1 text-[#ffb020]">· excluded from median</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No pit stops were recorded for this race.</Empty>
        )}
        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          {zeroStop.length > 0 && (
            <p>No recorded stops: {zeroStop.map((d) => d.code).join(", ")}.</p>
          )}
          <p>
            Stop laps and published durations come from the official Jolpica pit rows (pit-lane entry to exit). Measured
            loss = in-lap + out-lap − 2 × the driver&apos;s median clean lap. A stop that overlapped a red flag, safety car
            or track-wide yellow is marked neutralised and left out of the field median.
          </p>
        </div>
      </Panel>

      <DegradationTable compounds={report.compounds} caption="Tyre degradation by compound in this race" />

      <p className="text-[11px] text-muted-foreground">
        Compounds and stints come from OpenF1. Clean laps exclude pit in- and out-laps
        {report.flagsAvailable
          ? " and laps started under neutralised running, read from race-control messages."
          : "; OpenF1 published no race-control messages for this session, so neutralised laps could not be excluded."}
      </p>
    </div>
  );
}

function StintTimeline({ report }: { report: StrategyReport }) {
  const totalLaps = report.totalLaps;
  const legend = report.compounds.map((c) => c.compound);
  return (
    <Panel title="Stint timeline" bodyClassName="p-3">
      <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {legend.map((compound) => {
          const look = compoundLook(compound);
          return (
            <span key={compound} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border border-black/30" style={{ background: look.color }} aria-hidden />
              {look.label}
            </span>
          );
        })}
      </div>
      <ol className="flex flex-col gap-1.5">
        {report.drivers.map((driver) => (
          <li key={driver.driverNumber} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 sm:grid-cols-[6rem_1fr]">
            <span className="truncate text-xs">
              <span
                className="mr-1 inline-block h-2.5 w-[3px] align-middle"
                style={{ background: driver.teamColor ?? UNKNOWN_COMPOUND.color }}
                aria-hidden
              />
              <span className="tnum mr-1 text-muted-foreground">{driver.position ? `P${driver.position}` : ""}</span>
              {driver.code}
            </span>
            {driver.stints.length && totalLaps ? (
              <div className="flex h-5 gap-[2px]">
                {driver.stints.map((stint) => {
                  const look = compoundLook(stint.compound);
                  const description = `${look.label}: laps ${stint.lapStart}–${stint.lapEnd} (${stint.lengthLaps} laps), tyre age ${stint.tyreAgeAtStart} at start, degradation ${
                    stint.degradationS == null ? "not enough clean laps" : signedSeconds(stint.degradationS, 3) + "/lap"
                  }`;
                  return (
                    <span
                      key={stint.stintNumber}
                      className="flex min-w-0 items-center justify-center overflow-hidden text-[9px] font-bold text-black/75"
                      style={{ width: `${(stint.lengthLaps / totalLaps) * 100}%`, background: look.color }}
                      title={description}
                      aria-label={description}
                    >
                      <span className="truncate px-0.5">{look.label.charAt(0)}{stint.lengthLaps}</span>
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground">No stints published</span>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Bar width is stint length relative to the {totalLaps ?? "—"} timed race laps; the label is compound initial and
        laps. Hover or focus a stint for its lap range, starting tyre age and degradation.
      </p>
    </Panel>
  );
}

function DegradationTable({ compounds, caption }: { compounds: CompoundSummary[]; caption: string }) {
  return (
    <Panel title="Tyre degradation" bodyClassName="p-0">
      {compounds.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="label-caps border-b border-border text-left text-[10px] text-muted-foreground">
                <th className="px-3 py-2 font-medium">Compound</th>
                <th className="px-2 py-2 text-right font-medium">Stints</th>
                <th className="px-3 py-2 text-right font-medium">Median stint</th>
                <th className="px-3 py-2 text-right font-medium">Degradation</th>
                <th className="px-3 py-2 text-right font-medium">Clean laps</th>
              </tr>
            </thead>
            <tbody>
              {compounds.map((c) => {
                const look = compoundLook(c.compound);
                return (
                  <tr key={c.compound} className="border-b border-border/50 last:border-b-0">
                    <td className="px-3 py-1.5">
                      <span className="mr-1.5 inline-block h-3 w-3 rounded-full border border-black/30 align-middle" style={{ background: look.color }} aria-hidden />
                      {look.label}
                    </td>
                    <td className="tnum px-2 py-1.5 text-right">{c.stintCount}</td>
                    <td className="tnum px-3 py-1.5 text-right">
                      {c.medianStintLengthLaps == null ? "—" : `${c.medianStintLengthLaps} laps`}
                    </td>
                    <td className="tnum px-3 py-1.5 text-right">
                      {c.medianDegradationS == null ? "Not enough clean laps" : `${signedSeconds(c.medianDegradationS, 3)}/lap`}
                    </td>
                    <td className="tnum px-3 py-1.5 text-right">{c.degradationSamples}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No stints were published, so degradation cannot be measured.</Empty>
      )}
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Degradation is the least-squares slope of clean lap time against tyre age within each stint, shown as the median
        across stints. Fuel burn-off is not separated out, so a negative slope is possible and shown as measured.
      </p>
    </Panel>
  );
}

function BaselineStrategy({ baseline }: { baseline: StrategyBaseline }) {
  const seasons = baseline.seasons;
  const seasonLabel =
    seasons.length === 0 ? "—" : seasons.length === 1 ? String(seasons[0]) : `${seasons[0]}–${seasons[seasons.length - 1]}`;
  const stopRange =
    baseline.minStopCount != null && baseline.maxStopCount != null
      ? `observed ${baseline.minStopCount}–${baseline.maxStopCount}`
      : undefined;
  return (
    <div className="flex flex-col gap-4">
      <div className="border border-[#ffb020]/50 bg-[#ffb020]/10 p-3 text-sm" role="note">
        <p className="font-semibold">Strategy baseline — historical context, not a prediction</p>
        <p className="mt-1 text-muted-foreground">
          This race has no completed session yet. The figures below are medians over every completed OpenF1 race at this
          circuit; they describe past races, not a live or predicted pit window for this one.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <SummaryCard label="Contributing races" value={baseline.sessionCount} />
        <SummaryCard label="Seasons" value={seasonLabel} detail={`${seasons.length} season${seasons.length === 1 ? "" : "s"}`} />
        <SummaryCard label="Driver-race samples" value={baseline.driverRaceSamples} />
        <SummaryCard label="Median stops" value={baseline.medianStopCount ?? "—"} detail={stopRange} />
        <SummaryCard
          label="Typical pit loss"
          value={seconds(baseline.medianPitLossS, 2)}
          detail={`${baseline.pitLossSamples} measured stop${baseline.pitLossSamples === 1 ? "" : "s"}`}
        />
      </div>
      <DegradationTable compounds={baseline.compounds} caption="Historical tyre degradation by compound at this circuit" />
      <p className="text-[11px] text-muted-foreground">
        Historical stop counts come from OpenF1 pit records; published stop durations are not used for past editions.
        Measured pit loss = in-lap + out-lap − 2 × the driver&apos;s median clean lap, excluding neutralised stops.
      </p>
    </div>
  );
}

function AllocationPanel({ raceName }: { raceName: string }) {
  const allocation = TYRES.get(raceName);
  return (
    <Panel title="Compound allocation for this race" bodyClassName="p-3">
      {allocation ? (
        <div className="flex flex-wrap items-center gap-3">
          {[
            { code: allocation.hard, role: "Hard" },
            { code: allocation.medium, role: "Medium" },
            { code: allocation.soft, role: "Soft" },
          ].map(({ code, role }) => {
            const look = compoundAppearance(code, allocation);
            return (
              <span key={code} className="flex items-center gap-2 border border-border px-2 py-1">
                <span className="h-4 w-4 rounded-full border border-black/30" style={{ background: look.color }} aria-hidden />
                <span className="text-sm font-semibold">{role}</span>
                <span className="tnum text-xs text-muted-foreground">{code}</span>
              </span>
            );
          })}
          <a href={allocation.source} target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline">
            source
          </a>
        </div>
      ) : (
        <Empty>The compound allocation for this race has not been published in the data bundle.</Empty>
      )}
    </Panel>
  );
}
