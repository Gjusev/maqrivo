"""CP-SAT meal planning (mode: plan_meals).

Assigns recipes to week slots under daily nutrition targets (soft, penalized),
meal-type compatibility, repetition gaps, cooking-time caps, and locks.
"""

def solve_meal_plan(problem: dict) -> dict:
    from ortools.sat.python import cp_model

    slots = problem["slots"]
    recipes = [r for r in problem["recipes"]]
    options = problem["options"]

    model = cp_model.CpModel()

    assign = {}
    for slot in slots:
        for r in recipes:
            var = model.NewBoolVar(f"a_{slot['id']}_{r['id']}")
            assign[(slot["id"], r["id"])] = var
            if slot["mealType"] not in r["mealTypes"]:
                model.Add(var == 0)

    # One recipe (or none) per slot; locked slots are fixed.
    for slot in slots:
        slot_vars = [assign[(slot["id"], r["id"])] for r in recipes]
        locked_id = slot.get("lockedRecipeId")
        if locked_id:
            for r in recipes:
                model.Add(assign[(slot["id"], r["id"])] == (1 if r["id"] == locked_id else 0))
        else:
            model.Add(sum(slot_vars) <= 1)

    # Cooking time cap per slot.
    for slot in slots:
        for r in recipes:
            if r["totalMinutes"] > options["maxCookingMinutes"]:
                model.Add(assign[(slot["id"], r["id"])] == 0)

    # Repetition gap: the same recipe may not repeat within N days.
    gap = options.get("repetitionGapDays", 0)
    if gap > 0:
        by_date = {}
        for slot in slots:
            by_date.setdefault(slot["date"], []).append(slot["id"])
        dates = sorted(by_date)
        for r in recipes:
            for i, d in enumerate(dates):
                window = [s for wd in dates[max(0, i - gap + 1) : i + 1] for s in by_date[wd]]
                if len(window) > 1:
                    model.Add(sum(assign[(s, r["id"])] for s in window) <= 1)

    # Daily nutrition: soft deviations, penalized.
    days = sorted({slot["date"] for slot in slots})
    kcal_dev_terms, protein_short_terms = [], []
    for day in days:
        day_slots = [s for s in slots if s["date"] == day]
        kcal_day = model.NewIntVar(0, 1_000_000, f"kcal_{day}")
        protein_day = model.NewIntVar(0, 1_000_000, f"prot_{day}")
        model.Add(kcal_day == sum(r["kcalX10"] * assign[(s["id"], r["id"])] for s in day_slots for r in recipes))
        model.Add(protein_day == sum(r["proteinGX10"] * assign[(s["id"], r["id"])] for s in day_slots for r in recipes))

        kcal_over = model.NewIntVar(0, 1_000_000, f"kcal_over_{day}")
        kcal_under = model.NewIntVar(0, 1_000_000, f"kcal_under_{day}")
        model.Add(kcal_over >= kcal_day - options["dailyKcalX10"])
        model.Add(kcal_under >= options["dailyKcalX10"] - kcal_day)
        kcal_dev_terms.extend([kcal_over, kcal_under])

        protein_short = model.NewIntVar(0, 1_000_000, f"prot_short_{day}")
        model.Add(protein_short >= options["dailyProteinGX10"] - protein_day)
        protein_short_terms.append(protein_short)

    favorite_terms = [
        options["favoriteBonus"] * assign[(slot["id"], r["id"])]
        for slot in slots
        for r in recipes
        if r.get("favorite")
    ]

    empty_slot_penalty = 40  # discourage empty slots when recipes are available
    empty_terms = []
    for slot in slots:
        if not slot.get("lockedRecipeId"):
            filled = model.NewIntVar(0, 1, f"filled_{slot['id']}")
            model.Add(filled == sum(assign[(slot["id"], r["id"])] for r in recipes))
            empty_terms.append(filled)

    model.Minimize(
        options["kcalDeviationWeight"] * sum(kcal_dev_terms)
        + options["proteinShortfallWeight"] * sum(protein_short_terms)
        + options["repetitionWeight"] * 0  # repetition enforced as constraint; weight reserved
        - sum(favorite_terms)
        - empty_slot_penalty * sum(empty_terms)
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"status": "INFEASIBLE", "assignments": [], "totals": {}}

    assignments = []
    kcal_per_day, protein_per_day = [], []
    for day in days:
        day_slots = [s for s in slots if s["date"] == day]
        kcal_sum = sum(
            r["kcalX10"] * solver.Value(assign[(s["id"], r["id"])]) for s in day_slots for r in recipes
        )
        protein_sum = sum(
            r["proteinGX10"] * solver.Value(assign[(s["id"], r["id"])]) for s in day_slots for r in recipes
        )
        kcal_per_day.append(kcal_sum)
        protein_per_day.append(protein_sum)
    for slot in slots:
        chosen = next((r["id"] for r in recipes if solver.Value(assign[(slot["id"], r["id"])])), None)
        assignments.append({
            "slotId": slot["id"],
            "recipeId": chosen,
            "locked": bool(slot.get("lockedRecipeId")),
        })

    return {
        "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
        "assignments": assignments,
        "totals": {"kcalX10PerDay": kcal_per_day, "proteinGX10PerDay": protein_per_day},
    }
