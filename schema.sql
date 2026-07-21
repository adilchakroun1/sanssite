-- SansSite — schéma de base de données (Supabase / Postgres)
-- À exécuter dans Supabase → SQL Editor → New query → Run

create extension if not exists "pgcrypto";

-- Abonnements : un plan par utilisateur, mis à jour uniquement par le webhook Stripe
create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'reperage' check (plan in ('reperage','cible','sniper','escouade')),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text default 'active',
  updated_at timestamptz default now()
);

-- Compteur d'usage quotidien pour faire respecter les limites du plan gratuit
create table if not exists usage_daily (
  user_id uuid references auth.users(id) on delete cascade,
  day date not null default current_date,
  search_count int not null default 0,
  primary key (user_id, day)
);

-- Prospects suivis dans le pipeline de chaque utilisateur
create table if not exists pipeline_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  place_id text not null,
  name text, phone text, address text,
  niche text, ville text, website text,
  score numeric,
  status text default 'Nouveau',
  updated_at timestamptz default now(),
  unique (user_id, place_id)
);

-- Row Level Security : chaque utilisateur ne voit que ses propres données
alter table subscriptions enable row level security;
alter table usage_daily enable row level security;
alter table pipeline_leads enable row level security;

create policy "own subscription" on subscriptions
  for select using (auth.uid() = user_id);

create policy "own usage" on usage_daily
  for select using (auth.uid() = user_id);

create policy "own leads select" on pipeline_leads
  for select using (auth.uid() = user_id);
create policy "own leads insert" on pipeline_leads
  for insert with check (auth.uid() = user_id);
create policy "own leads update" on pipeline_leads
  for update using (auth.uid() = user_id);

-- Note : les routes API (dossier /api) utilisent la clé "service role" côté serveur,
-- qui contourne RLS volontairement — c'est normal et sécurisé car cette clé
-- ne quitte jamais le serveur (jamais exposée au navigateur).
