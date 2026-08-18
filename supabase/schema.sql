-- Supabase schema for Tattoo accounts + sync.
-- Run in the Supabase SQL editor. RLS MUST stay enabled — the anon key is
-- publishable, so without these policies every row would be world-readable.

-- One document store for every collection.
create table if not exists public.collections (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  kind       text        not null,  -- idea | concept | board | artistMeta | conventionOverrides
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create index if not exists collections_user_kind_idx
  on public.collections (user_id, kind);

alter table public.collections enable row level security;

create policy "own rows - select" on public.collections
  for select using (auth.uid() = user_id);
create policy "own rows - insert" on public.collections
  for insert with check (auth.uid() = user_id);
create policy "own rows - update" on public.collections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows - delete" on public.collections
  for delete using (auth.uid() = user_id);

-- A bare `upsert()` is arrival-order, not last-write-wins: a delayed older
-- write that lands after a newer one has already been stored would silently
-- overwrite it (#56). This enforces the recency comparison atomically on the
-- database side — the row is only touched when the incoming write is newer
-- than what's stored, so out-of-order arrival can never move updated_at
-- backwards. security invoker (the default, made explicit) so the insert/
-- update below still runs as the calling role — RLS on `collections` keeps
-- applying, and a caller cannot pass someone else's p_user_id and have it
-- silently succeed; `with check (auth.uid() = user_id)` on the existing
-- policies rejects it. The fixed search_path is still worth pinning even
-- under invoker rights, so an unqualified reference here can't be shadowed.
create or replace function public.upsert_if_newer(
  p_user_id uuid,
  p_kind text,
  p_id text,
  p_data jsonb,
  p_updated_at timestamptz
) returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.collections (user_id, kind, id, data, updated_at)
  values (p_user_id, p_kind, p_id, p_data, p_updated_at)
  on conflict (user_id, kind, id) do update
    set data = excluded.data, updated_at = excluded.updated_at
    where collections.updated_at < excluded.updated_at;
$$;

-- Private image bucket. Keys are user/<uid>/<scope>/<id>/<uuid>.jpg, so the first
-- path segment after `user/` is the owner uid — used to scope storage policies.
insert into storage.buckets (id, name, public)
  values ('tattoo-images', 'tattoo-images', false)
  on conflict (id) do nothing;

create policy "own images - all" on storage.objects
  for all
  using (
    bucket_id = 'tattoo-images'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'tattoo-images'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Accounts are created admin-side (invite-only). Create the owner + the artist:
--   select auth.admin (Dashboard → Authentication → Add user), or use the
--   Management API. Set VITE_OWNER_EMAIL to the owner's address.
