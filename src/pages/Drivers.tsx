import { useState } from "react";
import { Choice, Empty, ErrorBlock, Loading, PageLoader, Panel } from "@/components/Bits";
import { teamColor } from "@/lib/colors";
import {
  getDriverStandings,
  getSeasonProgression,
  type DriverStanding,
  type Progression,
} from "@/lib/jolpica";
import { DRIVER_NUMBERS } from "@/lib/staticData";
import { useAsync } from "@/lib/useAsync";

const numberByDriver = new Map(DRIVER_NUMBERS.map((d) => [d.driverId, d.number]));

/** Points are whole numbers now, but half points and shared positions are in the history. */
function pts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** A deficit reads as a minus; level on points is not a minus of zero. */
function delta(diff: number): string {
  return diff === 0 ? "level" : `−${pts(-diff)}`;
}

/** Three-letter tags keep the gap column narrow. Codes only exist from 2014, so old seasons fall back. */
function tag(driver: DriverStanding["Driver"]): string {
  return driver.code ?? driver.familyName.slice(0, 3).toUpperCase();
}

const VIEWS = [
  { value: "ladder" as const, label: "Ladder", hint: "Everyone ranked, with how far back they are" },
  { value: "progression" as const, label: "Season", hint: "Cumulative points after every round" },
];

export function DriversPage({ season }: { season: number }) {
  const [view, setView] = useState<"ladder" | "progression">("ladder");
  const { data, loading, error } = useAsync(() => getDriverStandings(season), [season]);
  if (loading) return <PageLoader label="Loading drivers" />;
  if (error) return <ErrorBlock message={error} />;
  if (!data?.length) return <Empty>No drivers registered for {season}.</Empty>;

  return (
    <Panel
      title={`${season} driver standings`}
      action={<Choice label="View" value={view} options={VIEWS} onChange={setView} />}
      bodyClassName="p-0"
    >
      {view === "ladder" ? <Ladder standings={data} /> : <ProgressionChart season={season} standings={data} />}
    </Panel>
  );
}

const ROW = "grid grid-cols-[1.5rem_2rem_minmax(0,1fr)_3rem_6.25rem] items-center gap-2";

/**
 * One row per driver with a bar scaled to their points, so the size of a
 * lead is a length rather than a number to do arithmetic with. Every row also
 * states the two gaps that matter: back to the leader and back to the car
 * directly ahead, which is the one a driver actually races against.
 */
function Ladder({ standings }: { standings: DriverStanding[] }) {
  const top = Number(standings[0].points) || 1;
  const leader = standings[0];
  const second = standings[1];
  const lead = second ? Number(leader.points) - Number(second.points) : 0;
  const leaderCode = tag(leader.Driver);
  const secondCode = second ? tag(second.Driver) : "";

  return (
    <div>
      <p className="border-b border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
        {second ? (
          lead > 0 ? (
            <>
              <span className="font-semibold text-foreground">{leaderCode}</span> leads by{" "}
              <span className="tnum font-semibold text-foreground">{pts(lead)} pts</span> from{" "}
              <span className="font-semibold text-foreground">{secondCode}</span>. Everyone else is measured against
              them.
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground">{leaderCode}</span> and{" "}
              <span className="font-semibold text-foreground">{secondCode}</span> are level on points at the top.
            </>
          )
        ) : (
          <>One driver has scored so far this season.</>
        )}
      </p>

      <div className={`label-caps ${ROW} border-b border-border px-3 py-1.5 text-[9px] text-muted-foreground`}>
        <span>#</span>
        <span />
        <span>Driver · points</span>
        <span className="text-right">Pts</span>
        <span className="text-right">Gap</span>
      </div>

      <ul className="divide-y divide-border">
        {standings.map((s, i) => {
          const points = Number(s.points);
          const ahead = i > 0 ? Number(standings[i - 1].points) : points;
          const color = teamColor(s.Constructors[0]?.constructorId ?? "");
          // Car numbers are not in the feed before 1996, so the three-letter form is
          // the one thing the box can always carry.
          const number = numberByDriver.get(s.Driver.driverId) ?? tag(s.Driver);
          const toLeader = points - top;
          const toAhead = points - ahead;
          const aheadCode = i > 0 ? tag(standings[i - 1].Driver) : "";

          return (
            <li key={s.Driver.driverId} className="px-3 py-2.5 hover:bg-secondary/40">
              <div className={ROW}>
                <span className="tnum text-sm text-muted-foreground">{s.positionText}</span>

                <a
                  href={`#/drivers/${s.Driver.driverId}`}
                  aria-label={`Open ${s.Driver.givenName} ${s.Driver.familyName}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center border"
                  style={{ borderColor: color }}
                >
                  <span className="tnum text-xs font-bold">{number}</span>
                </a>

                <span className="min-w-0">
                  <a
                    href={`#/drivers/${s.Driver.driverId}`}
                    className="block truncate text-sm font-semibold hover:text-primary"
                  >
                    {/* Truncation must never cost the surname, which is how drivers are known. */}
                    <span className="hidden sm:inline">{s.Driver.givenName} </span>
                    {s.Driver.familyName}
                  </a>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {s.Constructors[0]?.name} · {s.wins} win{s.wins === "1" ? "" : "s"}
                    <span className="hidden sm:inline"> · {s.Driver.nationality}</span>
                  </span>
                  <span className="relative mt-1.5 block h-2 bg-muted">
                    <span
                      className="absolute inset-y-0 left-0"
                      style={{ width: `${(points / top) * 100}%`, background: color }}
                    />
                    {i > 0 && ahead > points && (
                      <span
                        className="absolute inset-y-[-2px] w-px bg-foreground/50"
                        style={{ left: `${(ahead / top) * 100}%` }}
                        aria-hidden
                      />
                    )}
                  </span>
                </span>

                <span className="tnum text-right text-lg font-bold leading-none">{pts(points)}</span>

                <span className="text-right leading-tight">
                  {i === 0 ? (
                    <span className="label-caps text-[10px] text-primary">Leader</span>
                  ) : (
                    <>
                      <span className="tnum block text-[11px] font-semibold">
                        {delta(toAhead)}
                        <span className="font-normal text-muted-foreground"> vs {aheadCode}</span>
                      </span>
                      {i > 1 && (
                        <span className="tnum block text-[10px] text-muted-foreground">{delta(toLeader)} to P1</span>
                      )}
                    </>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        The tick inside each bar is where the car ahead sits, so the bar past the tick is the gap being chased.
      </p>
    </div>
  );
}

/* ── season progression ───────────────────────────────────────────────── */

const W = 860;
const H = 340;
const PAD = { top: 14, right: 58, bottom: 30, left: 42 };

/** A gridline step the eye can read: 1, 2, 5, 10, 25, 50 … */
function niceStep(raw: number): number {
  const safe = Math.max(1, raw);
  const mag = 10 ** Math.floor(Math.log10(safe));
  const n = safe / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

function ProgressionChart({ season, standings }: { season: number; standings: DriverStanding[] }) {
  const { data, loading, error } = useAsync(() => getSeasonProgression(season), [season]);
  const [pinned, setPinned] = useState<string[] | null>(null);

  if (loading) return <Loading label="Building the season round by round" />;
  if (error) return <ErrorBlock message={error} />;
  if (!data || data.rounds.length < 2) {
    return <Empty>The {season} season needs two completed rounds before a trend can be drawn.</Empty>;
  }

  const defaults = standings.slice(0, 5).map((s) => s.Driver.driverId);
  const selected = new Set(pinned ?? defaults.filter((id) => data.series.some((s) => s.driverId === id)));
  /** An empty chart explains nothing, so the last line standing is the leader's. */
  const toggle = (driverId: string) => {
    const next = selected.has(driverId) ? [...selected].filter((id) => id !== driverId) : [...selected, driverId];
    setPinned(next.length ? next : [data.series[0].driverId]);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
        {data.series.map((s) => {
          const on = selected.has(s.driverId);
          return (
            <button
              key={s.driverId}
              type="button"
              aria-pressed={on}
              title={`${s.name} · ${s.team}`}
              onClick={() => toggle(s.driverId)}
              className={`flex items-center gap-1.5 border px-1.5 py-0.5 text-[10px] transition-colors ${
                on ? "border-foreground/40 bg-secondary text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="h-2 w-2" style={{ background: teamColor(s.constructorId) }} aria-hidden />
              <span className="label-caps">{s.code}</span>
            </button>
          );
        })}
      </div>

      <Chart data={data} selected={selected} />

      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Cumulative points after each round, so the steep runs are the wins and the flat stretches are the races that
        produced nothing. Pick the chips above to pull a driver into the front.
      </p>
    </div>
  );
}

function Chart({ data, selected }: { data: Progression; selected: Set<string> }) {
  const { rounds, series } = data;
  const max = Math.max(1, ...series.map((s) => s.points.at(-1) ?? 0));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;

  const x = (i: number) => PAD.left + (i / Math.max(1, rounds.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / top) * (H - PAD.top - PAD.bottom);

  const labelEvery = rounds.length > 16 ? 3 : rounds.length > 10 ? 2 : 1;
  const highlighted = series.filter((s) => selected.has(s.driverId));
  const dimmed = series.filter((s) => !selected.has(s.driverId));

  // A points battle ends with totals a few pixels apart, so the name tags are pushed
  // down the right margin instead of printing on top of each other.
  const labelY = new Map<string, number>();
  let lowest = -Infinity;
  for (const s of [...highlighted].sort((a, b) => (b.points.at(-1) ?? 0) - (a.points.at(-1) ?? 0))) {
    const row = Math.max(y(s.points.at(-1) ?? 0), lowest + 15);
    labelY.set(s.driverId, row);
    lowest = row;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Cumulative championship points for each driver round by round in ${rounds.length} rounds`}
    >
      {Array.from({ length: top / step + 1 }, (_, i) => i * step).map((value) => (
        <g key={value}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(value)}
            y2={y(value)}
            stroke="currentColor"
            className="text-border"
            strokeWidth={1}
          />
          <text x={PAD.left - 8} y={y(value) + 4} textAnchor="end" className="tnum text-[11px]" fill="var(--muted-foreground)">
            {value}
          </text>
        </g>
      ))}

      {rounds.map((r, i) =>
        i % labelEvery === 0 || i === rounds.length - 1 ? (
          <text
            key={r.round}
            x={x(i)}
            y={H - PAD.bottom + 16}
            textAnchor="middle"
            className="tnum text-[10px]"
            fill="var(--muted-foreground)"
          >
            {r.round}
            <title>{`${r.circuit} — round ${r.round}`}</title>
          </text>
        ) : null,
      )}
      <text x={(PAD.left + W - PAD.right) / 2} y={H - 2} textAnchor="middle" className="label-caps text-[9px]" fill="var(--muted-foreground)">
        ROUND →
      </text>

      {dimmed.map((s) => (
        <polyline
          key={s.driverId}
          points={s.points.map((_, i) => `${x(i)},${y(s.points[i])}`).join(" ")}
          fill="none"
          stroke={teamColor(s.constructorId)}
          strokeWidth={1.25}
          strokeOpacity={0.16}
        />
      ))}

      {highlighted.map((s) => (
        <g key={s.driverId}>
          <polyline
            points={s.points.map((_, i) => `${x(i)},${y(s.points[i])}`).join(" ")}
            fill="none"
            stroke={teamColor(s.constructorId)}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          {s.points.map((value, i) => (
            <circle key={i} cx={x(i)} cy={y(value)} r={2.6} fill={teamColor(s.constructorId)}>
              <title>{`${rounds[i].locality} · round ${rounds[i].round}: ${s.code} ${pts(value)} pts`}</title>
            </circle>
          ))}
          {(() => {
            const row = labelY.get(s.driverId) ?? y(s.points.at(-1) ?? 0);
            const lastX = x(s.points.length - 1);
            const lastY = y(s.points.at(-1) ?? 0);
            return (
              <>
                {Math.abs(row - lastY) > 2 && (
                  <line x1={lastX + 2} y1={lastY} x2={lastX + 6} y2={row} stroke={teamColor(s.constructorId)} strokeWidth={1} strokeOpacity={0.6} />
                )}
                <text
                  x={lastX + 8}
                  y={row + 4}
                  className="tnum text-[11px] font-semibold"
                  fill={teamColor(s.constructorId)}
                >
                  {s.code} {pts(s.points.at(-1) ?? 0)}
                </text>
              </>
            );
          })()}
        </g>
      ))}
    </svg>
  );
}
