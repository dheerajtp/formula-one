# Pit Wall plan index

## Module execution order
| Plan | Title | Summary |
| --- | --- | --- |
| 01 | [Telemetry and pit strategy](plans/01-telemetry-strategy/00-README.md) | Race-page telemetry browsing plus measured pit strategy and an upcoming-race baseline; requires OpenF1 (completed sessions only) and the existing Jolpica client. |
| 02 | [Best laps and pit stops](plans/02-best-laps-pit-stops/00-README.md) | Season race-fastest-lap records, circuit race-lap records, official pit-lane transit and OpenF1 stationary crew times where published; builds on plan 01's OpenF1 client. |
| 03 | [Weekend pit strategy](plans/03-weekend-pit-strategy/00-README.md) | Pit strategy panel on the Weekend page: historical baseline before/during the race, compact actual strategy once OpenF1 publishes it, deep link to Race → Strategy; reuses plan 01's engine. |
| 04 | [Telemetry explained](plans/04-telemetry-explained/00-README.md) | "Explain this lap" guide on the Race → Telemetry tab: channel key and lap story written from the lap's own data, braking-zone/straight markers on chart and track map, and compare-with-another-lap overlay with time delta. |
| 05 | [Race fastest laps and pit stops](plans/05-race-laps-and-stops/00-README.md) | Per-race `Fastest laps` and `Pit stops` tabs on the Race page: every driver's best lap with circuit-record context and telemetry jump; official pit-lane transit joined with OpenF1 stationary crew time and a per-team crew summary. |
| 06 | [OpenF1 availability and mobile navigation](plans/06-openf1-availability-mobile-nav/00-README.md) | Keeps Telemetry/Strategy/pit data working while OpenF1 pauses free access during live F1 sessions (bundled session snapshots + IndexedDB store + named paused state), and a mobile menu so the header never overflows. |

## Boundaries
- All runtime data reads stay in the browser and remain credential-free.
- OpenF1 historical access is public; OpenF1 real-time telemetry is paid and is deliberately not part of this plan.
- No domain value is hardcoded: every lap, duration, compound and strategy metric is read from the API or computed from that data.
- Lap times are compared within a race or circuit; a season list of race laps is not presented as a cross-circuit pace order.
- Pit-lane transit (entry to exit) and stationary crew time are separate metrics and are never labelled as each other; missing stationary times are never imputed.
