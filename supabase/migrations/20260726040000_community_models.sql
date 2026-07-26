-- The Black Market → Enry registry: community models a user has added.
--
-- These are experimental Hugging Face community fine-tunes/merges, added at
-- runtime from the Lab's Black Market page and served via HF Inference
-- Providers (router.huggingface.co, OpenAI-compatible). They are NOT in the
-- static MODEL_LIST/PROVIDERS in src/lib/nim.ts — routing is derived entirely
-- from `model_id` (community:<hfId>:<provider>), so no server code change is
-- needed to add or remove one.
--
-- Scope note: community models are manually chat-selectable only. They are
-- deliberately never given 'drive' scope (Drive auto-select is semi-autonomous)
-- and Cruise never reads the registry — unvetted models stay out of every
-- autonomous path.

create table if not exists public.community_models (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,

  -- Routing id: community:<hfId>:<provider>. Self-describing; nim.ts routes
  -- off the string alone. Unique per user so a model can't be added twice.
  model_id     text not null,

  hf_id        text not null,          -- source HF repo, e.g. NousResearch/Hermes-3-Llama-3.1-8B
  provider     text not null,          -- HF Inference Provider, e.g. featherless-ai
  label        text not null,          -- display label in the picker
  company      text not null,          -- creator/org, shown in the picker
  description  text not null default '',
  base_model   text,
  params       text,
  license      text,
  badges       jsonb not null default '[]'::jsonb,  -- carried from the catalog entry

  created_at   timestamptz not null default now(),

  unique (user_id, model_id)
);

create index if not exists idx_community_models_user on public.community_models(user_id, created_at desc);

alter table public.community_models enable row level security;
