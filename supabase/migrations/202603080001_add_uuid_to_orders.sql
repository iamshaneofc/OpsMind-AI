-- Migration: Add UUID id column to orders table
-- This is needed for foreign key relationships with invoice_orders

-- Add id column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'orders' 
    and column_name = 'id'
  ) then
    alter table public.orders 
    add column id uuid default gen_random_uuid();
    
    -- Make it unique
    create unique index if not exists orders_id_unique_idx on public.orders(id);
    
    -- Update existing orders to have UUIDs
    update public.orders 
    set id = gen_random_uuid() 
    where id is null;
  end if;
end $$;
