TOP BURGER POS — V9.0 STABLE

Stable sales/operations baseline after live testing.
Includes:
- POS/orders/delivery/customers
- branches and flexible permissions
- shifts/expenses/reports and 80mm shift printing
- product images via Supabase Storage
- granular backup/restore/reset
- in-app dialogs (no browser prompt/confirm/alert flows)
- inventory/purchases/raw-material structures retained for later use

Database status:
The production database already received the tested reset_pos_data shift fix.
The included supabase-v9-0-stable-reset.sql is the canonical SQL for a fresh/rebuilt deployment.
Do not rerun migrations on the current production project unless needed.
