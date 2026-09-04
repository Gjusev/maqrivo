# Maqrivo

A personal nutrition, meal planning, and grocery optimization context: it connects what a user wants to eat (recipes, nutrition targets) to what they should actually buy (real products, real stores, observed prices and promotions), with provenance for every external fact.

## Language

### Food & Products

**FoodConcept**:
A generic edible thing ("chicken breast", "rice") that recipes refer to; not tied to any retailer or package. Resolved into Products by the optimizer.
_Avoid_: ingredient (that is the recipe role), product, food

**Product**:
A real, purchasable retail item with a brand, package quantity, purchasing mode, and (when known) nutrition. The same physical article can exist as user-created and catalog-imported entries.
_Avoid_: SKU (external retailer ids are attributes, not the concept), article, food concept

**PurchasingMode**:
How a Product is sold and quantified: PACKAGED (discrete packs), WEIGHT (price per kg or per 100 g), UNIT (price per piece).
_Avoid_: unit type, sale type

**ProductResolution**:
The deterministic matching of an external or textual product reference to a known Product, with outcome EXACT / PROBABLE / AMBIGUOUS / UNRESOLVED. An UNRESOLVED match is preferable to a wrong one.
_Avoid_: product mapping, deduplication

**DietaryAttribute**:
A dietary property of a Product or FoodConcept (halal, vegetarian, vegan, organic). Halal is tri-state plus evidence: CONFIRMED / CLAIMED / UNKNOWN / NOT_HALAL; UNKNOWN is never silently treated as acceptable.
_Avoid_: tag (tags are for stores), label

### Prices & Promotions

**PriceObservation**:
A dated observation of a price for a Product at a Store, with source and evidence. Observations are append-only; age is always visible; they never silently become permanent truth.
_Avoid_: price (a Product has no single price field), price record

**Promotion**:
A structured deal with a mechanism (direct price, percentage, multi-buy, second-unit discount, loyalty price, cashback, coupon...), a validity window, a scope (national/regional/store), and evidence. Mechanisms stay structured — never flattened into a fake percentage.
_Avoid_: offer (UI wording only), deal, discount (a discount is one mechanism among several)

**SourceEvidence**:
The first-class pointer from an external fact (price, promotion, product data) to its origin: retailer page, catalogue page, Open Prices proof, receipt, manual observation. Every current external claim can show its source.
_Avoid_: citation, reference, attachment

**Freshness**:
The visible age/validity state of an observation or promotion (observed N days ago, stale, expired). Missing data is shown as unknown; staleness is never hidden.
_Avoid_: cache status, TTL

### Stores & Retailers

**Retailer**:
A chain or banner (Carrefour, Intermarché, an independent butcher's name). Retailers own integration adapters; they are not places.
_Avoid_: brand (brands belong to products), store, chain

**Store**:
A physical retail location with coordinates, discovered from external sources or created by the user. Custom stores participate in optimization identically to discovered ones.
_Avoid_: shop, location (an Open Prices/OSM term used for external ids), venue

**CustomStore**:
A Store created by a user (halal butcher, market, specialty shop). Origin is orthogonal to price confidence.
_Avoid_: manual store, user store

**EnabledStore**:
A Store the user has opted into tracking. Only enabled stores receive ingestion jobs and enter optimization; all other discovered stores remain browsable metadata. Favorite is a preference bonus on an enabled store.
_Avoid_: tracked store, active store, subscribed store

### Planning & Shopping

**Recipe**:
Structured preparation data: servings, ingredients as FoodConcept quantities, steps, times, tags. Nutrition totals are always computed from confirmed ingredients, never asserted by AI.
_Avoid_: meal (a meal is a slot in a plan), dish

**MealPlan**:
A week-structured grid of MealSlots (day + meal type), each filled by a scaled Recipe or locked by the user.
_Avoid_: menu, weekly plan

**MealSlot**:
One day + meal-type cell in a MealPlan (Monday dinner). Lockable independently; re-planning is partial by default.
_Avoid_: meal entry, serving slot

**PantryItem**:
Food or Product quantity the user has at home, with purchase/expiry dates. Planning consumes pantry before suggesting purchases.
_Avoid_: stock, inventory item

**ShoppingPlan**:
The optimizer's output: which Products to buy at which Stores, grouped per store, with effective costs, applied promotions, and selection reasons.
_Avoid_: basket (the solver's intermediate problem), order, list (the shopping list is the UI rendering of the plan)

**ShoppingItem**:
One line of a ShoppingPlan: product, store, purchase quantity, effective cost, applied Promotion, reason selected, freshness of its price evidence.
_Avoid_: purchase, line item

**TravelPenalty**:
The configurable cost the optimizer adds per extra store or per km/minute of travel, so a €0.60 saving cannot silently cost a 25-minute detour.
_Avoid_: distance cost, store cost

### Optimization

**ObjectivePreset**:
A named, user-selectable optimization objective: CHEAPEST, BALANCED, FEWEST_STORES, MINIMUM_TRAVEL, MAX_PROTEIN_PER_EURO, PROMOTION_FOCUSED, LOW_WASTE. BALANCED is the default.
_Avoid_: mode, strategy

**ProteinPerEuro**:
A deterministic metric (grams of protein per euro) computed only where nutrition and price data quality allow it. Never AI-generated, never shown on stale prices.
_Avoid_: protein score, value index

**WasteCost**:
The penalty applied when a purchase inevitably leaves unusable surplus (buying 1 kg when 700 g is needed and the rest won't keep).
_Avoid_: leftover cost, surplus penalty
