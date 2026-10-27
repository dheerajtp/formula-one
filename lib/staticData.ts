import circuitsJson from "@/data/circuits.json";
import driversJson from "@/data/drivers.json";
import tyresJson from "@/data/tyres.json";
import weatherJson from "@/data/weather.json";

/**
 * Static datasets produced by `npm run build-data` from free public sources.
 * Bundling them keeps the deployed site to a single origin (the F1 stats API)
 * and avoids shipping raw geographic files to the browser.
 */

export interface OutlineNode {
  x: number;
  y: number;
}

export interface CircuitOutline {
  /** Centre-line nodes, normalised to a 0..1 square, start/finish first, ring closed. */
  nodes: OutlineNode[];
  /** Cumulative lap fraction for each node, ending at 1. */
  distances: number[];
  /** Lap length in metres where the geometry source records it. */
  length: number | null;
}

export interface StaticCircuit {
  id: string;
  name: string;
  locality: string;
  country: string;
  lat: number;
  lng: number;
  wikipedia: string | null;
  outline: CircuitOutline;
}

export interface TyreAllocation {
  race: string;
  hard: string;
  medium: string;
  soft: string;
  source: string;
}

export interface RaceWeather {
  circuitId: string;
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windMax: number | null;
}

export interface DriverNumber {
  code: string;
  driverId: string;
  number: number;
  name: string;
  team: string | null;
}

const circuits = circuitsJson as unknown as StaticCircuit[];
export const CIRCUITS = new Map(circuits.map((c) => [c.id, c]));
export const TYRES = new Map((tyresJson as unknown as TyreAllocation[]).map((t) => [t.race, t]));
export const WEATHER = new Map(
  (weatherJson as unknown as RaceWeather[]).map((w) => [`${w.circuitId}:${w.date}`, w]),
);
export const DRIVER_NUMBERS = driversJson as unknown as DriverNumber[];

/** Coarse land outlines for the calendar map, loaded on demand to keep the first bundle small. */
export async function loadWorld(): Promise<number[][][]> {
  const mod = await import("@/data/world.json");
  return (mod.default ?? mod) as unknown as number[][][];
}

export const COMPOUND_STYLE: Record<string, { label: string; color: string }> = {
  C1: { label: "Hard", color: "#F5F5F5" },
  C2: { label: "Hard", color: "#F5F5F5" },
  C3: { label: "Hard", color: "#F5F5F5" },
  C4: { label: "Medium", color: "#FFD12A" },
  C5: { label: "Soft", color: "#FF2B2B" },
  HARD: { label: "Hard", color: "#F5F5F5" },
  MEDIUM: { label: "Medium", color: "#FFD12A" },
  SOFT: { label: "Soft", color: "#FF2B2B" },
  INTERMEDIATE: { label: "Inter", color: "#3AC55A" },
  WET: { label: "Wet", color: "#0B6BD4" },
};

/**
 * Compound labels are relative to a race's allocation: the hardest of the three
 * nominated compounds is the white Hard, the middle is yellow Medium, the softest red.
 */
export function compoundAppearance(code: string, allocation: TyreAllocation | undefined) {
  if (!allocation) return { label: code, color: "#8B93A1" };
  const rank = [allocation.hard, allocation.medium, allocation.soft].indexOf(code);
  if (rank === 0) return { label: "Hard", color: "#F5F5F5" };
  if (rank === 1) return { label: "Medium", color: "#FFD12A" };
  if (rank === 2) return { label: "Soft", color: "#FF2B2B" };
  return { label: code, color: "#8B93A1" };
}

/** Point on the centre line for a 0..1 lap fraction. */
export function pointAt(outline: CircuitOutline, fraction: number): OutlineNode {
  const f = Math.min(0.999999, Math.max(0, fraction));
  const { nodes, distances } = outline;
  for (let i = 0; i < distances.length - 1; i++) {
    if (f >= distances[i] && f <= distances[i + 1]) {
      const span = distances[i + 1] - distances[i];
      const t = span > 0 ? (f - distances[i]) / span : 0;
      return {
        x: nodes[i].x + (nodes[i + 1].x - nodes[i].x) * t,
        y: nodes[i].y + (nodes[i + 1].y - nodes[i].y) * t,
      };
    }
  }
  return nodes[0];
}

export function outlinePath(outline: CircuitOutline, width = 100): string {
  return outline.nodes
    .map((n, i) => `${i === 0 ? "M" : "L"}${(n.x * width).toFixed(2)} ${(n.y * width).toFixed(2)}`)
    .join(" ");
}
