-- Private, unlimited notes in each student's classroom. Existing materials/files remain intact.
create table public.classroom_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  category text not null check (category in ('lesson', 'diary', 'conversation')),
  title text not null check (char_length(trim(title)) between 1 and 120),
  summary text not null default '' check (char_length(summary) <= 300),
  explanation text not null default '' check (char_length(explanation) <= 50000),
  examples jsonb not null default '[]' check (jsonb_typeof(examples) = 'array'),
  practice jsonb not null default '[]' check (jsonb_typeof(practice) = 'array'),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index classroom_notes_student_created_idx on public.classroom_notes(student_id, created_at desc);
alter table public.classroom_notes enable row level security;
revoke all on public.classroom_notes from anon, authenticated;
grant select on public.classroom_notes to anon;
grant select, insert, update, delete on public.classroom_notes to authenticated;
grant all on public.classroom_notes to service_role;
create policy "classroom notes read" on public.classroom_notes for select to authenticated
  using ((select private.is_teacher()) or (published and private.owns_student(student_id)));
create policy "classroom notes insert" on public.classroom_notes for insert to authenticated
  with check ((select private.is_teacher()));
create policy "classroom notes update" on public.classroom_notes for update to authenticated
  using ((select private.is_teacher())) with check ((select private.is_teacher()));
create policy "classroom notes delete" on public.classroom_notes for delete to authenticated
  using ((select private.is_teacher()));
