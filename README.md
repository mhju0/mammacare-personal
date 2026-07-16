# Allergy Tracker

Introduce your baby's foods one at a time, watch the trial window, and the
food list becomes a traffic light you can trust.

**Native iOS · 100% on-device · no account, no server — your baby's data
never leaves the phone.**

## How it works
1. Pick a food (56 built-in — big-9 allergens flagged high-risk — or add your own).
2. Start a trial. The app schedules gentle check-in reminders through the
   watch window (default 3 days). One food at a time — that's the point.
3. Log a reaction (symptoms, severity, notes) → food turns **red**.
   Window passes clean → **green**. The Foods list is the answer to
   "can my baby eat this?"
4. One tap exports a doctor-ready PDF report or a JSON backup.

## Stack
Expo (React Native, TypeScript) · Expo Router · expo-sqlite + Drizzle ORM
(on-device relational DB, statuses derived at read time, never stored) ·
expo-notifications (all local) · i18next (한국어 전용 UI) · Jest.

## Run
```bash
npm install
npx expo run:ios   # dev build on the iOS simulator
npx jest           # unit tests (status derivation, scheduling, export)
```

## History
v1 (MammaCare — Capacitor + FastAPI/Postgres) is archived at tag
`archive/v1-capacitor`. v2 is a ground-up rebuild; design spec in
`docs/superpowers/specs/`.

*Tracking aid, not medical advice. Always consult your pediatrician.*
