import { useMemo, useState } from "react";
import { Empty, ErrorBlock, Loading, PageLoader, Panel } from "@/components/Bits";
import { TrackMap } from "@/components/TrackMap";
import { teamColor } from "@/lib/colors";
import { formatDate } from "@/lib/format";
import { formatLapTime } from "@/lib/format";
import {
  getCalendar,
  getCircuitFastestLaps,
  getCircuitHistory,
  type CircuitEdition,
} from "@/lib/jolpica";
import { buildLapRecords, type LapRecord } from "@/lib/records";
import { CIRCUITS } from "@/lib/staticData";
import { useAsync } from "@/lib/useAsync";
import type { ReactNode } from "react";

const LATEST_SHOWN = 12;

interface WinTally {
  id: string;
  name: string;
  sub: string;
  count: number;
}

export function CircuitPage({ circuitId, season }: { circuitId: string; season: number }) {
  const atlas = CIRCUITS.get(circuitId);
  const history = useAsync(() => getCircuitHistory(circuitId), [circuitId]);
  const calendar = useAsync(() => getCalendar(season), [season]);
  const lapRecords = useAsync(() => getCircuitFastestLaps(circuitId), [circuitId]);
  const fastestLaps = useMemo(() => buildLapRecords(lapRecords.data ?? []), [lapRecords.data]);

  const editions = useMemo(() => history.data ?? [], [history.data]);
  const latest = editions.length ? editions[editions.length - 1] : null;
  const first = editions[0] ?? null;
  const info = latest?.circuit;
  const onCalendar = (calendar.data ?? []).find((race) => race.Circuit.circuitId === circuitId);

  const driverWins = useMemo(() => {
    const map = new Map<string, WinTally & { constructorId: string }>();
    for (const edition of editions) {
      const id = edition.winner.driverId;
      const found = map.get(id);
      if (found) {
        found.count += 1;
        found.sub = edition.team.name;
        found.constructorId = edition.team.constructorId;
      } else {
        map.set(id, {
          id,
          name: `${edition.winner.givenName} ${edition.winner.familyName}`,
          sub: edition.team.name,
          count: 1,
          constructorId: edition.team.constructorId,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [editions]);

  const teamWins = useMemo(() => {
    const map = new Map<string, WinTally>();
    for (const edition of editions) {
      const id = edition.team.constructorId;
      const found = map.get(id);
      if (found) found.count += 1;
      else map.set(id, { id, name: edition.team.name, sub: "", count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [editions]);

  if (!atlas && !info) {
    if (history.loading) return <PageLoader label="Loading the circuit" />;
    if (history.error) return <ErrorBlock message={history.error} />;
    return <ErrorBlock message={`No circuit record matches “${circuitId}”.`} />;
  }

  const name = atlas?.name ?? info?.circuitName ?? circuitId;
  const locality = atlas?.locality ?? info?.Location.locality ?? "";
  const country = atlas?.country ?? info?.Location.country ?? "";
  const wiki = atlas?.wikipedia ?? info?.url ?? null;
  const length = atlas?.outline.length ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="label-caps text-[11px] text-muted-foreground">Circuit profile</p>
            <h1 className="mt-0.5 text-2xl font-bold leading-tight sm:text-3xl">{name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {locality}
              {locality && country ? ", " : ""}
              {country}
              {length ? ` · ${(length / 1000).toFixed(2)} km lap` : ""}
            </p>

            {onCalendar ? (
              <p className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={`#/weekend/${season}/${onCalendar.round}`}
                  className="label-caps bg-primary px-2.5 py-1 text-[11px] text-primary-foreground hover:bg-primary/90"
                >
                  On the {season} calendar · R{onCalendar.round}
                </a>
                <a
                  href={`#/race/${season}/${onCalendar.round}`}
                  className="label-caps border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
                >
                  Race entry →
                </a>
              </p>
            ) : (
              <p className="mt-3 text-[11px] text-muted-foreground">Not on the {season} calendar.</p>
            )}

            {latest && (
              <p className="mt-3 text-sm">
                <span className="label-caps text-[10px] text-muted-foreground">Last winner</span>{" "}
                <a href={`#/drivers/${latest.winner.driverId}`} className="font-semibold hover:text-primary">
                  {latest.winner.givenName} {latest.winner.familyName}
                </a>
                <span className="text-muted-foreground">
                  {" "}
                  · {latest.team.name} · {latest.season}
                </span>
              </p>
            )}

            {wiki && (
              <a
                href={wiki}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-[11px] text-primary hover:underline"
              >
                Circuit history on Wikipedia →
              </a>
            )}
          </div>

          {atlas ? (
            <div className="h-40 w-40 shrink-0 self-center sm:h-48 sm:w-48">
              <TrackMap outline={atlas.outline} cars={[]} className="h-full w-full" />
            </div>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 border-t border-border sm:grid-cols-4 sm:divide-x sm:divide-border">
          <Stat label="Editions" value={editions.length || "—"} />
          <Stat label="First held" value={first?.season ?? "—"} />
          <Stat label="Last held" value={latest?.season ?? "—"} />
          <Stat label="Different winners" value={driverWins.length || "—"} />
        </dl>
      </Panel>

      <FastestLapPanel loading={lapRecords.loading} error={lapRecords.error} records={fastestLaps} />

      {history.loading ? (
        <Panel title="Winners here">
          <Loading label="Building the circuit record" />
        </Panel>
      ) : history.error ? (
        <Panel title="Winners here">
          <ErrorBlock message={history.error} />
        </Panel>
      ) : editions.length === 0 ? (
        <Panel title="Winners here">
          <Empty>No race results are published for this circuit.</Empty>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <WinnersPanel editions={editions} />
          <div className="flex flex-col gap-4">
            <WinBoard
              title="Most wins · drivers"
              rows={driverWins.slice(0, 6).map((row) => ({
                ...row,
                color: teamColor(row.constructorId),
                href: `#/drivers/${row.id}`,
              }))}
            />
            <WinBoard
              title="Most wins · teams"
              rows={teamWins.slice(0, 6).map((row) => ({
                ...row,
                color: teamColor(row.id),
              }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="label-caps text-[9px] text-muted-foreground">{label}</dt>
      <dd className="tnum mt-0.5 text-xl font-bold leading-none">{value}</dd>
    </div>
  );
}

function WinnersPanel({ editions }: { editions: CircuitEdition[] }) {
  const [showAll, setShowAll] = useState(false);
  const latestFirst = useMemo(() => [...editions].reverse(), [editions]);
  const shown = showAll ? latestFirst : latestFirst.slice(0, LATEST_SHOWN);

  return (
    <Panel
      title={`Winners here · ${editions.length} edition${editions.length === 1 ? "" : "s"}`}
      bodyClassName="p-0"
    >
      <ul className="divide-y divide-border/60">
        {shown.map((edition) => (
          <li
            key={`${edition.season}:${edition.round}`}
            className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 hover:bg-secondary/50"
          >
            <span>
              <a
                href={`#/race/${edition.season}/${edition.round}`}
                className="tnum block text-sm font-semibold hover:text-primary"
              >
                {edition.season}
              </a>
              <span className="label-caps block text-[9px] text-muted-foreground">R{edition.round}</span>
            </span>
            <span className="min-w-0">
              <a
                href={`#/drivers/${edition.winner.driverId}`}
                className="block truncate text-sm font-semibold hover:text-primary"
              >
                {edition.winner.givenName} {edition.winner.familyName}
              </a>
              <span
                className="block truncate text-[11px] text-muted-foreground"
                style={{ borderLeft: `3px solid ${teamColor(edition.team.constructorId)}`, paddingLeft: 6 }}
              >
                {edition.team.name}
              </span>
            </span>
            <span className="tnum text-right text-[11px] text-muted-foreground" title={formatDate(edition.date)}>
              {edition.time ?? edition.status}
            </span>
          </li>
        ))}
      </ul>
      {editions.length > LATEST_SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="label-caps block w-full border-t border-border px-3 py-2 text-left text-[11px] text-primary hover:bg-secondary"
        >
          {showAll ? `Show latest ${LATEST_SHOWN}` : `Show all ${editions.length} editions`}
        </button>
      )}
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Newest first. The year opens the full race entry; the time is the official winning time.
      </p>
    </Panel>
  );
}

function WinBoard({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; name: string; sub: string; count: number; color: string; href?: string }[];
}) {
  const top = rows[0]?.count || 1;
  return (
    <Panel title={title} bodyClassName="p-0">
      <ul className="divide-y divide-border/60">
        {rows.map((row) => (
          <li key={row.id} className="px-3 py-2">
            <div className="flex items-baseline justify-between gap-3">
              {row.href ? (
                <a href={row.href} className="min-w-0 truncate text-sm font-semibold hover:text-primary">
                  {row.name}
                </a>
              ) : (
                <span className="min-w-0 truncate text-sm font-semibold">{row.name}</span>
              )}
              <span className="tnum shrink-0 text-sm font-bold">{row.count}</span>
            </div>
            {row.sub && <span className="block truncate text-[11px] text-muted-foreground">{row.sub}</span>}
            <div className="mt-1.5 h-1 bg-muted" role="presentation">
              <div className="h-full" style={{ width: `${(row.count / top) * 100}%`, background: row.color }} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Presentation limit: the headline plus the next four editions. */
const FASTEST_SHOWN = 5;

function FastestLapPanel({
  loading,
  error,
  records,
}: {
  loading: boolean;
  error: string | null;
  records: LapRecord[];
}) {
  const title = "Fastest race lap here";
  if (loading) {
    return (
      <Panel title={title}>
        <Loading label="Loading fastest race laps" />
      </Panel>
    );
  }
  if (error) {
    return (
      <Panel title={title}>
        <ErrorBlock message={error} />
      </Panel>
    );
  }
  if (!records.length) {
    return (
      <Panel title={title}>
        <Empty>The feed records no race fastest lap at this circuit.</Empty>
      </Panel>
    );
  }
  const [best, ...rest] = records.slice(0, FASTEST_SHOWN);
  return (
    <Panel title={title} bodyClassName="p-0">
      <div className="grid gap-4 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <p className="tnum text-3xl font-bold">{formatLapTime(best.millis)}</p>
          <p className="mt-1 text-sm">
            <a href={`#/drivers/${best.driverId}`} className="font-semibold hover:text-primary">
              {best.driverName}
            </a>{" "}
            <span className="text-muted-foreground">
              <span
                className="mx-1 inline-block h-2.5 w-[3px] align-middle"
                style={{ background: teamColor(best.constructorId) }}
                aria-hidden
              />
              {best.team}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            <a href={`#/race/${best.season}/${best.round}`} className="hover:text-primary">
              {best.season} {best.raceName}
            </a>{" "}
            · lap {best.lap} · {formatDate(best.date)}
          </p>
        </div>
        {rest.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <caption className="sr-only">Next quickest race laps at this circuit</caption>
              <thead>
                <tr className="label-caps border-b border-border text-left text-[10px] text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">Season</th>
                  <th className="px-2 py-1.5 font-medium">Driver</th>
                  <th className="px-2 py-1.5 font-medium">Team</th>
                  <th className="px-2 py-1.5 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((r) => (
                  <tr key={`${r.season}-${r.round}`} className="border-b border-border/50 last:border-b-0">
                    <td className="tnum px-2 py-1">
                      <a href={`#/race/${r.season}/${r.round}`} className="hover:text-primary">
                        {r.season}
                      </a>
                    </td>
                    <td className="px-2 py-1">
                      <a href={`#/drivers/${r.driverId}`} className="font-semibold hover:text-primary">
                        {r.code}
                      </a>
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">{r.team}</td>
                    <td className="tnum px-2 py-1 text-right">{formatLapTime(r.millis)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        {records.length} recorded editions. This is the fastest <strong>race</strong> lap the feed records here —
        qualifying laps are not included, and the feed&apos;s fastest-lap coverage is not continuous across seasons.
      </p>
    </Panel>
  );
}
