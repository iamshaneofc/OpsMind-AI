-- Default warehouse (ERP Location_id) for distributor companies: stock/order context in chatbot and tools.
alter table public.companies
  add column if not exists base_warehouse_id integer null;

comment on column public.companies.base_warehouse_id is
  'ERP warehouse/location id for this distributor company’s primary fulfilment point. Used when resolving product stock for distributor users.';
