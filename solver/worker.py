"""Maqrivo solver worker.

Reads one JSON SolveRequest from stdin, writes one JSON SolveResponse to
stdout. Pure function of its input: no database, no network, no globals.
Modes: optimize_basket, plan_meals.
"""

import json
import sys


def solve(request: dict) -> dict:
    mode = request.get("mode")
    if mode == "optimize_basket":
        from models.basket import solve_basket

        return {"version": request.get("version", 1), "mode": mode, "solution": solve_basket(request["problem"])}
    if mode == "plan_meals":
        from models.mealplan import solve_meal_plan

        return {
            "version": request.get("version", 1),
            "mode": mode,
            "solution": solve_meal_plan(request["problem"]),
        }
    return {"version": request.get("version", 1), "mode": mode, "solution": {"status": "ERROR", "message": f"unknown mode {mode}"}}


def main() -> int:
    raw = sys.stdin.read()
    try:
        request = json.loads(raw)
        response = solve(request)
    except Exception as err:  # noqa: BLE001 — the protocol must never crash silently
        response = {
            "version": 1,
            "mode": "unknown",
            "solution": {"status": "ERROR", "message": f"{type(err).__name__}: {err}"},
        }
    sys.stdout.write(json.dumps(response))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
