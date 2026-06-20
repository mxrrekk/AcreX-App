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

alter table public.users
  add column if not exists plan text not null default 'free',
  add column if not exists subscription_status text not null default 'inactive',
  add column if not exists subscription_source text not null default 'manual_admin',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create table if not exists public.project_share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  token text not null unique,
  enabled boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid references public.users(id) on delete set null,
  address text,
  service_type text,
  photos jsonb not null default '[]'::jsonb,
  notes text,
  timeline text,
  budget_range text,
  parcel_size double precision,
  work_area double precision,
  map_snapshot_url text,
  ai_scope text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_matches (
  id uuid primary key default gen_random_uuid(),
  lead_request_id uuid not null references public.lead_requests(id) on delete cascade,
  contractor_user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending',
  match_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_stripe_customer_id_idx
  on public.users(stripe_customer_id);

create index if not exists project_share_links_project_id_idx
  on public.project_share_links(project_id);

create index if not exists project_share_links_token_idx
  on public.project_share_links(token);

create index if not exists lead_requests_requester_user_id_idx
  on public.lead_requests(requester_user_id, created_at desc);

create index if not exists lead_matches_contractor_user_id_idx
  on public.lead_matches(contractor_user_id, created_at desc);

alter table public.project_share_links enable row level security;
alter table public.lead_requests enable row level security;
alter table public.lead_matches enable row level security;

grant select, insert, update, delete on public.project_share_links to authenticated;
grant select, insert, update, delete on public.lead_requests to authenticated;
grant select, insert, update, delete on public.lead_matches to authenticated;

drop policy if exists "Users can manage their own share links" on public.project_share_links;
create policy "Users can manage their own share links"
  on public.project_share_links
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.projects
      where projects.id = project_share_links.project_id
        and projects.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage their own lead requests" on public.lead_requests;
create policy "Users can manage their own lead requests"
  on public.lead_requests
  for all
  using (auth.uid() = requester_user_id)
  with check (auth.uid() = requester_user_id);

drop policy if exists "Contractors can manage their own lead matches" on public.lead_matches;
create policy "Contractors can manage their own lead matches"
  on public.lead_matches
  for all
  using (auth.uid() = contractor_user_id)
  with check (auth.uid() = contractor_user_id);

drop trigger if exists set_project_share_links_updated_at on public.project_share_links;
create trigger set_project_share_links_updated_at
  before update on public.project_share_links
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_lead_requests_updated_at on public.lead_requests;
create trigger set_lead_requests_updated_at
  before update on public.lead_requests
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_lead_matches_updated_at on public.lead_matches;
create trigger set_lead_matches_updated_at
  before update on public.lead_matches
  for each row
  execute function public.set_updated_at();

-- Durable AcreX project data and file-storage foundation.
-- Existing polygon_geojson and quote_items columns/tables remain supported while
-- the application transitions to the normalized records below.

create table if not exists public.drawings (
  id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Untitled drawing',
  service_type text,
  zone_type text,
  geometry_type text not null,
  geometry_geojson jsonb not null,
  color text,
  unit text,
  quantity double precision,
  area_acres double precision,
  area_square_feet double precision,
  length_feet double precision,
  perimeter_feet double precision,
  address text,
  latitude double precision,
  longitude double precision,
  centroid jsonb,
  parcel_id text,
  location_source text,
  visible boolean not null default true,
  locked boolean not null default false,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  drawing_id text not null references public.drawings(id) on delete cascade,
  quantity double precision not null default 0,
  unit text not null,
  area_acres double precision,
  area_square_feet double precision,
  length_feet double precision,
  perimeter_feet double precision,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (drawing_id)
);

create table if not exists public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  drawing_id text references public.drawings(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  service text not null,
  description text,
  quantity double precision not null default 0,
  unit text not null default 'each',
  unit_price double precision,
  total double precision not null default 0,
  zone_name text,
  zone_type text,
  notes text,
  source_snapshot jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.quote_line_items (
  id, quote_id, project_id, user_id, service, description, quantity, unit,
  unit_price, total, zone_name, zone_type, notes, sort_order, created_at, updated_at
)
select
  legacy.id,
  legacy.quote_id,
  quotes.project_id,
  legacy.user_id,
  legacy.service,
  legacy.description,
  legacy.quantity,
  legacy.unit,
  legacy.unit_price,
  legacy.total,
  legacy.zone_name,
  legacy.zone_type,
  legacy.notes,
  legacy.sort_order,
  legacy.created_at,
  legacy.updated_at
from public.quote_items legacy
join public.quotes on quotes.id = legacy.quote_id and quotes.user_id = legacy.user_id
on conflict (id) do nothing;

create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  quote_line_item_id uuid references public.quote_line_items(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  description text,
  quantity double precision not null default 0,
  unit text not null default 'each',
  unit_price double precision not null default 0,
  total double precision not null default 0,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  export_type text not null,
  status text not null default 'ready',
  file_name text not null,
  storage_path text,
  mime_type text,
  file_size bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  export_id uuid references public.exports(id) on delete set null,
  file_type text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint,
  is_public boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attachments_parent_check check (
    project_id is not null or quote_id is not null or invoice_id is not null or export_id is not null
  )
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  company_profile jsonb not null default '{}'::jsonb,
  quote_defaults jsonb not null default '{}'::jsonb,
  pricing_defaults jsonb not null default '{}'::jsonb,
  drawing_defaults jsonb not null default '{}'::jsonb,
  map_defaults jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_estimate_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  context_snapshot jsonb not null,
  suggestion_snapshot jsonb not null,
  model text,
  confidence_score double precision,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.project_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists drawings_user_project_idx
  on public.drawings(user_id, project_id, updated_at desc);
create index if not exists measurements_user_project_idx
  on public.measurements(user_id, project_id, updated_at desc);
create index if not exists quote_line_items_user_quote_idx
  on public.quote_line_items(user_id, quote_id, sort_order);
create index if not exists invoice_line_items_user_invoice_idx
  on public.invoice_line_items(user_id, invoice_id, sort_order);
create index if not exists exports_user_project_idx
  on public.exports(user_id, project_id, created_at desc);
create index if not exists attachments_user_project_idx
  on public.attachments(user_id, project_id, created_at desc);
create index if not exists attachments_user_quote_idx
  on public.attachments(user_id, quote_id, created_at desc);
create index if not exists attachments_user_invoice_idx
  on public.attachments(user_id, invoice_id, created_at desc);
create index if not exists ai_estimate_snapshots_user_project_idx
  on public.ai_estimate_snapshots(user_id, project_id, created_at desc);
create index if not exists project_activity_user_project_idx
  on public.project_activity(user_id, project_id, created_at desc);

alter table public.drawings enable row level security;
alter table public.measurements enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.exports enable row level security;
alter table public.attachments enable row level security;
alter table public.user_settings enable row level security;
alter table public.ai_estimate_snapshots enable row level security;
alter table public.project_activity enable row level security;

grant select, insert, update, delete on public.drawings to authenticated;
grant select, insert, update, delete on public.measurements to authenticated;
grant select, insert, update, delete on public.quote_line_items to authenticated;
grant select, insert, update, delete on public.invoice_line_items to authenticated;
grant select, insert, update, delete on public.exports to authenticated;
grant select, insert, update, delete on public.attachments to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
grant select, insert, update, delete on public.ai_estimate_snapshots to authenticated;
grant select, insert, delete on public.project_activity to authenticated;

drop policy if exists "Users can manage their own drawings" on public.drawings;
create policy "Users can manage their own drawings"
  on public.drawings for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects
      where projects.id = drawings.project_id and projects.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects
      where projects.id = drawings.project_id and projects.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage their own measurements" on public.measurements;
create policy "Users can manage their own measurements"
  on public.measurements for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.drawings
      where drawings.id = measurements.drawing_id
        and drawings.project_id = measurements.project_id
        and drawings.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.drawings
      where drawings.id = measurements.drawing_id
        and drawings.project_id = measurements.project_id
        and drawings.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage their own quote line items" on public.quote_line_items;
create policy "Users can manage their own quote line items"
  on public.quote_line_items for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.quotes
      where quotes.id = quote_line_items.quote_id and quotes.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.quotes
      where quotes.id = quote_line_items.quote_id and quotes.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage their own invoice line items" on public.invoice_line_items;
create policy "Users can manage their own invoice line items"
  on public.invoice_line_items for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.invoices
      where invoices.id = invoice_line_items.invoice_id and invoices.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.invoices
      where invoices.id = invoice_line_items.invoice_id and invoices.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage their own exports" on public.exports;
create policy "Users can manage their own exports"
  on public.exports for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (project_id is null or exists (
      select 1 from public.projects
      where projects.id = exports.project_id and projects.user_id = auth.uid()
    ))
    and (quote_id is null or exists (
      select 1 from public.quotes
      where quotes.id = exports.quote_id and quotes.user_id = auth.uid()
    ))
    and (invoice_id is null or exists (
      select 1 from public.invoices
      where invoices.id = exports.invoice_id and invoices.user_id = auth.uid()
    ))
  );

drop policy if exists "Users can manage their own attachment metadata" on public.attachments;
create policy "Users can manage their own attachment metadata"
  on public.attachments for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (project_id is null or exists (
      select 1 from public.projects
      where projects.id = attachments.project_id and projects.user_id = auth.uid()
    ))
    and (quote_id is null or exists (
      select 1 from public.quotes
      where quotes.id = attachments.quote_id and quotes.user_id = auth.uid()
    ))
    and (invoice_id is null or exists (
      select 1 from public.invoices
      where invoices.id = attachments.invoice_id and invoices.user_id = auth.uid()
    ))
  );

drop policy if exists "Users can manage their own settings" on public.user_settings;
create policy "Users can manage their own settings"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own AI estimate snapshots" on public.ai_estimate_snapshots;
create policy "Users can manage their own AI estimate snapshots"
  on public.ai_estimate_snapshots for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects
      where projects.id = ai_estimate_snapshots.project_id and projects.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects
      where projects.id = ai_estimate_snapshots.project_id and projects.user_id = auth.uid()
    )
  );

drop policy if exists "Users can manage their own project activity" on public.project_activity;
create policy "Users can manage their own project activity"
  on public.project_activity for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects
      where projects.id = project_activity.project_id and projects.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects
      where projects.id = project_activity.project_id and projects.user_id = auth.uid()
    )
  );

drop trigger if exists set_drawings_updated_at on public.drawings;
create trigger set_drawings_updated_at before update on public.drawings
  for each row execute function public.set_updated_at();
drop trigger if exists set_measurements_updated_at on public.measurements;
create trigger set_measurements_updated_at before update on public.measurements
  for each row execute function public.set_updated_at();
drop trigger if exists set_quote_line_items_updated_at on public.quote_line_items;
create trigger set_quote_line_items_updated_at before update on public.quote_line_items
  for each row execute function public.set_updated_at();
drop trigger if exists set_invoice_line_items_updated_at on public.invoice_line_items;
create trigger set_invoice_line_items_updated_at before update on public.invoice_line_items
  for each row execute function public.set_updated_at();
drop trigger if exists set_exports_updated_at on public.exports;
create trigger set_exports_updated_at before update on public.exports
  for each row execute function public.set_updated_at();
drop trigger if exists set_attachments_updated_at on public.attachments;
create trigger set_attachments_updated_at before update on public.attachments
  for each row execute function public.set_updated_at();
drop trigger if exists set_user_settings_updated_at on public.user_settings;
create trigger set_user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit)
values ('acrex-files', 'acrex-files', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Users can read their own AcreX files" on storage.objects;
create policy "Users can read their own AcreX files"
  on storage.objects for select
  using (
    bucket_id = 'acrex-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can upload their own AcreX files" on storage.objects;
create policy "Users can upload their own AcreX files"
  on storage.objects for insert
  with check (
    bucket_id = 'acrex-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own AcreX files" on storage.objects;
create policy "Users can update their own AcreX files"
  on storage.objects for update
  using (
    bucket_id = 'acrex-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'acrex-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own AcreX files" on storage.objects;
create policy "Users can delete their own AcreX files"
  on storage.objects for delete
  using (
    bucket_id = 'acrex-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
