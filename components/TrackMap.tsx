import { useMemo } from "react";
import { outlinePath, pointAt, type CircuitOutline } from "@/lib/staticData";

export interface TrackCar {
  id: string;
  /** Progress around the lap; values outside 0..1 wrap. */
  frac: number;
  /** Offset from the centre line in the outline's normalised units. */
  lateral: number;
  color: string;
  label: string;
  selected: boolean;
  retired: boolean;
}

interface Props {
  outline: CircuitOutline;
  cars: TrackCar[];
  onSelectCar?: (id: string) => void;
  className?: string;
  /** Zoom window in view units, centred on `focusId` when one is given. */
  camera?: { span: number; focusId?: string | null };
}

const VIEW = 100;
const wrap = (f: number) => ((f % 1) + 1) % 1;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Draws the circuit centre-line with cars placed by lap progress.
 * Stroke widths stay in user units so the map scales with its container, and
 * are multiplied by the zoom factor so markers keep their screen size when the
 * camera closes in on the pack.
 */
export function TrackMap({ outline, cars, onSelectCar, className, camera }: Props) {
  const path = useMemo(() => outlinePath(outline, VIEW), [outline]);

  const points = useMemo(
    () =>
      cars.map((car) => {
        const f = wrap(car.frac);
        const p = pointAt(outline, f);
        const ahead = pointAt(outline, wrap(f + 0.004));
        const behind = pointAt(outline, wrap(f - 0.004));
        const tx = ahead.x - behind.x;
        const ty = ahead.y - behind.y;
        const len = Math.hypot(tx, ty) || 1;
        return {
          car,
          x: (p.x + (-ty / len) * car.lateral) * VIEW,
          y: (p.y + (tx / len) * car.lateral) * VIEW,
        };
      }),
    [cars, outline],
  );

  // Nudge grouped cars apart so a pack stays readable where they overlap.
  const span = camera ? clamp(camera.span, 8, VIEW) : VIEW;
  const zoom = span / VIEW;
  const offsets = useMemo(() => spreadCollisions(points, 3.6 * zoom), [points, zoom]);

  const focus = camera?.focusId ? points.find((p) => p.car.id === camera.focusId) : undefined;
  const half = span / 2;
  const cx = clamp(focus?.x ?? VIEW / 2, half, VIEW - half);
  const cy = clamp(focus?.y ?? VIEW / 2, half, VIEW - half);

  return (
    <svg
      viewBox={`${cx - half} ${cy - half} ${span} ${span}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Circuit map with car positions"
    >
      <path
        d={path}
        fill="none"
        stroke="#2a2f38"
        strokeWidth={3.4 * zoom}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={path}
        fill="none"
        stroke="#6b7280"
        strokeWidth={1.1 * zoom}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <StartLine outline={outline} zoom={zoom} />
      {points.map(({ car, x, y }) => {
        const offset = offsets.get(car.id) ?? { dx: 0, dy: 0 };
        return (
          <g
            key={car.id}
            transform={`translate(${x + offset.dx} ${y + offset.dy}) scale(${zoom})`}
            onClick={onSelectCar ? () => onSelectCar(car.id) : undefined}
            className={onSelectCar ? "cursor-pointer" : undefined}
            opacity={car.retired ? 0.45 : 1}
          >
            {car.selected && <circle r={3.6} fill="none" stroke={car.color} strokeWidth={0.5} opacity={0.6} />}
            <circle r={2.1} fill={car.color} stroke="#07080a" strokeWidth={0.5} />
            <text
              y={0.9}
              textAnchor="middle"
              fontSize={2.2}
              fontWeight={700}
              fill="#07080a"
              className="select-none"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {car.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function StartLine({ outline, zoom }: { outline: CircuitOutline; zoom: number }) {
  const a = pointAt(outline, 0);
  const b = pointAt(outline, 0.012);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Half-length lives in the outline's normalised 0..1 space.
  const half = 0.035;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;
  return (
    <line
      x1={(a.x - nx) * VIEW}
      y1={(a.y - ny) * VIEW}
      x2={(a.x + nx) * VIEW}
      y2={(a.y + ny) * VIEW}
      stroke="#e9ebee"
      strokeWidth={0.7 * zoom}
      strokeDasharray={`${1 * zoom} ${1 * zoom}`}
    />
  );
}

/** Separate cars that would otherwise stack, keeping the leader in place. */
function spreadCollisions(
  points: { car: TrackCar; x: number; y: number }[],
  minDistance: number,
) {
  const out = new Map<string, { dx: number; dy: number }>();
  const placed: { x: number; y: number }[] = [];
  for (const point of points) {
    let pos = { x: point.x, y: point.y };
    // Golden-angle search outward for a free slot, so a stacked pack fans out
    // instead of every car converging on the same escape route.
    for (let n = 1; n < 200; n++) {
      if (!placed.some((p) => Math.hypot(p.x - pos.x, p.y - pos.y) < minDistance)) break;
      const angle = n * 2.39996;
      const radius = minDistance * 0.62 * Math.sqrt(n);
      pos = { x: point.x + radius * Math.cos(angle), y: point.y + radius * Math.sin(angle) };
    }
    placed.push(pos);
    out.set(point.car.id, { dx: pos.x - point.x, dy: pos.y - point.y });
  }
  return out;
}
