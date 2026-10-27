import { useEffect, useState } from "react";
import { useRoute } from "@/lib/router";
import { Home } from "./pages/Home";
import { CalendarPage } from "./pages/Calendar";
import { RacePage } from "./pages/Race";
import { ReplayPage } from "./pages/Replay";
import { QualifyingPage } from "./pages/Qualifying";
import { DriversPage } from "./pages/Drivers";
import { DriverPage } from "./pages/Driver";
import { TeamsPage } from "./pages/Teams";
import { WeekendPage } from "./pages/Weekend";
import { getCalendar } from "@/lib/jolpica";
import { browserZone, setZoneMode, useZoneMode, zoneShort, type ZoneMode } from "@/lib/timezone";

const NAV = [
  { href: "#/", label: "Season" },
  { href: "#/weekend", label: "Weekend" },
  { href: "#/calendar", label: "Calendar" },
  { href: "#/drivers", label: "Drivers" },
  { href: "#/teams", label: "Teams" },
];

export default function App() {
  const route = useRoute();
  const [season, setSeason] = useState(() => {
    const stored = Number(localStorage.getItem("f1-season"));
    return Number.isFinite(stored) && stored >= 1950 && stored <= 2100 ? stored : currentSeason();
  });

  useEffect(() => {
    localStorage.setItem("f1-season", String(season));
  }, [season]);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <a href="#/" className="flex items-center gap-2.5">
            <span className="h-5 w-1.5 bg-primary" aria-hidden />
            <span className="text-lg font-bold uppercase tracking-[0.18em]">Pit Wall</span>
          </a>
          <nav aria-label="Sections" className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = isActive(item.href, route);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`label-caps rounded px-2.5 py-1.5 text-xs transition-colors ${
                    active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ZoneToggle />
            <div className="flex items-center gap-2">
              <label htmlFor="season" className="label-caps text-[10px] text-muted-foreground">
                Season
              </label>
              <SeasonSelect value={season} onChange={setSeason} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-5">
        {route.name === "home" && <Home season={season} />}
        {route.name === "calendar" && <CalendarPage season={season} />}
        {route.name === "weekend" && (
          <WeekendPage
            season={route.params.season ? Number(route.params.season) : season}
            round={route.params.round ? Number(route.params.round) : undefined}
          />
        )}
        {route.name === "race" && (
          <RacePage season={Number(route.params.season)} round={Number(route.params.round)} />
        )}
        {route.name === "replay" && (
          <ReplayPage season={Number(route.params.season)} round={Number(route.params.round)} />
        )}
        {route.name === "qualifying" && (
          <QualifyingPage season={Number(route.params.season)} round={Number(route.params.round)} />
        )}
        {route.name === "drivers" && <DriversPage season={season} />}
        {route.name === "driver" && (
          <DriverPage driverId={route.params.driverId} />
        )}
        {route.name === "teams" && <TeamsPage season={season} />}
        {route.name === "notfound" && (
          <p className="text-sm text-muted-foreground">
            That page does not exist. <a className="text-primary underline" href="#/">Back to the season</a>.
          </p>
        )}
      </main>

      <footer className="border-t border-border px-4 py-6 text-xs text-muted-foreground">
        <p>
          Timing, standings and circuit data from the free{" "}
          <a
            href="https://api.jolpi.ca/"
            className="underline hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Jolpica F1 API
          </a>
          . Track geometry from{" "}
          <a
            href="https://github.com/bacinger/f1-circuits"
            className="underline hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            bacinger/f1-circuits
          </a>{" "}
          (MIT). Tyre allocations sourced from race reports; see each race page.
        </p>
        <p className="mt-2">
          Replays are reconstructed from official lap timing. Wheel-by-wheel telemetry (speed, gear,
          throttle, DRS) is no longer published on a free feed, so those readouts are omitted rather than estimated.
          Qualifying has no public lap-by-lap feed at all, so it is shown as the official Q1/Q2/Q3 board.
        </p>
      </footer>
    </div>
  );
}

const ZONE_OPTIONS: { value: ZoneMode; label: string; hint: string }[] = [
  {
    value: "browser",
    label: browserZone() === "UTC" ? "My zone" : (browserZone().split("/").pop() ?? "My zone").replace(/_/g, " "),
    hint: `Your device clock — ${browserZone()} (${zoneShort("browser")})`,
  },
  { value: "utc", label: "UTC", hint: "The raw feed timing, before any conversion to your clock" },
];

function ZoneToggle() {
  const mode = useZoneMode();
  return (
    <div className="flex items-center gap-2">
      <span className="label-caps text-[10px] text-muted-foreground">Times in</span>
      <div className="flex border border-border" role="group" aria-label="Time zone">
        {ZONE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.hint}
            onClick={() => setZoneMode(option.value)}
            aria-pressed={option.value === mode}
            className={`label-caps px-2 py-1 text-[10px] transition-colors ${
              option.value === mode
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function isActive(href: string, route: ReturnType<typeof useRoute>) {
  if (href === "#/") return route.name === "home";
  const section =
    route.name === "race" || route.name === "replay" || route.name === "qualifying"
      ? "calendar"
      : route.name === "driver"
        ? "drivers"
        : route.name;
  return href === `#/${section}`;
}

function SeasonSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [options, setOptions] = useState<number[]>(() => {
    const now = currentSeason();
    return Array.from({ length: 8 }, (_, i) => now - i);
  });

  useEffect(() => {
    // Offer every season the API actually has, not just the recent eight.
    let active = true;
    getCalendar(value)
      .then(() => {
        if (!active) return;
        setOptions((prev) => (prev.includes(value) ? prev : [value, ...prev]));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [value]);

  return (
    <select
      id="season"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="tnum rounded border border-border bg-card px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {options.map((year) => (
        <option key={year} value={year}>
          {year}
        </option>
      ))}
    </select>
  );
}

function currentSeason() {
  return new Date().getUTCFullYear();
}
