<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg">
  <img src="docs/logo-light.svg" alt="알레르기 트래커 — Allergy Tracker" width="440">
</picture>

**Introduce your baby's foods one at a time — and the food list becomes a traffic light you can trust.**

Native iOS · Korean-only UI · 100% on-device — no account, no server, no network.

![Expo SDK 57](https://img.shields.io/badge/Expo-SDK%2057-000020?logo=expo&logoColor=white)
![React Native 0.86](https://img.shields.io/badge/React%20Native-0.86-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![SQLite + Drizzle](https://img.shields.io/badge/SQLite-Drizzle%20ORM-C5F74F?logo=drizzle&logoColor=black)
![Tests](https://img.shields.io/badge/tests-42%20passing-2E7D4F)
![License](https://img.shields.io/badge/license-MIT-8B8578)

</div>

---

<p align="center">
  <img src="docs/screenshots/home.png" alt="Home — active trial dashboard" width="168">
  <img src="docs/screenshots/foods.png" alt="Foods — searchable catalog with statuses" width="168">
  <img src="docs/screenshots/detail.png" alt="Food detail — reaction history timeline" width="168">
  <img src="docs/screenshots/calendar.png" alt="Calendar — tinted trial windows and event dots" width="168">
  <img src="docs/screenshots/reaction.png" alt="Reaction logging — symptoms and severity" width="168">
</p>

## Why

Pediatric weaning guidance (질병관리청, 대한소아청소년과학회, NHS, CDC) agrees on
one thing: introduce **one new food at a time** and watch for reactions —
which can appear up to **2–3 days later** — before moving on. In practice
that means remembering what was fed when, what happened, and what's still
untested, across months. This app is that memory.

## Features

- **One food at a time, enforced.** Starting a new trial is blocked while
  another is under observation — the single rule that makes every other
  record trustworthy.
- **Fixed 3-day observation window** with gentle local check-in
  notifications (daytime, 09:00) and a window-end reminder.
- **Traffic-light statuses** — 안전 (green) / 테스트 중 (amber) /
  반응 (red) / 안 먹어봄 — always **derived from the trial history at read
  time, never stored**, so the list can't drift out of sync.
- **이상 없음 one-tap check-ins** log "no reaction observed" during a trial
  without ending it — affirmative evidence, not just absence of alarms.
- **Delayed reactions handled correctly**: logging a reaction on a food
  already marked safe flips it to red, matching how real allergies surface.
- **Calendar history** — month view tints each day inside a trial window
  and dots reaction/check-in days, with a per-day event list.
- **Curated catalog** of 56 Korean weaning foods with the big-9 allergen
  groups flagged 고위험, plus free-text custom foods.
- **Doctor-ready PDF report** (foods tried, statuses, reaction log) and
  one-tap JSON backup — both generated on device and handed to the iOS
  share sheet.

## How a trial works

```
새 재료 시작 ──▶ 테스트 중 (3일)
                  │  이상 없음 check-ins (observations — never change status)
                  ├─ 반응 기록          ──▶ 반응 (red)   · notifications cancelled
                  ├─ 안전으로 표시       ──▶ 안전 (green) · window must have elapsed
                  ├─ 다음 재료 시작      ──▶ 안전 (green) · implicit-safe autoclose
                  └─ 테스트 취소        ──▶ 기록만 남음
지연 반응: 안전이던 재료에 반응 기록 ──▶ 반응 (red)
```

## Architecture

```
app/            Expo Router screens (stack-only, typed routes)
src/domain/     Pure logic — status derivation, trial rules, notification
                schedule, calendar math. No I/O, fully unit-tested (TDD).
src/data/       Mutations & live queries (drizzle + useLiveQuery)
src/db/         Schema, generated migrations, seed catalog, demo fixture
src/services/   Local notifications, PDF/JSON export builders
src/ui/         Design tokens (single source of color) + shared components
```

- **Status is a function, not a column.** `deriveStatus(trials, now)` is an
  exhaustive switch over trial history; there is no status field to corrupt.
- **Domain core is pure TypeScript** — 42 tests across 7 suites cover
  status rules, the start-trial decision (including implicit-safe
  autoclose), notification scheduling, calendar date math, export builders,
  and the demo fixture's invariants.
- **Editorial UI system** — paper/ink/persimmon token palette, hairline
  lists, big-type headlines; status colors always ship with an icon + label,
  never color alone.
- **Korean-only by design** — every user-visible string flows through
  i18next with `ko` as the sole locale; dates are pinned to `ko-KR`.

## Getting started

```bash
npm install
npx expo run:ios      # dev build on the iOS simulator
npx jest              # unit tests
npx tsc --noEmit      # typecheck
```

**Demo mode** — boot a fresh install pre-filled with 46 days of realistic
history (16 trials, reactions, check-ins, an active trial on day 2):

```bash
EXPO_PUBLIC_DEMO=1 npx expo run:ios
```

The demo seed only fires when the database has no baby profile; real
installs are unaffected.

## Privacy

All data lives in a local SQLite file on the phone. There is no network
code in the app — nothing is collected, synced, or sent anywhere. Export
is explicit: a PDF or JSON file handed to the iOS share sheet.

## License

[MIT](LICENSE) © 2026 Michael Ju

---

*이 앱은 기록 보조 도구이며 의학적 조언이 아닙니다 — a tracking aid, not
medical advice. Always consult your pediatrician about allergies.*
