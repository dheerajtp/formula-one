import { useMemo } from "react";
import { loadWorld } from "@/lib/staticData";
import { useAsync } from "@/lib/useAsync";

export interface WorldPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  href: string;
  /** Pins with emphasis get the primary fill and a ring. */
  highlight?: boolean;
}

/** Equirectangular projection into a 360x180 degree-space viewBox. */
function project(lat: number, lng: number) {
  return { x: lng + 180, y: 90 - lat };
}

/**
 * The coarse land outline behind the calendar and the circuit atlas. Pins are
 * links, so the map doubles as an index of the venues it plots.
 */
export function WorldMap({
  points,
  ariaLabel,
  legend,
}: {
  points: WorldPoint[];
  ariaLabel: string;
  legend: { label: string; highlight: boolean }[];
}) {
  const { data: world } = useAsync(loadWorld, []);
  const land = useMemo(
    () =>
      (world ?? []).map((polygon) => {
        const coords = polygon.map(([lng, lat]) => project(lat, lng));
        return `M${coords.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L")}Z`;
      }),
    [world],
  );

  const placed = useMemo(
    () =>
      points
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
        .map((point) => ({ ...point, ...project(point.lat, point.lng) })),
    [points],
  );

  return (
    <div className="relative">
      <svg viewBox="0 0 360 180" className="h-auto w-full" role="img" aria-label={ariaLabel}>
        <rect width="360" height="180" fill="#080a0d" />
        {land.map((d, i) => (
          <path key={i} d={d} fill="#161c25" stroke="#242c38" strokeWidth={0.25} />
        ))}
        <line x1="0" y1="90" x2="360" y2="90" stroke="#ffffff10" strokeWidth={0.3} />
        {placed.map((point) => (
          <a key={point.id} href={point.href} aria-label={point.label}>
            <title>{point.label}</title>
            <circle
              cx={point.x}
              cy={point.y}
              r={point.highlight ? 3 : 2.2}
              fill={point.highlight ? "#e10600" : "#8b949f"}
              stroke="#07080a"
              strokeWidth={0.5}
            />
            {point.highlight && (
              <circle cx={point.x} cy={point.y} r={5.5} fill="none" stroke="#e10600" strokeWidth={0.4} opacity={0.5} />
            )}
          </a>
        ))}
      </svg>
      <div className="absolute bottom-2 left-3 flex gap-4 text-[10px] uppercase tracking-wider text-muted-foreground">
        {legend.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${item.highlight ? "bg-primary" : "bg-muted-foreground"}`}
              aria-hidden
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
