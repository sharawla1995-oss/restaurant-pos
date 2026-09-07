TOP BURGER POS V9.2.9 - BRANCH MANAGEMENT

New:
- + Add Branch button beside branch selector in the top bar.
- Independent permission: branchManagement / إدارة الفروع.
- Full branch wizard: name, phone, address, template branch, website visibility.
- Atomic Supabase RPC creates the branch, website settings, and all branch_products rows.
- Template branch copies price overrides, stable availability, and prep time.
- Temporary pauses are not copied.
- Delivery zones, drivers, and employees are not cloned because they are location-specific.
- New branch appears dynamically without hard-coded branch names.

Run supabase-v9-2-9-branch-management.sql before using the Add Branch button.
