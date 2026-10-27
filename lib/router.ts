import { useCallback, useEffect, useState } from "react";

/** Minimal hash router — keeps the static build deep-linkable without a server. */
export interface Route {
  name:
    | "home"
    | "calendar"
    | "weekend"
    | "race"
    | "replay"
    | "qualifying"
    | "driver"
    | "drivers"
    | "teams"
    | "notfound";
  params: Record<string, string>;
}

const PATTERNS: [RegExp, Route["name"], string[]][] = [
  [/^\/?$/, "home", []],
  [/^\/calendar\/?$/, "calendar", []],
  [/^\/weekend\/?$/, "weekend", []],
  [/^\/weekend\/(\d+)\/(\d+)\/?$/, "weekend", ["season", "round"]],
  [/^\/race\/(\d+)\/(\d+)\/?$/, "race", ["season", "round"]],
  [/^\/replay\/(\d+)\/(\d+)\/?$/, "replay", ["season", "round"]],
  [/^\/qualifying\/(\d+)\/(\d+)\/?$/, "qualifying", ["season", "round"]],
  [/^\/drivers\/?$/, "drivers", []],
  [/^\/drivers\/([\w-]+)\/?$/, "driver", ["driverId"]],
  [/^\/teams\/?$/, "teams", []],
];

function parse(hash: string): Route {
  const path = hash.replace(/^#/, "") || "/";
  for (const [re, name, keys] of PATTERNS) {
    const m = path.match(re);
    if (m) {
      const params: Record<string, string> = {};
      keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { name, params };
    }
  }
  return { name: "notfound", params: {} };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(to: string) {
  window.location.hash = to;
}

/** Anchor helper that keeps hash routes consistent. */
export function useNav() {
  return useCallback((to: string) => (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.button !== 0) return;
    event.preventDefault();
    navigate(to);
  }, []);
}
