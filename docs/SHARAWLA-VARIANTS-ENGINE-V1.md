# Sharawla POS — Variants Engine V1 Foundation

## Status
Foundation implemented on isolated SH-0007 Beta operational backend only.
`commerce.variants` remains Planned in Sharawla Cloud until POS UI/checkout consumption is implemented and accepted.

## Why this exists
The legacy `product_variants` table was designed for simple Restaurant price choices such as Single / Double / Triple. It is preserved for compatibility.

Variants Engine V1 adds a true retail matrix model without breaking that behavior.

## Compatibility contract
- Existing `product_variants` rows remain valid.
- Existing Restaurant choices default to `is_stock_unit=false`.
- Existing product-level retail inventory remains untouched.
- Existing orders and order_items remain untouched.
- True retail variants opt in explicitly with `is_stock_unit=true`.
- No Profile, Category or Business assignment is created by this engine migration.

## Data model
### Existing table extended
`product_variants`
- sku
- barcode
- cost
- is_stock_unit
- image_url
- metadata
- created_at / updated_at

### New matrix tables
`product_variant_axes`
- Product-scoped dimensions such as Size, Color, Shade, Capacity, Model.

`product_variant_axis_values`
- Values for each axis, for example Size=M / L / XL or Color=Black / White.

`product_variant_selections`
- One selected value per axis per variant.
- Enforces same-product scope.

### Independent variant inventory
`retail_variant_inventory_balances`
- branch_id + variant_id
- quantity
- low stock threshold
- track inventory
- average unit cost
- last purchase cost

`retail_variant_inventory_movements`
- full movement ledger with idempotency key support.

## Safety
The migration does NOT replace or modify:
- create_pos_order_atomic
- create_retail_pos_order_atomic
- create_order_return_idempotent
- create_retail_order_return_idempotent
- retail_inventory_balances
- retail_inventory_movements
- orders
- order_items

Checkout integration is a separate future acceptance gate.

## Current Beta acceptance snapshot
Before migration on SH-0007 Beta:
- product_variants: 0
- retail_inventory_balances: 3
- retail_inventory_movements: 28
- orders: 18
- order_items: 22

After migration:
- all five counts unchanged
- product_variant_axes: 0
- product_variant_axis_values: 0
- product_variant_selections: 0
- retail_variant_inventory_balances: 0
- retail_variant_inventory_movements: 0

Sharawla Cloud capability state:
- `commerce.variants`
- implemented=false
- feature_class=planned
- profile assignments=0
- category assignments=0
- business assignments=0

## Next gates before capability activation
1. Secured matrix write RPCs.
2. POS product-editor UI for axes and combinations.
3. Barcode/SKU resolver.
4. Variant-aware checkout and independent stock deduction.
5. Variant-aware returns.
6. Purchase receiving into variant stock.
7. Reports by parent product and by variant.
8. Offline queue compatibility.
9. Backup/restore inclusion.
10. SH-0007 acceptance tests.

Only after all gates pass should `commerce.variants` be changed from Planned to implemented and assigned to selected non-production categories/businesses.