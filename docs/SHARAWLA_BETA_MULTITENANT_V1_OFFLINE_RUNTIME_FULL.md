# Sharawla Beta Multi-Tenant V1 — Offline Runtime Full Tenant Scope

Status: **SOURCE PREP / NOT DEPLOYED**

Generated from the 53 live Beta runtime functions that touch the Offline receipt families.

- Runtime functions captured: **53**
- Functions with direct operational entity-table access: **32**
- Operational entity tables directly referenced: **20**
- Tenant-scoped direct receipt/entity data references after transformation: **105**
- Inserts protected by the centralized tenant write guard: **55**
- Rowtype declarations excluded from data-access proof: **54**
- Unscoped direct read/update/delete references after transformation: **0**

The consolidated draft scopes direct access to receipt families plus ingredients, prep items, recipe versions, purchases, suppliers, stock transfers, restaurant table sessions, retail suspended sales, production batches, purchase lines, products, variants, waste reasons, retail purchasing/suppliers, customers, orders/order items, consumption snapshots and stock movements.

This closes the direct access inside the 53 wrappers. Canonical owner functions called by these wrappers remain a separate hardening gate and are not silently claimed closed here.
