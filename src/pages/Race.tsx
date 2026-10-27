import { useMemo, useState } from "react";
import { Empty, ErrorBlock, Loading, PageLoader, Panel, PositionBadge } from "@/components/Bits";
import { TrackMap } from "@/components/TrackMap";
import { teamColor } from "@/lib/colors";
import { formatClock, formatDate, formatEventDate, formatInterval } from "@/lib/format";
import { useZoneMode, zoneOf } from "@/lib/timezone";
import {
  getCalendar,
  getLapsByDriver,
  getPitStops,
  getRaceResults,
  type Lap,
  type PitStop,
  type RaceResult,
} from "@/lib/jolpica";
import { CIRCUITS, TYRES, WEATHER, compoundAppearance } from "@/lib/staticData";
import { useAsync } from "@/lib/useAsync";
import { QualifyingBoard } from "./Qualifying";

const TABS = ["Result", "Qualifying", "Lap chart", "Pit stops", "Tyres"] as const;
type Tab = (typeof TABS)[number];

export function RacePage({ season, round }: { season: number; round: number }) {
  const [tab, setTab] = useState<Tab>("Result");
  const timeZone = zoneOf(useZoneMode());
  const calendar = useAsync(() => getCalendar(season), [season]);
  const race = (calendar.data ?? []).find((r) => Number(r.round) === round);

  if (calendar.loading) return <PageLoader label="Loading race" />;
  if (calendar.error) return <ErrorBlock message={calendar.error} />;
  if (!race) {
    return <ErrorBlock message={`Round ${round} of ${season} was not found.`} />;
  }

  const circuit = CIRCUITS.get(race.Circuit.circuitId);
  const weather = WEATHER.get(`${race.Circuit.circuitId}:${race.date}`);
  const allocation = TYRES.get(race.raceName);

  return (
    <div className="flex flex-col gap-4">
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <p className="label-caps text-[11px] text-muted-foreground">
              Round {round} · {season}
            </p>
            <h1 className="mt-0.5 text-2xl font-bold leading-tight sm:text-3xl">{race.raceName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {race.Circuit.circuitName} · {race.Circuit.Location.locality}, {race.Circuit.Location.country} ·{" "}
              {race.time ? formatEventDate(race.date, race.time, timeZone) : formatDate(race.date)}
              {race.time && ` · lights out ${formatClock(race.date, race.time, timeZone)}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              {circuit?.outline.length ? (
                <span className="tnum">Lap length {(circuit.outline.length / 1000).toFixed(2)} km</span>
              ) : null}
              {weather ? (
                <>
                  {weather.tempMax != null && <span className="tnum">Track ~{Math.round(weather.tempMax)}°C air max</span>}
                  {weather.precipitation != null && (
                    <span className="tnum">{weather.precipitation > 0 ? `Wet: ${weather.precipitation} mm` : "Dry: no rain recorded"}</span>
                  )}
                  {weather.windMax != null && <span className="tnum">Wind gusts {Math.round(weather.windMax)} km/h</span>}
                </>
              ) : null}
              {allocation ? (
                <span className="flex items-center gap-1.5">
                  <span className="label-caps text-[10px]">Tyres</span>
                  {[allocation.hard, allocation.medium, allocation.soft].map((code, i) => {
                    const look = compoundAppearance(code, allocation);
                    return (
                      <span
                        key={code}
                        className="tnum rounded-full px-1.5 py-0.5 text-[10px] font-bold text-black"
                        style={{ background: look.color }}
                        title={`${look.label} — ${code}`}
                      >
                        {code}
                      </span>
                    );
                  })}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <a href={`#/replay/${season}/${round}`} className="flex items-center gap-3 border border-border bg-secondary px-3 py-2 hover:border-primary">
              {circuit && <TrackMap outline={circuit.outline} cars={[]} className="h-12 w-12" />}
              <span>
                <span className="label-caps block text-[11px] text-primary">Race replay</span>
                <span className="block text-xs text-muted-foreground">Positions, lap by lap</span>
              </span>
            </a>
            <a href={`#/qualifying/${season}/${round}`} className="flex items-center gap-3 border border-border bg-secondary px-3 py-2 hover:border-primary">
              <span className="flex h-12 w-12 items-center justify-center border border-border text-center text-[10px] font-bold leading-tight text-muted-foreground">
                Q1<br />Q2<br />Q3
              </span>
              <span>
                <span className="label-caps block text-[11px] text-primary">Qualifying</span>
                <span className="block text-xs text-muted-foreground">Grid set, segment by segment</span>
              </span>
            </a>
          </div>
        </div>
        <div role="tablist" aria-label="Race sections" className="flex overflow-x-auto border-t border-border">
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

      {tab === "Result" && <ResultTable season={season} round={round} />}
      {tab === "Qualifying" && <QualifyingBoard season={season} round={round} race={race} />}
      {tab === "Lap chart" && <LapSection season={season} round={round} />}
      {tab === "Pit stops" && <PitStopSection season={season} round={round} />}
      {tab === "Tyres" && <TyreSection season={season} round={round} raceName={race.raceName} />}
    </div>
  );
}

function useRaceData(season: number, round: number) {
  return useAsync(async () => {
    const results = await getRaceResults(season, round);
    const [lapsByDriver, pitStops] = await Promise.all([
      getLapsByDriver(season, round),
      getPitStops(season, round),
    ]);
    return { results, lapsByDriver, pitStops };
  }, [season, round]);
}

function ResultTable({ season, round }: { season: number; round: number }) {
  const { data, loading, error } = useAsync(async () => {
    const [results, pitStops] = await Promise.all([
      getRaceResults(season, round),
      getPitStops(season, round),
    ]);
    return { results, pitStops };
  }, [season, round]);
  if (loading) return <Loading label="Loading classification" />;
  if (error) return <ErrorBlock message={error} />;
  if (!data?.results.length) return <Empty>No classification recorded for this round yet.</Empty>;

  const stopsByDriver = new Map<string, number>();
  for (const stop of data.pitStops) stopsByDriver.set(stop.driverId, (stopsByDriver.get(stop.driverId) ?? 0) + 1);

  return (
    <Panel title="Race classification" bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="label-caps border-b border-border text-left text-[10px] text-muted-foreground">
              <th className="px-3 py-2 font-medium">Pos</th>
              <th className="px-3 py-2 font-medium">Driver</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-2 py-2 text-right font-medium">Grid</th>
              <th className="px-2 py-2 text-right font-medium">Stops</th>
              <th className="px-2 py-2 text-right font-medium">Pts</th>
              <th className="px-3 py-2 text-right font-medium">Time / status</th>
              <th className="px-3 py-2 text-right font-medium">Fastest lap</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((r) => (
              <tr key={r.Driver.driverId} className="border-b border-border/50 last:border-b-0 hover:bg-secondary/50">
                <td className="px-3 py-1.5">
                  <PositionBadge position={r.positionText} />
                </td>
                <td className="px-3 py-1.5">
                  <a href={`#/drivers/${r.Driver.driverId}`} className="font-semibold hover:text-primary">
                    {r.Driver.familyName}
                  </a>
                  <span className="ml-1.5 text-xs text-muted-foreground">{r.Driver.code}</span>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  <span
                    className="mr-1.5 inline-block h-2.5 w-[3px] align-middle"
                    style={{ background: teamColor(r.Constructor.constructorId) }}
                    aria-hidden
                  />
                  {r.Constructor.name}
                </td>
                <td className="tnum px-2 py-1.5 text-right">{r.grid}</td>
                <td className="tnum px-2 py-1.5 text-right">{stopsByDriver.get(r.Driver.driverId) ?? 0}</td>
                <td className="tnum px-2 py-1.5 text-right font-semibold">{r.points}</td>
                <td className="tnum px-3 py-1.5 text-right">
                  {r.Time ? (
                    Number(r.position) === 1 ? (
                      r.Time.time
                    ) : (
                      formatInterval(r.Time.time)
                    )
                  ) : (
                    <span className="text-destructive">{r.status}</span>
                  )}
                </td>
                <td className="tnum px-3 py-1.5 text-right text-xs text-muted-foreground">
                  {r.FastestLap ? `${r.FastestLap.Time.time} (L${r.FastestLap.lap})` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function LapSection({ season, round }: { season: number; round: number }) {
  const { data, loading, error } = useRaceData(season, round);
  const [visible, setVisible] = useState<string[]>([]);

  const series = useMemo(() => buildPositionSeries(data?.lapsByDriver ?? {}, data?.results ?? []), [data]);
  const shown = visible.length ? series.filter((s) => visible.includes(s.driverId)) : series.slice(0, 8);

  if (loading) return <Loading label="Loading lap data" />;
  if (error) return <ErrorBlock message={error} />;
  if (!series.length) return <Empty>Lap-by-lap positions are not available for this round.</Empty>;

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Positions through the race" bodyClassName="p-3">
        <PositionChart series={shown} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Lower is better. Positions are the official classification at the end of each lap.
        </p>
      </Panel>
      <Panel title="Drivers" bodyClassName="p-3">
        <div className="flex flex-wrap gap-1.5">
          {series.map((s) => {
            const active = shown.some((x) => x.driverId === s.driverId);
            return (
              <button
                key={s.driverId}
                type="button"
                onClick={() => setVisible((prev) => toggle(prev, s.driverId, active))}
                aria-pressed={active}
                className={`label-caps flex items-center gap-1.5 border px-2 py-1 text-[10px] ${
                  active ? "border-foreground/40 bg-secondary text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
                {s.code}
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function toggle(prev: string[], driverId: string, active: boolean) {
  return active ? (prev.length > 1 ? prev.filter((id) => id !== driverId) : prev) : [...prev, driverId];
}

interface PositionSeries {
  driverId: string;
  code: string;
  color: string;
  points: { lap: number; position: number }[];
}

function buildPositionSeries(lapsByDriver: Record<string, Lap[]>, results: RaceResult[]): PositionSeries[] {
  return results
    .map((r) => {
      const laps = lapsByDriver[r.Driver.driverId] ?? [];
      return {
        driverId: r.Driver.driverId,
        code: r.Driver.code ?? r.Driver.familyName.slice(0, 3).toUpperCase(),
        color: teamColor(r.Constructor.constructorId),
        points: laps.flatMap((l) => (l.position == null ? [] : [{ lap: l.number, position: l.position }])),
      };
    })
    .filter((s) => s.points.length > 1)
    .sort((a, b) => a.points[0].position - b.points[0].position);
}

function PositionChart({ series }: { series: PositionSeries[] }) {
  const W = 900;
  const H = 320;
  const pad = { l: 26, r: 8, t: 8, b: 22 };
  const maxLap = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.lap)));
  const maxPos = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.position)));
  const x = (lap: number) => pad.l + (lap / maxLap) * (W - pad.l - pad.r);
  const y = (pos: number) => pad.t + ((pos - 0.5) / maxPos) * (H - pad.t - pad.b);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Race positions by lap">
      {Array.from({ length: maxPos }, (_, i) => i + 1)
        .filter((p) => p === 1 || p === Math.ceil(maxPos / 2) || p === maxPos || maxPos <= 12)
        .map((p) => (
          <g key={p}>
            <line x1={pad.l} y1={y(p)} x2={W - pad.r} y2={y(p)} stroke="#ffffff10" strokeWidth={1} />
            <text x={pad.l - 6} y={y(p) + 3} textAnchor="end" fontSize={9} fill="#8b949f">
              P{p}
            </text>
          </g>
        ))}
      {series.map((s) => (
        <polyline
          key={s.driverId}
          points={s.points.map((p) => `${x(p.lap).toFixed(1)},${y(p.position).toFixed(1)}`).join(" ")}
          fill="none"
          stroke={s.color}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      ))}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <text key={f} x={x(maxLap * f)} y={H - 6} textAnchor="middle" fontSize={9} fill="#8b949f">
          L{Math.round(maxLap * f)}
        </text>
      ))}
    </svg>
  );
}

function PitStopSection({ season, round }: { season: number; round: number }) {
  const { data, loading, error } = useRaceData(season, round);
  if (loading) return <Loading label="Loading pit stops" />;
  if (error) return <ErrorBlock message={error} />;
  const stops = data?.pitStops ?? [];
  if (!stops.length) return <Empty>No pit stops recorded for this round.</Empty>;

  const byDriver = new Map<string, PitStop[]>();
  for (const stop of stops) {
    const list = byDriver.get(stop.driverId) ?? [];
    list.push(stop);
    byDriver.set(stop.driverId, list);
  }
  const results = data?.results ?? [];
  const totalLaps = Math.max(1, ...results.map((r) => Number(r.laps) || 0));

  return (
    <Panel title="Pit stop windows" bodyClassName="p-3">
      <div className="flex flex-col gap-2">
        {results
          .filter((r) => byDriver.has(r.Driver.driverId))
          .map((r) => {
            const driverStops = [...byDriver.get(r.Driver.driverId)!].sort((a, b) => Number(a.lap) - Number(b.lap));
            const color = teamColor(r.Constructor.constructorId);
            return (
              <div key={r.Driver.driverId} className="grid grid-cols-[7.5rem_1fr] items-center gap-3">
                <span className="truncate text-xs">
                  <span className="tnum mr-1 text-muted-foreground">P{r.position}</span>
                  {r.Driver.code}
                </span>
                <div className="relative h-5 bg-muted" title={`${driverStops.length} stops`}>
                  {driverStops.map((stop, i) => (
                    <span
                      key={stop.stop}
                      className="absolute top-0 h-full w-[2px]"
                      style={{ left: `${(Number(stop.lap) / totalLaps) * 100}%`, background: color }}
                      title={`Stop ${i + 1} on lap ${stop.lap} — ${stop.duration}s`}
                    />
                  ))}
                  <span className="tnum absolute right-1 top-0.5 text-[10px] text-muted-foreground">
                    {driverStops.length} stop{driverStops.length > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            );
          })}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Each mark is an official pit stop, placed at the lap it happened. Hover for the stationary time.
      </p>
    </Panel>
  );
}

function TyreSection({ season, round, raceName }: { season: number; round: number; raceName: string }) {
  const { data, loading, error } = useRaceData(season, round);
  const allocation = TYRES.get(raceName);

  if (loading) return <Loading label="Loading stints" />;
  if (error) return <ErrorBlock message={error} />;
  const results = data?.results ?? [];
  if (!results.length) return <Empty>No stint data for this round.</Empty>;

  const stops = new Map<string, PitStop[]>();
  for (const stop of data?.pitStops ?? []) {
    const list = stops.get(stop.driverId) ?? [];
    list.push(stop);
    stops.set(stop.driverId, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Race allocation" bodyClassName="p-3">
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
          <Empty>The compound allocation for this race has not been published yet.</Empty>
        )}
      </Panel>

      <Panel title="Stints from official pit stops" bodyClassName="p-3">
        <div className="flex flex-col gap-2">
          {results.map((r) => {
            const driverStops = [...(stops.get(r.Driver.driverId) ?? [])].sort((a, b) => Number(a.lap) - Number(b.lap));
            const laps = Number(r.laps) || 0;
            const bounds = [0, ...driverStops.map((s) => Number(s.lap)), laps].filter((v, i, a) => v > 0 && (i === 0 || a[i - 1] !== v));
            const segments: { start: number; end: number }[] = [];
            let cursor = 1;
            for (const b of bounds) {
              if (b > cursor) segments.push({ start: cursor, end: b - 1 });
              cursor = b;
            }
            if (cursor <= laps) segments.push({ start: cursor, end: laps });
            const color = teamColor(r.Constructor.constructorId);
            return (
              <div key={r.Driver.driverId} className="grid grid-cols-[7.5rem_1fr] items-center gap-3">
                <span className="truncate text-xs">
                  <span className="tnum mr-1 text-muted-foreground">P{r.position}</span>
                  {r.Driver.code}
                </span>
                <div className="flex h-5 gap-[2px]" title={`${segments.length} stints`}>
                  {segments.map((s, i) => (
                    <span
                      key={i}
                      className="flex items-center justify-center text-[9px] font-semibold text-black/70"
                      style={{
                        width: `${((s.end - s.start + 1) / Math.max(1, laps)) * 100}%`,
                        background: color,
                        opacity: 1 - i * 0.22,
                      }}
                    >
                      {s.end - s.start + 1}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Bar width is stint length in laps. Which specific compound a driver ran is part of the gated timing feed, so
          stints are shown unlabelled rather than guessed.
        </p>
      </Panel>
    </div>
  );
}
