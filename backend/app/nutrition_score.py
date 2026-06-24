"""
Infant nutrition balance scorer + recommender (MVP, 6-axis coarse model).

Design summary
--------------
Logging captures *presence only* (no portions) and is *sparse* (not every day
has data). So we do NOT measure "how much" of each nutrient was eaten — that
would silently treat un-logged days as zero, which is false. Instead we measure
the *balance* of what WAS logged: the share of the diet that leaned toward each
of the 6 axes, compared against an age-appropriate target balance.

Because the score is a ratio (each axis as a % of the total), it is immune to
how many items were logged (3 or 30), and meal-loggers vs snack-loggers both
produce valid profiles. The same target vector powers BOTH the personalized gap
analysis (when there's data) and the generic fallback advice (when there isn't).

Drop-in for FastAPI; pure functions, no DB dependency. A JS/TS port is a 1:1
translation if you'd rather run it client-side next to the chart.
"""

from __future__ import annotations
from typing import Iterable, Literal

# ---------------------------------------------------------------------------
# Tunables (all in one place so non-engineers can adjust them)
# ---------------------------------------------------------------------------

AXES = ["carb", "protein", "fat", "iron", "vitamin", "mineral"]

# Non-linear density: a "high" food counts far more than several "low" ones,
# rewarding genuinely nutrient-dense ingredients over weak ones.
DENSITY = {"none": 0.0, "low": 1.0, "medium": 2.5, "high": 4.5}

# Target balance per age band (shares sum to 1.0). Derived from KDRI 2025
# priorities: iron is weighted heavily at 6-11mo because the RNI jumps 20x
# (0.3 -> 6 mg/d) as fetal iron stores deplete; carbs are kept low on purpose
# because the typical Korean weaning base (쌀/감자/고구마/바나나) over-delivers
# them by default, so a modest carb target lets the real gaps surface.
TARGETS = {
    "6-11mo": {"carb": 0.15, "protein": 0.20, "fat": 0.15, "iron": 0.22, "vitamin": 0.15, "mineral": 0.13},
    "1-2y":   {"carb": 0.18, "protein": 0.20, "fat": 0.15, "iron": 0.17, "vitamin": 0.16, "mineral": 0.14},
}

# Confidence gate: below this, show generic age-band advice instead of
# personalized gaps. Confidence blends how many ingredients AND how many
# distinct days were logged.
CONFIDENCE_THRESHOLD = 0.40
TARGET_INGREDIENTS = 12   # ~2/day for a week = "enough" for full confidence
TARGET_DAYS = 5           # logging on 5+ distinct days = "enough" spread


Rating = dict   # e.g. {"nutrient_carb": "medium", "nutrient_iron": "high", ...}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def age_band(age_months: int) -> Literal["0-5mo", "6-11mo", "1-2y"]:
    if age_months < 6:
        return "0-5mo"
    if age_months < 12:
        return "6-11mo"
    return "1-2y"  # covers 12-23 months, incl. 18mo


def flatten_logs(entries: Iterable[list[Rating]]) -> list[Rating]:
    """Both logging units -> one flat list of ingredient ratings.

    `entries` is a list of log events. A single-ingredient log is a list of
    one rating; a meal/recipe log is a list of its ingredient ratings.
    Frequency is preserved on purpose (repeats are signal).
    """
    return [rating for entry in entries for rating in entry]


def _density_vector(rating: Rating) -> dict[str, float]:
    return {ax: DENSITY[rating.get(f"nutrient_{ax}", "none")] for ax in AXES}


# ---------------------------------------------------------------------------
# Core scoring
# ---------------------------------------------------------------------------

def score_diet(ingredient_ratings: list[Rating], distinct_days: int, age_months: int) -> dict:
    """Returns composition, target, gaps, confidence, mode, and flags."""
    band = age_band(age_months)

    # 0-5 months: milk-only, solids scoring not meaningful.
    if band == "0-5mo":
        return {
            "band": band,
            "mode": "not_applicable",
            "message": "0-5개월은 모유/분유 위주 시기로, 이유식 균형 점수는 6개월부터 의미가 있어요.",
        }

    target = TARGETS[band]
    n = len(ingredient_ratings)

    # Confidence: blend ingredient count and day spread.
    confidence = round(min(1.0, 0.5 * (n / TARGET_INGREDIENTS) + 0.5 * (distinct_days / TARGET_DAYS)), 2)

    # --- Fallback path: too little data -> generic age-band advice ---
    if n == 0 or confidence < CONFIDENCE_THRESHOLD:
        return {
            "band": band,
            "mode": "generic",
            "confidence": confidence,
            "target": target,
            # generic "gaps" = the target itself, ranked, so the recommender
            # still has something to act on with zero personal data.
            "priority_axes": sorted(target, key=target.get, reverse=True)[:3],
        }

    # --- Personalized path: enough data ---
    totals = {ax: 0.0 for ax in AXES}
    for r in ingredient_ratings:
        for ax, v in _density_vector(r).items():
            totals[ax] += v
    grand = sum(totals.values()) or 1.0
    composition = {ax: round(totals[ax] / grand, 4) for ax in AXES}

    gaps = {ax: round(target[ax] - composition[ax], 4) for ax in AXES}
    # Largest positive gaps = most under-represented = what baby is "lacking".
    lacking = [ax for ax, g in sorted(gaps.items(), key=lambda kv: kv[1], reverse=True) if g > 0.02]

    iron_high = sum(1 for r in ingredient_ratings if r.get("nutrient_iron") == "high")
    iron_med  = sum(1 for r in ingredient_ratings if r.get("nutrient_iron") == "medium")

    return {
        "band": band,
        "mode": "personalized",
        "confidence": confidence,
        "n_ingredients": n,
        "distinct_days": distinct_days,
        "composition": composition,   # feed straight into the radar chart
        "target": target,             # the dashed reference polygon
        "gaps": gaps,
        "lacking": lacking,           # ordered; lacking[0] is the headline gap
        "iron_sources": {"high": iron_high, "medium": iron_med},
    }


# ---------------------------------------------------------------------------
# Recommender: pick ingredients that fill the top gap, edible at this age
# ---------------------------------------------------------------------------

def recommend(result: dict, all_ingredients: list[dict], age_months: int, k: int = 5) -> list[dict]:
    """Suggest ingredients rich in the most-lacking axis and age-appropriate."""
    if result["mode"] == "not_applicable":
        return []

    if result["mode"] == "generic":
        target_axis = result["priority_axes"][0]
    else:
        target_axis = (
            result["lacking"][0] if result["lacking"]
            else sorted(result["gaps"], key=result["gaps"].get, reverse=True)[0]
        )

    edible = [i for i in all_ingredients if i.get("recommended_month", 99) <= age_months]
    edible.sort(key=lambda i: DENSITY[i.get(f"nutrient_{target_axis}", "none")], reverse=True)
    picks = [i for i in edible if DENSITY[i.get(f"nutrient_{target_axis}", "none")] > 0][:k]
    return [{"id": i["id"], "name": i["name"], "axis": target_axis,
             "level": i.get(f"nutrient_{target_axis}")} for i in picks]
