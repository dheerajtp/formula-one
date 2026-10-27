import { Empty, ErrorBlock, PageLoader, Panel } from "@/components/Bits";
import { teamColor } from "@/lib/colors";
import { getConstructorStandings, getDriverStandings, type DriverStanding } from "@/lib/jolpica";
import { useAsync } from "@/lib/useAsync";

export function TeamsPage({ season }: { season: number }) {
  const teams = useAsync(() => getConstructorStandings(season), [season]);
  const drivers = useAsync(() => getDriverStandings(season), [season]);
  if (teams.loading) return <PageLoader label="Loading teams" />;
  if (teams.error) return <ErrorBlock message={teams.error} />;
  if (!teams.data?.length) return <Empty>No constructors registered for {season}.</Empty>;

  const rosterByTeam = new Map<string, DriverStanding[]>();
  for (const s of drivers.data ?? []) {
    const key = s.Constructors[0]?.constructorId ?? "";
    rosterByTeam.set(key, [...(rosterByTeam.get(key) ?? []), s]);
  }
  const top = Number(teams.data[0].points) || 1;

  return (
    <Panel title={`${season} constructors standings`} bodyClassName="p-0">
      <ul className="divide-y divide-border">
        {teams.data.map((s) => {
          const id = s.Constructor.constructorId;
          const color = teamColor(id);
          const roster = (rosterByTeam.get(id) ?? []).slice(0, 4);
          return (
            <li key={id} className="p-3">
              <div className="flex items-baseline gap-3">
                <span className="tnum w-6 text-sm text-muted-foreground">{s.position}</span>
                <span className="h-5 w-1" style={{ background: color }} aria-hidden />
                <span className="flex-1 truncate font-bold">{s.Constructor.name}</span>
                <span className="tnum text-lg font-bold">{s.points}</span>
                <span className="label-caps w-10 text-right text-[10px] text-muted-foreground">pts</span>
              </div>
              <div className="mt-1.5 h-1.5 bg-muted">
                <div className="h-full" style={{ width: `${(Number(s.points) / top) * 100}%`, background: color }} />
              </div>
              {roster.length > 0 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {roster
                    .map((r) => {
                      const code = r.Driver.code ?? r.Driver.familyName;
                      return (
                        <a key={r.Driver.driverId} href={`#/drivers/${r.Driver.driverId}`} className="hover:text-primary">
                          {code} ({r.points})
                        </a>
                      );
                    })
                    .reduce<React.ReactNode[]>((acc, node, i) => (i ? acc.concat(" · ", node) : [node]), [])}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
