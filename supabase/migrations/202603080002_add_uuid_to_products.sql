-- Migration: Add UUID id column to products table
-- This is needed for foreign key relationships with invoice_items and order_items

-- Add id column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'products' 
    and column_name = 'id'
  ) then
    alter table public.products 
    add column id uuid default gen_random_uuid();
    
    -- Make it unique
    create unique index if not exists products_id_unique_idx on public.products(id);
    
    -- Update existing products to have UUIDs
    update public.products 
    set id = gen_random_uuid() 
    where id is null;
  end if;
end $$;
