// Builds the site's static datasets from free, public sources:
//   - Jolpica (Ergast-compatible) API  -> 2026 calendar + circuits
//   - bacinger/f1-circuits (MIT)       -> track centre-line geometry
//   - Wikipedia race reports           -> Pirelli compound allocations
//   - open-meteo                       -> recorded race-day weather
// Output is committed under src/data so the deployed site needs no secrets.
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "data");
const UA = "qoder-f1-site/1.0 (static dataset build)";
const GEOJSON_URL =
  "https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson";

// Jolpica circuitId -> feature name in the geometry dataset.
// Only needed where the two sources word a venue differently.
const GEOMETRY_ALIASES = {
  imola: "Autodromo Enzo e Dino Ferrari",
  montmelody: "Circuit Gilles-Villeneuve",
  paul_ricard: "Circuit Paul Ricard",
  silverstone: "Silverstone Circuit",
  hungaroring: "Hungaroring",
  spa: "Circuit de Spa-Francorchamps",
  monza: "Autodromo Nazionale Monza",
  marina_bay: "Marina Bay Street Circuit",
  suzikka: "Suzuka International Racing Course",
  suzuka: "Suzuka International Racing Course",
  americas: "Circuit of the Americas",
  mexico_city: "Autódromo Hermanos Rodríguez",
  interlagos: "Autódromo José Carlos Pace - Interlagos",
  yas_marina: "Yas Marina Circuit",
  bahrain: "Bahrain International Circuit",
  jeddah: "Jeddah Corniche Circuit",
  monte_carlo: "Circuit de Monaco",
  albert_park: "Albert Park Circuit",
  shanghai: "Shanghai International Circuit",
  zandvoort: "Circuit Zandvoort",
  red_bull_ring: "Red Bull Ring",
  baku_city: "Baku City Circuit",
  losail: "Losail International Circuit",
  las_vegas: "Las Vegas Street Circuit",
  miami: "Miami International Autodrome",
  catalunya: "Circuit de Barcelona-Catalunya",
  madring: "Circuito de Madring",
};

async function getJSON(url, options = {}) {
  // Wikipedia rate-limits bursts, so back off rather than lose the allocation.
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        ...options,
        headers: { "user-agent": UA, accept: "application/json", ...options.headers },
      });
    } catch (error) {
      // Transient DNS/reset failures are as common as 429s on these free feeds.
      if (attempt >= 5) throw error;
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res.json();
    const retriable = res.status === 429 || res.status >= 500;
    if (!retriable || attempt >= 5) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    const wait = Math.min(30000, 1500 * 2 ** attempt);
    console.log(`  ~ ${res.status} from ${new URL(url).host}, retrying in ${wait}ms`);
    await sleep(wait);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getText(url) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { "user-agent": UA } });
    } catch (error) {
      if (attempt >= 5) throw error;
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res.text();
    const retriable = res.status === 429 || res.status >= 500;
    if (!retriable || attempt >= 5) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    const wait = Math.min(30000, 4000 * 2 ** attempt);
    console.log(`  ~ ${res.status} from ${new URL(url).host}, retrying in ${wait}ms`);
    await sleep(wait);
  }
}

async function readExisting(name) {
  try {
    const parsed = JSON.parse(await readFile(resolve(OUT, name), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Project a lon/lat centre-line into a normalised 0..1 drawing space. */
function buildOutline(coordinates, trackLength) {
  const pts = coordinates.map(([lon, lat]) => ({ lon, lat }));
  // Equal-area-ish scaling: longitude shrinks with latitude so shapes stay true.
  const latK = Math.cos((mean(pts.map((p) => p.lat)) * Math.PI) / 180);
  const xy = pts.map((p) => [p.lon * latK, p.lat]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;
  const span = Math.max(spanX, spanY);

  const nodes = xy.map(([x, y]) => ({
    x: round((x - minX) / span, 5),
    // SVG y grows downwards; flip so north is up.
    y: round(1 - (y - minY) / span, 5),
  }));

  // Cumulative arc length lets the replay place a car by lap percentage.
  const cum = [0];
  for (let i = 1; i < nodes.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y));
  }
  // Close the ring back to the start/finish line.
  const closed = [...nodes, nodes[0]];
  const total = cum[cum.length - 1] + Math.hypot(nodes[0].x - nodes.at(-1).x, nodes[0].y - nodes.at(-1).y);
  const fractions = cum.map((c) => round(c / total, 5));

  return {
    nodes: closed,
    distances: [...fractions, 1],
    length: trackLength ?? null,
  };
}

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function round(n, digits) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Pull "C1..C5" allocations out of a race report's Tyre choices section. */
function parseTyres(wikitext, raceName, articleTitle) {
  // Editors write the heading both with and without spaces around the words.
  const heading = wikitext.match(/={2,4}\s*Tyre choices\s*={2,4}/);
  if (!heading || heading.index === undefined) return null;
  const rest = wikitext.slice(heading.index + heading[0].length);
  const nextSection = rest.search(/\n\s*={2,}/);
  let body = nextSection === -1 ? rest.slice(0, 1200) : rest.slice(0, nextSection);
  // Drop citations and templates so only the prose compound codes survive.
  body = body.replace(/<ref[\s\S]*?<\/ref>/g, " ").replace(/\{\{[\s\S]*?\}\}/g, " ");
  const compounds = [...body.matchAll(/\bC([1-5])\b/g)].map((m) => `C${m[1]}`);
  const unique = [...new Set(compounds)];
  if (unique.length < 3) return null;
  const [hard, medium, soft] = unique;
  return {
    race: raceName,
    hard,
    medium,
    soft,
    source: `https://en.wikipedia.org/wiki/${articleTitle}`,
  };
}

/**
 * Coarse land outlines for the calendar's world map. Rings are decimated to a
 * 0.5 degree grid, which is far below the map's pixel resolution but keeps the
 * bundle small.
 */
async function buildWorld() {
  const res = await fetch(
    "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json",
    { headers: { "user-agent": UA } },
  );
  if (!res.ok) throw new Error(`${res.status} for world outlines`);
  const geo = await res.json();
  const polygons = [];
  for (const feature of geo.features) {
    const g = feature.geometry;
    if (!g) continue;
    const rings =
      g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const ring of rings) for (const r of ring) polygons.push(decimate(r));
  }
  return polygons.filter((p) => p.length > 6);
}

function decimate(ring) {
  const out = [];
  for (const [lon, lat] of ring) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - lon) >= 0.5 || Math.abs(last[1] - lat) >= 0.5) {
      out.push([round(lon, 2), round(lat, 2)]);
    }
  }
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const calendar = await getJSON("https://api.jolpi.ca/ergast/f1/2026.json?limit=30");
  const races = calendar.MRData.RaceTable.Races;
  const geometry = await getJSON(GEOJSON_URL);
  const byName = new Map(geometry.features.map((f) => [f.properties.Name, f]));

  const circuits = [];
  const unmatched = [];
  const seen = new Set();
  for (const race of races) {
    const c = race.Circuit;
    if (seen.has(c.circuitId)) continue;
    seen.add(c.circuitId);
    const alias = GEOMETRY_ALIASES[c.circuitId];
    let feature = alias ? byName.get(alias) : undefined;
    if (!feature) {
      const guess = geometry.features.find((f) =>
        f.properties.Name.toLowerCase().includes(c.circuitName.toLowerCase().split(" ")[0]),
      );
      feature = guess;
    }
    if (!feature) {
      unmatched.push(`${c.circuitId} (${c.circuitName})`);
      continue;
    }
    circuits.push({
      id: c.circuitId,
      name: c.circuitName,
      locality: c.Location.locality,
      country: c.Location.country,
      lat: Number(c.Location.lat),
      lng: Number(c.Location.long),
      wikipedia: c.url ?? null,
      outline: buildOutline(feature.geometry.coordinates, feature.properties.length),
    });
  }

  // Wikipedia throttles hard, so keep whatever an earlier run already gathered
  // and only spend requests on the races still missing.
  const existingTyres = await readExisting("tyres.json");
  const tyresByRace = new Map(
    existingTyres.map((t) => [String(t.race).replace(/^\d{4}\s+/, ""), { ...t, race: String(t.race).replace(/^\d{4}\s+/, "") }]),
  );
  for (const race of races) {
    if (tyresByRace.has(race.raceName)) continue;
    const title = (race.url ?? "").split("/").pop();
    if (!title) continue;
    await sleep(4000);
    try {
      // action=raw is a plain page-source GET and survives rate limiting far
      // better than the parse API, which Wikipedia throttles aggressively.
      const wikitext = await getText(
        `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`,
      );
      const entry = parseTyres(wikitext, race.raceName, title);
      if (!entry) console.warn(`  ! no tyre allocation found for ${race.raceName}`);
      else tyresByRace.set(race.raceName, entry);
    } catch (error) {
      console.warn(`  ! tyres skipped for ${race.raceName}: ${error.message}`);
    }
  }
  const tyres = [...tyresByRace.values()];

  const existingWeather = await readExisting("weather.json");
  const weatherByKey = new Map(existingWeather.map((w) => [`${w.circuitId}:${w.date}`, w]));
  for (const race of races) {
    const c = race.Circuit.Location;
    const day = race.date;
    if (weatherByKey.has(`${race.Circuit.circuitId}:${day}`)) continue;
    if (new Date(`${race.date}T00:00:00Z`) > new Date()) continue;
    await sleep(400);
    try {
      const w = await getJSON(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${c.lat}&longitude=${c.long}&start_date=${day}&end_date=${day}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=UTC`,
      );
      weatherByKey.set(`${race.Circuit.circuitId}:${day}`, {
        circuitId: race.Circuit.circuitId,
        date: day,
        tempMax: w.daily.temperature_2m_max?.[0] ?? null,
        tempMin: w.daily.temperature_2m_min?.[0] ?? null,
        precipitation: w.daily.precipitation_sum?.[0] ?? null,
        windMax: w.daily.wind_speed_10m_max?.[0] ?? null,
      });
    } catch (error) {
      console.warn(`  ! weather skipped for ${race.raceName}: ${error.message}`);
    }
  }
  const weather = [...weatherByKey.values()].sort((a, b) => a.date.localeCompare(b.date));

  const standings = await getJSON("https://api.jolpi.ca/ergast/f1/2026/driverstandings.json?limit=40");
  const activeDrivers = standings.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? [];
  const driverNumbers = activeDrivers
    .filter((d) => d.Driver.permanentNumber)
    .map((d) => ({
      code: d.Driver.code,
      driverId: d.Driver.driverId,
      number: Number(d.Driver.permanentNumber),
      name: `${d.Driver.givenName} ${d.Driver.familyName}`,
      team: d.Constructors[0]?.name ?? null,
    }));

  await writeFile(resolve(OUT, "circuits.json"), JSON.stringify(circuits));
  await writeFile(resolve(OUT, "tyres.json"), JSON.stringify(tyres.filter(Boolean), null, 0));
  await writeFile(resolve(OUT, "weather.json"), JSON.stringify(weather, null, 0));
  await writeFile(resolve(OUT, "drivers.json"), JSON.stringify(driverNumbers, null, 0));

  let worldCount = 0;
  try {
    const world = await buildWorld();
    worldCount = world.length;
    await writeFile(resolve(OUT, "world.json"), JSON.stringify(world));
  } catch (error) {
    console.warn(`  ! world outlines skipped: ${error.message}`);
  }

  console.log(`circuits: ${circuits.length}/${seen.size}  (unmatched: ${unmatched.length ? unmatched.join(", ") : "none"})`);
  console.log(`tyres:    ${tyres.filter(Boolean).length}/${races.length}`);
  console.log(`weather:  ${weather.length}`);
  console.log(`drivers:  ${driverNumbers.length}`);
  console.log(`world:    ${worldCount} land polygons`);
}

await main().catch((error) => {
  console.error(`dataset build failed: ${error.message}`);
  process.exitCode = 1;
});
