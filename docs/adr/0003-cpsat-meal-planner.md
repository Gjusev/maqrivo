# Weekly meal planning is a CP-SAT problem, not an AI or greedy task

The weekly meal plan (which recipe fills which meal slot) is assembled by the same deterministic Python solver that optimizes the shopping basket, exposed as a second mode (`plan_meals`) on the same JSON-over-stdio contract from ADR-0001. Recipes are pre-validated candidates — user-created, imported, or AI-proposed then deterministically nutrition-checked — and the solver assigns them to slots under daily nutrition targets, meal-type tags, repetition limits, cooking-time caps, pantry consumption, aggregate budget, and user locks. AI may propose candidate recipes but never owns slot assignment or totals.

Rejected: a greedy rule-based planner (cannot jointly honor weekly budget and daily protein — it approximates globally-coupled constraints), and LLM-assembled weeks (unexplainable, violates the "no silent AI decisions on deterministic business logic" principle).
