import { useSyncExternalStore } from "react";

/**
 * Session clocks arrive from the feed in UTC. Visitors care about when the lights
 * go out where they are, so the site renders in the browser's own zone by default
 * and keeps UTC one click away for comparing with official timing.
 */
export type ZoneMode = "browser" | "utc";

const KEY = "f1-zone";
const listeners = new Set<() => void>();

function read(): ZoneMode {
  return localStorage.getItem(KEY) === "utc" ? "utc" : "browser";
}

let mode: ZoneMode = read();

export function useZoneMode(): ZoneMode {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => mode,
    () => mode,
  );
}

export function setZoneMode(next: ZoneMode): void {
  mode = next;
  localStorage.setItem(KEY, next);
  for (const listener of listeners) listener();
}

export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function zoneOf(current: ZoneMode = mode): string {
  return current === "utc" ? "UTC" : browserZone();
}

/** The offset short form, eg "GMT+5:30" — enough to tell a reader which clock they are on. */
export function zoneShort(current: ZoneMode = mode, at: Date = new Date()): string {
  const timeZone = zoneOf(current);
  if (timeZone === "UTC") return "UTC";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

export function zoneLong(current: ZoneMode = mode, at: Date = new Date()): string {
  const timeZone = zoneOf(current);
  if (timeZone === "UTC") return "UTC";
  return `${zoneShort(current, at)} ${timeZone.split("/").pop()?.replace(/_/g, " ")}`;
}
