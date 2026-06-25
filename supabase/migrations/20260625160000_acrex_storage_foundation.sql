create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Durable AcreX project data and file-storage foundation.
-- This migration assumes the base AcreX auth/profile/project/quote/invoice tables already exist.
-- Existing polygon_geojson and quote_items records remain supported while the app uses normalized records.

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
  is_public boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exports
  add column if not exists is_public boolean not null default false;

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
