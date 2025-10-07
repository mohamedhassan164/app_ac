-- Supabase SQL: schema, RLS, and policies
-- Auth: use Supabase Auth (Email/Password). Disable public sign-up in Dashboard (Auth > Providers > Email: uncheck "Enable email signups").
-- Create a role enum
create type public.app_role as enum ('manager','accountant','employee');

-- Profiles table (mirror auth.users)
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role public.app_role not null default 'employee',
  active boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_user_profiles_role on public.user_profiles(role);

-- Helper: current user's role
create or replace function public.current_role()
returns public.app_role
language sql stable security definer as $$
  select role from public.user_profiles where user_id = auth.uid();
$$;

-- Accounting: transactions
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null check (type in ('revenue','expense')),
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  approved boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id),
  created_at timestamp with time zone not null default now()
);
create index if not exists idx_transactions_date on public.transactions(date);
create index if not exists idx_transactions_type on public.transactions(type);

-- Inventory: items + movements (items stock updated via trigger)
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null default 'وحدة',
  min_qty numeric(14,3) not null default 0,
  current_qty numeric(14,3) not null default 0,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  kind text not null check (kind in ('in','out')),
  qty numeric(14,3) not null check (qty > 0),
  unit_price numeric(14,2) not null default 0,
  total numeric(14,2) generated always as (qty * unit_price) stored,
  party text not null default '',
  date date not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamp with time zone not null default now()
);
create index if not exists idx_mov_item on public.inventory_movements(item_id);
create index if not exists idx_mov_date on public.inventory_movements(date);

-- Trigger to update current_qty
create or replace function public.apply_inventory_movement()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    if (new.kind = 'in') then
      update public.inventory_items set current_qty = current_qty + new.qty, updated_at = now() where id = new.item_id;
    else
      update public.inventory_items set current_qty = greatest(0, current_qty - new.qty), updated_at = now() where id = new.item_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if (old.kind = 'in') then
      update public.inventory_items set current_qty = greatest(0, current_qty - old.qty), updated_at = now() where id = old.item_id;
    else
      update public.inventory_items set current_qty = current_qty + old.qty, updated_at = now() where id = old.item_id;
    end if;
    return old;
  end if;
  return null;
end$$;

create trigger trg_apply_inventory_movement
  after insert or delete on public.inventory_movements
  for each row execute function public.apply_inventory_movement();

-- Projects, costs, sales
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null default '',
  floors int not null default 0,
  units int not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamp with time zone not null default now()
);

create type public.project_cost_type as enum ('construction','operation','expense');

create table if not exists public.project_costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  type public.project_cost_type not null,
  amount numeric(14,2) not null check (amount >= 0),
  date date not null,
  note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamp with time zone not null default now()
);
create index if not exists idx_costs_project on public.project_costs(project_id);
create index if not exists idx_costs_date on public.project_costs(date);

create table if not exists public.project_sales (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_no text not null,
  buyer text not null,
  price numeric(14,2) not null check (price >= 0),
  date date not null,
  terms text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamp with time zone not null default now()
);
create index if not exists idx_sales_project on public.project_sales(project_id);
create index if not exists idx_sales_date on public.project_sales(date);

-- Payroll
create table if not exists public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  employee_name text not null,
  amount numeric(14,2) not null check (amount >= 0),
  note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamp with time zone not null default now()
);
create index if not exists idx_payroll_date on public.payroll_entries(date);

-- RLS
alter table public.user_profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.projects enable row level security;
alter table public.project_costs enable row level security;
alter table public.project_sales enable row level security;
alter table public.payroll_entries enable row level security;

-- Profiles policies
create policy if not exists profiles_read on public.user_profiles
for select using ( auth.role() = 'authenticated' );
create policy if not exists profiles_self_update on public.user_profiles
for update using ( auth.uid() = user_id ) with check ( auth.uid() = user_id );
-- Manager can manage all profiles
create policy if not exists profiles_manager_all on public.user_profiles
for all using ( public.current_role() = 'manager' ) with check ( public.current_role() = 'manager' );

-- Transactions policies
create policy if not exists tx_select on public.transactions for select using ( auth.role() = 'authenticated' );
-- Insert: employee/accountant/manager
create policy if not exists tx_insert on public.transactions for insert
with check ( public.current_role() in ('employee','accountant','manager') and created_by = auth.uid() );
-- Update/delete: manager only
create policy if not exists tx_update on public.transactions for update using ( public.current_role() = 'manager' );
create policy if not exists tx_delete on public.transactions for delete using ( public.current_role() = 'manager' );

-- Inventory policies
create policy if not exists inv_items_select on public.inventory_items for select using ( auth.role() = 'authenticated' );
create policy if not exists inv_items_admin on public.inventory_items for all using ( public.current_role() in ('manager','accountant') ) with check ( public.current_role() in ('manager','accountant') );

create policy if not exists inv_mov_select on public.inventory_movements for select using ( auth.role() = 'authenticated' );
create policy if not exists inv_mov_insert on public.inventory_movements for insert
with check ( public.current_role() in ('employee','accountant','manager') and created_by = auth.uid() );
create policy if not exists inv_mov_delete on public.inventory_movements for delete using ( public.current_role() = 'manager' );

-- Projects policies
create policy if not exists proj_select on public.projects for select using ( auth.role() = 'authenticated' );
create policy if not exists proj_insert on public.projects for insert with check ( public.current_role() in ('employee','accountant','manager') and created_by = auth.uid() );
create policy if not exists proj_update_del on public.projects for all using ( public.current_role() = 'manager' ) with check ( public.current_role() = 'manager' );

create policy if not exists cost_select on public.project_costs for select using ( auth.role() = 'authenticated' );
create policy if not exists cost_insert on public.project_costs for insert with check ( public.current_role() in ('employee','accountant','manager') and created_by = auth.uid() );
create policy if not exists cost_update_del on public.project_costs for all using ( public.current_role() in ('manager','accountant') ) with check ( public.current_role() in ('manager','accountant') );

create policy if not exists sales_select on public.project_sales for select using ( auth.role() = 'authenticated' );
create policy if not exists sales_insert on public.project_sales for insert with check ( public.current_role() in ('employee','accountant','manager') and created_by = auth.uid() );
create policy if not exists sales_update_del on public.project_sales for all using ( public.current_role() in ('manager') ) with check ( public.current_role() in ('manager') );

-- Payroll policies (accountant+manager manage, everyone reads)
create policy if not exists payroll_select on public.payroll_entries for select using ( auth.role() = 'authenticated' );
create policy if not exists payroll_insert on public.payroll_entries for insert with check ( public.current_role() in ('accountant','manager') and created_by = auth.uid() );
create policy if not exists payroll_update_del on public.payroll_entries for all using ( public.current_role() in ('accountant','manager') ) with check ( public.current_role() in ('accountant','manager') );

-- Realtime: enable replica for tables (Supabase UI: Database > Replication > Publications)
-- Run once: alter publication supabase_realtime add table public.transactions, public.inventory_items, public.inventory_movements, public.projects, public.project_costs, public.project_sales, public.payroll_entries;

-- Seed manager profile (after creating first auth user via Dashboard)
-- insert into public.user_profiles(user_id, name, email, role, active) values ('<AUTH_USER_UUID>', 'Manager', 'admin@company.com', 'manager', true);
