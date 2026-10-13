CREATE TABLE public.audit_logs (
  id bigint NOT NULL,
  employee_id bigint,
  branch_id bigint,
  action text NOT NULL,
  entity_type text,
  entity_id bigint,
  details jsonb,
  created_at timestamp with time zone DEFAULT now(),
  business_id uuid
);
CREATE TABLE public.branch_invoice_counters (
  branch_id bigint NOT NULL,
  next_number bigint NOT NULL DEFAULT 1,
  business_id uuid NOT NULL
);
CREATE TABLE public.branch_payment_methods (
  branch_id bigint NOT NULL,
  payment_method_id bigint NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  website_enabled boolean NOT NULL DEFAULT false,
  payment_account text,
  payment_instructions text,
  allow_reference boolean NOT NULL DEFAULT true,
  allow_receipt_upload boolean NOT NULL DEFAULT true,
  business_id uuid NOT NULL
);
CREATE TABLE public.branches (
  id bigint NOT NULL,
  name text NOT NULL,
  address text,
  phone text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  website_orders_enabled boolean NOT NULL DEFAULT true,
  website_orders_paused_until timestamp with time zone,
  prep_time_min integer NOT NULL DEFAULT 30,
  prep_time_max integer NOT NULL DEFAULT 45,
  website_visible boolean NOT NULL DEFAULT true,
  sort_order integer,
  location_url text,
  whatsapp text,
  location_type text NOT NULL DEFAULT 'branch'::text,
  location_code text,
  business_id uuid
);
CREATE TABLE public.business_auth_memberships (
  auth_user_id uuid NOT NULL,
  business_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'migration'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.business_device_bindings (
  device_id uuid NOT NULL,
  business_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL,
  verified_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.delivery_drivers (
  id bigint NOT NULL,
  name text NOT NULL,
  phone text,
  branch_id bigint,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  business_id uuid
);
CREATE TABLE public.delivery_payment_events (
  id bigint NOT NULL,
  order_id bigint NOT NULL,
  branch_id bigint NOT NULL,
  driver_id bigint,
  employee_id bigint,
  client_tx_id text NOT NULL,
  event_type text NOT NULL,
  old_method text,
  new_method text NOT NULL,
  custody_before numeric(12,2) NOT NULL DEFAULT 0,
  custody_after numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  business_id uuid
);
CREATE TABLE public.driver_settlement_items (
  id bigint NOT NULL,
  settlement_id bigint NOT NULL,
  order_id bigint NOT NULL,
  source_shift_id bigint,
  amount numeric(12,2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reversed_at timestamp with time zone,
  business_id uuid
);
CREATE TABLE public.employee_action_permissions_v2 (
  employee_id bigint NOT NULL,
  action_code text NOT NULL,
  allowed boolean NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  business_id uuid NOT NULL
);
CREATE TABLE public.employee_branches (
  employee_id bigint NOT NULL,
  branch_id bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  business_id uuid NOT NULL
);
CREATE TABLE public.employee_permissions (
  employee_id bigint NOT NULL,
  permission_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  business_id uuid NOT NULL
);
CREATE TABLE public.employees (
  id bigint NOT NULL,
  name text NOT NULL,
  username text NOT NULL,
  pin text,
  role text DEFAULT 'cashier'::text,
  branch_id bigint,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  auth_user_id uuid,
  business_id uuid
);
CREATE TABLE public.offline_customer_delivery_receipts_v1 (
  client_tx_id text NOT NULL,
  operation_type text NOT NULL,
  payload_digest text NOT NULL,
  entity_id bigint,
  result_json jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  business_id uuid NOT NULL
);
CREATE TABLE public.offline_order_status_receipts_v2 (
  client_tx_id text NOT NULL,
  order_id bigint NOT NULL,
  target_status text NOT NULL,
  result_json jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  business_id uuid NOT NULL
);
CREATE TABLE public.offline_v2_domain_events (
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id bigint,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  source text NOT NULL DEFAULT 'cloud'::text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  business_id uuid NOT NULL
);
CREATE TABLE public.order_payments (
  id bigint NOT NULL,
  order_id bigint NOT NULL,
  method text NOT NULL,
  amount numeric(12,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  business_id uuid
);
CREATE TABLE public.orders (
  id bigint NOT NULL,
  branch_id bigint,
  employee_id bigint,
  customer_id bigint,
  shift_id bigint,
  order_type text DEFAULT 'takeaway'::text,
  payment_method text DEFAULT 'cash'::text,
  subtotal numeric(12,2) DEFAULT 0,
  discount numeric(12,2) DEFAULT 0,
  delivery_fee numeric(12,2) DEFAULT 0,
  total numeric(12,2) DEFAULT 0,
  status text DEFAULT 'completed'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  source text NOT NULL DEFAULT 'pos'::text,
  customer_phone text,
  delivery_address text,
  delivery_zone_id bigint,
  driver_id bigint,
  assigned_at timestamp with time zone,
  delivered_at timestamp with time zone,
  cancelled_reason text,
  order_number text,
  customer_name text,
  delivery_area text,
  driver_settled_at timestamp with time zone,
  invoice_number bigint,
  bon_number integer,
  discount_type text,
  discount_value numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  service_amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'unpaid'::text,
  website_order_id bigint,
  payment_reference text,
  payment_receipt_path text,
  promo_code_id bigint,
  promo_code text,
  promo_discount numeric(12,2) NOT NULL DEFAULT 0,
  client_tx_id text,
  delivery_cash_custody_amount numeric(12,2) NOT NULL DEFAULT 0,
  delivery_payment_finalized_at timestamp with time zone,
  delivery_payment_finalized_by bigint,
  business_id uuid
);
CREATE TABLE public.payment_methods (
  id bigint NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'other'::text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  business_id uuid
);
CREATE TABLE public.shift_bon_counters (
  shift_id bigint NOT NULL,
  branch_id bigint NOT NULL,
  next_number integer NOT NULL DEFAULT 1,
  business_id uuid NOT NULL
);
CREATE TABLE public.shifts (
  id bigint NOT NULL,
  branch_id bigint,
  employee_id bigint,
  opening_cash numeric(12,2) DEFAULT 0,
  closing_cash numeric(12,2),
  opened_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone,
  status text DEFAULT 'open'::text,
  closed_by_employee_id bigint,
  sales_total numeric(12,2) NOT NULL DEFAULT 0,
  cash_sales numeric(12,2) NOT NULL DEFAULT 0,
  wallet_sales numeric(12,2) NOT NULL DEFAULT 0,
  instapay_sales numeric(12,2) NOT NULL DEFAULT 0,
  expenses_total numeric(12,2) NOT NULL DEFAULT 0,
  expected_cash numeric(12,2) NOT NULL DEFAULT 0,
  cash_difference numeric(12,2) NOT NULL DEFAULT 0,
  orders_count integer NOT NULL DEFAULT 0,
  close_notes text,
  client_open_tx_id text,
  client_close_tx_id text,
  cash_sales_gross numeric(12,2) NOT NULL DEFAULT 0,
  cash_returns_total numeric(12,2) NOT NULL DEFAULT 0,
  delivery_cash_originated numeric(12,2) NOT NULL DEFAULT 0,
  driver_custody_unsettled numeric(12,2) NOT NULL DEFAULT 0,
  driver_settlements_received numeric(12,2) NOT NULL DEFAULT 0,
  business_id uuid
);
