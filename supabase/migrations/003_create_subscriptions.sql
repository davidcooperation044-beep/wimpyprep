create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_name text not null,
  plan_name text not null,
  status text not null check (status in ('active', 'cancelled', 'past_due')) default 'active',
  price numeric,
  billing_interval text,
  started_at timestamptz not null default now(),
  cancelled_at timestamptz,
  next_billing_date timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, product_name)
);

alter table public.subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'subscriptions_owner'
      and polrelid = 'public.subscriptions'::regclass
  ) then
    create policy subscriptions_owner on public.subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'subscriptions_select_service'
      and polrelid = 'public.subscriptions'::regclass
  ) then
    create policy subscriptions_select_service on public.subscriptions for select using (auth.role() = 'service_role');
  end if;
end;
$$;
