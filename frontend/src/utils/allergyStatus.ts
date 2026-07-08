// Shared, pure derivation of per-(baby, ingredient) allergy status.
//
// Both the Dashboard traffic-light hero and the Allergy screen classify testing
// rows into safe / testing / reaction. The two screens partition on DIFFERENT
// axes — the Dashboard counts raw rows (safe/testing/reaction), while the Allergy
// screen buckets deduped ingredients and also excludes confirmed allergens — so
// the canonical record retains BOTH the raw testing status and the confirmed
// flag rather than collapsing into a single enum. Consumers wrap these in
// useMemo; nothing here touches React state or lifecycle.
//
// The chip label reuses the canonical `statusFromTestStatus` primitive. Note
// that primitive resolves `completed_safe` to "safe" even when `has_reaction` is
// set, whereas the count/bucket selectors below intentionally give a reaction the
// priority (`completed_reaction || has_reaction`) — this mirrors the two screens'
// existing inline logic exactly and must not be "unified" onto the chip rule.

import type {
  IngredientTestingResponse,
  ConfirmedAllergyResponse,
  TestStatus,
} from "../api/allergy";
import { statusFromTestStatus, type ChipStatus } from "../components/ui/status-chip";

export interface IngredientStatusRecord {
  /** The original testing row, retained losslessly for rendering. */
  testing: IngredientTestingResponse;
  ingredientId: number;
  /** Raw API status (null = not yet classified, treated as in-progress). */
  testStatus: TestStatus | null;
  hasReaction: boolean;
  /** True when this ingredient is on the baby's confirmed-allergy list. */
  isConfirmedAllergen: boolean;
  /** Display status via the shared chip primitive (safe/testing/reaction). */
  chipStatus: ChipStatus;
}

/**
 * Canonical per-row status records. One record per testing row (NO dedup — the
 * Dashboard counts and the Allergy "testing" bucket both render per-row), each
 * annotated with whether the ingredient is a confirmed allergen.
 */
export function deriveIngredientStatuses(
  testings: IngredientTestingResponse[],
  confirmedAllergies: ConfirmedAllergyResponse[] = [],
): IngredientStatusRecord[] {
  const confirmedIds = new Set(confirmedAllergies.map((c) => c.ingredient_id));
  return testings.map((t) => ({
    testing: t,
    ingredientId: t.ingredient_id,
    testStatus: t.test_status,
    hasReaction: t.has_reaction,
    isConfirmedAllergen: confirmedIds.has(t.ingredient_id),
    chipStatus: statusFromTestStatus((t.test_status ?? "testing") as TestStatus, t.has_reaction),
  }));
}

export interface DashboardCounts {
  safe: number;
  testing: number;
  reaction: number;
}

/**
 * Dashboard traffic-light counts. Tallies every row (no dedup, no confirmed
 * exclusion — the Dashboard never fetches confirmed allergies) with reaction
 * taking priority, exactly matching the screen's inline loop.
 */
export function toDashboardCounts(records: IngredientStatusRecord[]): DashboardCounts {
  let safe = 0;
  let testing = 0;
  let reaction = 0;
  for (const r of records) {
    if (r.testStatus === "completed_reaction" || r.hasReaction) reaction += 1;
    else if (r.testStatus === "completed_safe") safe += 1;
    else testing += 1;
  }
  return { safe, testing, reaction };
}

export interface AllergyBuckets {
  /** In-progress rows (per-row, no dedup), confirmed allergens excluded. */
  testing: IngredientTestingResponse[];
  /** Safe ingredients, deduped to latest row, sorted by Korean name. */
  safe: IngredientTestingResponse[];
  /** Reacted ingredients, deduped to latest row, sorted by Korean name. */
  reaction: IngredientTestingResponse[];
  /** Ingredient ids that have any reaction row (used by the consent gate). */
  reactionIngredientIds: Set<number>;
}

/** Keep the row with the latest `test_start_date` per ingredient. */
function dedupeByIngredientLatest(
  list: IngredientTestingResponse[],
): IngredientTestingResponse[] {
  const map = new Map<number, IngredientTestingResponse>();
  for (const item of list) {
    const existing = map.get(item.ingredient_id);
    if (!existing || item.test_start_date > existing.test_start_date) {
      map.set(item.ingredient_id, item);
    }
  }
  return Array.from(map.values());
}

/**
 * Allergy-screen buckets. `confirmedIngredientIds` is the FULL set of confirmed
 * ingredient ids (including ones with no testing row), because the screen
 * excludes confirmed allergens from the testing and reaction buckets — but NOT
 * from the safe bucket (asymmetry preserved from the original inline logic).
 */
export function toAllergyBuckets(
  records: IngredientStatusRecord[],
  confirmedIngredientIds: Set<number>,
): AllergyBuckets {
  const rows = records.map((r) => r.testing);

  const reactionIngredientIds = new Set(
    rows
      .filter((t) => t.test_status === "completed_reaction" || t.has_reaction)
      .map((t) => t.ingredient_id),
  );

  const testing = rows.filter(
    (t) => t.test_status === "testing" && !confirmedIngredientIds.has(t.ingredient_id),
  );

  const safe = dedupeByIngredientLatest(
    rows.filter(
      (t) => t.test_status === "completed_safe" && !reactionIngredientIds.has(t.ingredient_id),
    ),
  ).sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name, "ko"));

  const reaction = dedupeByIngredientLatest(
    rows.filter(
      (t) =>
        (t.test_status === "completed_reaction" || t.has_reaction) &&
        !confirmedIngredientIds.has(t.ingredient_id),
    ),
  ).sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name, "ko"));

  return { testing, safe, reaction, reactionIngredientIds };
}
