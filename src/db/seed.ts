import { db } from './client';
import { baby, checkin, food, reaction, trial } from './schema';
import { CATALOG } from './catalog';
import { buildDemoHistory } from './demoData';

export async function seedIfEmpty(): Promise<void> {
  const existing = await db.select({ id: food.id }).from(food).limit(1);
  if (existing.length > 0) return;
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
