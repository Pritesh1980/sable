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
