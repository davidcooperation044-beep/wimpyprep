create extension if not exists pgcrypto;

create table if not exists public.wp_battles (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.wp_subjects(id),
  year integer,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'completed', 'cancelled')),
  player_one_id uuid not null references auth.users(id),
  player_two_id uuid references auth.users(id),
  question_ids uuid[] not null default '{}',
  started_at timestamptz,
  ends_at timestamptz,
  completed_at timestamptz,
  winner_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.wp_battle_answers (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.wp_battles(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  question_id uuid not null references public.wp_questions(id),
  selected_option text not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  unique (battle_id, user_id, question_id)
);

alter table public.wp_battles enable row level security;
alter table public.wp_battle_answers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policy where polname = 'wp_battles_participant_select' and polrelid = 'public.wp_battles'::regclass) then
    create policy wp_battles_participant_select on public.wp_battles
      for select using (auth.uid() = player_one_id or auth.uid() = player_two_id);
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policy where polname = 'wp_battles_waiting_select' and polrelid = 'public.wp_battles'::regclass) then
    create policy wp_battles_waiting_select on public.wp_battles
      for select using (status = 'waiting');
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policy where polname = 'wp_battle_answers_owner' and polrelid = 'public.wp_battle_answers'::regclass) then
    create policy wp_battle_answers_owner on public.wp_battle_answers
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policy where polname = 'wp_battle_answers_opponent_select' and polrelid = 'public.wp_battle_answers'::regclass) then
    create policy wp_battle_answers_opponent_select on public.wp_battle_answers
      for select using (
        exists (
          select 1 from public.wp_battles b
          where b.id = battle_id
            and (b.player_one_id = auth.uid() or b.player_two_id = auth.uid())
        )
      );
  end if;
end;
$$;
