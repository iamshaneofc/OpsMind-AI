-- Migration: Add Proforma Invoices and Order Status Tracking
-- This migration adds support for the Order → Proforma Invoice → Final Invoice hierarchy

-- ============================================================================
-- 1. Add Order Status and ETA Fields
-- ============================================================================

-- Add order status and ETA tracking fields to orders table
do $$
begin
  -- Add original_eta if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'orders' 
    and column_name = 'original_eta'
  ) then
    alter table public.orders add column original_eta date;
  end if;
  
  -- Add revised_eta if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'orders' 
    and column_name = 'revised_eta'
  ) then
    alter table public.orders add column revised_eta date;
  end if;
  
  -- Add order_status if it doesn't exist (replaces generic 'status')
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'orders' 
    and column_name = 'order_status'
  ) then
    alter table public.orders add column order_status text 
      check (order_status in ('Delivered', 'Work in Progress', 'Running Late', 'Cancelled'));
  end if;
  
  -- Add delay_reason if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'orders' 
    and column_name = 'delay_reason'
  ) then
    alter table public.orders add column delay_reason text;
  end if;
  
  -- Add delivery_date if it doesn't exist (for tracking actual delivery)
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'orders' 
    and column_name = 'delivery_date'
  ) then
    alter table public.orders add column delivery_date date;
  end if;
end $$;

-- ============================================================================
-- 2. Create Proforma Invoices Table
-- ============================================================================

-- Create table without foreign keys first
create table if not exists public.proforma_invoices (
  id uuid primary key default gen_random_uuid(),
  proforma_number text unique not null, -- Proforma invoice number
  order_id uuid, -- Will add FK constraint separately
  company_id uuid, -- Will add FK constraint separately
  
  -- Proforma invoice details
  proforma_date timestamptz not null default now(),
  status text default 'Pending', -- Pending, Generated, Invoiced, Cancelled
  
  -- Amounts
  total_amount numeric(18, 2) not null default 0,
  base_amount numeric(18, 2) not null default 0,
  tax_amount numeric(18, 2) not null default 0,
  
  -- Additional details
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add foreign key constraints separately
do $$
begin
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
      and constraint_name = 'proforma_invoices_order_id_fkey'
    ) then
      alter table public.proforma_invoices 
      add constraint proforma_invoices_order_id_fkey 
      foreign key (order_id) references public.orders(id) on delete cascade;
    end if;
  end if;
  
  -- Add company_id foreign key if companies table exists
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
      and constraint_name = 'proforma_invoices_company_id_fkey'
    ) then
      alter table public.proforma_invoices 
      add constraint proforma_invoices_company_id_fkey 
      foreign key (company_id) references public.companies(id) on delete set null;
    end if;
  end if;
exception when others then
  -- Constraints might already exist, ignore error
  null;
end $$;

-- ============================================================================
-- 3. Create Proforma Invoice Items Table
-- ============================================================================

-- Create table without foreign keys first
create table if not exists public.proforma_invoice_items (
  id uuid primary key default gen_random_uuid(),
  proforma_invoice_id uuid not null, -- Will add FK constraint separately
  order_item_id uuid, -- Will add FK constraint separately
  product_id uuid, -- Will add FK constraint separately
  
  -- Item details
  quantity numeric(18, 3) not null default 0,
  unit_price numeric(18, 2) not null default 0,
  total_price numeric(18, 2) not null default 0,
  
  -- Product information (denormalized for quick access)
  product_name text,
  product_sku text,
  product_description text,
  
  created_at timestamptz not null default now()
);

-- Add foreign key constraints separately
do $$
begin
  -- Add proforma_invoice_id foreign key
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'proforma_invoices'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'proforma_invoices' and column_name = 'id'
  ) then
    if not exists (
      select 1 from information_schema.table_constraints 
      where constraint_schema = 'public' 
      and constraint_name = 'proforma_invoice_items_proforma_invoice_id_fkey'
    ) then
      alter table public.proforma_invoice_items 
      add constraint proforma_invoice_items_proforma_invoice_id_fkey 
      foreign key (proforma_invoice_id) references public.proforma_invoices(id) on delete cascade;
    end if;
  end if;
  
  -- Add order_item_id foreign key if order_items table exists
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'order_items'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'order_items' and column_name = 'id'
  ) then
    if not exists (
      select 1 from information_schema.table_constraints 
      where constraint_schema = 'public' 
      and constraint_name = 'proforma_invoice_items_order_item_id_fkey'
    ) then
      alter table public.proforma_invoice_items 
      add constraint proforma_invoice_items_order_item_id_fkey 
      foreign key (order_item_id) references public.order_items(id) on delete set null;
    end if;
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
      and constraint_name = 'proforma_invoice_items_product_id_fkey'
    ) then
      alter table public.proforma_invoice_items 
      add constraint proforma_invoice_items_product_id_fkey 
      foreign key (product_id) references public.products(id) on delete set null;
    end if;
  end if;
exception when others then
  -- Constraints might already exist, ignore error
  null;
end $$;

-- ============================================================================
-- 4. Link Invoices to Proforma Invoices
-- ============================================================================

-- Add proforma_invoice_id to invoices table
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'invoices' 
    and column_name = 'proforma_invoice_id'
  ) then
    alter table public.invoices add column proforma_invoice_id uuid 
      references public.proforma_invoices(id) on delete set null;
  end if;
end $$;

-- ============================================================================
-- 5. Add Item Status Tracking to Order Items
-- ============================================================================

do $$
begin
  -- Add item_status if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'order_items' 
    and column_name = 'item_status'
  ) then
    alter table public.order_items add column item_status text 
      check (item_status in ('Ordered', 'Processed', 'Pending', 'Delayed', 'Cancelled'));
  end if;
  
  -- Add processed_quantity if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'order_items' 
    and column_name = 'processed_quantity'
  ) then
    alter table public.order_items add column processed_quantity numeric(12, 2) default 0;
  end if;
  
  -- Add pending_quantity if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'order_items' 
    and column_name = 'pending_quantity'
  ) then
    alter table public.order_items add column pending_quantity numeric(12, 2) default 0;
  end if;
  
  -- Add delayed_quantity if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'order_items' 
    and column_name = 'delayed_quantity'
  ) then
    alter table public.order_items add column delayed_quantity numeric(12, 2) default 0;
  end if;
end $$;

-- ============================================================================
-- 6. Create Indexes for Performance
-- ============================================================================

create index if not exists proforma_invoices_order_id_idx on public.proforma_invoices(order_id);
create index if not exists proforma_invoices_company_id_idx on public.proforma_invoices(company_id);
create index if not exists proforma_invoices_proforma_number_idx on public.proforma_invoices(proforma_number);
create index if not exists proforma_invoice_items_proforma_id_idx on public.proforma_invoice_items(proforma_invoice_id);
create index if not exists invoices_proforma_invoice_id_idx on public.invoices(proforma_invoice_id);
create index if not exists orders_order_status_idx on public.orders(order_status);
create index if not exists orders_original_eta_idx on public.orders(original_eta);
create index if not exists orders_revised_eta_idx on public.orders(revised_eta);

-- ============================================================================
-- 7. Create Function to Calculate Order Status
-- ============================================================================

create or replace function public.calculate_order_status(
  p_order_id uuid
) returns text
language plpgsql
stable
as $$
declare
  v_order record;
  v_today date;
  v_eta_date date;
  v_delivery_date date;
  v_status text;
begin
  -- Get order details
  select 
    original_eta,
    revised_eta,
    delivery_date,
    order_status,
    status as old_status
  into v_order
  from public.orders
  where id = p_order_id;
  
  if not found then
    return null;
  end if;
  
  v_today := current_date;
  v_eta_date := coalesce(v_order.revised_eta, v_order.original_eta);
  v_delivery_date := v_order.delivery_date;
  
  -- If already has explicit order_status, use it (unless needs recalculation)
  if v_order.order_status is not null and v_order.order_status != 'Running Late' then
    return v_order.order_status;
  end if;
  
  -- Check if delivered
  if v_delivery_date is not null then
    return 'Delivered';
  end if;
  
  -- Check if cancelled (from old status field)
  if v_order.old_status = 'CANCELLED' or v_order.order_status = 'Cancelled' then
    return 'Cancelled';
  end if;
  
  -- Check if running late
  if v_eta_date is not null and v_today > v_eta_date then
    return 'Running Late';
  end if;
  
  -- Default to work in progress
  return 'Work in Progress';
end;
$$;

-- ============================================================================
-- 8. Create Function to Update Order Status Automatically
-- ============================================================================

create or replace function public.update_order_status()
returns trigger
language plpgsql
as $$
begin
  -- Auto-calculate order status when ETA or delivery date changes
  update public.orders
  set order_status = public.calculate_order_status(new.id)
  where id = new.id;
  
  return new;
end;
$$;

-- Create trigger to auto-update order status
drop trigger if exists orders_auto_update_status on public.orders;
create trigger orders_auto_update_status
  before insert or update of original_eta, revised_eta, delivery_date, status
  on public.orders
  for each row
  execute function public.update_order_status();

-- ============================================================================
-- 9. Create Function to Calculate Item Status
-- ============================================================================

create or replace function public.calculate_item_status(
  p_order_item_id uuid
) returns jsonb
language plpgsql
stable
as $$
declare
  v_item record;
  v_processed numeric;
  v_pending numeric;
  v_delayed numeric;
  v_result jsonb;
begin
  -- Get order item
  select quantity, processed_quantity, pending_quantity, delayed_quantity
  into v_item
  from public.order_items
  where id = p_order_item_id;
  
  if not found then
    return null;
  end if;
  
  -- Calculate processed quantity from invoices
  select coalesce(sum(invoice_quantity), 0)
  into v_processed
  from public.invoice_items ii
  join public.invoices i on ii.invoice_id = i.id
  where ii.product_id = (
    select product_id from public.order_items where id = p_order_item_id
  )
  and i.invoice_id in (
    select invoice_id 
    from public.invoice_orders io
    join public.orders o on io.order_number = o.order_number
    where o.id = (select order_id from public.order_items where id = p_order_item_id)
  );
  
  v_pending := greatest(0, v_item.quantity - v_processed);
  
  -- Calculate delayed quantity (items in invoices with Running Late status)
  select coalesce(sum(ii.invoice_quantity), 0)
  into v_delayed
  from public.invoice_items ii
  join public.invoices i on ii.invoice_id = i.id
  join public.invoice_orders io on io.invoice_id = i.id
  join public.orders o on io.order_number = o.order_number
  where o.order_status = 'Running Late'
  and ii.product_id = (select product_id from public.order_items where id = p_order_item_id);
  
  v_result := jsonb_build_object(
    'ordered', v_item.quantity,
    'processed', v_processed,
    'pending', v_pending,
    'delayed', v_delayed
  );
  
  return v_result;
end;
$$;
