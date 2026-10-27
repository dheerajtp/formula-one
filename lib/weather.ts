import type { StaticCircuit } from "./staticData";

/**
 * Foreground weather for a session that has not happened yet.
 *
 * Open-Meteo is free, key-free and CORS-open, which keeps the site static. The
 * recorded weather on a closed race comes from the bundled dataset instead, so
 * this is only asked for while a weekend is still ahead of us.
 */

const HOURLY = "temperature_2m,precipitation_probability,precipitation,wind_speed_10m";

export interface ForecastPoint {
  time: Date;
  tempC: number;
  rainChance: number;
  rainMm: number;
  windKph: number;
}

export interface SessionForecast {
  /** The hour the session starts, plus the two hours before it. */
  around: ForecastPoint[];
}

const cache = new Map<string, SessionForecast>();

function toPoints(body: {
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    precipitation_probability: (number | null)[];
    precipitation: (number | null)[];
    wind_speed_10m: (number | null)[];
  };
}): ForecastPoint[] {
  // A gap in the series becomes NaN and is dropped by the caller.
  const num = (v: number | null | undefined) => v ?? NaN;
  return body.hourly.time.map((time, i) => ({
    time: new Date(`${time}Z`),
    tempC: num(body.hourly.temperature_2m[i]),
    rainChance: num(body.hourly.precipitation_probability[i]),
    rainMm: num(body.hourly.precipitation[i]),
    windKph: num(body.hourly.wind_speed_10m[i]),
  }));
}

/**
 * The forecast around a session start. Returns null when the session is further
 * out than the forecast horizon or the circuit has no coordinates.
 */
export async function forecastFor(circuit: StaticCircuit, start: Date): Promise<SessionForecast | null> {
  if (!Number.isFinite(circuit.lat) || !Number.isFinite(circuit.lng)) return null;
  const key = `${circuit.id}:${start.toISOString().slice(0, 13)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${circuit.lat}&longitude=${circuit.lng}` +
    `&hourly=${HOURLY}&forecast_days=10&timezone=UTC`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  const points = toPoints(
    (await res.json()) as {
      hourly: {
        time: string[];
        temperature_2m: (number | null)[];
        precipitation_probability: (number | null)[];
        precipitation: (number | null)[];
        wind_speed_10m: (number | null)[];
      };
    },
  ).filter((p) => Number.isFinite(p.tempC) && Number.isFinite(p.windKph));

  // The forecast is only useful while the session is inside its horizon.
  const last = points.at(-1);
  if (!last || start.getTime() > last.time.getTime()) return null;

  const at = points.findIndex((p) => p.time.getTime() >= start.getTime());
  const from = Math.max(0, at - 2);
  const forecast: SessionForecast = { around: points.slice(from, Math.max(from, at) + 1) };
  cache.set(key, forecast);
  return forecast;
}

/** One-line read of the hours either side of lights out. */
export function describeForecast(forecast: SessionForecast): string {
  const at = forecast.around.at(-1);
  if (!at) return "";
  const parts = [`${Math.round(at.tempC)}°C`];
  if (at.rainChance >= 20 || at.rainMm > 0.2) {
    parts.push(at.rainMm > 0.2 ? `${at.rainMm.toFixed(1)} mm` : `${Math.round(at.rainChance)}% rain`);
  }
  parts.push(`wind ${Math.round(at.windKph)} km/h`);
  return parts.join(" · ");
}
