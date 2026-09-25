# Point 4 Batch 4B — Reservation Identity V1 Implementation Contract

Status: **design/source contract only**. This is not executable SQL, does not
change a deployed RPC, and does not activate Canonical Stock. Point 4B-2 genuine
committed concurrency remains open.

## 1. Current source-proven Reservation contract

The current operational model is defined by the beta17 Retail core, beta18
Retail Website integration, and its finalize file.

| Object | Current identity and durable role |
|---|---|
| `public.retail_website_orders` | Staged document. `id bigserial` PK; unique `idempotency_key text`; unique `reservation_key text`; branch/customer/payment/totals/status/expiry; accepted POS-order lineage. |
| `public.retail_website_order_items` | Operational product projection. Generated `id`; parent FK; product/pricing/quantity/notes; unique `(retail_website_order_id,product_id)`. |
| `public.retail_stock_reservations` | Physical Legacy reservation projection. Generated `id`; branch/product/quantity/key/status/expiry/order lineage; unique `(reservation_key,product_id)`. |

There is no durable status-command/event table. Creation uses
`retail_create_website_order(bigint,text,text,text,text,text,bigint,text,text,text,text,jsonb)`;
the public wrapper delegates to private
`retail_create_website_order_beta18_core(...)`. Standalone
`retail_reserve_stock(bigint,text,jsonb,integer)` remains defined but its
anon/authenticated execution is revoked. Status functions are
`accept_retail_website_order(bigint)`,
`reject_retail_website_order(bigint,text)`, and
`cancel_retail_website_order_customer(text,text)`. Release is inline in reject
and cancel; expiry is inline in create/reserve/accept, with no expiry RPC.

`retail-website/app.js` generates fresh submission keys immediately before the
RPC. `retail-website-pos.js` accepts/rejects by generated order ID. The flow is
online-only and owns no Native Offline V2 store, Outbox, sync or ACK.

The Legacy core groups input by `product_id`, sums quantity, chooses `max(notes)`,
then computes server price/offer evidence for that aggregate. Thus a generated
item ID, product ID, `idempotency_key`, or `reservation_key` is not an Identity
V1 document/line identity.

## 2. Normative schema manifest

The JSON block below is normative. A later migration must implement it exactly;
the Batch 4B checker parses and validates this structure.

<!-- CONTRACT_MANIFEST_BEGIN -->
```json
{
  "contract": "sharawla.point4.reservation.identity.v1",
  "status": "source-design-only",
  "tables": {
    "public.retail_reservation_documents_identity_v1": {
      "columns": [
        {"name":"id","type":"bigint generated always as identity","nullable":false,"default":null},
        {"name":"retail_website_order_id","type":"bigint","nullable":false,"default":null},
        {"name":"document_uid","type":"uuid","nullable":false,"default":null},
        {"name":"source_document_id","type":"text generated always as ('uuid:' || document_uid::text) stored","nullable":false,"default":null},
        {"name":"creation_client_tx_id","type":"uuid","nullable":false,"default":null},
        {"name":"creation_operation_digest","type":"text","nullable":false,"default":null},
        {"name":"identity_contract_version","type":"text","nullable":false,"default":"sharawla.point4.identity.v1"},
        {"name":"created_at","type":"timestamptz","nullable":false,"default":"now()"}
      ],
      "constraints": [
        {"name":"retail_reservation_documents_identity_v1_pkey","kind":"primary_key","definition":"primary key (id)"},
        {"name":"retail_reservation_documents_identity_v1_website_order_fkey","kind":"foreign_key","definition":"foreign key (retail_website_order_id) references public.retail_website_orders(id) on delete restrict"},
        {"name":"retail_reservation_documents_identity_v1_website_order_key","kind":"unique","definition":"unique (retail_website_order_id)"},
        {"name":"retail_reservation_documents_identity_v1_document_uid_key","kind":"unique","definition":"unique (document_uid)"},
        {"name":"retail_reservation_documents_identity_v1_source_document_key","kind":"unique","definition":"unique (source_document_id)"},
        {"name":"retail_reservation_documents_identity_v1_creation_tx_key","kind":"unique","definition":"unique (creation_client_tx_id)"},
        {"name":"retail_reservation_documents_identity_v1_digest_check","kind":"check","definition":"check (creation_operation_digest ~ '^[0-9a-f]{64}$')"},
        {"name":"retail_reservation_documents_identity_v1_version_check","kind":"check","definition":"check (identity_contract_version = 'sharawla.point4.identity.v1')"}
      ],
      "indexes": [
        {"name":"retail_reservation_documents_identity_v1_created_idx","definition":"(created_at, id)"}
      ],
      "triggers": [
        {"name":"retail_reservation_documents_identity_v1_immutable","definition":"before update or delete on public.retail_reservation_documents_identity_v1 for each row execute function public.retail_reservation_identity_immutable_v1()"}
      ]
    },
    "public.retail_reservation_lines_identity_v1": {
      "columns": [
        {"name":"id","type":"bigint generated always as identity","nullable":false,"default":null},
        {"name":"reservation_document_id","type":"bigint","nullable":false,"default":null},
        {"name":"line_uid","type":"uuid","nullable":false,"default":null},
        {"name":"product_id","type":"bigint","nullable":false,"default":null},
        {"name":"quantity","type":"numeric(14,3)","nullable":false,"default":null},
        {"name":"normalized_notes","type":"text","nullable":true,"default":null},
        {"name":"reservation_effect_line_key","type":"text","nullable":false,"default":null},
        {"name":"canonical_line_digest","type":"text","nullable":false,"default":null},
        {"name":"created_at","type":"timestamptz","nullable":false,"default":"now()"}
      ],
      "constraints": [
        {"name":"retail_reservation_lines_identity_v1_pkey","kind":"primary_key","definition":"primary key (id)"},
        {"name":"retail_reservation_lines_identity_v1_document_fkey","kind":"foreign_key","definition":"foreign key (reservation_document_id) references public.retail_reservation_documents_identity_v1(id) on delete restrict"},
        {"name":"retail_reservation_lines_identity_v1_product_fkey","kind":"foreign_key","definition":"foreign key (product_id) references public.products(id) on delete restrict"},
        {"name":"retail_reservation_lines_identity_v1_line_uid_key","kind":"unique","definition":"unique (line_uid)"},
        {"name":"retail_reservation_lines_identity_v1_effect_key","kind":"unique","definition":"unique (reservation_effect_line_key)"},
        {"name":"retail_reservation_lines_identity_v1_quantity_check","kind":"check","definition":"check (quantity > 0)"},
        {"name":"retail_reservation_lines_identity_v1_effect_format_check","kind":"check","definition":"check (reservation_effect_line_key ~ '^v1:stock:reservation:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')"},
        {"name":"retail_reservation_lines_identity_v1_digest_check","kind":"check","definition":"check (canonical_line_digest ~ '^[0-9a-f]{64}$')"}
      ],
      "indexes": [
        {"name":"retail_reservation_lines_identity_v1_document_product_idx","definition":"(reservation_document_id, product_id, id)"}
      ],
      "triggers": [
        {"name":"retail_reservation_lines_identity_v1_immutable","definition":"before update or delete on public.retail_reservation_lines_identity_v1 for each row execute function public.retail_reservation_identity_immutable_v1()"}
      ]
    },
    "public.retail_reservation_mutations_identity_v1": {
      "columns": [
        {"name":"id","type":"bigint generated always as identity","nullable":false,"default":null},
        {"name":"reservation_document_id","type":"bigint","nullable":false,"default":null},
        {"name":"client_tx_id","type":"uuid","nullable":false,"default":null},
        {"name":"mutation_type","type":"text","nullable":false,"default":null},
        {"name":"operation_digest","type":"text","nullable":false,"default":null},
        {"name":"requested_status","type":"text","nullable":false,"default":null},
        {"name":"result_status","type":"text","nullable":true,"default":null},
        {"name":"result_payload","type":"jsonb","nullable":true,"default":null},
        {"name":"actor_kind","type":"text","nullable":false,"default":null},
        {"name":"actor_employee_id","type":"bigint","nullable":true,"default":null},
        {"name":"recorded_at","type":"timestamptz","nullable":false,"default":"now()"},
        {"name":"applied_at","type":"timestamptz","nullable":true,"default":null}
      ],
      "constraints": [
        {"name":"retail_reservation_mutations_identity_v1_pkey","kind":"primary_key","definition":"primary key (id)"},
        {"name":"retail_reservation_mutations_identity_v1_document_fkey","kind":"foreign_key","definition":"foreign key (reservation_document_id) references public.retail_reservation_documents_identity_v1(id) on delete restrict"},
        {"name":"retail_reservation_mutations_identity_v1_employee_fkey","kind":"foreign_key","definition":"foreign key (actor_employee_id) references public.employees(id) on delete restrict"},
        {"name":"retail_reservation_mutations_identity_v1_client_tx_key","kind":"unique","definition":"unique (client_tx_id)"},
        {"name":"retail_reservation_mutations_identity_v1_digest_check","kind":"check","definition":"check (operation_digest ~ '^[0-9a-f]{64}$')"},
        {"name":"retail_reservation_mutations_identity_v1_type_status_check","kind":"check","definition":"check ((mutation_type, requested_status) in (('accept','accepted'),('reject','rejected'),('cancel','cancelled'),('expire','expired')))"},
        {"name":"retail_reservation_mutations_identity_v1_actor_check","kind":"check","definition":"check ((mutation_type in ('accept','reject') and actor_kind = 'staff' and actor_employee_id is not null) or (mutation_type = 'cancel' and actor_kind = 'customer' and actor_employee_id is null) or (mutation_type = 'expire' and actor_kind = 'system' and actor_employee_id is null))"},
        {"name":"retail_reservation_mutations_identity_v1_result_check","kind":"check","definition":"check ((applied_at is null and result_status is null and result_payload is null) or (applied_at is not null and result_status is not null and result_payload is not null))"},
        {"name":"retail_reservation_mutations_identity_v1_result_status_check","kind":"check","definition":"check (result_status is null or result_status in ('accepted','rejected','cancelled','expired'))"}
      ],
      "indexes": [
        {"name":"retail_reservation_mutations_identity_v1_document_recorded_idx","definition":"(reservation_document_id, recorded_at, id)"},
        {"name":"retail_reservation_mutations_identity_v1_one_expiry_idx","definition":"unique (reservation_document_id) where mutation_type = 'expire'"}
      ],
      "triggers": [
        {"name":"retail_reservation_mutations_identity_v1_guard","definition":"before update or delete on public.retail_reservation_mutations_identity_v1 for each row execute function public.retail_reservation_mutation_guard_v1()"}
      ]
    }
  },
  "functions": [
    "public.retail_reservation_identity_immutable_v1() returns trigger",
    "public.retail_reservation_mutation_guard_v1() returns trigger",
    "public.retail_reservation_identity_digest_v1(text,text,text,bigint,jsonb,jsonb) returns text",
    "public.retail_reservation_identity_resolve_mutation_v1(text,text,text) returns bigint",
    "public.retail_reservation_identity_assert_projection_v1(bigint) returns void",
    "public.retail_create_website_order_identity_v1(jsonb) returns jsonb",
    "public.accept_retail_website_order_identity_v1(text,text) returns jsonb",
    "public.reject_retail_website_order_identity_v1(text,text,text) returns jsonb",
    "public.cancel_retail_website_order_customer_identity_v1(text,text,text) returns jsonb",
    "public.expire_retail_website_order_identity_v1(text) returns jsonb"
  ],
  "policies": [
    {"name":"retail_reservation_documents_identity_v1_staff_select","table":"public.retail_reservation_documents_identity_v1","command":"select","roles":["authenticated"],"using":"exists (select 1 from public.retail_website_orders w where w.id = retail_website_order_id and public.has_branch_access(w.branch_id))"},
    {"name":"retail_reservation_lines_identity_v1_staff_select","table":"public.retail_reservation_lines_identity_v1","command":"select","roles":["authenticated"],"using":"exists (select 1 from public.retail_reservation_documents_identity_v1 d join public.retail_website_orders w on w.id = d.retail_website_order_id where d.id = reservation_document_id and public.has_branch_access(w.branch_id))"},
    {"name":"retail_reservation_mutations_identity_v1_staff_select","table":"public.retail_reservation_mutations_identity_v1","command":"select","roles":["authenticated"],"using":"exists (select 1 from public.retail_reservation_documents_identity_v1 d join public.retail_website_orders w on w.id = d.retail_website_order_id where d.id = reservation_document_id and public.has_branch_access(w.branch_id))"}
  ],
  "rpc_contracts": {
    "public.retail_create_website_order_identity_v1(jsonb) returns jsonb":{"arguments":["p_identity_envelope jsonb"],"security":"security definer set search_path=''","execute_roles":["anon","authenticated"]},
    "public.accept_retail_website_order_identity_v1(text,text) returns jsonb":{"arguments":["p_document_uid text","p_client_tx_id text"],"security":"security definer set search_path=''","execute_roles":["authenticated"]},
    "public.reject_retail_website_order_identity_v1(text,text,text) returns jsonb":{"arguments":["p_document_uid text","p_client_tx_id text","p_reason text"],"security":"security definer set search_path=''","execute_roles":["authenticated"]},
    "public.cancel_retail_website_order_customer_identity_v1(text,text,text) returns jsonb":{"arguments":["p_document_uid text","p_client_tx_id text","p_customer_phone text"],"security":"security definer set search_path=''","execute_roles":["anon","authenticated"]},
    "public.expire_retail_website_order_identity_v1(text) returns jsonb":{"arguments":["p_document_uid text"],"security":"security definer set search_path=''","execute_roles":[]}
  },
  "security": {
    "rls_enabled_on":["public.retail_reservation_documents_identity_v1","public.retail_reservation_lines_identity_v1","public.retail_reservation_mutations_identity_v1"],
    "table_mutation_revoked_from":["PUBLIC","anon","authenticated"],
    "helper_execute_revoked_from":["PUBLIC","anon","authenticated"],
    "entrypoint_public_execute_revoked":true
  },
  "digest": {
    "wire":"lowercase hexadecimal text",
    "syntax":"^[0-9a-f]{64}$",
    "characters":64,
    "decoded_bytes":32,
    "storage":"text",
    "algorithm":"SHA-256 over UTF-8 canonical JSONB text",
    "comparison":"byte-for-byte text equality after server generation",
    "malformed":"fail closed before durable write"
  },
  "mutation_map": {
    "accept":{"status":"accepted","actor":"staff","lock_domain":"point4-reservation-client-tx:"},
    "reject":{"status":"rejected","actor":"staff","lock_domain":"point4-reservation-client-tx:"},
    "cancel":{"status":"cancelled","actor":"customer","lock_domain":"point4-reservation-client-tx:"},
    "expire":{"status":"expired","actor":"system","lock_domain":"point4-reservation-client-tx:"}
  }
}
```
<!-- CONTRACT_MANIFEST_END -->

Unique constraints provide their own indexes. Listed indexes are additional.
All FK deletion is `RESTRICT`; canonical evidence never cascades away.

The immutable helper rejects UPDATE/DELETE on document and line sidecars. The
mutation guard rejects DELETE and identity/type/digest/FK changes; it permits
only one transition in which all result fields change from NULL to non-NULL
together, then rejects all further changes.

RLS is enabled on all three tables. The manifest gives the exact table, command,
role and `USING` expression for every staff SELECT policy. There is no anon
table policy. Direct INSERT/UPDATE/DELETE is revoked from PUBLIC, anon and
authenticated. Internal helpers have EXECUTE revoked from those roles. Every
entrypoint first revokes PUBLIC, anon and authenticated, then grants only the
roles in its manifest `execute_roles`; an empty list leaves the expiry RPC
owner/internal only. Versioned entrypoints use `SECURITY DEFINER SET
search_path=''`, fully qualified references and explicit customer/auth/branch
checks.

## 3. Exact digest contract

Reservation follows `point4_identity_operation_digest_v1`: lowercase
64-character SHA-256 hex text. No `bytea` digest column is proposed.

- Wire/storage: `text`, exactly `^[0-9a-f]{64}$`.
- Semantics: 64 ASCII hex characters represent 32 digest bytes.
- Generation: strict allowlisted JSONB → UTF-8 JSONB text → SHA-256 → lowercase
  hex encoding.
- Conversion: no wire decode because storage is canonical hex. Diagnostic
  `decode(value,'hex')` must yield 32 bytes and is not persisted.
- Trust: clients do not supply an authoritative digest. Each RPC canonicalizes
  intent and computes it server-side.
- Equality: exact text equality. Same TX/same digest replays; same TX/different
  digest raises `RETAIL_RESERVATION_IDENTITY_V1_IDEMPOTENCY_CONFLICT`.
- Malformed/noncanonical input fails before durable write.
- `payload_digest` remains transport integrity and is never copied into the
  economic `operation_digest`.

Creation root allowlist: `client_tx_id, document_uid, source_document_id,
branch_id, customer_name, customer_phone, customer_address, customer_notes,
order_type, delivery_zone_id, payment_method_code, payment_reference, lines`.
Creation-line allowlist: `line_uid, product_id, quantity, notes`. Pricing, cost,
offers, discount, expiry and timestamps are server-derived and excluded.
Accept allows `{document_uid,client_tx_id}`; reject adds `reason`; cancel adds
normalized `customer_phone`; expiry uses `{document_uid}` plus stored expiry
evidence and generates its system TX internally.

UUID text is validated by `point4_identity_uuid_v4_v1` before UUID cast.
Quantity uses `point4_identity_decimal_v1(value,3)`, IDs use
`point4_identity_bigint_v1`, source identity is `uuid:<lowercase-document-uuid>`,
lines sort by deterministic effect key, and unknown keys fail closed.

## 4. Duplicate-line projection

The sidecar is lossless for accepted client fields: every submitted line stores
its UID, product, normalized scale-3 quantity and nullable trimmed notes.
Duplicate products remain separate sidecar lines and digests.

Legacy projection intentionally matches the current product aggregate:

1. Group canonical sidecar lines by `product_id`.
2. Sum quantity at scale 3; overflow/precision loss fails closed.
3. Select notes with the existing Legacy expression
   `max(normalized_notes)`, ignoring NULL, under the operational database's
   current default collation. This is an intentional Legacy projection only;
   canonical line digests retain each line note and never digest the aggregate
   selected note.
4. Resolve name/unit/price/cost/offer server-side once for aggregate quantity.
5. Insert one Legacy item and reservation row per product.
6. `retail_reservation_identity_assert_projection_v1` verifies product sets and
   quantities. It does not claim per-line discount allocation; none exists in
   current behavior and none is invented.

## 5. Creation durability and retry ownership

The current browser is the creation-command owner. Identity V1 adds namespaced
per-command online retry records:
`localStorage['sharawlaRetailReservationCreatePendingV1:<document_uid>']` for
creation and
`localStorage['sharawlaRetailReservationMutationPendingV1:<client_tx_id>']` for
status commands. Per-command keys avoid one pending command overwriting another
across documents. Each value contains the contract version, operation,
client TX, document UID, source document ID and immutable original request;
transport timestamps are allowed but excluded from the economic digest. These
records are not Native Offline V2, an Outbox, background sync, or ACK ownership
and cannot execute offline.

Before first RPC it stores the immutable request including document UID,
creation TX and line UIDs. Retry/restart reloads the same record. It is removed
only after authoritative RPC result. A new command gets new identities.

Creation transaction order:

1. Validate/canonicalize and compute digest without DML.
2. Lock `point4-reservation-client-tx:<creation_client_tx_id>`, check both the
   document creation TX and mutation TX namespaces for conflicting reuse, then
   `point4-reservation-document:<document_uid>`.
3. Resolve TX/document replay or conflict.
4. Validate and lock product balances in product order, still without DML.
5. Insert Legacy website order and immediately its document sidecar; neither can
   commit without the other.
6. Insert every immutable sidecar line.
7. Insert deterministic Legacy aggregate items/reservations and expire eligible
   older Legacy reservations in the same transaction.
8. Assert projection, store result and commit.

Any error rolls everything back. Browser persistence owns ambiguous retry;
database durability begins atomically with the website order and sidecar.

## 6. Exact mutation idempotency

For human commands the browser/POS stores `{document_uid,client_tx_id,intent}`
under the mutation key above before RPC and retains it through authoritative
result. Each new accept/reject/cancel gets a new UUIDv4 TX; retry reuses it.

Every mutation RPC:

1. Validates intent and computes digest server-side.
2. Locks `point4-reservation-client-tx:<client_tx_id>`.
3. Looks up the TX across both document creation and mutation rows. Reuse by a
   different operation/document conflicts; same operation/document and same
   digest replays the stored result; same identity with a different digest
   conflicts.
4. Resolves document UID, locks sidecar and website order `FOR UPDATE`, then
   validates actor/state.
5. Inserts pending mutation, applies one Legacy transition, fills result fields
   once and commits. Failure rolls back the entire mutation.

| Mutation | Required state | Legacy effect | Stored/replayed result |
|---|---|---|---|
| accept | pending, unexpired | Existing POS creation; reservation consumed; order accepted | document UID, website/POS lineage, accepted status |
| reject | pending | Order rejected; active reservation released | document UID and rejected status |
| cancel | pending and normalized phone matches | Order cancelled; active reservation released | document UID and cancelled status |
| expire | pending and stored expiry <= DB time | Order/reservation expired | document UID and expired status |

Expiry is database-owned. The internal expiry RPC locks the document, checks the
unique expiry index, and generates one UUIDv4 with
`extensions.gen_random_uuid()` only when no durable expiry mutation exists. It
inserts mutation and effect in the same transaction. Rollback means no command
was committed; after commit, the unique expiry row is exact replay evidence.
Scheduling frequency is runtime operations, not an Identity migration decision.

## 7. Legacy/Canonical classification

- Legacy: no document sidecar. Existing RPCs remain unchanged. No read generates
  identity, no backfill occurs, and versioned creation never attaches a sidecar
  to a pre-existing order.
- Canonical Identity V1: one complete NOT NULL document sidecar and at least one
  complete line sidecar are created with the Legacy order in one transaction.
- Partial: impossible inside rows due NOT NULL/check/FK; incomplete RPC envelope
  fails before DML.
- DB IDs remain lookup/result lineage only.

Only versioned create may insert sidecars. Tables grant no direct mutation.

## 8. Named trigger/helper/RLS contract

- `retail_reservation_documents_identity_v1_immutable` and
  `retail_reservation_lines_identity_v1_immutable` execute
  `public.retail_reservation_identity_immutable_v1()` before UPDATE/DELETE.
- `retail_reservation_mutations_identity_v1_guard` executes
  `public.retail_reservation_mutation_guard_v1()` before UPDATE/DELETE.
- Exact helpers/RPCs, grants and policies are the manifest lists and maps.
- Digest helper consumes operation type, TX, document UID, branch, strict intent
  and strict lines. Resolver consumes operation type, TX and computed digest.

## 9. Decision register

| Finding | Classification | Resolution |
|---|---|---|
| Durable website retry owner | `RESOLVED BY CURRENT SOURCE/ARCHITECTURE` | Existing browser command owner gains online-only localStorage retry record; no Offline queue/sync/ACK owner. |
| Duplicate product semantics | `RESOLVED BY CURRENT SOURCE/ARCHITECTURE` | Sidecar preserves lines; Legacy intentionally aggregates product/quantity/note and calculates server offer once. |
| Expiry owner | `RESOLVED BY CURRENT SOURCE/ARCHITECTURE` | Internal DB expiry RPC atomically creates/persists system TX and effect. |
| Digest allowlists/encoding | `RESOLVED BY CURRENT SOURCE/ARCHITECTURE` | Strict allowlists; server-generated lowercase SHA-256 hex text. |
| Anonymous abuse/rate limit | `RESOLVED BY CURRENT SOURCE/ARCHITECTURE` | Preserve branch-open, payload-size, payment, phone and three-pending-orders-per-phone/branch/10-minute guards. Cancel preserves normalized-phone ownership. WAF remains optional defense-in-depth. |

No business/accounting decision remains for Identity schema implementation.
Canonical routing remains blocked by open 4B-2 concurrency.

## 10. RPC compatibility and later scope

The five manifest RPCs use new names. Existing positional signatures, grants and
callers remain untouched. No overload/default is added. Human UUID arguments are
text so lowercase UUIDv4 is validated before cast. Digests are server-generated.

Later implementation modifies exactly
`supabase-point4-reservation-identity-v1-contract.sql`,
`retail-website/app.js`, `retail-website-pos.js`,
`scripts/check-point4-reservation-identity-v1-contract.js`, `package.json`, and
`SHARAWLA_MASTER_STATUS.md`. The first file is the only new executable database
contract source and creates exactly the manifest objects; any timestamped
deployment wrapper is a later separately approved deployment artifact.

Published beta17/beta18, Point 4B-1/4B-2, Batch 1/3 and Offline V2 remain
unchanged. No backfill, automatic sidecar attachment, stock writer call,
dual-write, routing or ownership switch is permitted.

Implementation order: migration source → static/security review → isolated Beta
read-only preflight → explicit apply approval → DB contract acceptance →
website/POS propagation → runtime acceptance. Canonical routing is a later gate
after genuine 4B-2 concurrency acceptance.
