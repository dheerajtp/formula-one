export function formatLapTime(millis: number | null | undefined): string {
  if (millis == null || !Number.isFinite(millis)) return "—";
  const minutes = Math.floor(millis / 60000);
  const seconds = (millis % 60000) / 1000;
  return minutes > 0 ? `${minutes}:${seconds.toFixed(3).padStart(6, "0")}` : seconds.toFixed(3);
}

/** The lap feed only supplies "1:37.284"-style strings, so derive millis from them. */
export function parseLapTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parts = value.trim().split(":");
  if (!parts.every((p) => /^\d+(\.\d+)?$/.test(p))) return null;
  let ms = 0;
  for (let i = 0; i < parts.length; i++) {
    ms += Number(parts[i]) * 60 ** (parts.length - 1 - i) * 1000;
  }
  return Math.round(ms);
}

export function formatRaceClock(millis: number): string {
  const total = Math.max(0, Math.floor(millis / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Ergast returns qualifying/finish gaps as "12.345" or "+1L"; keep them verbatim. */
export function formatInterval(value: string | null | undefined): string {
  if (!value) return "—";
  return value.startsWith("+") || value.includes("LAP") ? value : `+${value}`;
}

export function formatGapSeconds(millis: number | null): string {
  if (millis == null) return "";
  return `+${(millis / 1000).toFixed(2)}s`;
}

export function formatDistance(metres: number | null): string {
  if (metres == null) return "";
  return `${metres.toFixed(1)}m`;
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Session times arrive as "13:00:00Z" for some seasons and "13:00:00" for others,
 * so the zone marker is normalised before parsing.
 */
export function utcDateTime(date: string, time?: string): Date {
  const clean = (time ?? "00:00:00").replace(/Z$/, "");
  return new Date(`${date}T${clean}Z`);
}

export function formatDateTime(iso: string, time?: string, timeZone = "UTC"): string {
  const d = utcDateTime(iso, time);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/** The day a session falls on once its clock is placed in `timeZone` — it can differ from the feed's UTC date. */
export function formatEventDate(iso: string, time: string | undefined, timeZone: string): string {
  return utcDateTime(iso, time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
}

export function formatClock(iso: string, time: string | undefined, timeZone: string): string {
  if (!time) return "";
  return utcDateTime(iso, time).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

export function countdown(target: Date, now: Date): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "under way";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
