-- Datos de negocio. Cada tabla lleva tenant_id y sus políticas RLS están en la migración siguiente.
-- Importes en céntimos (bigint) y porcentajes en numeric, igual que el modelo del frontend.
-- Los ids son uuid; el frontend deberá generarlos con crypto.randomUUID() al migrar del localStorage.

alter table public.tenants
  add column legal_name text,
  add column tax_id text not null default '',
  add column email text not null default '',
  add column phone text not null default '',
  add column address text,
  add column postal_code text,
  add column city text,
  add column website text,
  add column iban text,
  add column default_vat_rate numeric(5, 2) not null default 21 check (default_vat_rate between 0 and 100),
  add column default_deposit_percent numeric(5, 2) not null default 30
    check (default_deposit_percent between 0 and 100),
  add column next_estimate_number integer not null default 1 check (next_estimate_number >= 1),
  add column next_invoice_number integer not null default 1 check (next_invoice_number >= 1),
  add column updated_at timestamptz not null default now();

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  tax_id text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Permite que otras tablas apunten a (id, tenant_id) y así nunca crucen empresas.
  unique (id, tenant_id)
);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  sku text not null default '',
  name text not null check (char_length(name) between 1 and 160),
  kind text not null check (kind in ('material', 'labor', 'other')),
  category text not null default '',
  unit text not null default 'ud',
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Lo asigna el trigger (P-AAAA-NNN); el valor enviado por el cliente se ignora.
  number text not null default '',
  client_id uuid not null,
  title text not null default 'Nueva reforma' check (char_length(title) <= 200),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  vat_rate numeric(5, 2) not null default 21 check (vat_rate between 0 and 100),
  clauses text not null default '',
  valid_until date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, number),
  foreign key (client_id, tenant_id) references public.clients (id, tenant_id) on delete restrict
);

create table public.estimate_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  estimate_id uuid not null,
  catalog_item_id uuid,
  position integer not null default 0,
  description text not null default '',
  kind text not null check (kind in ('material', 'labor', 'other')),
  unit text not null default 'ud',
  quantity numeric(12, 3) not null default 1 check (quantity >= 0),
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  foreign key (estimate_id, tenant_id) references public.estimates (id, tenant_id) on delete cascade,
  foreign key (catalog_item_id, tenant_id) references public.catalog_items (id, tenant_id)
    on delete set null (catalog_item_id)
);

create table public.estimate_milestones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  estimate_id uuid not null,
  position integer not null default 0,
  label text not null check (char_length(label) between 1 and 160),
  description text,
  percent numeric(5, 2) not null check (percent between 0 and 100),
  unique (id, tenant_id),
  foreign key (estimate_id, tenant_id) references public.estimates (id, tenant_id) on delete cascade
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  entry_date date not null,
  concept text not null check (char_length(concept) between 1 and 200),
  category text not null default '',
  -- Importe bruto (IVA incluido); el IVA se extrae con vat_rate.
  amount_cents bigint not null check (amount_cents > 0),
  vat_rate numeric(5, 2) not null default 21 check (vat_rate between 0 and 100),
  estimate_id uuid,
  milestone_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (estimate_id, tenant_id) references public.estimates (id, tenant_id)
    on delete set null (estimate_id),
  foreign key (milestone_id, tenant_id) references public.estimate_milestones (id, tenant_id)
    on delete set null (milestone_id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Lo asigna el trigger (F-AAAA-NNN).
  number text not null default '',
  estimate_id uuid not null,
  milestone_id uuid not null,
  client_id uuid not null,
  concept text not null check (char_length(concept) between 1 and 200),
  total_cents bigint not null check (total_cents >= 0),
  vat_rate numeric(5, 2) not null default 21 check (vat_rate between 0 and 100),
  status text not null default 'issued' check (status in ('issued', 'sent', 'paid')),
  issued_at date not null default current_date,
  due_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, number),
  -- Un hito solo se factura una vez.
  unique (estimate_id, milestone_id),
  foreign key (estimate_id, tenant_id) references public.estimates (id, tenant_id) on delete restrict,
  foreign key (milestone_id, tenant_id) references public.estimate_milestones (id, tenant_id) on delete restrict,
  foreign key (client_id, tenant_id) references public.clients (id, tenant_id) on delete restrict
);

-- Índices de apoyo para filtros por empresa y claves foráneas.
create index clients_tenant_idx on public.clients (tenant_id);
create index catalog_items_tenant_idx on public.catalog_items (tenant_id);
create index estimates_tenant_created_idx on public.estimates (tenant_id, created_at desc);
create index estimates_client_idx on public.estimates (client_id);
create index estimate_lines_estimate_idx on public.estimate_lines (estimate_id, position);
create index estimate_milestones_estimate_idx on public.estimate_milestones (estimate_id, position);
create index ledger_entries_tenant_date_idx on public.ledger_entries (tenant_id, entry_date desc);
create index ledger_entries_estimate_idx on public.ledger_entries (estimate_id);
create index invoices_tenant_issued_idx on public.invoices (tenant_id, issued_at desc);
create index invoices_client_idx on public.invoices (client_id);
