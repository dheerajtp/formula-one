import { useMemo } from "react";
import { Empty, ErrorBlock, PageLoader, Panel, PositionBadge, StatRow } from "@/components/Bits";
import { teamColor } from "@/lib/colors";
import { formatDate } from "@/lib/format";
import { getDriverCareerResults, getDriverInfo, type CareerRaceResult } from "@/lib/jolpica";
import { useAsync } from "@/lib/useAsync";

export function DriverPage({ driverId }: { driverId: string }) {
  const info = useAsync(() => getDriverInfo(driverId), [driverId]);
  const results = useAsync(() => getDriverCareerResults(driverId), [driverId]);

  const career = useMemo(() => summarise(results.data ?? []), [results.data]);

  if (info.loading || results.loading) return <PageLoader label="Loading driver" />;
  if (info.error) return <ErrorBlock message={info.error} />;
  if (!info.data) return <ErrorBlock message={`No driver record for "${driverId}".`} />;

  const d = info.data;
  const color = teamColor(career.seasons[0]?.constructorId ?? "");

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Panel bodyClassName="p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-14 w-14 items-center justify-center border-2" style={{ borderColor: color }}>
              <span className="tnum text-2xl font-bold">{d.permanentNumber ?? d.code}</span>
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight">
                {d.givenName} {d.familyName}
              </h1>
              <p className="text-xs text-muted-foreground">
                {d.nationality}
                {d.dateOfBirth ? ` · born ${formatDate(d.dateOfBirth)}` : ""}
              </p>
              {d.code && <p className="tnum mt-0.5 text-xs text-muted-foreground">{d.code}</p>}
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-2">
            <StatRow label="Race starts" value={career.starts} />
            <StatRow label="Wins" value={career.wins} />
            <StatRow label="Podiums" value={career.podiums} />
            <StatRow label="Pole positions" value={career.poles} />
            <StatRow label="Fastest laps" value={career.fastests} />
            <StatRow label="Career points" value={career.points} />
          </div>
          {d.url && (
            <a
              href={d.url}
              target="_blank"
              rel="noreferrer"
              className="label-caps mt-3 inline-block border border-border px-2 py-1 text-[11px] hover:bg-secondary"
            >
              Wikipedia
            </a>
          )}
        </Panel>
      </div>

      <div className="flex flex-col gap-4">
        <Panel title="By season" bodyClassName="p-0">
          {career.seasons.length === 0 ? (
            <Empty>No race results on record.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="label-caps border-b border-border text-left text-[10px] text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Season</th>
                    <th className="px-3 py-2 font-medium">Team</th>
                    <th className="px-2 py-2 text-right font-medium">Starts</th>
                    <th className="px-2 py-2 text-right font-medium">Wins</th>
                    <th className="px-2 py-2 text-right font-medium">Podiums</th>
                    <th className="px-3 py-2 text-right font-medium">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {career.seasons.map((s) => (
                    <tr key={s.season} className="border-b border-border/50 last:border-b-0">
                      <td className="tnum px-3 py-1.5 font-semibold">{s.season}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        <span
                          className="mr-1.5 inline-block h-2.5 w-[3px] align-middle"
                          style={{ background: teamColor(s.constructorId) }}
                          aria-hidden
                        />
                        {s.team}
                      </td>
                      <td className="tnum px-2 py-1.5 text-right">{s.starts}</td>
                      <td className="tnum px-2 py-1.5 text-right">{s.wins}</td>
                      <td className="tnum px-2 py-1.5 text-right">{s.podiums}</td>
                      <td className="tnum px-3 py-1.5 text-right font-semibold">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Recent races" bodyClassName="p-0">
          {(results.data ?? []).length === 0 ? (
            <Empty>No races found.</Empty>
          ) : (
            <ul className="divide-y divide-border/50">
              {[...(results.data ?? [])]
                .sort((a, b) => Number(b.season) - Number(a.season) || Number(b.round) - Number(a.round))
                .slice(0, 12)
                .map((r) => (
                  <li key={`${r.season}-${r.round}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <PositionBadge position={r.positionText} />
                    <a
                      href={`#/race/${r.season}/${r.round}`}
                      className="min-w-0 flex-1 truncate hover:text-primary"
                      title={`${r.Constructor.name} — ${r.status}`}
                    >
                      {r.raceName}
                      <span className="ml-2 text-[11px] text-muted-foreground">{formatDate(r.date)}</span>
                    </a>
                    <span className="tnum w-24 text-right text-xs text-muted-foreground">
                      {r.Time ? r.Time.time : r.status}
                    </span>
                    <span className="tnum w-8 text-right text-xs font-semibold">{r.points}p</span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

interface SeasonSummary {
  season: string;
  team: string;
  constructorId: string;
  starts: number;
  wins: number;
  podiums: number;
  points: number;
}

function summarise(results: CareerRaceResult[]) {
  const bySeason = new Map<string, SeasonSummary>();
  for (const r of results) {
    const entry =
      bySeason.get(r.season) ??
      {
        season: r.season,
        team: r.Constructor.name,
        constructorId: r.Constructor.constructorId,
        starts: 0,
        wins: 0,
        podiums: 0,
        points: 0,
      };
    entry.starts += 1;
    if (Number(r.position) === 1) entry.wins += 1;
    if (Number(r.position) > 0 && Number(r.position) <= 3) entry.podiums += 1;
    entry.points += Number(r.points) || 0;
    bySeason.set(r.season, entry);
  }

  return {
    starts: results.length,
    wins: results.filter((r) => Number(r.position) === 1).length,
    podiums: results.filter((r) => Number(r.position) > 0 && Number(r.position) <= 3).length,
    poles: results.filter((r) => Number(r.grid) === 1).length,
    fastests: results.filter((r) => Number(r.FastestLap?.rank) === 1).length,
    points: results.reduce((sum, r) => sum + (Number(r.points) || 0), 0),
    seasons: [...bySeason.values()].sort((a, b) => b.season.localeCompare(a.season)),
  };
}
