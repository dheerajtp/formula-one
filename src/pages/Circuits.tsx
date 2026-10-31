import { useMemo } from "react";
import { Empty, ErrorBlock, PageLoader, Panel } from "@/components/Bits";
import { WorldMap, type WorldPoint } from "@/components/WorldMap";
import { getCalendar, type Race } from "@/lib/jolpica";
import { CIRCUITS, type StaticCircuit } from "@/lib/staticData";
import { useAsync } from "@/lib/useAsync";

export function CircuitsPage({ season }: { season: number }) {
  const calendar = useAsync(() => getCalendar(season), [season]);
  const races = useMemo(() => calendar.data ?? [], [calendar.data]);

  const byCircuit = useMemo(() => {
    const map = new Map<string, Race>();
    for (const race of races) map.set(race.Circuit.circuitId, race);
    return map;
  }, [races]);

  const atlas = useMemo(
    () => [...CIRCUITS.values()].sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name)),
    [],
  );
  const offCalendar = atlas.filter((circuit) => !byCircuit.has(circuit.id));

  if (calendar.loading) return <PageLoader label="Loading the circuit atlas" />;
  if (calendar.error) return <ErrorBlock message={calendar.error} />;

  const points: WorldPoint[] = [];
  const plotted = new Set<string>();
  for (const race of races) {
    const id = race.Circuit.circuitId;
    if (plotted.has(id)) continue;
    const circuit = CIRCUITS.get(id);
    const lat = circuit?.lat ?? Number(race.Circuit.Location.lat);
    const lng = circuit?.lng ?? Number(race.Circuit.Location.long);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    plotted.add(id);
    points.push({
      id,
      lat,
      lng,
      label: `${circuit?.name ?? race.Circuit.circuitName} — ${circuit?.locality ?? race.Circuit.Location.locality}, ${circuit?.country ?? race.Circuit.Location.country}`,
      href: `#/circuits/${id}`,
      highlight: true,
    });
  }
  for (const circuit of offCalendar) {
    points.push({
      id: circuit.id,
      lat: circuit.lat,
      lng: circuit.lng,
      label: `${circuit.name} — ${circuit.locality}, ${circuit.country}`,
      href: `#/circuits/${circuit.id}`,
      highlight: false,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Panel title="Circuit atlas" bodyClassName="p-0">
          <WorldMap
            points={points}
            ariaLabel={`Map of the Grand Prix circuits on the ${season} calendar and in the atlas`}
            legend={[
              { label: `on the ${season} calendar`, highlight: true },
              { label: "other venues", highlight: false },
            ]}
          />
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Every venue on the {season} calendar, plus the rest of the {atlas.length}-circuit atlas. A pin or
            a row opens the full record; track geometry is drawn where it is on file.
          </p>
        </Panel>

        <Panel title={`${season} venues`} bodyClassName="p-0">
          {races.length === 0 ? (
            <div className="p-3">
              <Empty>No circuit is scheduled for {season}.</Empty>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {[...races]
                .sort((a, b) => Number(a.round) - Number(b.round))
                .map((race) => (
                  <SeasonVenueRow key={race.round} race={race} />
                ))}
            </ul>
          )}
        </Panel>
      </div>

      {offCalendar.length > 0 && (
        <Panel title="Other venues" bodyClassName="p-0">
          <ul className="divide-y divide-border/60">
            {offCalendar.map((circuit) => (
              <AtlasRow key={circuit.id} circuit={circuit} />
            ))}
          </ul>
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Circuits in the atlas that are not on the {season} calendar. They keep their full records.
          </p>
        </Panel>
      )}
    </div>
  );
}

function SeasonVenueRow({ race }: { race: Race }) {
  const circuit = CIRCUITS.get(race.Circuit.circuitId);
  const round = Number(race.round);
  return (
    <li className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 hover:bg-secondary/50">
      <span className="tnum text-xs text-muted-foreground">R{round}</span>
      <div className="min-w-0">
        <a
          href={`#/circuits/${race.Circuit.circuitId}`}
          className="block truncate text-sm font-semibold hover:text-primary"
        >
          {circuit?.name ?? race.Circuit.circuitName}
        </a>
        <span className="block truncate text-[11px] text-muted-foreground">
          {race.raceName} · {circuit?.locality ?? race.Circuit.Location.locality},{" "}
          {circuit?.country ?? race.Circuit.Location.country}
          {circuit?.outline.length ? ` · ${(circuit.outline.length / 1000).toFixed(2)} km` : ""}
        </span>
      </div>
      <a
        href={`#/weekend/${race.season}/${race.round}`}
        className="label-caps text-[10px] text-primary hover:underline"
      >
        Weekend →
      </a>
    </li>
  );
}

function AtlasRow({ circuit }: { circuit: StaticCircuit }) {
  return (
    <li className="px-3 py-2 hover:bg-secondary/50">
      <a href={`#/circuits/${circuit.id}`} className="block truncate text-sm font-semibold hover:text-primary">
        {circuit.name}
      </a>
      <span className="block truncate text-[11px] text-muted-foreground">
        {circuit.locality}, {circuit.country}
        {circuit.outline.length ? ` · ${(circuit.outline.length / 1000).toFixed(2)} km` : ""}
      </span>
    </li>
  );
}
