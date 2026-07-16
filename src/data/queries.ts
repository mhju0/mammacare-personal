import { useMemo } from 'react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '../db/client';
import { baby, food, reaction, trial, type Baby, type Food, type Reaction, type Trial } from '../db/schema';
import { deriveStatus, latestTrial, type FoodStatus } from '../domain/status';

export function useBaby(): Baby | undefined {
  const { data } = useLiveQuery(db.select().from(baby));
  return data?.[0];
}

// updatedAt stays undefined until the live query resolves for the first time —
// lets callers avoid a setup-card flash before the DB has actually reported "no baby".
export function useBabyLoaded(): boolean {
  const { updatedAt } = useLiveQuery(db.select().from(baby));
  return updatedAt !== undefined;
}

export type FoodWithStatus = { food: Food; trials: Trial[]; status: FoodStatus; latest: Trial | undefined };

export function useFoodsWithStatus(): FoodWithStatus[] {
  const { data: foods } = useLiveQuery(db.select().from(food));
  const { data: trials } = useLiveQuery(db.select().from(trial));
  return useMemo(() => {
    const byFood = new Map<string, Trial[]>();
    for (const t of trials ?? []) {
      const list = byFood.get(t.foodId) ?? [];
      list.push(t);
      byFood.set(t.foodId, list);
    }
    return (foods ?? []).map((f) => {
      const ts = byFood.get(f.id) ?? [];
      return { food: f, trials: ts, status: deriveStatus(ts), latest: latestTrial(ts) };
    });
  }, [foods, trials]);
}

export function useReactions(): Reaction[] {
  const { data } = useLiveQuery(db.select().from(reaction));
  return data ?? [];
}
