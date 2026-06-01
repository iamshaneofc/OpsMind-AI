-- Migration: Add Row-Level Security Policies for Invoices
-- This migration adds company-based authorization for invoices and related tables

-- ============================================================================
-- 1. Enable RLS on Invoice Tables
-- ============================================================================

-- Enable RLS on existing invoice tables
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'invoices') then
    alter table public.invoices enable row level security;
  end if;
  
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'invoice_items') then
    alter table public.invoice_items enable row level security;
  end if;
  
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'invoice_orders') then
    alter table public.invoice_orders enable row level security;
  end if;
  
  -- Only enable RLS on proforma tables if they exist (created in previous migration)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'proforma_invoices') then
    alter table public.proforma_invoices enable row level security;
  end if;
  
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'proforma_invoice_items') then
    alter table public.proforma_invoice_items enable row level security;
  end if;
end $$;

-- ============================================================================
-- 2. Helper Functions for Company Access
-- ============================================================================

-- Function to get user's company_id (handles both UUID and integer)
-- Also maps invoice company_id (integer) to user company_id (UUID) via customers table
create or replace function public.get_user_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return null;
  end if;
  
  -- Get company_id from users table (UUID)
  select company_id into v_company_id
  from public.users
  where id = v_user_id;
  
  return v_company_id;
end;
$$;

-- Function to check if invoice belongs to user's company
-- Handles both UUID company_id (from users) and integer company_id (from invoices via customers)
create or replace function public.user_can_access_invoice(p_invoice_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_company_id uuid;
  v_invoice_company_id uuid;
  v_invoice_customer_id uuid;
  v_invoice_account_id integer;
  v_customer_company_id uuid;
begin
  -- Get user's company_id
  v_user_company_id := public.get_user_company_id();
  
  -- If super admin, allow access
  if public.is_super_admin() then
    return true;
  end if;
  
  -- If user has no company, deny access
  if v_user_company_id is null then
    return false;
  end if;
  
  -- Get invoice company_id directly
  select company_id, customer_id, account_id
  into v_invoice_company_id, v_invoice_customer_id, v_invoice_account_id
  from public.invoices
  where id = p_invoice_id;
  
  -- Check direct company_id match (UUID)
  if v_invoice_company_id = v_user_company_id then
    return true;
  end if;
  
  -- Check via customer (for integer company_id mapping)
  if v_invoice_customer_id is not null then
    select company_id into v_customer_company_id
    from public.customers
    where id = v_invoice_customer_id;
    
    if v_customer_company_id = v_user_company_id then
      return true;
    end if;
  end if;
  
  -- Check via account_id -> customer -> company
  if v_invoice_account_id is not null then
    select company_id into v_customer_company_id
    from public.customers
    where account_id = v_invoice_account_id;
    
    if v_customer_company_id = v_user_company_id then
      return true;
    end if;
  end if;
  
  return false;
end;
$$;

-- Function to check if user is super admin
-- This function may already exist from 202603060002_rls_policies.sql
-- We use create or replace to ensure it's compatible with invoice RLS policies
-- Only create if users table exists (from init_schema migration)
do $$
begin
  -- Only create function if users table exists with required columns
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' 
    and table_name = 'users'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'users' 
    and column_name = 'id'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'users' 
    and column_name = 'role'
  ) then
    -- Check if current_user_role() exists (from 202603060002_rls_policies.sql)
    if exists (
      select 1 from information_schema.routines 
      where routine_schema = 'public' 
      and routine_name = 'current_user_role'
    ) then
      -- Use existing current_user_role() function
      begin
        execute 'create or replace function public.is_super_admin()
          returns boolean
          language sql
          stable
          security definer
          set search_path = public
          as $func$
            select public.current_user_role() = ''super_admin'';
          $func$;';
      exception when others then
        -- If current_user_role() call fails, fall through to direct query
        null;
      end;
    end if;
    
    -- If function wasn't created above (or current_user_role() doesn't exist), create with direct query
    if not exists (
      select 1 from information_schema.routines 
      where routine_schema = 'public' 
      and routine_name = 'is_super_admin'
    ) then
      -- Direct query if current_user_role() doesn't exist yet
      begin
        execute 'create or replace function public.is_super_admin()
          returns boolean
          language plpgsql
          stable
          security definer
          set search_path = public
          as $func$
          declare
            v_user_id uuid;
            v_role text;
          begin
            v_user_id := auth.uid();
            if v_user_id is null then
              return false;
            end if;
            
            select role into v_role
            from public.users
            where id = v_user_id
            limit 1;
            
            return coalesce(v_role = ''super_admin'', false);
          end;
          $func$;';
      exception when others then
        -- If function creation fails, log but don't stop migration
        raise notice 'Could not create is_super_admin() function: %', sqlerrm;
      end;
    end if;
  else
    -- If users table doesn't exist, create a stub function that returns false
    -- This will be replaced when the proper migration runs
    begin
      execute 'create or replace function public.is_super_admin()
        returns boolean
        language sql
        stable
        security definer
        set search_path = public
        as $func$
          select false;
        $func$;';
    exception when others then
      raise notice 'Could not create is_super_admin() stub function: %', sqlerrm;
    end;
  end if;
end $$;

-- Function to get company_id from invoice
create or replace function public.get_invoice_company_id(p_invoice_id uuid)
returns uuid
language plpgsql
stable
as $$
declare
  v_company_id uuid;
  v_customer_id uuid;
  v_account_id integer;
begin
  -- Try to get company_id directly from invoice
  select company_id into v_company_id
  from public.invoices
  where id = p_invoice_id;
  
  -- If not found, try via customer
  if v_company_id is null then
    select customer_id into v_customer_id
    from public.invoices
    where id = p_invoice_id;
    
    if v_customer_id is not null then
      select company_id into v_company_id
      from public.customers
      where id = v_customer_id;
    end if;
  end if;
  
  -- If still not found, try via account_id
  if v_company_id is null then
    select account_id into v_account_id
    from public.invoices
    where id = p_invoice_id;
    
    if v_account_id is not null then
      select company_id into v_company_id
      from public.customers
      where account_id = v_account_id;
    end if;
  end if;
  
  return v_company_id;
end;
$$;

-- ============================================================================
-- 3. RLS Policies for Invoices
-- ============================================================================

-- Drop existing policies if any
drop policy if exists invoices_select on public.invoices;
drop policy if exists invoices_insert on public.invoices;
drop policy if exists invoices_update on public.invoices;
drop policy if exists invoices_delete on public.invoices;

-- SELECT Policy: Super admin sees all, others see their company's invoices
create policy invoices_select on public.invoices
for select
to authenticated
using (public.user_can_access_invoice(id));

-- INSERT Policy: Super admin can insert, others can insert for their company
create policy invoices_insert on public.invoices
for insert
to authenticated
with check (
  public.is_super_admin()
  or company_id = public.get_user_company_id()
);

-- UPDATE Policy: Super admin can update all, others can update their company's invoices
create policy invoices_update on public.invoices
for update
to authenticated
using (public.user_can_access_invoice(id))
with check (
  public.is_super_admin()
  or company_id = public.get_user_company_id()
);

-- DELETE Policy: Only super admin can delete
create policy invoices_delete on public.invoices
for delete
to authenticated
using (public.is_super_admin());

-- ============================================================================
-- 4. RLS Policies for Invoice Items
-- ============================================================================

drop policy if exists invoice_items_select on public.invoice_items;
drop policy if exists invoice_items_insert on public.invoice_items;
drop policy if exists invoice_items_update on public.invoice_items;
drop policy if exists invoice_items_delete on public.invoice_items;

-- SELECT Policy: Access based on parent invoice
create policy invoice_items_select on public.invoice_items
for select
to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
    and public.user_can_access_invoice(i.id)
  )
);

-- INSERT Policy: Can insert if can access parent invoice
create policy invoice_items_insert on public.invoice_items
for insert
to authenticated
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
    and public.user_can_access_invoice(i.id)
  )
);

-- UPDATE Policy: Can update if can access parent invoice
create policy invoice_items_update on public.invoice_items
for update
to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
    and public.user_can_access_invoice(i.id)
  )
);

-- DELETE Policy: Only super admin can delete
create policy invoice_items_delete on public.invoice_items
for delete
to authenticated
using (public.is_super_admin());

-- ============================================================================
-- 5. RLS Policies for Invoice Orders
-- ============================================================================

drop policy if exists invoice_orders_select on public.invoice_orders;
drop policy if exists invoice_orders_insert on public.invoice_orders;

-- SELECT Policy: Access based on parent invoice
create policy invoice_orders_select on public.invoice_orders
for select
to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1 from public.invoices i
    where i.id = invoice_orders.invoice_id
    and public.user_can_access_invoice(i.id)
  )
);

-- INSERT Policy: Can insert if can access parent invoice
create policy invoice_orders_insert on public.invoice_orders
for insert
to authenticated
with check (
  public.is_super_admin()
  or exists (
    select 1 from public.invoices i
    where i.id = invoice_orders.invoice_id
    and public.user_can_access_invoice(i.id)
  )
);

-- ============================================================================
-- 6. RLS Policies for Proforma Invoices
-- ============================================================================

-- Only create policies if proforma_invoices table exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'proforma_invoices') then
    drop policy if exists proforma_invoices_select on public.proforma_invoices;
    drop policy if exists proforma_invoices_insert on public.proforma_invoices;
    drop policy if exists proforma_invoices_update on public.proforma_invoices;

    -- SELECT Policy: Super admin sees all, others see their company's proforma invoices
    create policy proforma_invoices_select on public.proforma_invoices
    for select
    to authenticated
    using (
      public.is_super_admin()
      or company_id = public.get_user_company_id()
    );

    -- INSERT Policy: Super admin can insert, others can insert for their company
    create policy proforma_invoices_insert on public.proforma_invoices
    for insert
    to authenticated
    with check (
      public.is_super_admin()
      or company_id = public.get_user_company_id()
    );

    -- UPDATE Policy: Super admin can update all, others can update their company's
    create policy proforma_invoices_update on public.proforma_invoices
    for update
    to authenticated
    using (
      public.is_super_admin()
      or company_id = public.get_user_company_id()
    )
    with check (
      public.is_super_admin()
      or company_id = public.get_user_company_id()
    );
  end if;
end $$;

-- ============================================================================
-- 7. RLS Policies for Proforma Invoice Items
-- ============================================================================

-- Only create policies if proforma_invoice_items table exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'proforma_invoice_items') then
    drop policy if exists proforma_invoice_items_select on public.proforma_invoice_items;
    drop policy if exists proforma_invoice_items_insert on public.proforma_invoice_items;

    -- SELECT Policy: Access based on parent proforma invoice
    create policy proforma_invoice_items_select on public.proforma_invoice_items
    for select
    to authenticated
    using (
      public.is_super_admin()
      or exists (
        select 1 from public.proforma_invoices pi
        where pi.id = proforma_invoice_items.proforma_invoice_id
        and (
          public.is_super_admin()
          or pi.company_id = public.get_user_company_id()
        )
      )
    );

    -- INSERT Policy: Can insert if can access parent proforma invoice
    create policy proforma_invoice_items_insert on public.proforma_invoice_items
    for insert
    to authenticated
    with check (
      public.is_super_admin()
      or exists (
        select 1 from public.proforma_invoices pi
        where pi.id = proforma_invoice_items.proforma_invoice_id
        and (
          public.is_super_admin()
          or pi.company_id = public.get_user_company_id()
        )
      )
    );
  end if;
end $$;

-- ============================================================================
-- 8. RLS Policies for Customers (Company-based access)
-- ============================================================================

-- Enable RLS on customers if not already enabled
alter table public.customers enable row level security;

drop policy if exists customers_select on public.customers;

-- SELECT Policy: Super admin sees all, others see customers for their company
create policy customers_select on public.customers
for select
to authenticated
using (
  public.is_super_admin()
  or company_id = public.get_user_company_id()
);
