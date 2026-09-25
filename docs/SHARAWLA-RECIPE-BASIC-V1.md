# Sharawla POS — Recipe Basic V1 Foundation

## Status
Foundation implemented on isolated SH-0007 Beta operational backend only.
No production operational backend was modified.

Sharawla Cloud capabilities remain Planned and unassigned:
- `food.ingredients`
- `food.recipes`

## Legacy compatibility
Existing tables are preserved:
- `ingredients`
- `ingredient_stock`
- `recipes`
- `stock_movements`
- `purchases`
- `purchase_items`

No existing legacy row is migrated, rewritten or deleted by this foundation.

## Basic V1 data model
### Units
`inventory_units`
Seeded reference units:
- g
- kg
- ml
- l
- pc
- pack
- box

Generic dimensional conversions are supported where safe (kg <-> g, l <-> ml).
Packaging conversions remain ingredient-specific.

### Ingredient-specific conversions
`ingredient_unit_conversions`
Example: one box of a particular ingredient = 24 pieces.

Helper:
`ingredient_unit_factor_v1(ingredient_id, from_unit, to_unit)`

### Ingredient extensions
Legacy `ingredients` is extended additively with:
- base_unit_code
- purchase_unit_code
- sku
- barcode
- track_inventory
- updated_at

Legacy `ingredients.unit` remains untouched and authoritative until an ingredient is explicitly configured for the new model.

### Versioned Recipes
New:
- `food_recipe_headers`
- `food_recipe_versions`
- `food_recipe_lines`

Supports:
- base product recipe
- product-variant recipe
- version number
- draft / active / retired lifecycle
- effective dates
- unit conversion snapshot per line
- base quantity snapshot

A product variant recipe is constrained to a variant belonging to the same product.

### Extras and removals
New:
- `food_modifier_recipe_impacts`
- `food_recipe_removal_mappings`

This models inventory/cost impact for Extras and removable components without changing plain text item notes.

### Cost preview
Views:
- `food_active_recipe_lines_v1`
- `food_recipe_cost_preview_v1`

Recipe cost is calculated from base quantities and `ingredients.cost_per_unit`.
The view also reports whether all ingredient base units are configured.

## Safety boundary
Recipe Basic V1 is NOT connected to checkout yet.
It does not alter:
- order creation
- order returns
- offline queue
- ingredient stock deduction
- printing
- reports
- backup/restore

Those are separate acceptance gates.

## Acceptance snapshot
Before migration on SH-0007 Beta:
- ingredients: 0
- ingredient_stock: 0
- legacy recipe lines: 0
- stock_movements: 0
- legacy purchases: 0
- legacy purchase items: 0

After migration:
- all six counts unchanged
- inventory_units: 7 reference rows
- ingredient_unit_conversions: 0
- recipe headers: 0
- recipe versions: 0
- recipe lines: 0
- modifier impacts: 0
- removal mappings: 0

## Gates before Basic can be marked implemented
1. Secured Ingredient/Unit/Recipe write RPCs.
2. POS Recipe Basic editor UI.
3. Recipe activation/version-switch transaction.
4. Recipe requirement resolver including Extras/Removals.
5. Atomic checkout ingredient deduction.
6. Atomic return/reversal behavior.
7. Offline queue + idempotency.
8. Backup/restore inclusion.
9. Recipe cost and ingredient usage report pack.
10. SH-0007 end-to-end acceptance.

Only after those gates pass should `food.ingredients` / `food.recipes` become implemented/assignable.