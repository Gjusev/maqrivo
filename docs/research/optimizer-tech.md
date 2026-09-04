# Optimizer Technology Research — Grocery Basket Optimization

**Date:** 2026-09-04
**Status:** Research findings for architecture decision
**Scope:** Deterministic solver choice and integration pattern for Maqrivo's weekly-basket optimizer (TypeScript/Next.js + PostgreSQL).

## Problem recap (decision inputs)

Given required ingredient quantities (meal plan), candidate products (~100) across ~10 nearby stores with pack sizes, per-pack vs per-kg pricing, promotions (multi-buy, loyalty prices, spend-thresholds), pantry inventory, a weekly budget, nutrition floors, store-count/travel penalties, and waste costs — choose integer purchase quantities per product/store. Constraints couple items globally (budget, nutrition, store fixed costs, cross-item promos). Hard requirements from the spec:

- **Explainable results** — "why is this item in my basket / why is my budget infeasible".
- **Partial re-optimization** when the user locks items.
- Target solve latency: a few seconds at most.

---

## Option 1 — Google OR-Tools CP-SAT

### Maturity
- Current release **v9.15** — PyPI package `ortools` **9.15.6755** published **2026-01-14**, with wheels for CPython 3.9–3.14 on Linux/macOS/**Windows** (x86-64 + ARM64). Actively developed by Google, Apache-2.0. ([PyPI](https://pypi.org/project/ortools/), [release notes](https://developers.google.com/optimization/support/release_notes))
- CP-SAT is the flagship solver: a parallel portfolio SAT/CP/LP-hybrid. The official docs position it as "generally faster than MPSolver" for integer problems. ([CP-SAT docs](https://developers.google.com/optimization/cp/cp_solver), [CP-SAT Primer](https://d-krupke.github.io/cpsat-primer/))
- **Node.js/WASM status: there is no official JavaScript.** The GitHub README lists wrappers only for **Python, C#, Java, C++** — no npm badge, no WASM mention. ([google/or-tools](https://github.com/google/or-tools))
- **The npm package `ortools` is gone**: the npm registry returns **404** for `ortools` (verified 2026-09-04). The once-published package (Google, ~2019, v6.x era) has been unpublished. Any "npm install ortools" advice found in old blog posts is dead. The only other npm artifact, `node_or_tools`, is a narrow VRP-only binding.
- Community WASM fork: [`or-tools-wasm`](https://github.com/Axelwickm/or-tools-wasm) (npm `or-tools-wasm` **0.9.1**, 2026-06-08, Apache-2.0). Exposes **CP-SAT**, Routing, MPSolver, and MathOpt to browser/Node/Deno/Bun with a Python-like TS API. It is a **single-maintainer fork** of or-tools (58 stars) driving the author's commercial product; pre-1.0, fork-lag risk on every upstream release. Viable, not boring-safe.

### Fit for the basket problem
- Model must be **integer-only**: "you must define your optimization problem using integers only" — prices must be expressed in minor units (e.g., øre/cents), per-kg in grams. That maps cleanly onto groceries. ([CP-SAT docs](https://developers.google.com/optimization/cp/cp_solver))
- Modeling ergonomics are the strongest argument: multi-buy triggers, loyalty gating, pantry offsets, waste terms, and "store opened" fixed charges are reified Booleans + linear constraints — no linearization gymnastics (big-M only where you want it).
- **Explainability affordances (official API, [pdoc reference](https://or-tools.github.io/docs/pdoc/ortools/sat/python/cp_model.html)):**
  - `CpModel.add_hint` / `clear_hints` + solver parameter `fix_variables_to_their_hinted_value` — **locked items become hints, optionally hard-fixed → exact partial re-optimization**.
  - `CpModel.add_assumption(s)` + `CpSolver.sufficient_assumptions_for_infeasibility()` — returns a **sufficient subset of assumptions explaining INFEASIBILITY** (UNSAT core). Direct answer to "why is my budget/nutrition floor impossible". (Caveat: community reports say core minimality is best-effort, not guaranteed minimal — [or-tools-discuss](https://groups.google.com/g/or-tools-discuss/c/qlVv2uSq1uo), [issue #5141](https://github.com/google/or-tools/issues/5141).)
  - `best_objective_bound` + status `FEASIBLE` under a `max_time_in_seconds` cap → honest "within X % of optimal" reporting.
  - Solution callbacks / `enumerate_all_solutions` for alternatives ("what if I drop store X").
- No duals/shadow prices (CP-SAT is not an LP; duals don't exist). See "explainability" note under HiGHS — same audit-layer answer applies.
- Vs MIP: for pure linear cost minimization with integer pack counts, a MIP solver is typically at least as fast. CP-SAT wins when the model is constraint-heavy (reified promo logic, logical implications, count constraints) — which Maqrivo's is. OR-Tools itself ships both; Google's assignment tutorial shows the same problem solved both ways ([CP-SAT](https://developers.google.com/optimization/assignment/assignment_cp) / [MIP](https://developers.google.com/optimization/assignment/assignment_mip)).

### Integration pattern
Python only → one of the patterns in "Integration patterns compared" (subprocess or sidecar). No in-process Node option (short of the community WASM fork).

### Risks
- Second runtime (Python) in the stack; Windows dev needs Python + `pip install ortools` (wheels exist, low friction).
- Integer-only modeling forces minor-unit arithmetic everywhere — a bug class to test for (rounding, overflow with large multipliers; CP-SAT uses int64, keep magnitudes < 10^9).
- `or-tools-wasm` as a no-Python escape hatch = single-maintainer fork risk.

---

## Option 2 — HiGHS (open-source MIP solver)

### Maturity
- HiGHS 1.15.x (2026): **1.13.1** (2026-02-11) → **1.14.0** (2026-04-06) → **1.15.0** (2026-06-28) → **1.15.1** (2026-07-02). Very active, MIT-licensed, maintained by the Edinburgh group (Julian Hall, Ivet Galabova et al.); embedded in **SciPy, Pyomo, JuMP, GAMS, AMPL, MATLAB**; industry users include MathWorks, EDF, Microsoft Research. ([highs.dev](https://highs.dev/), [releases](https://github.com/ERGO-Code/HiGHS/releases))
- Python: **`highspy` 1.15.1** (PyPI, 2026-07-02), thin pybind11 wrapper, Python ≥ 3.9. ([PyPI](https://pypi.org/project/highspy/)) Alternatively `scipy.optimize.milp` — officially "a wrapper of the HiGHS linear optimization software" — if you already ship SciPy. ([scipy docs](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.milp.html))
- **JS/WASM: first-class community package, unusually well kept.** [`highs-js`](https://github.com/lovasoa/highs-js) (npm package name **`highs`**) at **1.15.2** (2026-07-22) — its **major.minor tracks the embedded HiGHS version 1:1**, so `highs@1.15` *is* HiGHS 1.15. MIT. Compiles HiGHS to WebAssembly; runs **in Node and browsers**; TypeScript declarations; CPLEX-LP text or incremental model building; MIP supported (branch-and-cut), plus basis warm-starts, ranging, IIS. Single-threaded WASM. Native alternative `highs-addon` (0.10.3, 2025-08) lags on an older HiGHS 0.10 line.

### Fit for the basket problem
- Basket cost minimization with integer pack counts is a textbook MILP: `min Σ price·qty` s.t. coverage, budget, store-linkage (fixed-charge binaries), promo triggers. HiGHS solves this class extremely well; at ~1k variables this is trivially small (milliseconds to low hundreds of ms).
- Store travel penalties = classic fixed-charge structure; spend-threshold coupons are one binary + one inequality per store.
- **Explainability — duals/slacks:** HiGHS returns duals/reduced costs **for LP only; it does not return duals for MIPs** ([HiGHS duals for MIPs](https://discourse.julialang.org/t/highs-duals-for-mips/88817)). What you *do* get for MIP: primal solution, row activities → **slacks per constraint are directly computable** (budget slack, nutrition surplus), `mip_dual_bound`, gap, node counts, IIS for infeasible LPs. Standard trick for shadow prices: fix integers at their optimal values, re-solve the LP, read duals.
- Practical consequence: **"explainable" cannot rely on MIP duals for this problem either way** — explanations should come from an app-side audit layer (per-item price ranking vs alternatives, per-constraint slack, promo-line items) computed from the returned solution, identical for CP-SAT and HiGHS. The one solver-native explanation CP-SAT gives you that HiGHS doesn't is the UNSAT core for infeasible budgets.

### Integration pattern
- In-process in the Next.js server via **`highs` (WASM)** — no Python at all, one Docker image, works on Windows dev machines via plain `npm install`. WASM loads once (~async init), solves are synchronous afterwards; use a worker thread per concurrent solve (not reentrant).
- Or the same Python patterns as CP-SAT via `highspy`.

### Risks
- `highs-js` is still a community one-maintainer project — but it mechanically tracks upstream versions (strongest possible maintenance signal for a binding) and has an upstream that SciPy et al. depend on.
- WASM is single-threaded; long-running MIPs can block the event loop if solved on the main thread (mitigate: run in a `worker_threads` worker; our sizes make this near-moot).
- Modeling complex promo logic in pure MILP needs disciplined big-M / indicator-variable patterns; easier to make modeling mistakes than in CP-SAT.

---

## Option 3 — Pure-TS / other JS-native options

| Package | Version (last publish) | License | Notes |
|---|---|---|---|
| [`javascript-lp-solver`](https://www.npmjs.com/package/javascript-lp-solver) | 1.0.3 (2026-01) | Unlicense | Pure JS simplex + branch-and-bound. Fine for toys; slow, no robust presolve; risk of pathological times on MIP. |
| [`glpk.js`](https://www.npmjs.com/package/glpk.js) | 5.0.0 (2025-12) | **GPL-3.0** | GLPK compiled for Node/browser. Works, but GLPK is decades old in performance terms, and **GPL-3.0 is a real licensing constraint** for anything distributed. |
| `glpk-wasm` | 0.1.4 (2022-12) | GPL | Stale 4 years. Skip. |

Verdict: `highs-js` (Option 2) strictly dominates these for in-process use — newer solver, MIT license, version-locked to upstream. Pure-TS options are only interesting for the *decomposition fallback* below, where you write the algorithm yourself and need no LP solver at all.

---

## Integration patterns compared (Next.js)

| | (a) Python subprocess per solve | (b) Long-running Python worker (FastAPI/gRPC) | (c) WASM in-process in Node | (d) Pure-TS solver |
|---|---|---|---|---|
| **Deployment** | Python in the same Docker image (multi-stage: `node` + `python3` + pip layer); Next.js `output: 'standalone'` server, spawn via `child_process` ([Next.js output docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)) | Extra compose service; health check; internal port | Nothing extra — `npm install highs` | Nothing extra |
| **Windows dev** | Needs local Python; works, but path/venv friction | Same + running two dev processes; or `docker compose up` both | **Best: zero setup** | Best |
| **Latency @ ~100 products × 10 stores** | Process spawn + `import ortools` ≈ **300–800 ms overhead** + solve 50–500 ms → **~0.5–1.5 s end-to-end** | Import once; per solve **~50–500 ms** (HTTP overhead ~1–5 ms) | WASM init once; per solve **~10–300 ms**, no IPC | ~1–100 ms depending on algorithm |
| **Concurrency** | Spawn storms risk; needs a queue (Postgres jobs table works) | Worker pool / async endpoints; cleanest at scale | `worker_threads` pool; memory not GC-managed — use `dispose()`/`withModel()` | Trivial |
| **Maintenance (1 dev)** | Low: stateless script, JSON contract on stdin/stdout | Medium: second service, protocol, versioning, monitoring | Low-Medium: npm dep + worker-thread discipline | High: you own the algorithm & its correctness |
| **Failure mode** | Timeout kill, non-zero exit → clean 500 + retry | Connection refused → circuit breaker | Exception in-process; OOM kills the route | Logic bugs |

Key latency insight: **at this problem size the solve itself is negligible; process/runtime overhead dominates.** Subprocess-per-solve still lands well inside "a few seconds"; a warm worker or WASM gets you to interactive (<300 ms) latency, which matters for lock-item re-optimization UX.

---

## Problem formulation sanity check — do we even need a solver?

**Decomposition analysis.** Without the global constraints, the problem is easy: for each ingredient, the cheapest sourcing is a tiny per-integer problem over pack combos, and store choice adds only fixed travel costs. With ~10 stores you can enumerate all **2^10 − 1 = 1,023 store subsets**, solve per-ingredient cheapest-cover per subset (a few integer vars each), add the subset's travel penalty, and take the min — a pure-TS implementation running in well under a second.

**What breaks decomposition:**
1. **Weekly budget** — a knapsack constraint coupling every ingredient; per-subset per-ingredient optimality no longer composes (you'd need Lagrangian/DP over the price axis).
2. **Nutrition floors** — same coupling, per-nutrient.
3. **Store-wide spend-threshold promos** ("spend 300, save 50") and **cross-item multi-buy coupons** — couple ingredients within a store.
4. **Waste cost × pantry** — waste depends on total purchased quantity vs consumption, coupling pack choices across stores for the same ingredient.

With budget + nutrition + promos all present (Maqrivo's spec), the coupled model is the *simpler* correct implementation — the decomposition route would need custom knapsack/Lagrangian heuristics and would still struggle to prove optimality or explain infeasibility.

**Conclusion:** a real solver is justified, but not for performance — for **correctness under coupled constraints, optimality bounds, and infeasibility explanations**. The enumerated-subset heuristic is still worth keeping as a fast pre-pass (it seeds hints and bounds) and as an emergency fallback if the solver service is down; behind an interface, it costs little.

**Explainability architecture (solver-independent).** No available solver gives MIP duals for this model (HiGHS: LP-only; CP-SAT: none). Build explanations from the solution artifacts: per chosen item — price-per-unit vs alternatives at other stores, promo line items, pantry offset; per constraint — slack (budget left, nutrition surplus); for infeasible — CP-SAT UNSAT core over per-constraint assumption literals (budget, each nutrition floor, each ingredient's availability) → "no combination of stores can meet protein ≥ X within budget Y". Persist model + solution + bound per solve for auditability.

---

## Comparison table

| Criterion | OR-Tools CP-SAT (Python) | HiGHS via `highs-js` (WASM, in-process) | HiGHS via `highspy` (Python) | Pure-TS (glpk.js / js-lp-solver) |
|---|---|---|---|---|
| Upstream maturity | Google, 9.15 (2026-01), Apache-2.0 | HiGHS 1.15 (Edinburgh), MIT | same | GLPK (GPL) / hobby-grade |
| Official Node support | **None** (npm `ortools` unpublished, 404) | Community but version-locked 1:1 | None | Native |
| Model fit | Excellent for constraint/promo logic, integer-native | Excellent for linear cost minimization; promos need indicator vars | same | Same as MIP, weaker solver |
| Solve perf @ our size | 50–500 ms | 10–300 ms | 10–300 ms | 10 ms–∞ |
| Locked items (re-opt) | `add_hint` + `fix_variables_to_their_hinted_value` | Change variable bounds / warm start | same | DIY |
| Infeasibility explanation | **UNSAT core (assumptions)** | IIS for LPs; for MIP: manual bisection | same | None |
| Duals/slacks | None; slacks computable | Slacks computable; duals LP-only (fix & re-solve) | same | Weak |
| Extra runtime | Python | **None** | Python | None |
| Docker/Windows burden | Medium | **Low** | Medium | **Low** |
| Single-dev maintenance | Low-medium | **Low** | Medium (if worker) | High (own algorithm) |

---

## Recommendation

**Primary: Google OR-Tools CP-SAT, Python, invoked as a subprocess-per-solve (JSON over stdin/stdout) in phase 1, promoted to a small FastAPI sidecar container when solve frequency or interactivity demands it. Keep `highs-js` (WASM, in-process) as the planned fallback and cross-check during development.**

Rationale:
1. **Modeling fit** — loyalty gating, multi-buy triggers, pantry offsets, waste, store fixed charges are reified-Boolean territory; CP-SAT expresses them directly and integer-native (prices in øre). Fewer modeling bugs than big-M MILP for a solo developer.
2. **Explainability is spec-critical and CP-SAT has the only solver-native answer for infeasibility** (`sufficient_assumptions_for_infeasibility`), plus clean locked-item handling via hints + `fix_variables_to_their_hinted_value`. Slacks/price-ranking explanations are built app-side regardless of solver.
3. **Subprocess-first is the honest phase-1 choice**: stateless, no second service to operate, ~0.5–1.5 s end-to-end (within spec), trivially promoted to the FastAPI sidecar (same solver code, ~50–500 ms warm) once concurrency grows. Run spawns through a Postgres jobs table to prevent pile-ups.
4. **Why not WASM-only now**: the only CP-SAT-in-JS route is a pre-1.0 single-maintainer fork (`or-tools-wasm`) — acceptable risk later or for experiments, not for the core money-path algorithm. `highs-js` is the mirror-image trade: excellent in-process ergonomics, MIT, version-locked to upstream — if the model stabilizes as *purely* linear-integer, migrating the formulation to HiGHS-in-WASM removes Python entirely and is a well-paved path.
5. **The enumerated-store-subset heuristic ships anyway** as a hint-seeder and degraded-mode fallback — cheap insurance that also satisfies the "is a solver overkill?" question with a concrete, bounded alternative.

**Expected solve latency (100 products × 10 stores):** subprocess route ≈ 0.5–1.5 s cold/warm (Python import dominates); FastAPI sidecar or WASM route ≈ 50–500 ms per solve; subset-enumeration pre-pass ≈ <100 ms in TS.

## References

- OR-Tools — https://developers.google.com/optimization/cp/cp_solver ; https://pypi.org/project/ortools/ ; https://developers.google.com/optimization/support/release_notes ; https://github.com/google/or-tools
- CP-SAT Python API (hints, assumptions, UNSAT core) — https://or-tools.github.io/docs/pdoc/ortools/sat/python/cp_model.html
- CP-SAT Primer (community) — https://d-krupke.github.io/cpsat-primer/ ; assumptions discussion — https://groups.google.com/g/or-tools-discuss/c/qlVv2uSq1uo ; https://github.com/google/or-tools/issues/5141
- or-tools-wasm (community) — https://github.com/Axelwickm/or-tools-wasm ; npm: `or-tools-wasm@0.9.1` (2026-06-08)
- HiGHS — https://highs.dev/ ; https://github.com/ERGO-Code/HiGHS/releases ; https://pypi.org/project/highspy/
- HiGHS duals for MIPs (LP-only) — https://discourse.julialang.org/t/highs-duals-for-mips/88817
- highs-js — https://github.com/lovasoa/highs-js ; https://lovasoa.github.io/highs-js/ ; npm: `highs@1.15.2` (2026-07-22), MIT
- scipy.optimize.milp (HiGHS wrapper) — https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.milp.html
- Pure-TS options — https://www.npmjs.com/package/glpk.js (5.0.0, GPL-3.0) ; https://www.npmjs.com/package/javascript-lp-solver (1.0.3)
- Next.js standalone/Docker output — https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Assignment example both ways — https://developers.google.com/optimization/assignment/assignment_cp ; https://developers.google.com/optimization/assignment/assignment_mip
- npm registry checks (ortools 404, highs 1.15.2, licenses) performed 2026-09-04 via registry.npmjs.org
