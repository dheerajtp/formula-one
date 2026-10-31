# 06/01 — Mobile header

Plan folder: [`00-README.md`](00-README.md) · Model: Haiku · Prerequisites: none · Parallel with: 02–04

## Decisions you need
A7, A8 — run `grep -E '^\| (A7|A8) ' 00-README.md`.

## Read first
- `src/App.tsx` — the `<header>` block, `NAV`, `isActive`, `ZoneToggle`, `SeasonSelect`.

## Scope (files you own)
- `src/App.tsx`

## Tasks
1. Add `menuOpen` state. Below `md`: render logo + `Menu`/`Close` button (`aria-expanded`, `aria-controls="site-menu"`); hide the inline nav and controls with `hidden md:flex`.
2. `#site-menu` (only when open, `md:hidden`): `grid grid-cols-2 gap-1` of the same `NAV` links with the same active styling, then a row with `ZoneToggle` and the season select.
3. Close on link click, on `hashchange` (route change effect), and on `Escape` (keydown listener while open); return focus to the button on close.
4. At `md`+ the existing header markup renders exactly as today.

## Done when
- `npm run build` passes; at 360 / 390 px `scrollWidth === innerWidth` on `#/`, `#/calendar`, `#/race/2026/18`, `#/records`; menu keyboard flow works; 1440 px header unchanged (screenshot diff).
- Append `## Result`.
