create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  client_id uuid,
  project_name text not null default 'Untitled Project',
  customer_name text,
  address text,
  polygon_geojson jsonb,
  acres double precision,
  square_feet double precision,
  service_type text,
  price_per_acre double precision,
  estimated_total double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  company text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  quote_number text not null,
  status text not null default 'Draft',
  project_name text,
  client_name text,
  address text,
  subtotal double precision not null default 0,
  total double precision not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_status_check check (status in ('Draft', 'Sent', 'Accepted', 'Declined'))
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  service text not null,
  description text,
  quantity double precision not null default 0,
  unit text not null default 'acre',
  unit_price double precision not null default 0,
  total double precision not null default 0,
  zone_name text,
  zone_type text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  invoice_number text not null,
  due_date date,
  status text not null default 'Draft',
  client_name text,
  project_name text,
  address text,
  total double precision not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_status_check check (status in ('Draft', 'Sent', 'Paid', 'Overdue'))
);

alter table public.projects
  add column if not exists client_id uuid,
  add column if not exists service_type text,
  add column if not exists price_per_acre double precision,
  add column if not exists estimated_total double precision;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_client_id_fkey'
  ) then
    alter table public.projects
      add constraint projects_client_id_fkey
      foreign key (client_id)
      references public.clients(id)
      on delete set null;
  end if;
end $$;

create index if not exists projects_user_id_created_at_idx
  on public.projects(user_id, created_at desc);

create index if not exists clients_user_id_created_at_idx
  on public.clients(user_id, created_at desc);

create index if not exists projects_user_id_client_id_idx
  on public.projects(user_id, client_id);

create index if not exists quotes_user_id_created_at_idx
  on public.quotes(user_id, created_at desc);

create index if not exists quotes_user_id_project_id_idx
  on public.quotes(user_id, project_id);

create index if not exists quote_items_user_id_quote_id_idx
  on public.quote_items(user_id, quote_id);

create index if not exists invoices_user_id_created_at_idx
  on public.invoices(user_id, created_at desc);

create index if not exists invoices_user_id_quote_id_idx
  on public.invoices(user_id, quote_id);

alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.clients enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.invoices enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.users to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.quotes to authenticated;
grant select, insert, update, delete on public.quote_items to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;

drop policy if exists "Users can read their own profile" on public.users;
create policy "Users can read their own profile"
  on public.users
  for select
  using (auth.uid() = id);

drop policy if exists "Users can create their own profile" on public.users;
create policy "Users can create their own profile"
  on public.users
  for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.users;
create policy "Users can update their own profile"
  on public.users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can read their own projects" on public.projects;
create policy "Users can read their own projects"
  on public.projects
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own projects" on public.projects;
create policy "Users can create their own projects"
  on public.projects
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects"
  on public.projects
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Users can delete their own projects"
  on public.projects
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own clients" on public.clients;
create policy "Users can read their own clients"
  on public.clients
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own clients" on public.clients;
create policy "Users can create their own clients"
  on public.clients
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own clients" on public.clients;
create policy "Users can update their own clients"
  on public.clients
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own clients" on public.clients;
create policy "Users can delete their own clients"
  on public.clients
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own quotes" on public.quotes;
create policy "Users can read their own quotes"
  on public.quotes
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own quotes" on public.quotes;
create policy "Users can create their own quotes"
  on public.quotes
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own quotes" on public.quotes;
create policy "Users can update their own quotes"
  on public.quotes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own quotes" on public.quotes;
create policy "Users can delete their own quotes"
  on public.quotes
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own quote items" on public.quote_items;
create policy "Users can read their own quote items"
  on public.quote_items
  for select
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.quotes
      where quotes.id = quote_items.quote_id
        and quotes.user_id = auth.uid()
    )
  );

drop policy if exists "Users can create their own quote items" on public.quote_items;
create policy "Users can create their own quote items"
  on public.quote_items
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.quotes
      where quotes.id = quote_items.quote_id
        and quotes.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their own quote items" on public.quote_items;
create policy "Users can update their own quote items"
  on public.quote_items
  for update
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.quotes
      where quotes.id = quote_items.quote_id
        and quotes.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.quotes
      where quotes.id = quote_items.quote_id
        and quotes.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their own quote items" on public.quote_items;
create policy "Users can delete their own quote items"
  on public.quote_items
  for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.quotes
      where quotes.id = quote_items.quote_id
        and quotes.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read their own invoices" on public.invoices;
create policy "Users can read their own invoices"
  on public.invoices
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own invoices" on public.invoices;
create policy "Users can create their own invoices"
  on public.invoices
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.quotes
      where quotes.id = invoices.quote_id
        and quotes.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their own invoices" on public.invoices;
create policy "Users can update their own invoices"
  on public.invoices
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.quotes
      where quotes.id = invoices.quote_id
        and quotes.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their own invoices" on public.invoices;
create policy "Users can delete their own invoices"
  on public.invoices
  for delete
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at
  before update on public.clients
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_quotes_updated_at on public.quotes;
create trigger set_quotes_updated_at
  before update on public.quotes
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_quote_items_updated_at on public.quote_items;
create trigger set_quote_items_updated_at
  before update on public.quote_items
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_invoices_updated_at on public.invoices;
create trigger set_invoices_updated_at
  before update on public.invoices
  for each row
  execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();
