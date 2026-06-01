create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null unique,
  unit text not null default 'kg',
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null check (role in ('super_admin', 'distributor', 'warehouse')),
  company_id uuid references public.companies(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  company_id uuid not null references public.companies(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  status text not null,
  expected_dispatch_date date,
  expected_delivery_date date,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12, 2) not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists order_items_order_product_uniq
  on public.order_items(order_id, product_id);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  available_qty numeric(14, 2) not null default 0,
  reorder_level numeric(14, 2) not null default 30,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists inventory_warehouse_product_uniq
  on public.inventory(warehouse_id, product_id);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open',
  warehouse_id uuid references public.warehouses(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.chatbot_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'distributor', 'warehouse')),
  message text not null,
  response text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists orders_company_idx on public.orders(company_id);
create index if not exists orders_warehouse_idx on public.orders(warehouse_id);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists inventory_warehouse_idx on public.inventory(warehouse_id);
create index if not exists chatbot_messages_user_idx on public.chatbot_messages(user_id);
