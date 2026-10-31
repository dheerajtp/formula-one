/**
 * Client for OpenF1 (`https://api.openf1.org/v1`), the historical session feed:
 * car data, laps, stints, pit stops, race control, drivers and session metadata.
 *
 * OpenF1 also publishes live timing, but that needs a paid credential a static
 * browser bundle cannot protect, so this client reads completed sessions only —
 * no live code, no API key and no fallback sample data. Every call goes through
 * `requestOpenF1`, the single place that knows the base URL, the serialized
 * request queue and the retry policy, so a future server-side proxy can replace
 * that one function without touching callers.
 */
import type { Race } from "./jolpica";
import { storeGet, storePut } from "./openf1Store";

const BASE = "https://api.openf1.org/v1";
const CACHE_KEY = "f1-openf1-cache:v1";

/** OpenF1's free tier publishes 3 requests/second, so requests are spaced 350 ms apart. */
const MIN_REQUEST_SPACING_MS = 350;
/**
 * The free tier also caps requests per minute (published as 30/minute); past it the
 * API answers 429 with `Retry-After: 60`. A sliding window keeps the queue under it.
 */
const MAX_REQUESTS_PER_WINDOW = 30;
const RATE_WINDOW_MS = 60_000;
/** 5xx attempts. A 429 is not counted against this: the queue waits out `Retry-After` instead. */
const MAX_ATTEMPTS = 3;
/** Upper bound on consecutive 429s for one request before it fails visibly. */
const MAX_THROTTLED_ATTEMPTS = 4;
/**
 * Used when a 429 carries no readable `Retry-After`. Browsers hide that header on
 * this cross-origin API (it is not exposed via CORS), so wait out one full window.
 */
const RETRY_FALLBACK_MS = RATE_WINDOW_MS;

/** First 5xx backoff; doubles per attempt (500 ms, then 1 s). */
const BACKOFF_BASE_MS = 500;

export interface OpenF1Meeting {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  location: string;
  country_name: string;
  circuit_key: number;
  circuit_short_name: string;
  date_start: string;
  date_end: string;
  year: number;
}

export interface OpenF1Session {
  session_key: number;
  session_type: string;
  session_name: string;
  date_start: string;
  date_end: string;
  meeting_key: number;
  circuit_key: number;
  circuit_short_name: string;
  location: string;
  country_name: string;
  year: number;
  is_cancelled?: boolean;
}

export interface OpenF1Driver {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  first_name: string;
  last_name: string;
  team_name: string;
  /** Hex colour without the leading `#`. */
  team_colour: string;
  country_code: string;
}

export interface OpenF1Lap {
  driver_number: number;
  lap_number: number;
  date_start: string;
  /** Seconds, or null for a lap the feed could not time (in/out laps, red flags). */
  lap_duration: number | null;
  is_pit_out_lap: boolean;
  st_speed?: number | null;
  i1_speed?: number | null;
  i2_speed?: number | null;
}

export interface OpenF1Stint {
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number;
  /** As published by the feed: "SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET". */
  compound: string;
  tyre_age_at_start: number;
}

export interface OpenF1Pit {
  driver_number: number;
  lap_number: number;
  date: string;
  /** Raw feed number: usually seconds, but red-flag pit visits arrive on a different scale, so keep it unscaled. */
  pit_duration: number | null;
  lane_duration: number | null;
  stop_duration: number | null;
}

export interface OpenF1RaceControl {
  date: string;
  category: string;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  message: string;
  lap_number: number | null;
}

export interface OpenF1CarData {
  date: string;
  driver_number: number;
  speed: number;
  throttle: number;
  brake: number;
  n_gear: number;
  rpm: number;
  /** Drag-reduction-system state exactly as the feed publishes it (car-specific codes). */
  drs: number;
}

type QueryValue = string | number | null | undefined;
type QueryParams = Record<string, QueryValue>;

/**
 * OpenF1 wants `date>=<iso>` / `date<=<iso>` as one token. `URLSearchParams`
 * cannot express that: it encodes the operator and then adds the separator `=`,
 * and the API reads the resulting `date>==<iso>` as an unknown filter and answers
 * 404 "No results found". Bounds are therefore appended with the operator already
 * encoded and no separator, while every plain parameter still goes through
 * `URLSearchParams`.
 */
const RANGE_ENCODINGS: Record<string, string> = {
  "date>=": "date%3E%3D",
  "date<=": "date%3C%3D",
};

function buildUrl(path: string, params: QueryParams): string {
  const plain = new URLSearchParams();
  const bounds: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    const range = RANGE_ENCODINGS[key];
    if (range) bounds.push(`${range}${encodeURIComponent(String(value))}`);
    else plain.set(key, String(value));
  }
  const query = [plain.toString(), ...bounds].filter(Boolean).join("&");
  return `${BASE}${path}${query ? `?${query}` : ""}`;
}

/** Session-scoped cache: responses are immutable once a session is settled. */
const cache = new Map<string, unknown>();

function readPersisted(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePersisted(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or quota — the in-memory map still serves the visit */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let queueTail: Promise<unknown> = Promise.resolve();
let lastStartedAt = 0;
/** Start times inside the current rate window. */
const recentStarts: number[] = [];
/** Set by a 429: nobody in the queue starts before this instant. */
let pausedUntil = 0;

/**
 * Serialize requests, leaving at least `MIN_REQUEST_SPACING_MS` between starts and
 * at most `MAX_REQUESTS_PER_WINDOW` starts per `RATE_WINDOW_MS`. A 429 pauses the
 * whole queue (not just the one request) until the server's `Retry-After`, and a
 * retry goes back through this queue, so backoff and spacing stack rather than
 * letting a failed burst escape the rate limit.
 */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    for (;;) {
      const now = Date.now();
      while (recentStarts.length && now - recentStarts[0] >= RATE_WINDOW_MS) recentStarts.shift();
      const waits = [
        pausedUntil - now,
        MIN_REQUEST_SPACING_MS - (now - lastStartedAt),
        recentStarts.length >= MAX_REQUESTS_PER_WINDOW ? recentStarts[0] + RATE_WINDOW_MS - now : 0,
      ];
      const wait = Math.max(...waits);
      if (wait <= 0) break;
      await sleep(wait);
    }
    lastStartedAt = Date.now();
    recentStarts.push(lastStartedAt);
    return task();
  });
  // A rejected request must not poison the queue for the calls behind it.
  queueTail = run.catch(() => undefined);
  return run;
}

function retryAfterMs(res: Response): number {
  const header = res.headers.get("retry-after");
  if (!header) return RETRY_FALLBACK_MS;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : RETRY_FALLBACK_MS;
}

function requestFailure(status: number, path: string): Error {
  const message = `OpenF1 request failed (${status}) for ${path}`;
  const error = new Error(status === 422 ? `${message} (query too large; narrow the date range)` : message);
  // The status rides along so lookups can tell "nothing published" from a real failure.
  return Object.assign(error, { status });
}

/** Every paused-state message starts with this, so views can tell it apart from real failures. */
export const OPENF1_PAUSED_PREFIX = "OpenF1 paused:";

export function isOpenF1Paused(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.startsWith(OPENF1_PAUSED_PREFIX);
}

/**
 * A fetch that fails outright. While any F1 session is live, OpenF1 answers every
 * unauthenticated request (past sessions included) with 401 and no CORS header,
 * so the browser sees only a network error. When the device is online that is
 * almost always the live-session pause, so it is reported as a named state rather
 * than a generic failure; an offline device gets its own message.
 */
function unreachable(path: string): Error {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const error = new Error(
    offline
      ? `OpenF1 could not be reached for ${path}: this device is offline.`
      : `${OPENF1_PAUSED_PREFIX} OpenF1 pauses free access while an F1 session is live, past races included. ` +
          "Data already saved for this race is shown; the rest returns when the session ends.",
  );
  return Object.assign(error, { status: 0 });
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && (error as { status?: number }).status === 404;
}

/**
 * OpenF1 reports "no rows matched" as 404 rather than an empty array — a season
 * before its coverage, a meeting with no sessions, a circuit with no prior race,
 * a session with no pit rows. Lookups translate that one status to emptiness;
 * every other failure still propagates.
 */
async function allowMissing<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * Only settled, non-empty answers are kept: an empty session looks exactly like
 * one that has not run yet. Session metadata is skipped while any session in the
 * answer starts in the future, because it can still change before the meeting runs.
 */
function isCacheable(path: string, body: unknown): boolean {
  const now = Date.now();
  if (Array.isArray(body)) {
    if (body.length === 0) return false;
    if (!path.startsWith("/sessions")) return true;
    return body.every((row) => {
      const start = (row as { date_start?: string }).date_start;
      return !start || Date.parse(start) <= now;
    });
  }
  const start = (body as { date_start?: string } | null)?.date_start;
  return !start || Date.parse(start) <= now;
}

/**
 * Fetch one OpenF1 resource. Successful responses are cached by full URL, and
 * `persist` also mirrors them into `sessionStorage` for the two lookups whose
 * answers do not change during a meeting (season meetings, session metadata).
 */
/** End time of every session this visit has seen, so settled responses can be stored for offline use. */
const sessionEnds = new Map<number, number>();

export function rememberSessionEnds(rows: { session_key?: number; date_end?: string; date_start?: string }[]) {
  for (const row of rows) {
    const end = Date.parse(row.date_end || row.date_start || "");
    if (typeof row.session_key === "number" && Number.isFinite(end)) sessionEnds.set(row.session_key, end);
  }
}

/** A session-scoped request whose session has ended: its answer can never change. */
function isSettled(params: QueryParams): boolean {
  const key = Number(params.session_key);
  const end = sessionEnds.get(key);
  return end !== undefined && end <= Date.now();
}

/** Lookups that can still change but are worth keeping as a fallback while OpenF1 is paused. */
function isFallbackLookup(path: string): boolean {
  return path === "/meetings" || path === "/sessions";
}

export async function requestOpenF1<T>(
  path: string,
  params: QueryParams = {},
  opts: { persist?: boolean } = {},
): Promise<T> {
  const url = buildUrl(path, params);
  if (cache.has(url)) return cache.get(url) as T;
  if (opts.persist) {
    const persisted = readPersisted(CACHE_KEY + url);
    if (persisted !== null) {
      cache.set(url, persisted);
      if (path === "/sessions" && Array.isArray(persisted)) rememberSessionEnds(persisted);
      return persisted as T;
    }
  }

  const settled = isSettled(params);
  if (settled) {
    const stored = await storeGet<T>(url);
    if (stored !== null) {
      cache.set(url, stored);
      return stored;
    }
  }

  let throttled = 0;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await enqueue(() => fetch(url, { headers: { accept: "application/json" } }));
    } catch {
      // Paused or offline: anything saved earlier for this exact request still serves.
      const stored = await storeGet<T>(url);
      if (stored !== null) {
        cache.set(url, stored);
        if (path === "/sessions" && Array.isArray(stored)) rememberSessionEnds(stored);
        return stored;
      }
      throw unreachable(path);
    }
    if (res.ok) {
      const json = (await res.json()) as T;
      if (path === "/sessions" && Array.isArray(json)) rememberSessionEnds(json);
      if (isCacheable(path, json)) {
        cache.set(url, json);
        if (opts.persist) writePersisted(CACHE_KEY + url, json);
        if (settled || isFallbackLookup(path)) void storePut(url, json);
      }
      return json;
    }

    const status = res.status;
    if (status === 429) {
      // Throttled: hold the entire queue until the server says so, then retry this one.
      throttled += 1;
      attempt -= 1;
      if (throttled >= MAX_THROTTLED_ATTEMPTS) throw requestFailure(status, path);
      pausedUntil = Math.max(pausedUntil, Date.now() + retryAfterMs(res));
      continue;
    }
    // 404 means "no rows" and 422 means "narrow the query": retrying changes neither.
    if (status < 500 || attempt >= MAX_ATTEMPTS) throw requestFailure(status, path);
    await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
  }
}

/* ----------------------------------------------------- bundled snapshot */

/**
 * Completed race sessions saved into the site by `npm run build-openf1`
 * (`public/openf1`). They are OpenF1's own rows, read first for settled sessions
 * so race pages keep working while OpenF1 pauses free access during live sessions.
 */
interface SnapshotIndexRow {
  season: number;
  round: number;
  /** Jolpica circuit id, so a race not yet run can find its venue's saved history. */
  circuitId?: string;
  session: OpenF1Session;
}

interface SessionSnapshot {
  season: number;
  round: number;
  session: OpenF1Session;
  drivers: OpenF1Driver[];
  lapFields: string[];
  laps: unknown[][];
  stints: OpenF1Stint[];
  pit: OpenF1Pit[];
  raceControl: OpenF1RaceControl[];
}

interface ExpandedSnapshot extends Omit<SessionSnapshot, "laps"> {
  laps: OpenF1Lap[];
}

const SNAPSHOT_BASE = `${import.meta.env.BASE_URL ?? "/"}openf1`;
let snapshotIndex: Promise<SnapshotIndexRow[]> | null = null;
const snapshots = new Map<number, Promise<ExpandedSnapshot | null>>();

/** The saved-race index; empty when the site ships without snapshots. */
export function loadSnapshotIndex(): Promise<SnapshotIndexRow[]> {
  snapshotIndex ??= fetch(`${SNAPSHOT_BASE}/index.json`)
    .then((res) => (res.ok ? res.json() : { sessions: [] }))
    .then((body: { sessions?: SnapshotIndexRow[] }) => {
      const rows = body.sessions ?? [];
      rememberSessionEnds(rows.map((row) => row.session));
      return rows;
    })
    .catch(() => []);
  return snapshotIndex;
}

/** Saved race sessions at a Jolpica circuit that started before `beforeIso`, newest first. */
export async function savedRaceSessionsAt(circuitId: string, beforeIso: string): Promise<OpenF1Session[]> {
  const before = Date.parse(beforeIso);
  return (await loadSnapshotIndex())
    .filter((row) => row.circuitId === circuitId && Date.parse(row.session.date_start) < before)
    .map((row) => row.session)
    .sort((a, b) => Date.parse(b.date_start) - Date.parse(a.date_start));
}

async function snapshotForSession(sessionKey: number): Promise<ExpandedSnapshot | null> {
  if (!snapshots.has(sessionKey)) {
    snapshots.set(
      sessionKey,
      loadSnapshotIndex().then(async (rows) => {
        const row = rows.find((r) => r.session.session_key === sessionKey);
        if (!row) return null;
        try {
          const res = await fetch(`${SNAPSHOT_BASE}/${row.season}/${row.round}.json`);
          if (!res.ok) return null;
          const raw = (await res.json()) as SessionSnapshot;
          const laps = raw.laps.map((tuple) => {
            const lap: Record<string, unknown> = {};
            raw.lapFields.forEach((field, i) => (lap[field] = tuple[i]));
            return lap as unknown as OpenF1Lap;
          });
          return { ...raw, laps };
        } catch {
          return null;
        }
      }),
    );
  }
  return snapshots.get(sessionKey)!;
}

export async function getSeasonMeetings(season: number): Promise<OpenF1Meeting[]> {
  const meetings = await allowMissing(
    requestOpenF1<OpenF1Meeting[]>("/meetings", { year: season }, { persist: true }),
  );
  return meetings ?? [];
}

/** Lowercase, accent-free, punctuation-free form used to compare feed names with the calendar. */
export function normaliseName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isoDay(iso: string): string {
  return iso.slice(0, 10);
}

function coversDay(meeting: OpenF1Meeting, day: string): boolean {
  return isoDay(meeting.date_start) <= day && day <= isoDay(meeting.date_end);
}

function nameMatches(meeting: OpenF1Meeting, raceName: string): boolean {
  const wanted = normaliseName(raceName);
  const actual = normaliseName(meeting.meeting_name);
  return wanted.length > 0 && (actual === wanted || actual.includes(wanted) || wanted.includes(actual));
}

/** The meeting whose start date sits closest to `day`, earliest first on a tie. */
function nearestStart(meetings: OpenF1Meeting[], day: string): OpenF1Meeting {
  const target = Date.parse(day);
  return [...meetings].sort((a, b) => {
    const distance =
      Math.abs(Date.parse(isoDay(a.date_start)) - target) - Math.abs(Date.parse(isoDay(b.date_start)) - target);
    return distance || a.date_start.localeCompare(b.date_start);
  })[0];
}

/**
 * The OpenF1 meeting for a calendar race. The date interval is the primary signal;
 * the normalised meeting name breaks ties and covers meetings whose published
 * range does not bracket the race date. A race that matches neither returns null
 * rather than borrowing another venue's session.
 */
export function findRaceMeeting(
  meetings: OpenF1Meeting[],
  race: Pick<Race, "raceName" | "date">,
): OpenF1Meeting | null {
  const day = isoDay(race.date);
  const containing = meetings.filter((meeting) => coversDay(meeting, day));
  const namedContaining = containing.filter((meeting) => nameMatches(meeting, race.raceName));
  if (namedContaining.length) return nearestStart(namedContaining, day);
  if (containing.length === 1) return containing[0];
  if (containing.length > 1) return nearestStart(containing, day);

  const named = meetings.filter((meeting) => nameMatches(meeting, race.raceName));
  if (named.length === 0) return null;
  if (named.length === 1) return named[0];
  return nearestStart(named, day);
}

/**
 * The race session of a meeting. `session_type` alone is not enough: a sprint
 * weekend's Sprint also carries `session_type: "Race"`, so the session name decides.
 */
export async function getRaceSession(meetingKey: number): Promise<OpenF1Session | null> {
  const sessions = await allowMissing(
    requestOpenF1<OpenF1Session[]>("/sessions", { meeting_key: meetingKey }, { persist: true }),
  );
  return sessions?.find((session) => !session.is_cancelled && session.session_name === "Race") ?? null;
}

export async function resolveRaceSession(
  season: number,
  race: Pick<Race, "raceName" | "date"> & { round?: string },
): Promise<{ meeting: OpenF1Meeting; session: OpenF1Session } | null> {
  const saved = (await loadSnapshotIndex()).find(
    (row) => row.season === season && race.round !== undefined && row.round === Number(race.round),
  );
  if (saved) {
    const s = saved.session;
    // The snapshot carries the session row; the meeting fields callers use are on it too.
    const meeting: OpenF1Meeting = {
      meeting_key: s.meeting_key,
      meeting_name: race.raceName,
      meeting_official_name: race.raceName,
      location: s.location,
      country_name: s.country_name,
      circuit_key: s.circuit_key,
      circuit_short_name: s.circuit_short_name,
      date_start: s.date_start,
      date_end: s.date_end,
      year: s.year,
    };
    return { meeting, session: s };
  }
  const meetings = await getSeasonMeetings(season);
  const meeting = findRaceMeeting(meetings, race);
  if (!meeting) return null;
  const session = await getRaceSession(meeting.meeting_key);
  return session ? { meeting, session } : null;
}

/**
 * Completed races at a circuit before `beforeIso`, newest first. Coverage is
 * whatever the feed holds, so no season range is assumed here.
 */
export async function getPriorRaceSessions(
  circuitKey: number,
  beforeIso: string,
  excludeSessionKey?: number,
): Promise<OpenF1Session[]> {
  const before = Date.parse(beforeIso);
  const saved = (await loadSnapshotIndex()).map((row) => row.session).filter((s) => s.circuit_key === circuitKey);
  let fetched: OpenF1Session[] | null = null;
  try {
    fetched = await allowMissing(
      requestOpenF1<OpenF1Session[]>("/sessions", { circuit_key: circuitKey, session_name: "Race" }),
    );
  } catch (error) {
    // Paused: the saved races at this circuit are still a complete history up to the snapshot.
    if (!saved.length) throw error;
  }
  const byKey = new Map<number, OpenF1Session>();
  for (const session of [...saved, ...(fetched ?? [])]) byKey.set(session.session_key, session);
  const sessions = [...byKey.values()];
  return sessions
    .filter(
      (session) =>
        !session.is_cancelled &&
        session.session_name === "Race" &&
        session.session_key !== excludeSessionKey &&
        Date.parse(session.date_start) < before,
    )
    .sort((a, b) => Date.parse(b.date_start) - Date.parse(a.date_start));
}

/**
 * Every race session of a season, in calendar order. Filtering on `session_type`
 * would be wrong — a sprint weekend's Sprint also carries `"Race"` — so the
 * session name decides, exactly as `getRaceSession` does for one meeting.
 */
export async function getSeasonRaceSessions(season: number): Promise<OpenF1Session[]> {
  let sessions: OpenF1Session[] | null;
  try {
    sessions = await allowMissing(
      requestOpenF1<OpenF1Session[]>("/sessions", { year: season }, { persist: true }),
    );
  } catch (error) {
    const saved = (await loadSnapshotIndex()).filter((row) => row.season === season).map((row) => row.session);
    if (!saved.length) throw error;
    sessions = saved;
  }
  return (sessions ?? [])
    .filter((session) => !session.is_cancelled && session.session_name === "Race")
    .sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start));
}

/** Session driver rows. `persist` is for completed sessions only, whose answer cannot change. */
export async function getSessionDrivers(
  sessionKey: number,
  opts: { persist?: boolean } = {},
): Promise<OpenF1Driver[]> {
  const saved = await snapshotForSession(sessionKey);
  if (saved) return saved.drivers;
  const drivers = await allowMissing(
    requestOpenF1<OpenF1Driver[]>("/drivers", { session_key: sessionKey }, opts),
  );
  return drivers ?? [];
}

export async function getSessionLaps(sessionKey: number, driverNumber?: number): Promise<OpenF1Lap[]> {
  const saved = await snapshotForSession(sessionKey);
  if (saved) return driverNumber == null ? saved.laps : saved.laps.filter((lap) => lap.driver_number === driverNumber);
  const params: QueryParams = { session_key: sessionKey };
  if (driverNumber != null) params.driver_number = driverNumber;
  const laps = await allowMissing(requestOpenF1<OpenF1Lap[]>("/laps", params));
  return laps ?? [];
}

export async function getSessionStints(sessionKey: number): Promise<OpenF1Stint[]> {
  const saved = await snapshotForSession(sessionKey);
  if (saved) return saved.stints;
  const stints = await allowMissing(requestOpenF1<OpenF1Stint[]>("/stints", { session_key: sessionKey }));
  return stints ?? [];
}

/** Session pit rows. `stop_duration` stays untouched: null is "not published", never zero. */
export async function getSessionPit(
  sessionKey: number,
  opts: { persist?: boolean } = {},
): Promise<OpenF1Pit[]> {
  const saved = await snapshotForSession(sessionKey);
  if (saved) return saved.pit;
  const stops = await allowMissing(
    requestOpenF1<OpenF1Pit[]>("/pit", { session_key: sessionKey }, opts),
  );
  return stops ?? [];
}

export async function getSessionRaceControl(sessionKey: number): Promise<OpenF1RaceControl[]> {
  const saved = await snapshotForSession(sessionKey);
  if (saved) return saved.raceControl;
  const messages = await allowMissing(
    requestOpenF1<OpenF1RaceControl[]>("/race_control", { session_key: sessionKey }),
  );
  return messages ?? [];
}

/**
 * Car data for one driver over a closed window. OpenF1 refuses a query that is too
 * broad, so the caller must always pass a lap-sized window; the answer is cached in
 * memory only because it is large and belongs to a single session.
 */
export async function getCarData(
  sessionKey: number,
  driverNumber: number,
  fromIso: string,
  toIso: string,
): Promise<OpenF1CarData[]> {
  const samples = await allowMissing(
    requestOpenF1<OpenF1CarData[]>("/car_data", {
      session_key: sessionKey,
      driver_number: driverNumber,
      "date>=": fromIso,
      "date<=": toIso,
    }),
  );
  return samples ?? [];
}
