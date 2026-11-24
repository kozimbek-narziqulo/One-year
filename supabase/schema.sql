-- One-year / Сад дней
-- Schema for a new Supabase project, based on the verified production table.
--
-- Run this in the SQL Editor of your own Supabase project.
-- This script creates the table if it does not exist. It does not migrate an
-- existing table; review and write a migration separately before changing one.

create table if not exists public.entries (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  content text null,
  created_at time with time zone default now(),
  date text null,
  body text null,
  mood integer null,
  shape_id integer null,
  constraint entries_pkey primary key (id),
  constraint entries_user_id_date_key unique (user_id, date),
  constraint entries_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade
);

alter table public.entries enable row level security;

drop policy if exists entries_select_own on public.entries;
create policy entries_select_own
  on public.entries for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists entries_insert_own on public.entries;
create policy entries_insert_own
  on public.entries for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists entries_update_own on public.entries;
create policy entries_update_own
  on public.entries for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists entries_delete_own on public.entries;
create policy entries_delete_own
  on public.entries for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.entries to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'entries'
  ) then
    alter publication supabase_realtime add table public.entries;
  end if;
end
$$;
