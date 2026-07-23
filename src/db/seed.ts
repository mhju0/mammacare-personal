import { and, eq, notInArray } from 'drizzle-orm';
import { db } from './client';
import { baby, checkin, food, reaction, trial } from './schema';
import { CATALOG } from './catalog';
import { buildDemoHistory } from './demoData';
import { newId } from '../data/ids';

export async function seedIfEmpty(): Promise<void> {
  // The single settings row (window days; optional name/birthdate for the
  // doctor report) is created here — there is no setup screen.
  const babyRow = await db.select({ id: baby.id }).from(baby).limit(1);
  if (babyRow.length === 0) {
    await db.insert(baby).values({ id: newId(), name: null, birthdate: null, defaultWindowDays: 3 });
  }
  // Check for SEEDED foods specifically — a custom food (e.g. the demo's
  // 퀴노아, inserted before this runs) must not suppress catalog seeding.
  const existing = await db
    .select({ id: food.id })
    .from(food)
    .where(eq(food.isCustom, false))
    .limit(1);
  if (existing.length > 0) {
    // Reconcile installs seeded by an older catalog: drop seeded foods that
    // were since removed (they'd render as raw i18n keys), but never ones the
    // user has trial history for — those keep a legacy name in ko.json.
    await db.delete(food).where(
      and(
        eq(food.isCustom, false),
        notInArray(food.id, CATALOG.map((c) => c.id)),
        notInArray(food.id, db.select({ id: trial.foodId }).from(trial)),
      ),
    );
    return;
  }
  await db.insert(food).values(
    CATALOG.map((c) => ({
      id: c.id,
      name: `foodName.${c.id}`,
      isCustom: false,
      allergenGroup: c.group,
    })),
  );
}

// EXPO_PUBLIC_DEMO=1 only: fill an untouched install with ~45 days of
// history for demos. No-ops as soon as a baby row exists.
export async function seedDemoIfEmpty(now: Date): Promise<void> {
  const existing = await db.select({ id: baby.id }).from(baby).limit(1);
  if (existing.length > 0) return;
  const demo = buildDemoHistory(now);
  await db.insert(food).values(demo.foods);
  await db.insert(baby).values(demo.babyRow);
  await db.insert(trial).values(demo.trials);
  await db.insert(reaction).values(demo.reactions);
  await db.insert(checkin).values(demo.checkins);
}
