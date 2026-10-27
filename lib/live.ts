import { useEffect, useState } from "react";
import { utcDateTime } from "./format";
import { hasTiming, type Race } from "./jolpica";

/**
 * Session availability for the free data feed.
 *
 * The broadcast-grade live timing stream (wheel speeds, gear, throttle, brake,
 * DRS) is no longer published without an F1TV subscription, so this site
 * reconstructs replays from official lap timing, which only exists once a
 * session has closed. This module is the seam where a live source — a community
 * relay or a self-hosted bridge — can be wired in later without touching the UI.
 */
export type SessionStatus = "upcoming" | "in-progress" | "closed" | "unknown";

export function classifySession(race: Race, now: Date, hasTiming: boolean): SessionStatus {
  if (!race.date) return "unknown";
  const start = utcDateTime(race.date, race.time);
  if (Number.isNaN(start.getTime())) return "unknown";
  // Sessions rarely run longer than three hours including delays.
  const elapsed = now.getTime() - start.getTime();
  if (elapsed < 0) return "upcoming";
  if (elapsed < 3 * 60 * 60 * 1000 && !hasTiming) return "in-progress";
  return "closed";
}

export const LIVE_FEED_UNAVAILABLE =
  "Live wheel-by-wheel timing needs the F1 broadcast feed, which is no longer free to access. This replay uses the official lap classification instead.";

export const IN_PROGRESS_NOTE =
  "This session has not closed yet, so its lap-by-lap classification is not published. The replay becomes available shortly after the flag.";

/* ── race weekend ─────────────────────────────────────────────────────── */

export type SessionKind = "FP1" | "FP2" | "FP3" | "Sprint" | "Qualifying" | "Race";

export interface WeekendSession {
  kind: SessionKind;
  label: string;
  start: Date;
  /** The feed's clock for this session; some historical rounds publish a date but no time. */
  time?: string;
  /** How long a session is treated as still running, which is how "live" is judged. */
  windowMs: number;
}

export type SessionPhase = "done" | "live" | "upcoming";

const HOUR = 60 * 60 * 1000;

const WINDOW: Record<SessionKind, number> = {
  FP1: 1.75 * HOUR,
  FP2: 1.75 * HOUR,
  FP3: 1.75 * HOUR,
  Sprint: 1.25 * HOUR,
  Qualifying: 1.75 * HOUR,
  // Includes red flags and the delay before the classification is published.
  Race: 3 * HOUR,
};

/** Every timed session of a weekend, in the order they run. */
export function weekendSessions(race: Race): WeekendSession[] {
  const listed: [SessionKind, string, { date: string; time?: string } | undefined][] = [
    ["FP1", "Practice 1", race.FirstPractice],
    ["FP2", "Practice 2", race.SecondPractice],
    ["FP3", "Practice 3", race.ThirdPractice],
    ["Sprint", "Sprint", race.Sprint],
    ["Qualifying", "Qualifying", race.Qualifying],
    ["Race", "Grand Prix", { date: race.date, time: race.time }],
  ];
  return listed
    .flatMap(([kind, label, session]) =>
      session?.date
        ? [
            {
              kind,
              label,
              start: utcDateTime(session.date, session.time),
              time: session.time,
              windowMs: WINDOW[kind],
            },
          ]
        : [],
    )
    .filter((session) => !Number.isNaN(session.start.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function sessionPhase(session: WeekendSession, now: Date): SessionPhase {
  const t = now.getTime();
  if (t < session.start.getTime()) return "upcoming";
  return t < session.start.getTime() + session.windowMs ? "live" : "done";
}

export interface WeekendState {
  race: Race;
  sessions: WeekendSession[];
  /** The session running right now, if the clock says one is. */
  live: WeekendSession | null;
  /** The next session that has not started. */
  next: WeekendSession | null;
  /** True from half a day before the first session to three hours after the last. */
  withinWeekend: boolean;
}

export function weekendState(race: Race, now: Date): WeekendState {
  const sessions = weekendSessions(race);
  const phases = sessions.map((session) => sessionPhase(session, now));
  const last = sessions.at(-1);
  return {
    race,
    sessions,
    live: sessions[phases.indexOf("live")] ?? null,
    next: sessions[phases.indexOf("upcoming")] ?? null,
    withinWeekend:
      sessions.length > 0 &&
      now.getTime() >= sessions[0].start.getTime() - 12 * HOUR &&
      now.getTime() <= last!.start.getTime() + last!.windowMs + 3 * HOUR,
  };
}

/**
 * The meeting to put in front of the visitor: the one running if a weekend is
 * under way, otherwise the next one on the calendar.
 */
export function pickWeekend(races: Race[], now: Date): WeekendState | null {
  const states = races.map((race) => weekendState(race, now)).filter((state) => state.sessions.length > 0);
  return states.find((state) => state.withinWeekend) ?? states.find((state) => state.next) ?? states.at(-1) ?? null;
}

const CHECK_EVERY_MS = 30000;

/**
 * Is it worth asking the feed for this session's lap sheet? Only a meeting that
 * has just run—anything older is history, and its sheet is either there or never
 * coming, so a visitor reading an old race should not be polling for it.
 */
export function worthWatching(start: Date | null, now: Date): boolean {
  if (!start) return false;
  const elapsed = now.getTime() - start.getTime();
  return elapsed > -30 * 60 * 1000 && elapsed < 24 * 60 * 60 * 1000;
}

/**
 * Watch for the lap sheet to be published, which is the only honest way to go
 * from "the race is running" to "watch the race". The answer is always asked for
 * once; `poll` decides whether to keep asking, so a live race costs a handful of
 * one-row requests and an old one costs a single call.
 */
export function useTimingArrival(season: number, round: number, poll: boolean) {
  const [state, setState] = useState<{ landed: boolean; lastChecked: Date | null; probeFailed: boolean }>({
    landed: false,
    lastChecked: null,
    probeFailed: false,
  });

  useEffect(() => {
    let active = true;
    let timer = 0;

    const check = async () => {
      try {
        const published = await hasTiming(season, round);
        if (!active) return;
        setState({ landed: published, lastChecked: new Date(), probeFailed: false });
        // Self-limiting: once the sheet exists there is nothing left to wait for.
        if (published) return;
      } catch {
        if (!active) return;
        setState((s) => ({ ...s, lastChecked: new Date(), probeFailed: true }));
      }
      if (active && poll) timer = window.setTimeout(check, CHECK_EVERY_MS);
    };

    check();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [season, round, poll]);

  return state;
}
