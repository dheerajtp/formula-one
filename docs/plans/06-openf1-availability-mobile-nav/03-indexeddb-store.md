# 06/03 — IndexedDB response store

Plan folder: [`00-README.md`](00-README.md) · Model: Sonnet · Prerequisites: 02 · Parallel with: 01, 04

## Decisions you need
A1, A4 — run `grep -E '^\| (A1|A4) ' 00-README.md`.

## Scope (files you own)
- `lib/openf1Store.ts` (new), `lib/openf1.ts`

## Tasks
1. `openf1Store.get(url)`, `put(url, body, sessionEnd)`, `prune()`; DB `f1-openf1`, store `responses`, records `{ url, body, bytes, savedAt }`. Total-size cap with oldest-first eviction (storage constant, documented). All calls try/catch → `null`/no-op.
2. `requestOpenF1`: after the memory cache and before the network, read the store; after a successful response that `isCacheable` accepts and whose session has ended (session/date bounds in the URL or response rows end before now), write it. Car-data URLs qualify once their session ended.
3. On `OpenF1PausedError`, a store hit still returns data (the store is consulted first, so this is automatic).

## Done when
- `npm run build` passes; open a 2024 race lap's telemetry, reload with OpenF1 blocked: the chart renders from the store; a different lap shows `PausedNote`.
- Append `## Result` with stored bytes for a typical lap.
