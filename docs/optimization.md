# Maqrivo Optimization Design (v1 — pending plan approval)

Deterministic constraint optimization via OR-Tools CP-SAT (v9.15, Python), executed per ADR-0001. Two modes behind one versioned JSON contract. All quantities are integer grams/millilitres/units; all money is integer cents. The solver is a pure function of its input — no DB access — so every model is fixture-testable from Python and from Node.

## Mode A: `optimize_basket`

### Input assembly (Node side, `server/optimization`)

1. **Requirements**: for each FoodConcept, weekly need = Σ recipe ingredient quantities in the active meal plan (scaled servings), minus consumable pantry inventory (respecting expiry: expired stock contributes zero).
2. **Candidate set**: for each requirement, all products linked to the concept at **enabled** stores, each carrying its freshest price observation under policy; candidates failing dietary rules (halal state, vegetarian/vegan, allergens) are **excluded before the solve** — hard filtering at assembly, never post-hoc. Missing-nutrition products stay eligible; missing-price products are dropped or penalized per `stale_price_policy` (default: `penalize` — 15 % uncertainty margin applied and flagged; alternative: `exclude`).
3. **Promotion effective-cost tables**: each applicable promotion is pre-evaluated per candidate into `effectiveCost(k)` for k = 0…k_max packs (k_max small, ≤ 6): PROMO_PRICE (flat), PERCENTAGE (k·price·(1−pct)), MULTIBUY / BUY_X_GET_Y (piecewise — the "2 for 1 is not −33 % on odd quantities" rule falls out of the table), SECOND_UNIT, LOYALTY_PRICE (only when the user holds that retailer's loyalty card — `loyalty_cards` list in preferences), COUPON/CASHBACK (credit at basket level). Tables enter the model via `AddElement`, keeping mechanism semantics exact.

### Model

- `x[c] ∈ ℤ≥0` — purchase count (packs / grams / units per purchasing mode), bounds from requirement/k_max.
- `y[s] ∈ {0,1}` — store visited. `x[c] ≤ k_max · y[store(c)]`; `Σ y[s] ≤ max_stores_in_plan`.
- **Coverage (hard)**: Σ delivered quantity of concept-matching candidates ≥ required grams per requirement.
- **Budget (soft)**: overrun `over = max(0, total − weekly_budget)` heavily penalized in the objective, never hidden — the response always carries `total`, `budget`, `overrun` (product decision: soft penalty with visible overrun).
- **Effective cost**: `cost(c) = effectiveCostTable[x[c]] − residualCredit(c, x[c])` where surplus beyond need is credited at shelf-life rates (storable 80 %, semi 50 %, fresh 20 % — configurable; LOW_WASTE stiffens).

### Objective

`minimize Σ cost(c) + travelPenalty·Σ_{s≠first} y[s] + staleMargin·staleCostShare + wastePenalty·perishableSurplus`

Travel penalty defaults by sensitivity: low €1.00, medium €2.50, high €5.00 per additional store. Objective presets are weight vectors: CHEAPEST (cost only), BALANCED (defaults above), FEWEST_STORES (10× store penalty), MINIMUM_TRAVEL (per-km weighting), MAX_PROTEIN_PER_EURO (maximize protein grams − λ·cost on protein-bearing items), PROMOTION_FOCUSED (bonus equal to promo savings vs regular price), LOW_WASTE (stiffer residual + waste weights).

### Output

Chosen candidates with counts, per-store grouping, totals, applied promotion ids, and **reason codes with parameters** — deterministic strings the UI phrases in the user's language: `CHEAPER_THAN_NEXT {savings_cents, next_candidate}`, `PROMO_ACTIVATED {min_qty, effective_price}`, `PROTEIN_VALUE {g, cost_cents}`, `SINGLE_STORE_PLAN`, `PANTRY_COVERED {grams}`, `STALE_PRICE_MARGIN {pct}`, `TRAVEL_REJECTED {saving, penalty}` (emitted when the solver dropped a cheaper distant store: the alternative set is re-checked without the penalty).

Infeasibility (coverage impossible — e.g. no halal-compliant source of a concept at enabled stores) uses CP-SAT assumption cores (`sufficient_assumptions_for_infeasibility`) to name the exact blocking requirement; budget never causes infeasibility (soft by design).

### Partial re-solve

Locked shopping items and "replace this product" requests re-enter as fixed variables / excluded candidates; CP-SAT hints from the previous solution make re-solves incremental and fast.

## Mode B: `plan_meals`

Slots = week grid (Mon–Sun × active meal types from profile). `assign[d][m][r] ∈ {0,1}`, one recipe per slot (empty allowed).

- Recipe candidates filtered by meal-type tags, max cooking time, allergens, halal rules (same hard-filter-at-assembly principle), cuisine preferences as objective scores.
- Repetition: minimum distinct days between repeats of the same recipe; `max_distinct_recipes` cap honored.
- Nutrition: daily kcal/protein deviations from target are **penalized** (tolerance bands), not hard-constrained — small recipe libraries must still produce plans; hard floors available as strict mode.
- Budget coupling (estimate): concept-level cheapest-fresh-price linear cost of the week's ingredients enters the objective; the exact basket solve follows planning.
- Pantry push: expiring pantry items whose concepts get used before expiry earn a usage bonus; explicit user instructions ("use the chicken Thursday") pin those variables.
- Locks: locked slots are fixed domains — partial regeneration by construction.

Objective: nutrition deviation + estimated cost + repetition + cooking-time preference − pantry-expiry usage − favorite-recipe score.

## Deterministic metrics (never AI, computed in `packages/core`)

Protein per euro, cost per 10 g protein, calories per euro, cost per serving, price per 100 g / per kg — displayed only where price freshness and nutrition completeness permit (policy-checked), per the no-evidence-no-deal rule.
