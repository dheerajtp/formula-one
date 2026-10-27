import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Choice, Empty, ErrorBlock, PageLoader, Panel } from "@/components/Bits";
import { TrackMap, type TrackCar } from "@/components/TrackMap";
import { teamColor } from "@/lib/colors";
import { IN_PROGRESS_NOTE, LIVE_FEED_UNAVAILABLE, classifySession, useTimingArrival, worthWatching } from "@/lib/live";
import { formatLapTime, formatRaceClock } from "@/lib/format";
import {
  getCalendar,
  getLapsByDriver,
  getPitStops,
  getRaceResults,
  raceStartDate,
  type PitStop,
  type Race,
} from "@/lib/jolpica";
import { buildReplay, gapToMetres, layoutField, type CarState, type PositionScale } from "@/lib/replay";
import { CIRCUITS } from "@/lib/staticData";
import { useAsync, useNow } from "@/lib/useAsync";

const SPEEDS = [0.5, 1, 2, 4, 8, 16, 32];
const PACK_SPAN = 28;
const ORDER_COLS = "grid-cols-[1.75rem_1fr_4rem_auto]";

function stored<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  const value = localStorage.getItem(key);
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function ReplayPage({ season, round }: { season: number; round: number }) {
  const calendar = useAsync(() => getCalendar(season), [season]);
  const race = (calendar.data ?? []).find((r) => Number(r.round) === round);

  if (calendar.loading) return <PageLoader label="Loading session" />;
  if (calendar.error) return <ErrorBlock message={calendar.error} />;
  if (!race) return <ErrorBlock message={`Round ${round} of ${season} was not found.`} />;

  return <Replay season={season} round={round} race={race} />;
}

function Replay({ season, round, race }: { season: number; round: number; race: Race }) {
  const { raceName } = race;
  const circuit = CIRCUITS.get(race.Circuit.circuitId);
  const now = useNow(15000);
  const [reloadKey, setReloadKey] = useState<string | null>(null);
  const { data, loading, error } = useAsync(async () => {
    const [results, lapsByDriver, pitStops] = await Promise.all([
      getRaceResults(season, round),
      getLapsByDriver(season, round),
      getPitStops(season, round),
    ]);
    return { results, lapsByDriver, pitStops };
  }, [season, round, reloadKey]);

  // The sheet can be published while the visitor is sitting here, so watch for it
  // and pull the replay in rather than asking them to refresh.
  const watching = !data?.results.length && worthWatching(raceStartDate(race), now);
  const timing = useTimingArrival(season, round, watching);
  useEffect(() => {
    if (timing.landed) setReloadKey(`${season}/${round}`);
  }, [timing.landed, season, round]);

  const replay = useMemo(() => {
    if (!data?.results.length) return null;
    return buildReplay(data.results, data.lapsByDriver, data.pitStops, teamColor);
  }, [data]);

  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(3);
  const [selected, setSelected] = useState<string[]>([]);
  const [scale, setScale] = useState<PositionScale>(() =>
    stored("f1-replay-scale", "spread", ["spread", "true"] as const),
  );
  const [zoom, setZoom] = useState<"whole" | "pack">(() =>
    stored("f1-replay-zoom", "whole", ["whole", "pack"] as const),
  );
  const clockRef = useRef(0);
  clockRef.current = clock;

  const speed = SPEEDS[speedIndex];

  useEffect(() => {
    if (!replay) return;
    // Default the side cards to the top three finishers.
    setSelected(replay.entrants.slice(0, 3).map((e) => e.driverId));
  }, [replay]);

  useEffect(() => {
    localStorage.setItem("f1-replay-scale", scale);
  }, [scale]);

  useEffect(() => {
    localStorage.setItem("f1-replay-zoom", zoom);
  }, [zoom]);

  useEffect(() => {
    if (!playing || !replay) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) * speed;
      last = now;
      const next = clockRef.current + delta;
      if (next >= replay.durationMs) {
        setClock(replay.durationMs);
        setPlaying(false);
        return;
      }
      setClock(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, replay]);

  const seek = useCallback(
    (ms: number) => {
      if (!replay) return;
      setClock(Math.min(replay.durationMs, Math.max(0, ms)));
    },
    [replay],
  );

  const toggleSelect = useCallback(
    (driverId: string, additive: boolean) => {
      setSelected((prev) => {
        if (prev.includes(driverId)) return prev.length > 1 ? prev.filter((id) => id !== driverId) : prev;
        return additive ? [...prev, driverId].slice(-4) : [driverId];
      });
    },
    [],
  );

  // Keyboard transport, matching the layout printed under the map.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!replay) return;
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return;
      switch (event.key) {
        case " ":
          event.preventDefault();
          setPlaying((p) => !p);
          break;
        case "ArrowRight":
          event.preventDefault();
          seek(clockRef.current + (event.shiftKey ? replay.durationMs / 20 : 10000 * speed));
          break;
        case "ArrowLeft":
          event.preventDefault();
          seek(clockRef.current - (event.shiftKey ? replay.durationMs / 20 : 10000 * speed));
          break;
        case "ArrowUp":
          event.preventDefault();
          setSpeedIndex((i) => Math.min(SPEEDS.length - 1, i + 1));
          break;
        case "ArrowDown":
          event.preventDefault();
          setSpeedIndex((i) => Math.max(0, i - 1));
          break;
        case "r":
        case "R":
          setClock(0);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay, seek, speed]);

  if (loading) return <PageLoader label="Loading lap timing" />;
  if (error) return <ErrorBlock message={error} />;
  if (!replay || !circuit) {
    const status = classifySession(race, now, false);
    const waiting = status === "in-progress" || watching;
    return (
      <Panel title={raceName}>
        <Empty>
          <div className="space-y-2">
            <p>
              {waiting
                ? IN_PROGRESS_NOTE
                : `No lap timing is available for this session. ${LIVE_FEED_UNAVAILABLE}`}
            </p>
            {watching && (
              <p className="tnum flex items-center gap-2 text-[11px]" role="status">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${timing.probeFailed ? "bg-muted-foreground" : "animate-pulse bg-primary"}`}
                  aria-hidden
                />
                {timing.lastChecked
                  ? `Checked ${timing.lastChecked.toLocaleTimeString()} · the replay appears here by itself once the sheet is published.`
                  : "Checking the feed now…"}
              </p>
            )}
            <p className="text-[11px]">
              <a href={`#/weekend/${season}/${round}`} className="text-primary hover:underline">
                Weekend schedule →
              </a>
            </p>
          </div>
        </Empty>
      </Panel>
    );
  }

  const frame = replay.frameAt(clock);
  const layout = layoutField(frame, scale);
  const cars: TrackCar[] = frame.cars
    .filter((car) => !car.retired)
    .map((car) => {
      const at = layout.get(car.entrant.driverId);
      return {
        id: car.entrant.driverId,
        frac: at?.fraction ?? 0,
        lateral: at?.lateral ?? 0,
        color: car.entrant.color,
        label: car.entrant.carNumber,
        selected: selected.includes(car.entrant.driverId),
        retired: false,
      };
    });

  // The front of the field by track, which is the car the camera should follow.
  const front = frame.cars.reduce(
    (best, car) => (!car.retired && car.lap > (best?.lap ?? 0) ? car : best),
    undefined as CarState | undefined,
  );
  const focusCar = front?.entrant.driverId ?? null;
  // Before anyone crosses the line the feed has no classification to show, so the
  // board is the grid. Naming that explicitly stops it reading as an early result.
  const gridPhase = !frame.cars.some((car) => !car.onGrid);
  const selectedCars = selected
    .map((id) => frame.cars.find((c) => c.entrant.driverId === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">{raceName}</h1>
          <p className="text-xs text-muted-foreground">
            {circuit.name} · {circuit.locality}, {circuit.country}
          </p>
          <a
            href={`#/qualifying/${season}/${round}`}
            className="label-caps text-[10px] text-primary hover:underline"
          >
            How the grid was set →
          </a>
        </div>
        <div className="tnum flex items-baseline gap-4">
          {gridPhase && (
            <span className="label-caps self-center border border-primary/60 px-1.5 py-0.5 text-[10px] text-primary">
              lights out · grid
            </span>
          )}
          <span>
            <span className="label-caps mr-1 text-[10px] text-muted-foreground">Lap</span>
            <span className="text-lg font-bold">
              {frame.leaderLap}/{replay.totalLaps}
            </span>
          </span>
          <span>
            <span className="label-caps mr-1 text-[10px] text-muted-foreground">Race time</span>
            <span className="text-lg font-bold">{formatRaceClock(clock)}</span>
            <span className="ml-1 text-xs text-muted-foreground">(x{speed})</span>
          </span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        <div className="order-2 flex flex-col gap-3 lg:order-1">
          {selectedCars.map((car) => (
            <DriverCard
              key={car.entrant.driverId}
              car={car}
              stops={replay.stopsByDriver.get(car.entrant.driverId) ?? []}
              lapLengthM={circuit.outline.length}
              onRemove={() => toggleSelect(car.entrant.driverId, true)}
            />
          ))}
          <p className="border border-border bg-card p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            Positions are the official classification at the end of each lap. Until a car has crossed the line once it
            sits on its grid slot, so the opening board is the start order and not a result — the Start column carries
            each car's slot and where it has moved to. Speed, gear and throttle traces would come from the broadcast
            feed. {LIVE_FEED_UNAVAILABLE}
          </p>
        </div>

        <Panel
          className="order-1 lg:order-2"
          bodyClassName="p-1"
          title={
            gridPhase
              ? "Circuit · lights out, field on its grid slots"
              : scale === "spread"
                ? "Circuit · gaps not to scale"
                : "Circuit · true scale"
          }
          action={
            <div className="flex items-center gap-3">
              <Choice
                label="Gaps"
                value={scale}
                options={[
                  { value: "spread", label: "Spread", hint: "Stretch intervals so the field is readable" },
                  { value: "true", label: "True", hint: "Show real distance around the lap" },
                ]}
                onChange={setScale}
              />
              <Choice
                label="View"
                value={zoom}
                options={[
                  { value: "whole", label: "Track", hint: "Show the whole circuit" },
                  { value: "pack", label: "Pack", hint: "Follow the leader" },
                ]}
                onChange={setZoom}
              />
            </div>
          }
        >
          <TrackMap
            outline={circuit.outline}
            cars={cars}
            camera={zoom === "pack" ? { span: PACK_SPAN, focusId: focusCar } : undefined}
            onSelectCar={(id) => toggleSelect(id, true)}
            className="h-[46vh] max-h-[520px] min-h-[300px] w-full"
          />
        </Panel>

        <Panel
          className="order-3"
          title={gridPhase ? "Starting grid" : `Running order · lap ${frame.leaderLap}`}
          bodyClassName="p-0"
        >
          <div className={`label-caps grid ${ORDER_COLS} gap-2 border-b border-border px-2.5 py-1 text-[9px] text-muted-foreground`}>
            <span>{gridPhase ? "Slot" : "Pos"}</span>
            <span>Driver</span>
            <span>Start</span>
            <span className="text-right">Interval · lap</span>
          </div>
          {gridPhase && (
            <p className="border-b border-border bg-secondary/40 px-2.5 py-1.5 text-[10px] leading-snug text-muted-foreground">
              No car has reached the line yet, so this is the order they set off in — not a result. Press play: the
              board rewrites itself each time a car crosses the line.
            </p>
          )}
          <ol className="max-h-[42vh] overflow-y-auto">
            {frame.cars.map((car) => (
              <li key={car.entrant.driverId}>
                <button
                  type="button"
                  onClick={(e) => toggleSelect(car.entrant.driverId, e.shiftKey || e.metaKey || e.ctrlKey)}
                  className={`grid w-full ${ORDER_COLS} items-center gap-2 border-b border-border/50 px-2.5 py-1.5 text-left text-sm last:border-b-0 hover:bg-secondary/70 ${
                    selected.includes(car.entrant.driverId) ? "bg-secondary" : ""
                  }`}
                >
                  <span className="tnum text-xs text-muted-foreground">{car.retired ? "—" : car.runningOrder}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-3.5 w-[3px] shrink-0" style={{ background: car.entrant.color }} aria-hidden />
                    <span className="truncate font-semibold">{car.entrant.code}</span>
                    <span className="tnum truncate text-[11px] text-muted-foreground">{car.entrant.name}</span>
                  </span>
                  <GridDelta car={car} />
                  <span className="tnum text-right text-xs">
                    <span className={car.retired ? "text-destructive" : ""}>{car.intervalText}</span>
                    {car.lastLapTimeMs != null && !car.retired && (
                      <span className="block text-[10px] text-muted-foreground">{formatLapTime(car.lastLapTimeMs)}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <Transport
        clock={clock}
        duration={replay.durationMs}
        playing={playing}
        speed={speed}
        speedIndex={speedIndex}
        maxSpeedIndex={SPEEDS.length - 1}
        totalLaps={replay.totalLaps}
        stops={collectStops(replay.stopsByDriver)}
        onTogglePlay={() => setPlaying((p) => !p)}
        onSeek={seek}
        onSpeed={(next) => setSpeedIndex(Math.min(SPEEDS.length - 1, Math.max(0, next)))}
      />
    </div>
  );
}

function collectStops(stopsByDriver: Map<string, PitStop[]>) {
  const all: PitStop[] = [];
  for (const list of stopsByDriver.values()) all.push(...list);
  return all;
}

function DriverCard({
  car,
  stops,
  lapLengthM,
  onRemove,
}: {
  car: CarState;
  stops: PitStop[];
  lapLengthM: number | null;
  onRemove: () => void;
}) {
  const stintStart = [...stops].filter((s) => Number(s.lap) <= car.lap).pop()?.lap;
  const stintLaps = stintStart ? car.lap - Number(stintStart) : car.lap;
  const metres = gapToMetres(car.gapToAheadMs, car.lastLapTimeMs, lapLengthM);
  const headerColor = car.entrant.color === "#E8E8E8" ? "#07080a" : "#ffffff";

  return (
    <section className="border border-border bg-card" style={{ borderTopColor: car.entrant.color, borderTopWidth: 3 }}>
      <header className="flex items-center justify-between px-3 py-1.5" style={{ background: car.entrant.color }}>
        <h3 className="text-sm font-bold" style={{ color: headerColor }}>
          {car.entrant.code} ·{" "}
          {car.onGrid
            ? `GRID P${car.entrant.gridPosition}`
            : car.retired
              ? "OUT"
              : `P${car.runningOrder}`}
        </h3>
        <button type="button" onClick={onRemove} className="text-xs opacity-70 hover:opacity-100" aria-label={`Hide ${car.entrant.name}`}>
          ✕
        </button>
      </header>
      <div className="space-y-0.5 px-3 py-2 text-sm">
        <p className="truncate text-xs text-muted-foreground">{car.entrant.name} — {car.entrant.team}</p>
        <Row label="Lap" value={`${car.lap}`} />
        <Row label="Grid" value={`P${car.entrant.gridPosition}`} />
        <Row label="Last lap" value={formatLapTime(car.lastLapTimeMs)} />
        <Row label="Interval" value={car.retired ? "Retired" : car.intervalText || "—"} extra={metres ? `(${metres}m)` : ""} />
        <Row label="Stint" value={`${stintLaps} laps`} />
        <Row label="Stops" value={`${stops.filter((s) => Number(s.lap) <= car.lap).length}`} />
        <Row label="Status" value={car.retired ? car.entrant.status : "Running"} />
      </div>
    </section>
  );
}

function Row({ label, value, extra = "" }: { label: string; value: string; extra?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="label-caps text-[10px] text-muted-foreground">{label}</span>
      <span className="tnum text-xs">
        {value}
        {extra && <span className="ml-1 text-muted-foreground">{extra}</span>}
      </span>
    </div>
  );
}

/** The starting slot, plus places gained or lost against it once the car has crossed the line. */
function GridDelta({ car }: { car: CarState }) {
  const slot = <span className="tnum text-[10px] text-muted-foreground">P{car.entrant.gridPosition}</span>;
  if (car.onGrid || car.retired) return <span className="flex justify-end">{slot}</span>;
  const gained = car.entrant.gridPosition - car.runningOrder;
  if (gained === 0)
    return (
      <span className="flex items-baseline justify-end gap-1">
        {slot}
        <span className="text-[10px] text-muted-foreground">=</span>
      </span>
    );
  const places = Math.abs(gained);
  return (
    <span
      className="flex items-baseline justify-end gap-1"
      title={`${gained > 0 ? "Gained" : "Lost"} ${places} place${places === 1 ? "" : "s"} from P${car.entrant.gridPosition} on the grid`}
    >
      {slot}
      <span className={`tnum text-[10px] font-semibold ${gained > 0 ? "text-emerald-400" : "text-rose-400"}`}>
        {gained > 0 ? "▲" : "▼"}
        {places}
      </span>
    </span>
  );
}

function Transport({
  clock,
  duration,
  playing,
  speed,
  speedIndex,
  maxSpeedIndex,
  totalLaps,
  stops,
  onTogglePlay,
  onSeek,
  onSpeed,
}: {
  clock: number;
  duration: number;
  playing: boolean;
  speed: number;
  speedIndex: number;
  maxSpeedIndex: number;
  totalLaps: number;
  stops: PitStop[];
  onTogglePlay: () => void;
  onSeek: (ms: number) => void;
  onSpeed: (index: number) => void;
}) {
  const progress = duration > 0 ? (clock / duration) * 100 : 0;
  // Assume an even lap split for placing stop markers on the scrub bar.
  const lapOf = (lap: number) => (lap / Math.max(1, totalLaps)) * 100;

  return (
    <Panel bodyClassName="p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <TransportButton label="Rewind" onClick={() => onSeek(clock - duration / 20)}>
            ⏪
          </TransportButton>
          <TransportButton label={playing ? "Pause" : "Play"} onClick={onTogglePlay} primary>
            {playing ? "⏸" : "▶"}
          </TransportButton>
          <TransportButton label="Fast forward" onClick={() => onSeek(clock + duration / 20)}>
            ⏩
          </TransportButton>
        </div>

        <div className="flex items-center gap-1">
          <TransportButton label="Slower" onClick={() => onSpeed(speedIndex - 1)}>
            −
          </TransportButton>
          <span className="tnum w-14 text-center text-sm font-bold" aria-live="polite">
            {speed}×
          </span>
          <TransportButton label="Faster" onClick={() => onSpeed(speedIndex + 1)}>
            +
          </TransportButton>
        </div>

        <div className="min-w-[16rem] flex-1">
          <div className="relative h-8">
            <div className="absolute inset-x-0 top-3 h-2 bg-muted" aria-hidden>
              <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
              {stops.map((s, i) => (
                <span
                  key={i}
                  className="absolute top-0 h-full w-[2px] bg-amber-400/70"
                  style={{ left: `${lapOf(Number(s.lap))}%` }}
                  title={`Pit stop, lap ${s.lap}`}
                  aria-hidden
                />
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.round(duration))}
              value={Math.round(clock)}
              onChange={(e) => onSeek(Number(e.target.value))}
              aria-label="Replay position"
              className="absolute inset-0 h-8 w-full cursor-pointer appearance-none bg-transparent opacity-0"
            />
          </div>
          <div className="tnum flex justify-between text-[10px] text-muted-foreground">
            <span>Lap 1</span>
            <span>{formatRaceClock(clock)} / {formatRaceClock(duration)}</span>
            <span>Lap {totalLaps}</span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        <span className="label-caps">Keys</span> space play/pause · ← → scrub · ↑ ↓ speed · R restart ·
        click a car or shift-click the order to pin up to four drivers · map controls set gap scale and zoom.
      </p>
    </Panel>
  );
}

function TransportButton({
  children,
  label,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center border text-sm transition-colors ${
        primary
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/85"
          : "border-border bg-secondary hover:border-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
