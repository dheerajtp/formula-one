import type { ReactNode } from "react";
import { DataError, Empty, Loading, Panel } from "@/components/Bits";
import type { Race } from "@/lib/jolpica";
import type { SessionPhase } from "@/lib/live";
import { COMPOUND_STYLE } from "@/lib/staticData";
import type { CompoundSummary, StrategyBaseline, StrategyReport } from "@/lib/strategy";
import { loadStrategy } from "@/lib/strategyLoader";
import { useAsync } from "@/lib/useAsync";

/** Presentation cap on the finisher stint bars. */
const FINISHERS_SHOWN = 10;
const UNKNOWN_COMPOUND = { label: "Unknown", color: "#5b6170" };

function compoundLook(compound: string) {
  return COMPOUND_STYLE[compound?.toUpperCase()] ?? { ...UNKNOWN_COMPOUND, label: compound || UNKNOWN_COMPOUND.label };
}

function seconds(value: number | null | undefined, digits = 2): string {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)} s`;
}

function signedSeconds(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : "±"}${Math.abs(value).toFixed(digits)} s`;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const TITLE = "Pit strategy";

export function WeekendStrategyPanel({
  season,
  round,
  race,
  racePhase,
}: {
  season: number;
  round: number;
  race: Race;
  racePhase: SessionPhase;
}) {
  const raceOver = racePhase === "done";
  const want = raceOver ? "auto" : "baseline";
  // Deliberately not keyed on the page clock: one fetch per phase change.
  const state = useAsync(
    () => loadStrategy(season, round, race, { want, raceOver }),
    [season, round, want],
  );

  if (state.loading) {
    return (
      <Panel title={TITLE}>
        <Loading label="Reading past races at this circuit from OpenF1 — the free feed allows 30 requests a minute" />
      </Panel>
    );
  }
  if (state.error) {
    return (
      <Panel title={TITLE}>
        <DataError message={state.error} />
      </Panel>
    );
  }
  const data = state.data;
  if (!data || data.mode === "missing") {
    return (
      <Panel title={TITLE}>
        <Empty>OpenF1 has no session data for this race, so there is no strategy evidence to show.</Empty>
      </Panel>
    );
  }

  if (data.mode === "actual") {
    return <ActualSummary season={season} round={round} report={data.report} />;
  }

  const baseline = data.mode === "baseline" || data.mode === "awaiting" ? data.baseline : null;
  return (
    <Panel title={TITLE} bodyClassName="p-3">
      {data.mode === "awaiting" && (
        <p className="mb-3 border border-border bg-secondary/50 px-2 py-1.5 text-xs">
          The race is over; OpenF1 has not published this session yet. The actual strategy appears here once it does.
        </p>
      )}
      {racePhase === "live" && (
        <p className="mb-3 border border-primary/40 bg-primary/10 px-2 py-1.5 text-xs">
          Live strategy needs OpenF1&apos;s paid real-time feed, so it is not shown. The actual strategy appears here
          once the session is published.
        </p>
      )}
      {baseline ? (
        <BaselineSummary baseline={baseline} />
      ) : (
        <Empty>
          No completed OpenF1 race at this circuit yet, so there is no baseline. Nothing is estimated in its place.
        </Empty>
      )}
    </Panel>
  );
}

function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="border border-border px-2 py-1.5">
      <p className="label-caps text-[10px] text-muted-foreground">{label}</p>
      <p className="tnum text-base font-semibold leading-tight">{value}</p>
      {detail && <p className="tnum text-[10px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

function BaselineSummary({ baseline }: { baseline: StrategyBaseline }) {
  const seasons = baseline.seasons;
  const seasonLabel =
    seasons.length === 0 ? "" : seasons.length === 1 ? String(seasons[0]) : `${seasons[0]}–${seasons[seasons.length - 1]}`;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs">
        <span className="font-semibold">Historical context</span>
        <span className="text-muted-foreground">
          {" "}
          from {plural(baseline.sessionCount, "past race")}
          {seasonLabel && ` (${seasonLabel})`} at this circuit — not a prediction for this race.
        </span>
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat
          label="Median stops"
          value={baseline.medianStopCount ?? "—"}
          detail={
            baseline.minStopCount != null && baseline.maxStopCount != null
              ? `observed ${baseline.minStopCount}–${baseline.maxStopCount}`
              : undefined
          }
        />
        <Stat
          label="Typical pit loss"
          value={seconds(baseline.medianPitLossS)}
          detail={plural(baseline.pitLossSamples, "measured stop")}
        />
        <Stat label="Driver-races" value={baseline.driverRaceSamples} />
      </div>
      <CompoundRows compounds={baseline.compounds} />
      <Footnote />
    </div>
  );
}

function CompoundRows({ compounds }: { compounds: CompoundSummary[] }) {
  if (!compounds.length) return <Empty>No stints were published, so tyre behaviour cannot be summarised.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[300px] text-xs">
        <caption className="sr-only">Median stint length and degradation by compound</caption>
        <thead>
          <tr className="label-caps border-b border-border text-left text-[10px] text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Compound</th>
            <th className="px-2 py-1 text-right font-medium">Median stint</th>
            <th className="px-2 py-1 text-right font-medium">Degradation</th>
            <th className="py-1 pl-2 text-right font-medium">Stints · laps</th>
          </tr>
        </thead>
        <tbody>
          {compounds.map((c) => {
            const look = compoundLook(c.compound);
            return (
              <tr key={c.compound} className="border-b border-border/50 last:border-b-0">
                <td className="py-1 pr-2">
                  <span
                    className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border border-black/30 align-middle"
                    style={{ background: look.color }}
                    aria-hidden
                  />
                  {look.label}
                </td>
                <td className="tnum px-2 py-1 text-right">
                  {c.medianStintLengthLaps == null ? "—" : `${c.medianStintLengthLaps} laps`}
                </td>
                <td className="tnum px-2 py-1 text-right">
                  {c.medianDegradationS == null ? "not enough clean laps" : `${signedSeconds(c.medianDegradationS)}/lap`}
                </td>
                <td className="tnum py-1 pl-2 text-right text-muted-foreground">
                  {c.stintCount} · {c.degradationSamples}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActualSummary({ season, round, report }: { season: number; round: number; report: StrategyReport }) {
  const stops = report.drivers.reduce((sum, d) => sum + d.stops.length, 0);
  const finishers = report.drivers.filter((d) => d.position != null).slice(0, FINISHERS_SHOWN);
  const totalLaps = report.totalLaps;
  return (
    <Panel
      title={TITLE}
      action={
        <a
          href={`#/race/${season}/${round}/strategy`}
          className="label-caps text-[11px] text-primary hover:underline"
        >
          Full strategy →
        </a>
      }
      bodyClassName="p-3"
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Race laps" value={totalLaps ?? "—"} />
          <Stat
            label="Recorded stops"
            value={stops}
            detail={report.excludedStops ? `${report.excludedStops} neutralised` : "none neutralised"}
          />
          <Stat
            label="Median pit loss"
            value={seconds(report.pitLossMedianS)}
            detail={plural(report.pitLossSamples, "measured stop")}
          />
          <Stat
            label="Compounds used"
            value={report.compounds.length ? report.compounds.map((c) => compoundLook(c.compound).label).join(" · ") : "—"}
          />
        </div>

        {totalLaps && finishers.some((d) => d.stints.length) ? (
          <div>
            <p className="label-caps mb-1.5 text-[10px] text-muted-foreground">
              Top {finishers.length} finishers · tyre stints
            </p>
            <ol className="flex flex-col gap-1">
              {finishers.map((driver) => (
                <li key={driver.driverNumber} className="grid grid-cols-[3.75rem_1fr] items-center gap-2">
                  <span className="truncate text-xs">
                    <span className="tnum mr-1 text-muted-foreground">P{driver.position}</span>
                    {driver.code}
                  </span>
                  {driver.stints.length ? (
                    <div className="flex h-4 gap-[2px]">
                      {driver.stints.map((stint) => {
                        const look = compoundLook(stint.compound);
                        const label = `${driver.code} ${look.label}: laps ${stint.lapStart}–${stint.lapEnd} (${stint.lengthLaps} laps)`;
                        return (
                          <span
                            key={stint.stintNumber}
                            className="flex min-w-0 items-center justify-center overflow-hidden text-[9px] font-bold text-black/75"
                            style={{ width: `${(stint.lengthLaps / totalLaps) * 100}%`, background: look.color }}
                            title={label}
                            aria-label={label}
                          >
                            <span className="truncate px-0.5">
                              {look.label.charAt(0)}
                              {stint.lengthLaps}
                            </span>
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
          </div>
        ) : (
          <Empty>OpenF1 has published no stints for this session, so tyre compounds are unavailable.</Empty>
        )}
        <Footnote />
      </div>
    </Panel>
  );
}

function Footnote() {
  return (
    <p className="text-[11px] text-muted-foreground">
      Measured pit loss = in-lap + out-lap − 2 × the driver&apos;s median clean lap; stops under red flag, safety car or
      track-wide yellow are left out. Stints and race control from OpenF1; official stops from Jolpica.
    </p>
  );
}
