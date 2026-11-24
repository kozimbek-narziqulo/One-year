-- One-year / Сад дней
-- Apply this in the SQL Editor of your own Supabase project.
--
-- IMPORTANT:
-- Review this file against any existing production schema before applying it.
-- It creates the table if it does not exist; it does not migrate or overwrite
-- columns in an existing table.

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  body text not null default '',
  mood smallint null check (mood is null or mood between 1 and 5),
  shape_id integer null check (shape_id is null or shape_id between 0 and 10000),
  created_at timestamptz not null default now(),
  constraint entries_user_date_unique unique (user_id, date)
);

alter table public.entries enable row level security;

drop policy if exists "Users can read their own entries" on public.entries;
create policy "Users can read their own entries"
  on public.entries for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own entries" on public.entries;
create policy "Users can create their own entries"
  on public.entries for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own entries" on public.entries;
create policy "Users can update their own entries"
  on public.entries for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own entries" on public.entries;
create policy "Users can delete their own entries"
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
