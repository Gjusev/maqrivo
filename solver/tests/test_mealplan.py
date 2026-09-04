import sys
from pathlib import Path

SOLVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SOLVER))

from models.mealplan import solve_meal_plan  # noqa: E402


def slot(sid, date, meal_type, locked=None):
    return {"id": sid, "date": date, "mealType": meal_type, "lockedRecipeId": locked}


def recipe(rid, kcal_x10, protein_x10, meal_types=("lunch", "dinner"), minutes=30, favorite=False):
    return {
        "id": rid,
        "mealTypes": list(meal_types),
        "kcalX10": kcal_x10,
        "proteinGX10": protein_x10,
        "carbsGX10": 0,
        "fatGX10": 0,
        "totalMinutes": minutes,
        "favorite": favorite,
    }


def options(**kw):
    base = {
        "dailyKcalX10": 10000,
        "dailyProteinGX10": 1200,
        "kcalDeviationWeight": 1,
        "proteinShortfallWeight": 4,
        "repetitionWeight": 30,
        "favoriteBonus": 10,
        "maxCookingMinutes": 60,
        "repetitionGapDays": 2,
    }
    base.update(kw)
    return base


def week_slots():
    return [
        slot("d1-l", "2026-09-07", "lunch"),
        slot("d1-d", "2026-09-07", "dinner"),
        slot("d2-l", "2026-09-08", "lunch"),
        slot("d2-d", "2026-09-08", "dinner"),
    ]


class TestMealPlan:
    def test_assigns_high_protein_over_low(self):
        problem = {
            "slots": week_slots(),
            "recipes": [
                recipe("proteiny", 8000, 1600),
                recipe("light", 8000, 300),
            ],
            "options": options(repetitionGapDays=0),
        }
        sol = solve_meal_plan(problem)
        assert sol["status"] in ("OPTIMAL", "FEASIBLE")
        chosen = [a["recipeId"] for a in sol["assignments"]]
        assert chosen.count("proteiny") > chosen.count("light")

    def test_meal_type_compatibility(self):
        problem = {
            "slots": [slot("b1", "2026-09-07", "breakfast")],
            "recipes": [recipe("dinner-only", 8000, 1500, meal_types=("dinner",))],
            "options": options(),
        }
        sol = solve_meal_plan(problem)
        assert sol["assignments"][0]["recipeId"] is None

    def test_repetition_gap_respected(self):
        problem = {
            "slots": week_slots(),
            "recipes": [recipe("solo", 8000, 1200)],
            "options": options(repetitionGapDays=2),
        }
        sol = solve_meal_plan(problem)
        chosen = [a["recipeId"] for a in sol["assignments"]]
        assert chosen.count("solo") <= 1  # gap 2 days forbids any repeat this week

    def test_locked_slot_stays(self):
        problem = {
            "slots": [
                slot("d1-l", "2026-09-07", "lunch", locked="keepme"),
                slot("d1-d", "2026-09-07", "dinner"),
            ],
            "recipes": [recipe("keepme", 7000, 1000), recipe("other", 8000, 1400)],
            "options": options(repetitionGapDays=0),
        }
        sol = solve_meal_plan(problem)
        first = next(a for a in sol["assignments"] if a["slotId"] == "d1-l")
        assert first["recipeId"] == "keepme"
        assert first["locked"] is True

    def test_cooking_time_cap(self):
        problem = {
            "slots": [slot("d1-d", "2026-09-07", "dinner")],
            "recipes": [recipe("slow", 8000, 1500, minutes=90), recipe("fast", 7500, 1300, minutes=25)],
            "options": options(maxCookingMinutes=60),
        }
        sol = solve_meal_plan(problem)
        assert sol["assignments"][0]["recipeId"] == "fast"

    def test_daily_totals_reported(self):
        problem = {
            "slots": week_slots(),
            "recipes": [recipe("a", 5000, 600)],
            "options": options(repetitionGapDays=0),
        }
        sol = solve_meal_plan(problem)
        assert len(sol["totals"]["kcalX10PerDay"]) == 2
        # All slots filled with recipe a: 2 × 5000 per day.
        assert sol["totals"]["kcalX10PerDay"][0] == 10000
