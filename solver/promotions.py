"""Promotion effective-cost tables per purchase count (cents).

Mirrors packages/core/src/promotions/evaluate.ts semantics exactly:
mechanisms stay structured; the cost of k units is evaluated piecewise.
A stale margin (percent) inflates every non-promoted price.
"""

def effective_cost_table(candidate: dict, stale_margin_pct: int = 0) -> list:
    """Cost in cents for k = 0..maxCount units of this candidate."""
    max_count = candidate["maxCount"]
    unit = candidate["unitPriceCents"]
    margin = 1 + stale_margin_pct / 100 if candidate.get("stale") else 1.0

    promo = candidate["promotions"][0] if candidate["promotions"] else None
    table = [0]
    for k in range(1, max_count + 1):
        base = round(unit * margin)
        cost = _cost_for_count(promo, k, base)
        table.append(cost)
    return table


def _cost_for_count(promo, k: int, unit_price: int) -> int:
    if promo is None:
        return k * unit_price
    kind = promo["mechanism"]
    if kind in ("PROMO_PRICE", "LOYALTY_PRICE"):
        price = promo.get("promoPriceCents") or unit_price
        return k * price
    if kind in ("PERCENTAGE_OFF", "CATEGORY_PROMO"):
        pct = promo.get("discountPct") or 0
        return round(k * unit_price * (1 - pct / 100))
    if kind == "MULTIBUY":
        qty = promo.get("bundleQty") or 2
        bundle_price = promo.get("bundlePriceCents") or qty * unit_price
        bundles, rest = divmod(k, qty)
        return bundles * bundle_price + rest * unit_price
    if kind == "BUY_X_GET_Y":
        buy = promo.get("buyQty") or 2
        free = promo.get("freeQty") or 1
        group = buy + free
        groups, rest = divmod(k, group)
        return (groups * buy + rest) * unit_price
    if kind == "SECOND_UNIT_DISCOUNT":
        pct = promo.get("discountPct") or 50
        discounted = k // 2
        full = k - discounted
        return full * unit_price + round(discounted * unit_price * (1 - pct / 100))
    return k * unit_price
