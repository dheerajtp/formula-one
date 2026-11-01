// Saves every completed OpenF1 race session into the site as static JSON, so the
// Telemetry session table, Strategy, Weekend pit strategy and crew stop times keep
// working while OpenF1 pauses free access during live F1 sessions.
//
//   npm run build-openf1            # add races not saved yet
//   npm run build-openf1 -- --force # rebuild every file
//
// Output: public/openf1/index.json and public/openf1/{season}/{round}.json.
// Car data (per-lap telemetry) is deliberately not included: it is far too large.
// Run it outside a live session; OpenF1 answers 401 to everyone during one.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public", "openf1");
const OPENF1 = "https://api.openf1.org/v1";
const JOLPICA = "https://api.jolpi.ca/ergast/f1";
const FORCE = process.argv.includes("--force");

// OpenF1 free tier: 3 requests/second and 30 per minute.
const SPACING_MS = 350;
const PER_MINUTE = 30;
const starts = [];
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  for (;;) {
    const now = Date.now();
    while (starts.length && now - starts[0] >= 60_000) starts.shift();
    const wait = Math.max(SPACING_MS - (now - last), starts.length >= PER_MINUTE ? starts[0] + 60_000 - now : 0);
    if (wait <= 0) break;
    await sleep(wait);
  }
  last = Date.now();
  starts.push(last);
}

class LockedError extends Error {}

/** One OpenF1 request; 404 means "no rows" and becomes []. */
async function openf1(path, params) {
  const url = `${OPENF1}${path}?${new URLSearchParams(params)}`;
  for (let attempt = 1; ; attempt++) {
    await throttle();
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.ok) return res.json();
    if (res.status === 404) return [];
    if (res.status === 401) {
      throw new LockedError("OpenF1 is paused for a live F1 session (401). Re-run when the session ends.");
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const retry = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 60_000);
      continue;
    }
    throw new Error(`OpenF1 ${res.status} for ${url}`);
  }
}

async function jolpica(path) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${JOLPICA}${path}`, { headers: { accept: "application/json" } });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < 6) {
      await sleep(2000 * attempt);
      continue;
    }
    throw new Error(`Jolpica ${res.status} for ${path}`);
  }
}

const day = (iso) => iso.slice(0, 10);
const dayDiff = (a, b) => Math.abs(Date.parse(day(a)) - Date.parse(day(b))) / 86_400_000;

/** The calendar round whose race date is nearest the OpenF1 race session (same rule family as `findRaceMeeting`). */
function matchRound(session, races) {
  let best = null;
  for (const race of races) {
    const d = dayDiff(session.date_start, race.date);
    if (d <= 1 && (!best || d < best.d)) best = { race, d };
  }
  return best?.race ?? null;
}

/** Laps as compact tuples; the client expands them back with `lapFields`. */
const LAP_FIELDS = ["driver_number", "lap_number", "date_start", "lap_duration", "is_pit_out_lap", "st_speed"];

async function readIndex() {
  try {
    return JSON.parse(await readFile(resolve(OUT, "index.json"), "utf8")).sessions ?? [];
  } catch {
    return [];
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const index = new Map((await readIndex()).map((row) => [row.session.session_key, row]));
  const now = Date.now();
  let written = 0;

  for (let season = new Date().getUTCFullYear(); ; season--) {
    const sessions = (await openf1("/sessions", { year: season }))
      .filter((s) => !s.is_cancelled && s.session_name === "Race" && Date.parse(s.date_end || s.date_start) < now)
      .sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start));
    if (!sessions.length) {
      // Before OpenF1's coverage starts, a season returns nothing.
      if (season < new Date().getUTCFullYear()) break;
      continue;
    }
    const races = (await jolpica(`/${season}.json?limit=100`)).MRData.RaceTable.Races;

    for (const session of sessions) {
      const race = matchRound(session, races);
      if (!race) {
        console.warn(`  no calendar round for session ${session.session_key} (${session.location} ${day(session.date_start)})`);
        continue;
      }
      const round = Number(race.round);
      const file = resolve(OUT, String(season), `${round}.json`);
      if (!FORCE && existsSync(file) && index.get(session.session_key)?.circuitId) continue;

      process.stdout.write(`  ${season} R${round} ${race.raceName} … `);
      const params = { session_key: session.session_key };
      const drivers = await openf1("/drivers", params);
      const laps = await openf1("/laps", params);
      const stints = await openf1("/stints", params);
      const pit = await openf1("/pit", params);
      const raceControl = await openf1("/race_control", params);
      if (!laps.some((lap) => typeof lap.lap_duration === "number")) {
        console.log("no timed laps yet, skipped");
        continue;
      }

      await mkdir(dirname(file), { recursive: true });
      const snapshot = {
        generatedAt: new Date().toISOString(),
        source: "OpenF1 (https://openf1.org), saved unmodified for availability",
        season,
        round,
        session,
        drivers,
        lapFields: LAP_FIELDS,
        laps: laps.map((lap) => LAP_FIELDS.map((field) => lap[field] ?? null)),
        stints,
        pit,
        raceControl,
      };
      await writeFile(file, JSON.stringify(snapshot));
      index.set(session.session_key, { season, round, circuitId: race.Circuit.circuitId, session });
      await writeIndex(index);
      written += 1;
      console.log(`${((await stat(file)).size / 1024).toFixed(0)} KB`);
    }
  }

  // Rewriting an unchanged index would only bump generatedAt and make the weekly job commit nothing-new.
  if (written > 0 || !existsSync(resolve(OUT, "index.json"))) await writeIndex(index);
  let bytes = 0;
  for (const row of index.values()) bytes += (await stat(resolve(OUT, String(row.season), `${row.round}.json`))).size;
  console.log(`Done: ${written} new, ${index.size} races saved, ${(bytes / 1024 / 1024).toFixed(1)} MB in public/openf1.`);
}

async function writeIndex(index) {
  const sessions = [...index.values()].sort((a, b) => Date.parse(a.session.date_start) - Date.parse(b.session.date_start));
  await writeFile(
    resolve(OUT, "index.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), sessions }),
  );
}

main().catch((error) => {
  console.error(error instanceof LockedError ? `\n${error.message}` : error);
  process.exit(1);
});
