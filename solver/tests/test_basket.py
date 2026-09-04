import json
import subprocess
import sys
from pathlib import Path

SOLVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SOLVER))

from models.basket import solve_basket  # noqa: E402
from promotions import effective_cost_table  # noqa: E402


def run_worker(request):
    result = subprocess.run(
        [sys.executable, str(SOLVER / "worker.py")],
        input=json.dumps(request),
        capture_output=True,
        text=True,
        timeout=60,
        cwd=str(SOLVER),
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def candidate(cid, store, concept, pack, price, **kw):
    return {
        "id": cid,
        "productId": f"p-{cid}",
        "storeId": store,
        "conceptId": concept,
        "purchasingMode": "PACKAGED",
        "packContentBase": pack,
        "unitPriceCents": price,
        "maxCount": kw.pop("maxCount", 6),
        "promotions": kw.pop("promotions", []),
        "shelfLifeClass": kw.pop("shelfLifeClass", "storable"),
        "stale": kw.pop("stale", False),
        "favorite": False,
        **kw,
    }


def default_options():
    return {
        "objective": "BALANCED",
        "maxStores": 3,
        "travelPenaltyCentsPerStore": 250,
        "travelPenaltyCentsPerKm": 0,
        "staleMarginPct": 15,
        "budgetCents": None,
        "budgetPenaltyCentsPerEuro": 150,
        "residualRates": {"storable": 0.8, "semi": 0.5, "fresh": 0.2},
        "wastePenaltyCentsPerKg": 50,
        "favoriteStoreBonusCents": 30,
    }


def base_problem(candidates, requirements, stores, **option_overrides):
    options = default_options()
    options.update(option_overrides)
    return {
        "requirements": requirements,
        "candidates": candidates,
        "stores": stores,
        "options": options,
        "lockedItems": [],
    }


class TestPromotionTables:
    def test_multibuy_two_for_five(self):
        c = candidate("a", "s1", "x", 500, 320, promotions=[{"mechanism": "MULTIBUY", "bundleQty": 2, "bundlePriceCents": 500}])
        table = effective_cost_table(c)
        assert table[0] == 0
        assert table[1] == 320
        assert table[2] == 500
        assert table[3] == 820

    def test_buy_x_get_y_not_flat_discount(self):
        c = candidate("a", "s1", "x", 500, 300, promotions=[{"mechanism": "BUY_X_GET_Y", "buyQty": 2, "freeQty": 1}])
        table = effective_cost_table(c)
        assert table[1] == 300
        assert table[2] == 600
        assert table[3] == 600
        assert table[6] == 1200

    def test_stale_margin_inflates(self):
        c = candidate("a", "s1", "x", 500, 200, stale=True)
        assert effective_cost_table(c, 15)[1] == 230


class TestBasketOptimization:
    def test_cheapest_candidate_wins_within_store(self):
        problem = base_problem(
            [candidate("cheap", "s1", "chicken", 600, 649, shelfLifeClass="fresh"),
             candidate("dear", "s1", "chicken", 600, 899, shelfLifeClass="fresh")],
            [{"conceptId": "chicken", "requiredBase": 600}],
            [{"id": "s1", "distanceM": 500, "favorite": False}],
        )
        sol = solve_basket(problem)
        assert sol["status"] == "OPTIMAL"
        item = next(i for i in sol["items"] if i["candidateId"] == "cheap")
        assert item["count"] == 1
        assert not any(i["candidateId"] == "dear" for i in sol["items"])
        assert sol["totalPaidCents"] == 649

    def test_two_packs_when_one_is_not_enough(self):
        problem = base_problem(
            [candidate("a", "s1", "chicken", 600, 649, shelfLifeClass="fresh")],
            [{"conceptId": "chicken", "requiredBase": 700}],
            [{"id": "s1", "distanceM": 500, "favorite": False}],
        )
        sol = solve_basket(problem)
        item = sol["items"][0]
        assert item["count"] == 2
        assert item["contentBase"] == 1200

    def test_travel_penalty_rejects_small_cheap_gain(self):
        # Second store is cheaper by €0.60 but the penalty is €5.00.
        problem = base_problem(
            [candidate("near", "s1", "chicken", 600, 649, shelfLifeClass="fresh"),
             candidate("far", "s2", "chicken", 600, 589, shelfLifeClass="fresh")],
            [{"conceptId": "chicken", "requiredBase": 600}],
            [
                {"id": "s1", "distanceM": 400, "favorite": False},
                {"id": "s2", "distanceM": 1500, "favorite": False},
            ],
            travelPenaltyCentsPerStore=500,
        )
        sol = solve_basket(problem)
        assert sol["visitedStores"] == ["s1"]
        reason = next(r for r in sol["reasons"] if r["code"] == "SINGLE_STORE_PLAN")
        assert reason

    def test_travel_penalty_allows_real_savings(self):
        # Second store saves €3.00: worth the €0.50 penalty.
        problem = base_problem(
            [candidate("near", "s1", "rice", 1000, 500),
             candidate("far", "s2", "rice", 1000, 200)],
            [{"conceptId": "rice", "requiredBase": 1000}],
            [
                {"id": "s1", "distanceM": 400, "favorite": False},
                {"id": "s2", "distanceM": 1500, "favorite": False},
            ],
            travelPenaltyCentsPerStore=50,
        )
        sol = solve_basket(problem)
        assert sol["visitedStores"] == ["s2"]

    def test_budget_overrun_is_reported_not_hidden(self):
        problem = base_problem(
            [candidate("a", "s1", "chicken", 600, 649, shelfLifeClass="fresh")],
            [{"conceptId": "chicken", "requiredBase": 600}],
            [{"id": "s1", "distanceM": 500, "favorite": False}],
            budgetCents=400,
        )
        sol = solve_basket(problem)
        assert sol["status"] in ("OPTIMAL", "FEASIBLE")
        assert sol["budgetOverrunCents"] == 249
        assert any(r["code"] == "BUDGET_OVERRUN" for r in sol["reasons"])

    def test_multibuy_activation_in_solver(self):
        # 2 packs at the bundle price beat 1 pack when 700g are needed.
        problem = base_problem(
            [candidate("a", "s1", "yog", 400, 200, promotions=[{"mechanism": "MULTIBUY", "bundleQty": 2, "bundlePriceCents": 300}])],
            [{"conceptId": "yog", "requiredBase": 700}],
            [{"id": "s1", "distanceM": 500, "favorite": False}],
        )
        sol = solve_basket(problem)
        item = sol["items"][0]
        assert item["count"] == 2
        assert item["paidCents"] == 300
        assert any(r["code"] == "PROMO_ACTIVATED" for r in sol["reasons"])

    def test_infeasible_when_no_coverage_possible(self):
        problem = base_problem(
            [candidate("a", "s1", "chicken", 600, 649, maxCount=1)],
            [{"conceptId": "chicken", "requiredBase": 2000}],
            [{"id": "s1", "distanceM": 500, "favorite": False}],
        )
        sol = solve_basket(problem)
        assert sol["status"] == "INFEASIBLE"
        assert "chicken" in sol["infeasibleRequirements"]

    def test_locked_item_is_respected(self):
        problem = base_problem(
            [candidate("cheap", "s1", "rice", 1000, 500),
             candidate("locked", "s2", "rice", 1000, 700)],
            [{"conceptId": "rice", "requiredBase": 2000}],
            [
                {"id": "s1", "distanceM": 400, "favorite": False},
                {"id": "s2", "distanceM": 900, "favorite": False},
            ],
        )
        problem["lockedItems"] = [{"productId": "p-locked", "storeId": "s2", "count": 1}]
        sol = solve_basket(problem)
        locked_item = next(i for i in sol["items"] if i["candidateId"] == "locked")
        assert locked_item["count"] == 1
        assert "s2" in sol["visitedStores"]

    def test_weight_packs_at_100g_granularity(self):
        # Butcher chicken: 100 g packs at €8.90/kg → 89 c per pack.
        problem = base_problem(
            [candidate("butcher", "s1", "chicken", 100, 89, purchasingMode="WEIGHT", pricePerKgCents=890, shelfLifeClass="fresh", maxCount=20)],
            [{"conceptId": "chicken", "requiredBase": 700}],
            [{"id": "s1", "distanceM": 500, "favorite": False}],
        )
        sol = solve_basket(problem)
        item = sol["items"][0]
        assert item["count"] == 7
        assert item["paidCents"] == 7 * 89  # 623 c = €6.23 for 700 g

    def test_worker_protocol_end_to_end(self):
        request = {
            "version": 1,
            "mode": "optimize_basket",
            "problem": base_problem(
                [candidate("a", "s1", "rice", 1000, 500)],
                [{"conceptId": "rice", "requiredBase": 1000}],
                [{"id": "s1", "distanceM": 500, "favorite": False}],
            ),
        }
        response = run_worker(request)
        assert response["mode"] == "optimize_basket"
        assert response["solution"]["status"] == "OPTIMAL"
        assert response["solution"]["totalPaidCents"] == 500
