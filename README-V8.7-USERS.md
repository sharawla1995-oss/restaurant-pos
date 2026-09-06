# Top Burger POS V8.7 — Users & Permissions

## What changed
- Secure user creation through a Supabase Edge Function named `manage-users`.
- Add user from the POS: name, email, password, role, primary branch, allowed branches.
- Edit role, primary branch and branch access.
- Activate/deactivate users.
- Change a user's password.
- Deactivated employees can no longer bootstrap into the POS.
- Admin accounts retain access to all active branches.
- Version/cache bumped to V8.7.

## Required one-time Supabase step
Deploy the Edge Function in:
`supabase/functions/manage-users/index.ts`

The function uses Supabase's built-in Edge Function secrets:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

Do NOT place the service-role key in `app.js`, `index.html`, GitHub Pages, or any browser-visible file.

No new database SQL is required for V8.7 because it uses the existing `employees` and `employee_branches` tables.
