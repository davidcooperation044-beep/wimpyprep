create extension if not exists pgcrypto;

create table if not exists public.wp_subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  exam_type text not null check (exam_type in ('jamb', 'waec')),
  created_at timestamptz not null default now()
);

create table if not exists public.wp_questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.wp_subjects(id),
  topic text,
  year integer,
  question_text text not null,
  options jsonb not null,
  correct_option text not null,
  explanation text,
  difficulty smallint not null default 2 check (difficulty between 1 and 5),
  created_at timestamptz not null default now()
);

create table if not exists public.wp_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.wp_questions(id),
  selected_option text not null,
  is_correct boolean not null,
  session_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wp_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('practice', 'mock_exam')),
  subject_ids uuid[] not null,
  score numeric,
  total_questions integer,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.wp_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  freeze_tokens integer not null default 0,
  last_active_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.wp_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (referred_id)
);

alter table public.wp_subjects enable row level security;
alter table public.wp_questions enable row level security;
alter table public.wp_attempts enable row level security;
alter table public.wp_sessions enable row level security;
alter table public.wp_streaks enable row level security;
alter table public.wp_referrals enable row level security;

create policy if not exists wp_subjects_select_public on public.wp_subjects for select using (true);
create policy if not exists wp_subjects_write_service on public.wp_subjects for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists wp_questions_select_public on public.wp_questions for select using (true);
create policy if not exists wp_questions_write_service on public.wp_questions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists wp_attempts_owner on public.wp_attempts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists wp_sessions_owner on public.wp_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists wp_streaks_owner on public.wp_streaks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists wp_referrals_owner on public.wp_referrals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
