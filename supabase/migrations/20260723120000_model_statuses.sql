create table if not exists public.model_statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  model_id text not null,
  status text not null check (status in ('live', 'degraded', 'down')),
  note text,
  updated_at timestamptz not null default now(),
  unique (user_id, model_id)
);

create index if not exists idx_model_statuses_user_model on public.model_statuses(user_id, model_id);
