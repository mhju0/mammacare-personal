# Allergy Tracker — Ground-Up Rebuild Design

**Date:** 2026-07-16
**Status:** Approved by owner (brainstorming session)
**Naming:** product **Allergy Tracker** (formerly MammaCare); iOS home-screen
label **"Allergies"** (15-char names truncate under the icon); repo renamed
`mhju0/mammacare-ios` → **`mhju0/allergy-tracker`** (GitHub auto-redirects);
slug `allergy-tracker`.
**Supersedes:** the entire v1 app (React/Vite/Capacitor + FastAPI/Postgres), archived at tag `archive/v1-capacitor`.

## 1. Purpose & positioning

A **baby food-allergy tracker** — that is the whole product. Parents introduce
new foods one at a time, watch for reactions over a ~3-day window, and the food
list becomes a traffic light they can trust.

- **Goal:** portfolio-first, but genuinely usable by real parents. When the two
  conflict, portfolio wins.
- **The one idea kept from v1:** allergy status as a traffic light. Everything
  else (community, admin console, hospital finder, recommendations, accounts,
  server) is gone and does not come back.

## 2. Decisions (all owner-confirmed)

| Fork | Decision |
|---|---|
| Stack | **Expo (managed) + React Native + TypeScript**, native iOS target. Android is a free byproduct, not a polish target. |
| Data | **On-device only.** No accounts, no login, no server, no sync. |
| Persistence | **expo-sqlite + Drizzle ORM** — real typed schema, migrations. |
| V1 scope extras | **Reminders** (local notifications) + **pediatrician export**. |
| Not in v1 | Multiple babies, reaction photos, cloud sync, import/restore, dark mode. |
| Food catalog | **Curated seed + free-text**: big-9 allergens + ~40 common first foods shipped in-app; parents can add any custom food. |
| Language | **i18n from day one** (i18next + expo-localization): English default, Korean locale. |
| Repo | **Same repo, wiped and renamed to `mhju0/allergy-tracker`.** v1 archived as a tag; v2 scaffolded at the root. Product name **Allergy Tracker**. Local working folder can be renamed at the owner's convenience (nothing depends on it). |

## 3. Screens — no tabs, Home is the hub

Stack navigation via Expo Router. Five surfaces, nothing else:

1. **Home** — the traffic light. Active-trial card front and center
   ("Egg — day 2 of 3"), status counts (safe / testing / reacted / untried),
   one CTA: "Try a new food." On first launch, Home shows a single inline
   setup card (baby name + birthdate) instead of the dashboard.
2. **Foods** — every food as a status-chip row (grey untried · amber testing ·
   green safe · red reacted), search, add from the catalog or free-text.
   Big-9 allergens carry a visible "high-risk" badge.
3. **Food detail** — one food's full story: trials, reactions, dates.
   Actions: start trial / log reaction / retest.
4. **Log reaction** (modal sheet) — symptom multi-select from a fixed list
   (hives, rash, vomiting, diarrhea, facial swelling, breathing difficulty,
   other), severity (mild / moderate / severe), when it happened, free note.
   If severity is severe or "breathing difficulty" is selected, show a static
   "seek emergency care now" advisory line.
5. **Settings** (sheet) — baby name/birthdate, default watch window (3 days),
   language (EN/KO), the two export buttons, medical disclaimer, app info.

### Visual direction
Minimal native-iOS feel: system font, generous whitespace, near-neutral
palette where **the traffic-light colors are the only loud thing**. Color is
never the sole carrier of meaning (icon + label always). No logo art, no
mascot, no photography. Light mode only in v1. Design tokens defined once at
build time; no one-off hardcoded colors.

## 4. Data model & domain logic

Drizzle schema on expo-sqlite:

- `baby` — id, name, birthdate. (Single row in v1; still a table so
  multi-baby is a migration, not a rewrite.)
- `food` — id, name (i18n key for catalog foods, raw text for custom),
  isCustom, allergenGroup (nullable; set for big-9).
- `trial` — id, foodId, startedAt, windowDays (default from settings),
  outcome (`safe` | `reacted` | `cancelled` | NULL = active), endedAt.
- `reaction` — id, trialId, symptoms (JSON array of fixed keys), severity
  (`mild` | `moderate` | `severe`), occurredAt, note.

### Rule 1 — status is derived, never stored
One pure function, the unit-tested heart of the app:

```
deriveStatus(trials, reactions, now) →
  untried   — food has no trials
  testing   — latest trial has no outcome (includes "window elapsed,
              awaiting confirmation" — UI shows it as ready-to-confirm)
  reacted   — latest trial's outcome is `reacted`
  safe      — latest trial's outcome is `safe`
```

- "Latest trial" always means latest **non-cancelled** trial.
- A trial ends **only** by explicit outcome — no timer auto-flips it.
- Logging a reaction sets its trial's outcome to `reacted` and ends the trial
  immediately. Logging a reaction on a food whose latest trial is already
  closed (e.g. a delayed reaction after it was marked safe) attaches to that
  latest trial and flips its outcome to `reacted`.
- **Implicit confirmation:** starting a new trial while the previous trial's
  window has fully elapsed with zero reactions auto-closes that previous
  trial as `safe`. (Moving on to the next food *is* the confirmation.)
  If the previous trial's window has NOT elapsed, starting a new trial is
  blocked (see Rule 2). A reaction is always an explicit log.
- `cancelled` trials are ignored by status derivation (food reverts to its
  previous state's logic — derivation just skips them).

### Rule 2 — one active trial at a time
Only one non-elapsed active trial may exist across all foods (isolating the
variable is the medical point of a food trial). Enforced as a guard in the
start-trial mutation — not a DB constraint. Retesting a safe or reacted food
is always allowed and just creates a new trial.

## 5. Reminders

`expo-notifications`, all local, no server:

- Starting a trial schedules one check-in per day of the window
  ("Day 2 of egg — any symptoms?") plus a window-end prompt
  ("Egg's watch window is done — mark it safe?").
- Logging an outcome (or cancelling the trial) cancels its pending
  notifications.
- Notification permission is requested at **first trial start** (in context),
  never at app launch. Denied permission degrades gracefully: the app works
  identically, just without nudges.

## 6. Export (and backup)

Two buttons in Settings, both handing off to the native share sheet:

1. **Pediatrician PDF** (`expo-print`): baby info, foods tried with dates and
   statuses, every reaction with symptoms/severity/date. The artifact a
   parent brings to an allergist.
2. **JSON backup** (`expo-file-system` + `expo-sharing`): the raw tables,
   versioned envelope. Since on-device-only means the phone is the single
   copy, this is the backup story. Import/restore is v2; v1 backup is "the
   file exists somewhere safe."

## 7. Seed catalog

Shipped as a JSON asset, inserted on first launch:

- **Big-9 allergens** (high-risk badge): egg, peanut, cow's milk, wheat, soy,
  fish, shellfish, tree nuts, sesame.
- **~40 common first foods**: rice, oat, banana, avocado, sweet potato,
  carrot, apple, pear, broccoli, etc. Curated during implementation; Korean
  weaning staples included.
- Catalog food names are i18n keys (EN + KO translations); custom foods store
  whatever the parent typed.

## 8. Safety & trust details

- Medical disclaimer ("tracking aid, not medical advice") shown once in
  onboarding and permanently in Settings.
- Emergency advisory line on severe/breathing reactions (§3.4).
- Privacy line, honestly earned: "Your baby's data never leaves your phone."

## 9. Testing

- **Jest unit tests on `deriveStatus`** — every transition, the implicit-
  confirmation edge, cancelled-trial skipping, window boundary at exactly
  `startedAt + windowDays`.
- Unit tests on the notification scheduling/cancellation logic (pure
  scheduling computation extracted from the expo-notifications calls).
- No E2E suite in v1. Manual smoke on the iOS simulator before tagging.

## 10. Teardown & migration plan

1. Tag current `main` as `archive/v1-capacitor`, push the tag. Everything is
   recoverable; nothing else needs preserving.
2. Remove all v1 files from `main` (backend/, frontend/, requirements.txt,
   ROADMAP.md, SETUP.md, DESIGN_SYSTEM.md, docs/screenshots/). Keep: LICENSE,
   `.gitignore` (rewritten), this spec.
3. Delete untracked local junk: `venv/`, `.serena/`, `.tokensave/`,
   `pre_uq_drop_backup.dump` (PII — must not survive in the working tree).
4. Scaffold the Expo app at the repo root; rewrite `README.md` and the local
   `CLAUDE.md` (gitignored) for v2; new minimal `DESIGN_SYSTEM` notes live in
   the README until there's enough to warrant a file.
5. Local Postgres database `mammacare_db` is left alone (harmless), noted as
   deletable in the new CLAUDE.md.

## 11. Explicitly out of scope (do not resurrect)

AI features of any kind, community, admin console, hospital finder,
recommendations, inquiries/CS, accounts/auth/JWT, any server or cloud
component, Capacitor, FastAPI, Postgres, multi-baby (v1), photos (v1),
dark mode (v1), Android polish (v1).
