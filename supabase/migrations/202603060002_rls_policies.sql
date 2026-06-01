create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid() limit 1;
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.users where id = auth.uid() limit 1;
$$;

create or replace function public.current_warehouse_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select warehouse_id from public.users where id = auth.uid() limit 1;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'super_admin';
$$;

alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.warehouses enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory enable row level security;
alter table public.alerts enable row level security;
alter table public.chatbot_messages enable row level security;
alter table public.order_status_history enable row level security;

drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies
for select
to authenticated
using (true);

drop policy if exists warehouses_read on public.warehouses;
create policy warehouses_read on public.warehouses
for select
to authenticated
using (true);

drop policy if exists products_read on public.products;
create policy products_read on public.products
for select
to authenticated
using (true);

drop policy if exists users_self_or_admin_read on public.users;
create policy users_self_or_admin_read on public.users
for select
to authenticated
using (auth.uid() = id or public.is_super_admin());

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
for update
to authenticated
using (auth.uid() = id or public.is_super_admin())
with check (auth.uid() = id or public.is_super_admin());

drop policy if exists orders_read_by_role on public.orders;
create policy orders_read_by_role on public.orders
for select
to authenticated
using (
  public.is_super_admin()
  or (
    public.current_user_role() = 'distributor'
    and company_id = public.current_company_id()
  )
  or (
    public.current_user_role() = 'warehouse'
    and warehouse_id = public.current_warehouse_id()
  )
);

drop policy if exists orders_write_admin_warehouse on public.orders;
create policy orders_write_admin_warehouse on public.orders
for all
to authenticated
using (
  public.is_super_admin()
  or (
    public.current_user_role() = 'warehouse'
    and warehouse_id = public.current_warehouse_id()
  )
)
with check (
  public.is_super_admin()
  or (
    public.current_user_role() = 'warehouse'
    and warehouse_id = public.current_warehouse_id()
  )
);

drop policy if exists order_items_read_by_order_scope on public.order_items;
create policy order_items_read_by_order_scope on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and (
        public.is_super_admin()
        or (public.current_user_role() = 'distributor' and o.company_id = public.current_company_id())
        or (public.current_user_role() = 'warehouse' and o.warehouse_id = public.current_warehouse_id())
      )
  )
);

drop policy if exists inventory_read_by_role on public.inventory;
create policy inventory_read_by_role on public.inventory
for select
to authenticated
using (
  public.is_super_admin()
  or (
    public.current_user_role() = 'warehouse'
    and warehouse_id = public.current_warehouse_id()
  )
);

drop policy if exists inventory_write_admin_warehouse on public.inventory;
create policy inventory_write_admin_warehouse on public.inventory
for all
to authenticated
using (
  public.is_super_admin()
  or (
    public.current_user_role() = 'warehouse'
    and warehouse_id = public.current_warehouse_id()
  )
)
with check (
  public.is_super_admin()
  or (
    public.current_user_role() = 'warehouse'
    and warehouse_id = public.current_warehouse_id()
  )
);

drop policy if exists alerts_read_by_role on public.alerts;
create policy alerts_read_by_role on public.alerts
for select
to authenticated
using (
  public.is_super_admin()
  or (
    public.current_user_role() = 'warehouse'
    and (warehouse_id = public.current_warehouse_id() or warehouse_id is null)
  )
  or (
    public.current_user_role() = 'distributor'
    and company_id = public.current_company_id()
  )
);

drop policy if exists alerts_write_admin on public.alerts;
create policy alerts_write_admin on public.alerts
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists chatbot_messages_own_read on public.chatbot_messages;
create policy chatbot_messages_own_read on public.chatbot_messages
for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists chatbot_messages_own_insert on public.chatbot_messages;
create policy chatbot_messages_own_insert on public.chatbot_messages
for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = public.current_user_role()
);

drop policy if exists chatbot_messages_own_update on public.chatbot_messages;
create policy chatbot_messages_own_update on public.chatbot_messages
for update
to authenticated
using (user_id = auth.uid() or public.is_super_admin())
with check (user_id = auth.uid() or public.is_super_admin());

drop policy if exists history_read_by_order_scope on public.order_status_history;
create policy history_read_by_order_scope on public.order_status_history
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_status_history.order_id
      and (
        public.is_super_admin()
        or (public.current_user_role() = 'distributor' and o.company_id = public.current_company_id())
        or (public.current_user_role() = 'warehouse' and o.warehouse_id = public.current_warehouse_id())
      )
  )
);

drop policy if exists history_write_admin_warehouse on public.order_status_history;
create policy history_write_admin_warehouse on public.order_status_history
for all
to authenticated
using (
  public.is_super_admin()
  or public.current_user_role() = 'warehouse'
)
with check (
  public.is_super_admin()
  or public.current_user_role() = 'warehouse'
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.orders;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.inventory;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.alerts;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.chatbot_messages;
  exception when duplicate_object then null;
  end;
end
$$;
