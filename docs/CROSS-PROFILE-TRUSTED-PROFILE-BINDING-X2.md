# Sharawla — Trusted Operational Profile Binding X2 Design

Status: X2 DESIGN / READ-ONLY / DOCUMENTATION ONLY
DB deployment: NONE
Runtime change: NONE
Production impact: NONE

---

## 1. Confirmed current gap

The isolated Beta operational backend currently has:
- employees;
- branches;
- business_settings;
- Action/Page permission tables.

It does NOT currently have a trusted persisted:
- Cloud business_id;
- POS profile code;
- Capability/runtime identity.

No relevant Profile/Business identity was found in:
- app_settings;
- auth.users raw_app_meta_data.

Therefore a profile-specific backend owner cannot safely authorize itself by trusting:
- client-supplied profile;
- renderer state;
- navigation state;
- editable user metadata.

---

## 2. Confirmed Cloud authority for SH-0007

Read-only Sharawla Cloud evidence for SH-0007:

- Support Code: SH-0007
- Cloud device id: 8c580a23-8711-4540-b6ca-f5c1725d5fcf
- Cloud business id: 91826502-590e-4afa-8826-2c0f4b99c490
- Business: تجريبي
- POS Profile: restaurant
- Business Connection: active
- Operational backend: xihcxydjnzemflhedzor

Sharawla Cloud is the trusted source for Business/Profile binding.

The operational backend must not infer Profile from UI.

---

## 3. Operational backend identity model

For the current business-scoped backend architecture, introduce a single trusted operational runtime identity binding.

Recommended private table:

sharawla_internal.operational_business_identity_v1

Fields:
- id smallint primary key check(id = 1)
- cloud_business_id uuid not null
- profile_code text not null
- binding_version integer not null
- source text not null
- bound_at timestamptz not null
- updated_at timestamptz not null
- optional cloud_connection_version / evidence metadata

The table is not part of the public Data API.

No anon/authenticated table privileges.

Write authority:
- postgres/service provisioning path only;
- explicit Sharawla Admin/Cloud-controlled binding operation.

The POS client must never be able to update this row.

---

## 4. Binding source

The binding is provisioned from the trusted Sharawla Cloud relationship:

Device
-> Business
-> POS Profile
-> Business Connection
-> operational backend

Provisioning inputs are derived server-side from Cloud records.

Do not accept:
- arbitrary business_id from POS;
- arbitrary profile_code from POS;
- a client-provided backend URL as proof.

The provisioning operator must verify that the target operational backend is the active Business Connection for that Cloud Business before writing the binding.

---

## 5. Internal profile assertion helper

Recommended private helper:

sharawla_internal.assert_operational_profile_v1(expected_profile text)

Behavior:
1. read the singleton operational identity;
2. require exactly one valid binding;
3. require non-empty profile_code;
4. compare trusted stored profile with expected_profile;
5. mismatch -> raise fail-closed error;
6. missing/ambiguous binding -> fail closed.

The helper is internal.
It is not a public client RPC.

Profile-specific SECURITY DEFINER owners call it internally.

---

## 6. Shared-owner assertion

Some owners are intentionally shared.

Do not weaken exact-profile guard by using a generic fallback.

Use a separate internal helper conceptually:

sharawla_internal.assert_operational_profile_allowed_v1(
  allowed_profiles text[]
)

Rules:
- allowlist must be explicit;
- empty allowlist -> deny;
- unknown stored profile -> deny;
- no Restaurant fallback;
- every shared owner documents why it is shared.

---

## 7. Profile-specific owner rule

Examples:

Retail owner:
- expected_profile = retail

Pharmacy owner:
- expected_profile = pharmacy

Logistics owner:
- expected_profile = logistics

Membership owner:
- expected_profile = membership

Service owner:
- expected_profile = service

Restaurant/Food owner:
- expected_profile = restaurant where owner is Restaurant-specific.

A Restaurant-authenticated user calling a Retail owner must fail at the owner before mutation even if:
- the RPC is callable;
- legacy orders/inventory permission is present;
- branch access exists.

---

## 8. Capability vs Profile

Profile binding solves cross-profile ownership.
It does NOT replace commercial Feature entitlement.

Use Profile guard for base profile-specific owners.

Use Runtime Snapshot / Sharawla Cloud entitlement for optional commercial capabilities such as:
- food.kitchen_stations;
- support.center;
- ai.operator.

Do not copy a dynamic paid entitlement catalog into the operational Profile binding row.

Keep concerns separate:
- Profile = trusted business type / engine owner
- Feature entitlement = commercial/runtime decision
- Action permission = employee authority
- Location scope = target operational scope

---

## 9. Action + Location composition

Final employee mutation precondition is conceptually:

trusted operational Profile
AND authenticated employee
AND Action V2
AND Location scope
AND business invariants

Profile pass alone never authorizes a mutation.

---

## 10. Location source

The profile binding is Business-wide.

Target location remains operation-specific:
- branch parameter;
- owning order branch;
- shift branch;
- stock source/destination;
- appointment/job branch;
- check-in branch;
- etc.

Do not put current branch into the singleton Profile identity row.

Location remains a separate authorization dimension.

---

## 11. Profile migration rule

Changing a Business Profile is a high-risk platform operation.

Do not let operational users update profile_code locally.

A Profile migration requires:
1. Sharawla Cloud Admin authorization;
2. compatibility validation;
3. no active unsupported workflow;
4. explicit operational backend binding update;
5. Runtime Config/Snapshot refresh;
6. negative cross-profile verification;
7. audit record.

No automatic profile flip based on POS navigation.

---

## 12. Backend sharing caveat

This singleton contract fits the current business-scoped operational backend model observed here.

If Sharawla later hosts multiple Businesses in one operational database:
- do NOT reuse a singleton;
- every business row/owner must carry a trusted business discriminator;
- the profile assertion must resolve by trusted business_id.

Do not silently apply the singleton design to a future multi-tenant operational database.

---

## 13. Private-schema security

Preferred location:
- private non-exposed schema, e.g. sharawla_internal.

Reason:
- identity is infrastructure metadata;
- not a Business Data API resource.

The private assertion helper should not be granted as a public client API.

Sensitive public SECURITY DEFINER owners should call the private helper internally.

---

## 14. Provisioning acceptance

For SH-0007 Beta, when implementation begins:

Expected binding:
- cloud_business_id = 91826502-590e-4afa-8826-2c0f4b99c490
- profile_code = restaurant
- backend = xihcxydjnzemflhedzor

Acceptance:
- exactly one binding;
- normal authenticated user cannot insert/update/delete it;
- Restaurant owner profile check passes;
- Retail/Pharmacy/Logistics/Membership/Service exact-profile checks deny;
- restart/offline does not alter binding;
- POS UI cannot mutate binding;
- Sharawla Cloud/Admin controlled migration path is audited.

---

## 15. X2 rollout order

Do not add profile checks to all 88 owners in one transaction.

Suggested batches:
- X2-L Logistics
- X2-M Membership
- X2-P Pharmacy
- X2-S Service
- X2-R Retail employee owners
- X2-public Retail/quote paths separately documented

For each family:
1. pin starting definitions;
2. add internal profile assertion;
3. preserve business logic;
4. test expected profile;
5. test unrelated Restaurant profile;
6. verify no mutation on denied call.

---

## 16. Relationship to X1

Recommended implementation strategy:
- create trusted Profile binding first;
- add X2 profile guards;
- then harden ACLs X1 family-by-family;
or stage X1/X2 in the same controlled family window with explicit rollback.

Do not revoke a required caller before the replacement owner path is verified.

---

## 17. Relationship to AI

AI may never choose a Profile by prompt.

AI calls a curated owner.
That owner resolves trusted Profile from operational infrastructure.

If Profile mismatch:
- fail closed;
- no fallback;
- no alternate RPC auto-selection.

---

## 18. Current state

Trusted Profile source discovery:
CLOSED.

X2 design:
CLOSED.

X2 deployment:
NOT STARTED.

No operational DB mutation.
No Cloud mutation.
No Runtime/version change.

Immediate runtime continuation remains:
SH-0007 10.5.4-beta.58.26 -> G0 -> G1 -> G2 -> G3.
