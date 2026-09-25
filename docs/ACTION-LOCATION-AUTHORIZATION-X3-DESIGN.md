# Sharawla — Action + Location Authorization X3 Design

Status: X3 DESIGN / READ-ONLY / DOCUMENTATION ONLY
DB deployment: NONE
Runtime change: NONE
Production impact: NONE

---

## 1. Existing authorization semantics

Current Beta backend behavior is confirmed as:

### has_action_permission_v2(action_code)

1. auth.uid() required;
2. Admin -> allow;
3. resolve current_employee_id();
4. explicit employee_action_permissions_v2 row wins;
5. otherwise read permission_actions_v2.legacy_permission;
6. if no legacy permission -> deny;
7. otherwise inherit has_permission(legacy).

### has_branch_access(branch_id)

Allow when:
- Admin; or
- current employee has employee_branches row for branch.

### has_permission(permission_key)

Allow when:
- role = admin; or
- explicit employee_permissions row has allowed=true.

X3 must preserve these accepted compatibility semantics while adding Action-specific Location scope.

---

## 2. Broad location ceiling

employee_branches remains the broad employee Location ceiling.

An Action-specific scope may only restrict this set.

It may never expand beyond employee_branches.

Therefore:

effective_location_allow
=
has_branch_access(target_location)
AND
action_location_scope_result

Admin semantics remain explicit:
- current Admin behavior may bypass broad/location scope;
- this must stay intentional and covered by tests.

---

## 3. Additive scope table

Recommended operational table:

employee_action_location_scope_v2

Columns:
- employee_id bigint not null
- action_code text not null
- location_id bigint not null
- allowed boolean not null default true
- updated_at timestamptz not null default now()
- updated_by bigint/null where practical

Foreign keys:
- employee_id -> employees.id
- action_code -> permission_actions_v2.code
- location_id -> branches.id

Primary key:
(employee_id, action_code, location_id)

RLS:
- ordinary user may read only their own effective scope if UI needs it;
- mutation only through guarded admin owner;
- no direct ordinary-user INSERT/UPDATE/DELETE.

---

## 4. Scope mode semantics

No rows for employee + action:
- INHERIT broad employee_branches.

One or more rows for employee + action:
- RESTRICTED mode.

In RESTRICTED mode:
- target location must have an explicit row with allowed=true;
- missing target row = DENY;
- allowed=false = DENY;
- broad employee_branches must still allow the location.

This makes the set deterministic.

It avoids accidental expansion.

---

## 5. Why absence means inherit

Existing users currently have no Action-specific location rows.

If absence meant deny:
- every existing user would lose all branch actions after migration.

Therefore migration-safe default:
- no X3 rows -> old broad branch behavior.

Only an explicit scoped configuration changes behavior.

---

## 6. Effective evaluator

Recommended helper:

has_action_permission_at_location_v2(
  p_action_code text,
  p_location_id bigint
) returns boolean

Conceptual behavior:

1. require normal has_action_permission_v2(action_code);
2. if Admin -> true according to current accepted Admin semantics;
3. require valid current employee;
4. require has_branch_access(location_id);
5. inspect employee_action_location_scope_v2 for employee + action;
6. if no rows -> true (inherit broad branch access);
7. if rows exist -> target row must exist and allowed=true;
8. otherwise false.

The evaluator does not perform Profile authorization.
Profile guard remains X2.

---

## 7. Business-wide actions

Not every Action has a target Location.

Examples:
- business identity settings;
- Business-wide insurance company setup;
- some membership plan definitions;
- some service catalog configuration.

For genuinely Business-wide actions:
- use has_action_permission_v2(action_code);
- do not invent a fake branch solely to satisfy X3.

If a Business-wide action later becomes Location-specific:
- change the owner contract explicitly;
- do not silently start using current UI branch.

---

## 8. Multi-location actions

Some operations involve two locations.

Examples:
- stock transfer source -> destination;
- internal supply route;
- cross-location stock movement.

Final owner must document whether authority is required on:
- source only;
- destination only;
- both.

Default for transfer mutation:
- CREATE: require source mutation authority and visibility/eligibility of destination;
- RECEIVE: require destination receive authority;
- CANCEL: require authority according to transfer ownership/state.

Do not collapse source/destination to current UI branch.

---

## 9. Entity-derived location

Some owners receive no branch parameter directly.

Examples:
- return -> original order branch;
- shift close -> shift branch;
- delivery settle -> order/driver/shift branch;
- purchase approve -> purchase.branch_id;
- service job status -> job branch.

Rule:
- resolve target Location server-side from authoritative entity row;
- then call Action+Location evaluator.

Never trust a client-supplied branch when the authoritative entity already determines it.

---

## 10. Profile + Action + Location composition

For a profile-specific employee mutation owner:

1. X2 trusted Profile assertion;
2. has_action_permission_at_location_v2(action, target_location);
3. owner-specific business invariants;
4. mutation;
5. authoritative audit where required.

Conceptually:

assert_operational_profile_v1(expected_profile)
AND
has_action_permission_at_location_v2(action_code, location_id)
AND
domain invariants

No layer substitutes for another.

---

## 11. Cross-profile use

Examples:

Restaurant user -> retail_purchase_order_create:
- X2 Retail Profile assertion fails before mutation.

Retail user with wrong Action:
- Profile passes;
- X3 Action fails.

Retail user with Action but wrong branch:
- Profile passes;
- Action passes;
- X3 Location fails.

Retail user with correct Profile + Action + Location:
- normal business invariants decide final outcome.

---

## 12. Action catalog mapping discipline

Actions are business authority, not function names.

One Action may protect multiple owner functions when meaning/risk is the same.

Examples:
- membership.subscription.manage may cover subscribe + renew;
- service.appointment.manage may cover create + normal status management;
- service.job.complete remains separate for final completion;
- purchasing.receive protects receive owner variants when semantics are aligned.

Do not create duplicate V1/V2 Action codes for implementation variants.

---

## 13. Legacy fallback migration

Current has_action_permission_v2 may inherit legacy page permission.

Do not remove legacy fallback globally in X3.

Migration stages:

Stage A:
- add Action codes;
- wire owners;
- preserve legacy fallback where explicitly mapped.

Stage B:
- add explicit role/user Action defaults.

Stage C:
- measure remaining inherited legacy decisions.

Stage D:
- only after parity evidence, remove legacy fallback for selected high-risk Actions if desired.

High-risk new Actions may use legacy_permission=NULL from day one to fail closed.

---

## 14. Admin management owner

Do not let UI write employee_action_location_scope_v2 directly.

Use guarded admin RPC(s), conceptually:

admin_set_employee_action_location_scope_v2(
  employee_id,
  action_code,
  location_ids[]
)

and:

admin_reset_employee_action_location_scope_v2(
  employee_id,
  action_code
)

Set semantics:
- validate employee exists;
- validate action exists/active;
- validate every location belongs to broad employee_branches unless employee is Admin under explicit policy;
- replace scope atomically;
- audit previous/new set.

Reset:
- remove Action-specific rows;
- returns behavior to INHERIT broad branch access.

---

## 15. UI semantics

Advanced Permissions UI should show:

Action:
- Inherit
- Allow
- Deny

Location:
- All allowed locations (inherit)
- Restricted locations

If Action = Deny:
- Location selector disabled.

If Action = Inherit/Allow:
- user may choose broad inheritance or restricted location set.

UI must display effective result, not just stored rows.

---

## 16. Offline replay

Offline operations must carry stable target Location identity already required by the business payload.

On sync:
- backend re-evaluates current Profile;
- current Action permission;
- current Location scope;
- current business invariants.

Do not persist a permanent authorization token at offline creation time.

If authorization changed while offline:
- sync fails visibly;
- operation remains unresolved for authorized review/recovery;
- do not silently mutate under stale permission.

---

## 17. Location Code relationship

X3 evaluator uses operational location_id internally.

Cross-system identity later uses:
business_branches.code <-> branches.location_code.

Do not replace relational operational branch IDs with text codes inside every business table.

location_code is cross-system identity.
branch/location_id remains operational relational key.

---

## 18. Security properties

Required:
- fail closed on invalid action;
- fail closed on invalid location;
- explicit Action override beats legacy fallback;
- broad branch ceiling cannot be expanded by Action scope;
- restricted mode missing row = deny;
- direct RPC call receives same decision as UI;
- direct REST bypass is removed/hardened for sensitive owners.

---

## 19. X3 acceptance matrix

For each representative owner test:

A. Page denied
- UI hidden/blocked.
- backend still independently protected.

B. Action denied
- backend deny.

C. Action allowed, broad branch denied
- backend deny.

D. Broad branch allowed, Action restricted to other location
- backend deny.

E. Action allowed, broad branch allowed, restricted location allowed
- business operation proceeds.

F. No Action-specific Location rows
- inherits employee_branches compatibility behavior.

G. Admin
- behaves according to explicit Admin policy.

H. Direct RPC manipulation
- same deny/allow result.

I. Offline replay after permission/location change
- current authorization enforced.

---

## 20. X3 rollout order

Do not wire all profiles at once.

Recommended:
1. Restaurant Core P2/P3 owners.
2. Restaurant customer/catalog/settings batches.
3. Cross-profile family X3-L Logistics.
4. X3-M Membership.
5. X3-P Pharmacy.
6. X3-S Service.
7. X3-R Retail.

Each family gets:
- owner map;
- action map;
- location source;
- deny tests;
- allow tests;
- rollback boundary.

---

## 21. Current state

Existing Action evaluator:
confirmed.

Existing broad branch evaluator:
confirmed.

X3 Location scope semantics:
DESIGN CLOSED.

X3 schema/evaluator deployment:
NOT STARTED.

No DB write.
No Runtime change.
No Production change.

Immediate runtime continuation remains:
SH-0007 10.5.4-beta.58.26 -> G0 -> G1 -> G2 -> G3.
