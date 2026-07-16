-- Audio is never stored in this table. Deleting auth.users cascades all saved history.
create table if not exists public.pronunciation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null check (language in ('en', 'hi')),
  transcript text,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.pronunciation_history enable row level security;

create policy "users read their own pronunciation history"
  on public.pronunciation_history for select using (auth.uid() = user_id);
create policy "users insert their own pronunciation history"
  on public.pronunciation_history for insert with check (auth.uid() = user_id);
create policy "users delete their own pronunciation history"
  on public.pronunciation_history for delete using (auth.uid() = user_id);
