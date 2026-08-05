create extension if not exists pgcrypto;

alter table public.wp_subjects
  drop constraint if exists wp_subjects_exam_type_check;

alter table public.wp_subjects
  add constraint wp_subjects_exam_type_check
  check (exam_type in ('jamb', 'waec', 'neco', 'post-utme'));

alter table public.wp_battles
  add column if not exists room_code text,
  add column if not exists is_private boolean not null default false,
  add column if not exists time_limit_seconds integer not null default 1800,
  add column if not exists question_count integer not null default 10,
  add column if not exists player_one_ready boolean not null default false,
  add column if not exists player_two_ready boolean not null default false;

create unique index if not exists wp_battles_room_code_unique_idx on public.wp_battles (room_code) where room_code is not null;

create or replace function public.ensure_battle_room_code()
returns trigger language plpgsql as $$
begin
  if new.is_private and (new.room_code is null or new.room_code = '') then
    loop
      new.room_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from public.wp_battles where room_code = new.room_code and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid));
    end loop;
  elsif not new.is_private then
    new.room_code := null;
  end if;

  return new;
end;
$$;

create trigger wp_battles_set_room_code
before insert or update of is_private, room_code on public.wp_battles
for each row execute function public.ensure_battle_room_code();
