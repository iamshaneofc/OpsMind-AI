-- Migration to add invoice tables for importing MSSQL invoice data

-- Ensure required tables exist (they should from init_schema migration)
-- If they don't exist, this migration will fail - which is expected behavior

-- Create invoices table (header)
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_id integer unique, -- Original MSSQL invoice ID
  invoice_number text not null,
  invoice_date timestamptz not null,
  prompt_1 text,
  prompt_2 text,
  prompt_3 text,
  prompt_4 text,
  prompt_5 text,
  base_amount numeric(18, 2) not null default 0,
  discount_amount numeric(18, 2) not null default 0,
  excise_amount numeric(18, 2) not null default 0,
  tax_amount numeric(18, 2) not null default 0,
  item_amount numeric(18, 2) not null default 0,
  invoice_total_amount numeric(18, 2) not null default 0,
  confirmed boolean not null default false,
  transport_name text,
  vehicle_number text,
  date_of_removal timestamptz,
  
  -- Links to existing tables (only add FK if tables exist)
  company_id uuid,
  account_id integer, -- Original MSSQL account ID
  
  -- Customer details (denormalized for quick access)
  customer_full_name text,
  customer_short_name text,
  customer_address text,
  customer_city text,
  customer_pincode text,
  customer_telephone text,
  customer_email text,
  customer_vat_tin text,
  customer_cst_tin text,
  customer_gst_number text,
  customer_contact_person text,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add foreign key constraint for company_id if companies table exists
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'companies'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'companies' and column_name = 'id'
  ) then
    if not exists (
      select 1 from information_schema.table_constraints 
      where constraint_schema = 'public' 
      and constraint_name = 'invoices_company_id_fkey'
    ) then
      alter table public.invoices 
      add constraint invoices_company_id_fkey 
      foreign key (company_id) references public.companies(id) on delete set null;
    end if;
  end if;
exception when others then
  -- Constraint might already exist, ignore error
  null;
end $$;

-- Create invoice_items table (body)
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  invoice_body_id integer, -- Original MSSQL invoice body ID
  order_body_id integer, -- Original MSSQL order body ID
  
  -- Product details
  product_id uuid,
  product_catalogue_number text,
  product_description text,
  product_cas_number text,
  packing_id integer, -- Original MSSQL packing ID
  pack_quantity numeric(18, 3),
  product_catalogue_price numeric(18, 2),
  product_mrp numeric(18, 2),
  
  -- Quantities and amounts
  invoice_quantity integer not null default 0,
  order_quantity integer,
  net_order_quantity integer,
  
  -- Pricing
  order_price numeric(18, 2),
  order_net_price numeric(18, 2),
  order_discount_percentage numeric(5, 2),
  order_item_total_amount numeric(18, 2),
  invoice_line_base_amount numeric(18, 2) not null default 0,
  invoice_line_discount_amount numeric(18, 2) not null default 0,
  invoice_line_excise_amount numeric(18, 2) not null default 0,
  invoice_line_tax_amount numeric(18, 2) not null default 0,
  invoice_line_item_amount numeric(18, 2) not null default 0,
  
  -- Tax details
  sgst_percent numeric(5, 2),
  cgst_percent numeric(5, 2),
  igst_percent numeric(5, 2),
  sgst_amount numeric(18, 2),
  cgst_amount numeric(18, 2),
  igst_amount numeric(18, 2),
  
  -- Additional details
  order_product_printing_name text,
  order_remarks text,
  
  created_at timestamptz not null default now()
);

-- Add foreign key constraints for invoice_items
do $$
begin
  -- Add invoice_id foreign key
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_schema = 'public' 
    and constraint_name = 'invoice_items_invoice_id_fkey'
  ) then
    alter table public.invoice_items 
    add constraint invoice_items_invoice_id_fkey 
    foreign key (invoice_id) references public.invoices(id) on delete cascade;
  end if;
  
  -- Add product_id foreign key if products table exists
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'products'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'products' and column_name = 'id'
  ) then
    if not exists (
      select 1 from information_schema.table_constraints 
      where constraint_schema = 'public' 
      and constraint_name = 'invoice_items_product_id_fkey'
    ) then
      alter table public.invoice_items 
      add constraint invoice_items_product_id_fkey 
      foreign key (product_id) references public.products(id) on delete set null;
    end if;
  end if;
exception when others then
  -- Constraint might already exist, ignore error
  null;
end $$;

-- Create invoice_orders table to link invoices to orders
create table if not exists public.invoice_orders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  order_id uuid,
  order_number text, -- Original MSSQL order number
  order_date timestamptz,
  customer_po_number text,
  customer_po_date timestamptz,
  order_total_amount numeric(18, 2),
  payment_terms integer,
  created_at timestamptz not null default now()
);

-- Add foreign key constraints for invoice_orders
do $$
begin
  -- Add invoice_id foreign key
  if not exists (
    select 1 from information_schema.table_constraints 
    where constraint_schema = 'public' 
    and constraint_name = 'invoice_orders_invoice_id_fkey'
  ) then
    alter table public.invoice_orders 
    add constraint invoice_orders_invoice_id_fkey 
    foreign key (invoice_id) references public.invoices(id) on delete cascade;
  end if;
  
  -- Add order_id foreign key if orders table exists
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'orders'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'orders' and column_name = 'id'
  ) then
    if not exists (
      select 1 from information_schema.table_constraints 
      where constraint_schema = 'public' 
      and constraint_name = 'invoice_orders_order_id_fkey'
    ) then
      alter table public.invoice_orders 
      add constraint invoice_orders_order_id_fkey 
      foreign key (order_id) references public.orders(id) on delete set null;
    end if;
  end if;
exception when others then
  -- Constraint might already exist, ignore error
  null;
end $$;

-- Create indexes for better query performance
create index if not exists invoices_invoice_id_idx on public.invoices(invoice_id);
create index if not exists invoices_invoice_number_idx on public.invoices(invoice_number);
create index if not exists invoices_invoice_date_idx on public.invoices(invoice_date);
create index if not exists invoices_company_id_idx on public.invoices(company_id);
create index if not exists invoices_account_id_idx on public.invoices(account_id);

create index if not exists invoice_items_invoice_id_idx on public.invoice_items(invoice_id);
create index if not exists invoice_items_product_id_idx on public.invoice_items(product_id);
create index if not exists invoice_items_order_body_id_idx on public.invoice_items(order_body_id);

create index if not exists invoice_orders_invoice_id_idx on public.invoice_orders(invoice_id);
create index if not exists invoice_orders_order_id_idx on public.invoice_orders(order_id);

-- Enable RLS
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_orders enable row level security;

-- RLS Policies - allow authenticated users to read
create policy invoices_read on public.invoices
  for select
  to authenticated
  using (true);

create policy invoice_items_read on public.invoice_items
  for select
  to authenticated
  using (true);

create policy invoice_orders_read on public.invoice_orders
  for select
  to authenticated
  using (true);

-- Allow service role to insert/update (for import script)
create policy invoices_service_insert on public.invoices
  for insert
  to service_role
  with check (true);

create policy invoices_service_update on public.invoices
  for update
  to service_role
  using (true);

create policy invoice_items_service_insert on public.invoice_items
  for insert
  to service_role
  with check (true);

create policy invoice_orders_service_insert on public.invoice_orders
  for insert
  to service_role
  with check (true);
