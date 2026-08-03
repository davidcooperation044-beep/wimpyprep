create extension if not exists pgcrypto;

create table if not exists public.wp_user_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.wp_subjects(id) on delete cascade,
  exam_type text not null check (exam_type in ('jamb', 'waec')),
  created_at timestamptz not null default now(),
  unique (user_id, subject_id, exam_type)
);

alter table public.wp_user_subjects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'wp_user_subjects_owner'
      and polrelid = 'public.wp_user_subjects'::regclass
  ) then
    create policy wp_user_subjects_owner on public.wp_user_subjects
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end;
$$;
