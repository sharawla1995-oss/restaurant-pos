# Top Chicken first admin — implementation checkpoint

Beta only: xihcxydjnzemflhedzor.
Canonical business: 5358328c-9724-49aa-affc-1bce8be90f92.
Beta branch: 22 (TOP CHICKEN 20).
Cloud device: 44162475-3ca2-4a2b-8bd5-aee1c7bb1c73 (SH-0008).
Username: topchicken. No email entry required. Never store passwords in source.

Confirmed:
- Tenant, branch and device binding were inserted into Beta and verified.
- Desktop app.js signIn() currently submits email/password to /auth/v1/token.
- Deployed smart-function login accepts username/password and resolves the internal Auth email.
- Existing smart-function create/password actions do not safely scope target records and branches to the actor's business. Do not use those actions for provisioning.

Before first-admin creation:
1. Implement a restricted operator-only bootstrap with server-owned canonical business and branch validation.
2. Create Auth user with internal generated email and securely supplied strong password.
3. Create employee admin with business_id, branch_id=22 and auth_user_id.
4. Create employee_branches and business_auth_memberships for the same business.
5. Verify username login and device-scoped tenant context on SH-0008.
6. Patch desktop username sign-in and offline verifier; preserve email-based legacy sign-in where applicable.
7. Test cross-tenant rejection and rollback/compensation.

No new Windows installer is needed unless the current desktop login cannot be updated by the existing release mechanism. The account is not yet created.
