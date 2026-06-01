-- Enhanced Invoice Schema Migration
-- Adds customers table and improves data structure

-- Create customers table (from ACCOUNT_MASTER)
-- Create without foreign key first, then add constraint separately
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  account_id integer unique, -- Original MSSQL account ID
  company_id uuid, -- Will add FK constraint separately
  
  -- Customer details
  full_name text not null,
  short_name text,
  address text,
  city text,
  state_id integer,
  pincode text,
  telephone text,
  email text,
  vat_tin text,
  cst_tin text,
  gst_number text,
  contact_person text,
  
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
      and constraint_name = 'customers_company_id_fkey'
    ) then
      alter table public.customers 
      add constraint customers_company_id_fkey 
      foreign key (company_id) references public.companies(id) on delete set null;
    end if;
  end if;
exception when others then
  -- Constraint might already exist, ignore error
  null;
end $$;

-- Update products table to include more fields
-- Add columns first, then add unique constraint separately
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'products'
  ) then
    alter table public.products 
      add column if not exists product_id integer,
      add column if not exists catalogue_number text,
      add column if not exists description text,
      add column if not exists cas_number text,
      add column if not exists packing_id integer,
      add column if not exists pack_quantity numeric(18, 3),
      add column if not exists catalogue_price numeric(18, 2),
      add column if not exists mrp numeric(18, 2);
    
    -- Add unique constraint on catalogue_number if it doesn't exist
    if not exists (
      select 1 from information_schema.table_constraints 
      where constraint_schema = 'public' 
      and constraint_name = 'products_catalogue_number_key'
    ) then
      -- Only add unique constraint if there are no duplicate values
      if not exists (
        select catalogue_number 
        from public.products 
        where catalogue_number is not null
        group by catalogue_number 
        having count(*) > 1
      ) then
        alter table public.products 
        add constraint products_catalogue_number_key unique (catalogue_number);
      end if;
    end if;
  end if;
exception when others then
  -- Ignore errors if columns already exist or constraint already exists
  null;
end $$;

-- Update invoices table to link to customers
-- Add column first, then add foreign key constraint
alter table public.invoices
  add column if not exists customer_id uuid;

-- Add foreign key constraint for customer_id if customers table exists
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'customers'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'customers' and column_name = 'id'
  ) then
    if not exists (
      select 1 from information_schema.table_constraints 
      where constraint_schema = 'public' 
      and constraint_name = 'invoices_customer_id_fkey'
    ) then
      alter table public.invoices 
      add constraint invoices_customer_id_fkey 
      foreign key (customer_id) references public.customers(id) on delete set null;
    end if;
  end if;
exception when others then
  -- Constraint might already exist, ignore error
  null;
end $$;

-- Update invoice_items to store product details properly
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'invoice_items'
  ) then
    alter table public.invoice_items
      add column if not exists product_catalogue_number text,
      add column if not exists product_description text,
      add column if not exists product_cas_number text,
      add column if not exists packing_id integer,
      add column if not exists pack_quantity numeric(18, 3),
      add column if not exists product_catalogue_price numeric(18, 2),
      add column if not exists product_mrp numeric(18, 2);
  end if;
exception when others then
  -- Ignore errors if columns already exist
  null;
end $$;

-- Create indexes
create index if not exists customers_account_id_idx on public.customers(account_id);
create index if not exists customers_company_id_idx on public.customers(company_id);
create index if not exists products_catalogue_number_idx on public.products(catalogue_number);
create index if not exists products_product_id_idx on public.products(product_id);
create index if not exists invoices_customer_id_idx on public.invoices(customer_id);

-- Enable RLS
alter table public.customers enable row level security;

-- RLS Policies
create policy customers_read on public.customers
  for select
  to authenticated
  using (true);

create policy customers_service_insert on public.customers
  for insert
  to service_role
  with check (true);

create policy customers_service_update on public.customers
  for update
  to service_role
  using (true);
