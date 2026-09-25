-- Sharawla POS Point 4
-- Transitive Frozen Evidence V1 — additive schema only.
-- SOURCE-ONLY: this file is not a cutover, deployment, or activation.
--
-- Contract:
--   * Evidence is durable only after all ownership guards succeed.
--   * (client_tx_id, line_uid) binds to exactly one order_item_id.
--   * Existing food snapshots remain unchanged.

create table if not exists public.food_operation_frozen_evidence (
  client_tx_id text primary key,
  contract_version text not null
    check (contract_version = 'sharawla.point4.food-frozen-evidence.v1'),
  order_id bigint not null,
  branch_id bigint not null,
  resolution_instant timestamptz not null,
  context_digest text not null,
  context_json jsonb not null,
  created_at timestamptz not null default now(),

  constraint food_operation_frozen_evidence_client_tx_nonempty
    check (btrim(client_tx_id) <> ''),
  constraint food_operation_frozen_evidence_digest_nonempty
    check (btrim(context_digest) <> ''),
  constraint food_operation_frozen_evidence_context_object
    check (jsonb_typeof(context_json) = 'object'),
  constraint food_operation_frozen_evidence_order_fk
    foreign key (order_id) references public.orders(id) on delete cascade,
  constraint food_operation_frozen_evidence_order_unique
    unique (order_id),
  constraint food_operation_frozen_evidence_operation_order_unique
    unique (client_tx_id, order_id)
);

create table if not exists public.food_operation_frozen_evidence_lines (
  client_tx_id text not null,
  line_uid uuid not null,
  order_item_id bigint not null,
  order_id bigint not null,
  branch_id bigint not null,
  line_ordinal integer not null,
  recipe_version_id bigint,
  execution_evidence jsonb not null,
  evidence_digest text not null,
  created_at timestamptz not null default now(),

  constraint food_operation_frozen_evidence_lines_pk
    primary key (client_tx_id, line_uid),

  -- Durable binding invariant:
  -- one operation line maps to one generated order item, and one generated
  -- order item cannot be rebound to another line within or across operations.
  constraint food_operation_frozen_evidence_lines_order_item_unique
    unique (order_item_id),

  constraint food_operation_frozen_evidence_lines_ordinal_unique
    unique (client_tx_id, line_ordinal),

  constraint food_operation_frozen_evidence_lines_ordinal_positive
    check (line_ordinal > 0),
  constraint food_operation_frozen_evidence_lines_digest_nonempty
    check (btrim(evidence_digest) <> ''),
  constraint food_operation_frozen_evidence_lines_evidence_object
    check (jsonb_typeof(execution_evidence) = 'object'),

  constraint food_operation_frozen_evidence_lines_header_fk
    foreign key (client_tx_id, order_id)
    references public.food_operation_frozen_evidence(client_tx_id, order_id)
    on delete cascade,

  constraint food_operation_frozen_evidence_lines_order_item_fk
    foreign key (order_item_id)
    references public.order_items(id)
    on delete cascade,

  constraint food_operation_frozen_evidence_lines_recipe_version_fk
    foreign key (recipe_version_id)
    references public.food_recipe_versions(id)
    on delete restrict
);

comment on table public.food_operation_frozen_evidence is
  'Point4 additive immutable operation-level Food evidence. Must be persisted only after ownership guards succeed.';

comment on table public.food_operation_frozen_evidence_lines is
  'Point4 additive immutable per-line Food execution evidence and durable client_tx_id+line_uid to order_item_id binding.';

comment on constraint food_operation_frozen_evidence_lines_order_item_unique
  on public.food_operation_frozen_evidence_lines is
  'Prevents contradictory rebinding of a generated order_item_id to another frozen operation line.';
