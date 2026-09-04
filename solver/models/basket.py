"""CP-SAT basket optimization (mode: optimize_basket).

Pure function of the SolveRequest document. Money stays integer cents,
quantities integer base units. Division is always modeled as exact floor via
two linear inequalities — CP-SAT has no integer division operator.
WEIGHT purchases arrive from the assembler as packs of 100 g.
"""

from promotions import effective_cost_table


def solve_basket(problem: dict) -> dict:
    from ortools.sat.python import cp_model

    requirements = problem["requirements"]
    candidates = problem["candidates"]
    stores = {s["id"]: s for s in problem["stores"]}
    options = problem["options"]
    locked = problem.get("lockedItems", [])
    rates = options["residualRates"]

    model = cp_model.CpModel()

    # ── Variables: counts, effective costs, store visits ──────────────────
    x, cost, tables = {}, {}, {}
    store_visit = {s_id: model.NewBoolVar(f"y_{s_id}") for s_id in stores}

    for c in candidates:
        table = effective_cost_table(c, options["staleMarginPct"])
        tables[c["id"]] = table
        x[c["id"]] = model.NewIntVar(0, c["maxCount"], f"x_{c['id']}")
        cost[c["id"]] = model.NewIntVar(0, max(table), f"c_{c['id']}")
        model.AddElement(x[c["id"]], table, cost[c["id"]])
        lock = next((l for l in locked if l["productId"] == c["productId"] and l["storeId"] == c["storeId"]), None)
        if lock:
            model.Add(x[c["id"]] == lock["count"])

    for c in candidates:
        model.Add(x[c["id"]] <= c["maxCount"] * store_visit[c["storeId"]])
    model.Add(sum(store_visit.values()) <= options["maxStores"])

    # ── Coverage (hard): every requirement must be met ───────────────────
    for req in requirements:
        concept = req["conceptId"]
        deliveries = [
            c["packContentBase"] * x[c["id"]]
            for c in candidates
            if c["conceptId"] == concept and c["packContentBase"] > 0
        ]
        model.Add(sum(deliveries) >= req["requiredBase"]) if deliveries else model.Add(req["requiredBase"] <= 0)

    # ── Surplus per concept (floor semantics via two inequalities) ───────
    surplus = {}
    for req in requirements:
        concept = req["conceptId"]
        deliveries = [
            c["packContentBase"] * x[c["id"]]
            for c in candidates
            if c["conceptId"] == concept and c["packContentBase"] > 0
        ]
        delivered = sum(deliveries) if deliveries else 0
        s_var = model.NewIntVar(0, 10_000_000, f"surplus_{concept}")
        # Exact: max(delivered - required, 0). No phantom surplus can be farmed.
        model.AddMaxEquality(s_var, [delivered - req["requiredBase"], 0])
        surplus[concept] = s_var

    # Cheapest price per 100 g per concept (deterministic precompute).
    coeff_per_100g = {}
    for req in requirements:
        concept = req["conceptId"]
        prices = []
        for c in candidates:
            if c["conceptId"] != concept:
                continue
            if c["purchasingMode"] == "WEIGHT" and c.get("pricePerKgCents"):
                prices.append(c["pricePerKgCents"] // 10)
            elif c["packContentBase"] > 0 and c["unitPriceCents"] > 0:
                prices.append(round(c["unitPriceCents"] * 100 / c["packContentBase"]))
        coeff_per_100g[concept] = min(prices) if prices else 0

    # Cheapest marginal price per 100 g per concept (across promo tables): the
    # residual credit must stay below it, or overbuying becomes an arbitrage.
    min_marginal_per_100g = {}
    for req in requirements:
        concept = req["conceptId"]
        marginals = []
        for c in candidates:
            if c["conceptId"] != concept or c["packContentBase"] <= 0:
                continue
            table = effective_cost_table(c, options["staleMarginPct"])
            for k in range(1, len(table)):
                delta = table[k] - table[k - 1]
                per_100 = delta * 100 // c["packContentBase"]
                marginals.append(per_100)
        min_marginal_per_100g[concept] = min(marginals) if marginals else 0

    # Residual credit per concept: surplus/100 (100g units) × coeff × rate.
    credits = []
    fresh_surplus_terms = []
    for req in requirements:
        concept = req["conceptId"]
        coeff = coeff_per_100g[concept]
        if coeff > 0:
            classes = [c["shelfLifeClass"] for c in candidates if c["conceptId"] == concept]
            if "fresh" in classes:
                rate = rates.get("fresh", 0.2)
            elif "semi" in classes:
                rate = rates.get("semi", 0.5)
            else:
                rate = rates.get("storable", 0.8)
            credit = model.NewIntVar(0, 10_000_000, f"credit_{concept}")
            naive = round(coeff * rate)
            marginal = min_marginal_per_100g.get(concept, 0)
            # 10% haircut under the cheapest marginal price kills the arbitrage.
            credit_cents_100 = naive if marginal <= 0 else min(naive, int(marginal * 0.9))
            model.Add(credit * 100 <= surplus[concept] * credit_cents_100)
            model.Add(credit * 100 >= surplus[concept] * credit_cents_100 - 99)
            credits.append(credit)
        for c in candidates:
            if c["conceptId"] == concept and c["shelfLifeClass"] == "fresh" and c["packContentBase"] > 0:
                fresh_surplus_terms.append(c["packContentBase"] * x[c["id"]])

    # ── Budget (soft): overrun minimized with a heavy penalty ─────────────
    overrun = model.NewIntVar(0, 10_000_000, "overrun")
    total_paid = sum(cost[c["id"]] for c in candidates)
    if options.get("budgetCents"):
        model.Add(overrun >= total_paid - options["budgetCents"])
        model.Add(overrun >= 0)
    else:
        model.Add(overrun == 0)
    budget_penalty = model.NewIntVar(0, 10_000_000, "budget_penalty")
    per_euro = options["budgetPenaltyCentsPerEuro"]
    model.Add(budget_penalty * 100 <= overrun * per_euro)
    model.Add(budget_penalty * 100 >= overrun * per_euro - 99)

    # Waste penalty: cents per kg of fresh-class purchase weight.
    waste = model.NewIntVar(0, 10_000_000, "waste_penalty")
    waste_per_kg = options["wastePenaltyCentsPerKg"]
    if fresh_surplus_terms:
        model.Add(waste * 1000 <= sum(fresh_surplus_terms) * waste_per_kg)
        model.Add(waste * 1000 >= sum(fresh_surplus_terms) * waste_per_kg - 999)

    # ── Travel penalties (first store free) ──────────────────────────────
    objective = options["objective"]
    travel_terms = []
    ranked = sorted(stores.items(), key=lambda kv: kv[1]["distanceM"])
    for index, (s_id, s) in enumerate(ranked):
        y = store_visit[s_id]
        if index == 0:
            if s.get("favorite"):
                travel_terms.append(-options["favoriteStoreBonusCents"] * y)
            continue
        penalty = options["travelPenaltyCentsPerStore"]
        if objective == "MINIMUM_TRAVEL":
            penalty += options["travelPenaltyCentsPerKm"] * s["distanceM"] // 1000
        if objective == "FEWEST_STORES":
            penalty *= 10
        if s.get("favorite"):
            penalty = max(0, penalty - options["favoriteStoreBonusCents"])
        travel_terms.append(penalty * y)

    # ── Objective per preset ─────────────────────────────────────────────
    cost_terms = [cost[c["id"]] for c in candidates]
    # 1-cent tie-break: an open store with no purchase reports as unvisited.
    store_tiebreak = sum(store_visit.values())
    promo_terms = []
    for c in candidates:
        if c["promotions"] and c["unitPriceCents"] > 0:
            promo_terms.append(-round(c["unitPriceCents"] * 0.1) * x[c["id"]])

    if objective == "CHEAPEST":
        model.Minimize(sum(cost_terms) - sum(credits) + store_tiebreak)
    elif objective == "FEWEST_STORES":
        model.Minimize(sum(cost_terms) - sum(credits) + sum(travel_terms) + store_tiebreak)
    elif objective == "MINIMUM_TRAVEL":
        model.Minimize(sum(cost_terms) - sum(credits) + sum(travel_terms) + store_tiebreak)
    elif objective == "PROMOTION_FOCUSED":
        model.Minimize(sum(cost_terms) - sum(credits) + sum(promo_terms) + store_tiebreak)
    elif objective == "LOW_WASTE":
        model.Minimize(sum(cost_terms) - sum(credits) + waste + store_tiebreak)
    elif objective == "MAX_PROTEIN_PER_EURO":
        protein_terms = [
            c["proteinPer100"] * x[c["id"]] for c in candidates if c.get("proteinPer100")
        ]
        model.Minimize((sum(cost_terms) - sum(credits) - 4 * sum(protein_terms) if protein_terms else sum(cost_terms) - sum(credits)) + store_tiebreak)
    else:  # BALANCED default
        model.Minimize(
            sum(cost_terms) - sum(credits) + sum(travel_terms) + budget_penalty + waste + store_tiebreak
        )

    # ── Solve ────────────────────────────────────────────────────────────
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        if status == cp_model.INFEASIBLE:
            return infeasible(requirements)
        return {
            "status": "ERROR",
            "items": [],
            "visitedStores": [],
            "totalPaidCents": 0,
            "totalEffectiveCents": 0,
            "budgetOverrunCents": 0,
            "surplusByConcept": {},
            "reasons": [],
            "infeasibleRequirements": [],
            "message": "solver timeout without a feasible solution",
        }
    return extract_solution(solver, problem, x, tables, candidates, store_visit, overrun, surplus, status)


def extract_solution(solver, problem, x, tables, candidates, store_visit, overrun, surplus, status):
    from ortools.sat.python import cp_model

    items = []
    for c in candidates:
        count = solver.Value(x[c["id"]])
        if count <= 0:
            continue
        paid = tables[c["id"]][count]
        item = {
            "candidateId": c["id"],
            "productId": c["productId"],
            "storeId": c["storeId"],
            "conceptId": c["conceptId"],
            "count": count,
            "contentBase": c["packContentBase"] * count,
            "paidCents": paid,
            "effectiveCents": paid,
        }
        if c["promotions"]:
            item["appliedPromotion"] = c["promotions"][0]
            item["reason"] = "PROMO_ACTIVATED"
        elif c.get("stale"):
            item["reason"] = "STALE_PRICE_MARGIN"
        items.append(item)

    visited = [s_id for s_id, y in store_visit.items() if solver.Value(y)]
    total_paid = sum(i["paidCents"] for i in items)
    overrun_cents = solver.Value(overrun)

    reasons = []
    if len(visited) <= 1:
        reasons.append({"code": "SINGLE_STORE_PLAN"})
    else:
        reasons.append({"code": "MULTI_STORE_PLAN", "params": {"stores": len(visited)}})
    if overrun_cents > 0:
        reasons.append({"code": "BUDGET_OVERRUN", "params": {"overrunCents": overrun_cents}})
    for concept, s_var in surplus.items():
        value = solver.Value(s_var)
        if value > 0:
            reasons.append({"code": "SURPLUS_CREDITED", "params": {"conceptId": concept, "grams": value}})
    for item in items:
        if item.get("reason") == "PROMO_ACTIVATED":
            reasons.append({"code": "PROMO_ACTIVATED", "params": {"productId": item["productId"]}})

    return {
        "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
        "items": items,
        "visitedStores": visited,
        "totalPaidCents": total_paid,
        "totalEffectiveCents": total_paid,
        "budgetOverrunCents": overrun_cents,
        "surplusByConcept": {k: solver.Value(v) for k, v in surplus.items()},
        "reasons": reasons,
        "infeasibleRequirements": [],
    }


def infeasible(requirements):
    # Without assumption cores we conservatively name all requirements; the
    # Node layer adds candidate-availability context to the message.
    return {
        "status": "INFEASIBLE",
        "items": [],
        "visitedStores": [],
        "totalPaidCents": 0,
        "totalEffectiveCents": 0,
        "budgetOverrunCents": 0,
        "surplusByConcept": {},
        "reasons": [],
        "infeasibleRequirements": [r["conceptId"] for r in requirements],
        "message": "no candidate combination covers every requirement within the store limit",
    }
