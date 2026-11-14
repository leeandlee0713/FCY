-- HEYJUN Korean — 데이터베이스 구조와 접근 권한
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행한다. 그다음 seed.sql(예시 학습 자료)을 실행한다.
--
-- 역할: member(일반 회원) / student(학생) / teacher(강사, 관리자)
-- 강사 지정: private.admin_emails에 있는 이메일로 가입하고 "이메일 인증"을 마치면 자동으로 teacher가 된다.
--           이 목록은 브라우저에서 읽을 수 없다. 프런트엔드 코드에는 관리자 정보가 없다.

create schema if not exists private;
grant usage on schema private to anon, authenticated;

-- ── 회원 ─────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  role text not null default 'member' check (role in ('member', 'student', 'teacher')),
  created_at timestamptz not null default now()
);

create table private.admin_emails (email text primary key);
insert into private.admin_emails (email) values ('hyejunlee23@gmail.com');

create function private.is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'teacher');
$$;

-- 가입·이메일 인증 때 프로필을 만들고, 인증된 관리자 이메일이면 강사로 올린다.
create function private.sync_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_admin boolean;
begin
  v_admin := new.email_confirmed_at is not null
    and exists (select 1 from private.admin_emails a where a.email = lower(new.email));
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 40), ''), 'Member'),
    case when v_admin then 'teacher' else 'member' end
  )
  on conflict (id) do update
    set role = case when v_admin then 'teacher' else public.profiles.role end;
  return new;
end;
$$;

create trigger on_auth_user_sync
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function private.sync_profile();

-- 회원이 자기 역할을 바꾸지 못하게 막는다(강사만 바꿀 수 있다).
create function private.guard_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id then raise exception 'id cannot change'; end if;
  if new.role is distinct from old.role and (select auth.uid()) is not null and not private.is_teacher() then
    raise exception 'ROLE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_profile before update on public.profiles
  for each row execute function private.guard_profile();

alter table public.profiles enable row level security;
create policy "profiles: 누구나 이름 읽기" on public.profiles for select to anon, authenticated using (true);
create policy "profiles: 본인 또는 강사 수정" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.is_teacher())
  with check (id = (select auth.uid()) or private.is_teacher());

-- ── 학생 · 학생별 수업자료 ────────────────────────────────────────
create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  note text not null default '',
  user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create function private.owns_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.students where id = p_student and user_id = (select auth.uid()));
$$;
-- 파일 경로의 첫 폴더(학생 id)가 로그인한 학생 본인의 것인지 확인한다.
create function private.owns_student_path(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students
    where id::text = split_part(p_name, '/', 1) and user_id = (select auth.uid())
  );
$$;

alter table public.students enable row level security;
create policy "students: 강사 또는 본인만 읽기" on public.students for select to authenticated
  using (private.is_teacher() or user_id = (select auth.uid()));
create policy "students: 강사만 추가" on public.students for insert to authenticated with check (private.is_teacher());
create policy "students: 강사만 수정" on public.students for update to authenticated
  using (private.is_teacher()) with check (private.is_teacher());
create policy "students: 강사만 삭제" on public.students for delete to authenticated using (private.is_teacher());

create table public.lesson_materials (
  student_id uuid not null references public.students (id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  title text not null default '' check (char_length(title) <= 120),
  description text not null default '' check (char_length(description) <= 10000),
  links jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (student_id, slot)
);
alter table public.lesson_materials enable row level security;
create policy "materials: 강사 또는 해당 학생만 읽기" on public.lesson_materials for select to authenticated
  using (private.is_teacher() or private.owns_student(student_id));
create policy "materials: 강사만 추가" on public.lesson_materials for insert to authenticated with check (private.is_teacher());
create policy "materials: 강사만 수정" on public.lesson_materials for update to authenticated
  using (private.is_teacher()) with check (private.is_teacher());
create policy "materials: 강사만 삭제" on public.lesson_materials for delete to authenticated using (private.is_teacher());

create table public.lesson_files (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  path text not null unique,
  name text not null check (char_length(name) between 1 and 200),
  mime text not null default '',
  size bigint not null default 0,
  created_at timestamptz not null default now()
);
create index on public.lesson_files (student_id, slot);
alter table public.lesson_files enable row level security;
create policy "files: 강사 또는 해당 학생만 읽기" on public.lesson_files for select to authenticated
  using (private.is_teacher() or private.owns_student(student_id));
create policy "files: 강사만 추가" on public.lesson_files for insert to authenticated with check (private.is_teacher());
create policy "files: 강사만 삭제" on public.lesson_files for delete to authenticated using (private.is_teacher());

-- 강사가 학생 메뉴에 회원 계정을 연결한다(이메일로 찾는다). 이메일을 비우면 연결을 푼다.
create function public.link_student_account(p_student uuid, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if not private.is_teacher() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_email is null or trim(p_email) = '' then
    update public.profiles set role = 'member'
      where id = (select user_id from public.students where id = p_student) and role = 'student';
    update public.students set user_id = null where id = p_student;
    return;
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'NO_SUCH_MEMBER'; end if;
  if exists (select 1 from public.students where user_id = v_user and id <> p_student) then
    raise exception 'ALREADY_LINKED';
  end if;
  update public.students set user_id = v_user where id = p_student;
  update public.profiles set role = 'student' where id = v_user and role = 'member';
end;
$$;
-- 강사 화면에 연결된 계정의 이메일을 보여 준다.
create function public.student_accounts() returns table (student_id uuid, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_teacher() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query select s.id, u.email::text from public.students s join auth.users u on u.id = s.user_id;
end;
$$;
revoke execute on function public.link_student_account(uuid, text), public.student_accounts() from public, anon;
grant execute on function public.link_student_account(uuid, text), public.student_accounts() to authenticated;

-- ── 학습실(공개 자료) ─────────────────────────────────────────────
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('expression', 'grammar')),
  level text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced')),
  title text not null check (char_length(title) between 1 and 120),
  summary text not null default '' check (char_length(summary) <= 300),
  explanation text not null default '',
  examples jsonb not null default '[]',
  practice jsonb not null default '[]',
  is_sample boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.resources enable row level security;
create policy "resources: 공개 자료는 누구나 읽기" on public.resources for select to anon, authenticated
  using (published or private.is_teacher());
create policy "resources: 강사만 추가" on public.resources for insert to authenticated with check (private.is_teacher());
create policy "resources: 강사만 수정" on public.resources for update to authenticated
  using (private.is_teacher()) with check (private.is_teacher());
create policy "resources: 강사만 삭제" on public.resources for delete to authenticated using (private.is_teacher());

-- ── 커뮤니티 ─────────────────────────────────────────────────────
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  topic text not null check (topic in ('question', 'experience', 'life')),
  title text not null check (char_length(title) between 2 and 120),
  body text not null check (char_length(body) between 2 and 5000),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.posts (created_at desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.comments (post_id, created_at);

-- 기본 스팸 방지: 연속 작성 간격과 링크 개수를 제한한다(강사는 예외).
create function private.guard_post() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.author_id <> old.author_id then raise exception 'author cannot change'; end if;
    if new.hidden is distinct from old.hidden and not private.is_teacher() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    new.updated_at := now();
    return new;
  end if;
  if private.is_teacher() then return new; end if;
  if exists (select 1 from public.posts where author_id = new.author_id and created_at > now() - interval '30 seconds') then
    raise exception 'RATE_LIMIT';
  end if;
  if (char_length(new.body) - char_length(replace(lower(new.body), 'http', ''))) / 4 > 3 then
    raise exception 'TOO_MANY_LINKS';
  end if;
  return new;
end;
$$;
create trigger guard_post before insert or update on public.posts
  for each row execute function private.guard_post();

create function private.guard_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.author_id <> old.author_id or new.post_id <> old.post_id then raise exception 'cannot move comment'; end if;
    return new;
  end if;
  if private.is_teacher() then return new; end if;
  if exists (select 1 from public.comments where author_id = new.author_id and created_at > now() - interval '10 seconds') then
    raise exception 'RATE_LIMIT';
  end if;
  if (char_length(new.body) - char_length(replace(lower(new.body), 'http', ''))) / 4 > 3 then
    raise exception 'TOO_MANY_LINKS';
  end if;
  return new;
end;
$$;
create trigger guard_comment before insert or update on public.comments
  for each row execute function private.guard_comment();

alter table public.posts enable row level security;
create policy "posts: 누구나 읽기(숨긴 글 제외)" on public.posts for select to anon, authenticated
  using (not hidden or author_id = (select auth.uid()) or private.is_teacher());
create policy "posts: 회원이 본인 이름으로 작성" on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and hidden = false);
create policy "posts: 본인 또는 강사 수정" on public.posts for update to authenticated
  using (author_id = (select auth.uid()) or private.is_teacher())
  with check (author_id = (select auth.uid()) or private.is_teacher());
create policy "posts: 본인 또는 강사 삭제" on public.posts for delete to authenticated
  using (author_id = (select auth.uid()) or private.is_teacher());

alter table public.comments enable row level security;
create policy "comments: 누구나 읽기" on public.comments for select to anon, authenticated using (true);
create policy "comments: 회원이 본인 이름으로 작성" on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "comments: 본인 또는 강사 수정" on public.comments for update to authenticated
  using (author_id = (select auth.uid()) or private.is_teacher())
  with check (author_id = (select auth.uid()) or private.is_teacher());
create policy "comments: 본인 또는 강사 삭제" on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or private.is_teacher());

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter_id)
);
alter table public.reports enable row level security;
create policy "reports: 회원이 신고" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and resolved = false);
create policy "reports: 강사만 읽기" on public.reports for select to authenticated using (private.is_teacher());
create policy "reports: 강사만 처리" on public.reports for update to authenticated
  using (private.is_teacher()) with check (private.is_teacher());
create policy "reports: 강사만 삭제" on public.reports for delete to authenticated using (private.is_teacher());

-- ── 1:1 수업 신청 ────────────────────────────────────────────────
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  level text not null check (char_length(level) <= 40),
  goal text not null check (char_length(goal) between 1 and 1000),
  times text not null check (char_length(times) between 1 and 500),
  contact text not null check (char_length(contact) between 3 and 200),
  message text not null default '' check (char_length(message) <= 2000),
  status text not null default 'new' check (status in ('new', 'contacted', 'done')),
  created_at timestamptz not null default now()
);
-- 로그인하지 않은 방문자도 신청할 수 있으므로 전체 접수 속도를 제한한다.
create function private.guard_application() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.applications where created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'RATE_LIMIT';
  end if;
  return new;
end;
$$;
create trigger guard_application before insert on public.applications
  for each row execute function private.guard_application();

alter table public.applications enable row level security;
create policy "applications: 누구나 신청" on public.applications for insert to anon, authenticated
  with check (status = 'new');
create policy "applications: 강사만 읽기" on public.applications for select to authenticated using (private.is_teacher());
create policy "applications: 강사만 처리" on public.applications for update to authenticated
  using (private.is_teacher()) with check (private.is_teacher());
create policy "applications: 강사만 삭제" on public.applications for delete to authenticated using (private.is_teacher());

-- ── 게임 기록(회원별) ─────────────────────────────────────────────
create table public.game_scores (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  game text not null check (game in ('match', 'blocks', 'listen')),
  best_score int not null default 0 check (best_score between 0 and 1000),
  best_streak int not null default 0 check (best_streak between 0 and 1000),
  plays int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);
alter table public.game_scores enable row level security;
create policy "scores: 본인 기록 읽기" on public.game_scores for select to authenticated using (user_id = (select auth.uid()));
create policy "scores: 본인 기록 추가" on public.game_scores for insert to authenticated with check (user_id = (select auth.uid()));
create policy "scores: 본인 기록 수정" on public.game_scores for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── 강사 소개 · 운영 정보 ─────────────────────────────────────────
create table public.site_settings (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
create policy "settings: 누구나 읽기" on public.site_settings for select to anon, authenticated using (true);
create policy "settings: 강사만 추가" on public.site_settings for insert to authenticated with check (private.is_teacher());
create policy "settings: 강사만 수정" on public.site_settings for update to authenticated
  using (private.is_teacher()) with check (private.is_teacher());

-- ── 테이블 접근 권한(RLS가 행 단위로 다시 걸러 낸다) ───────────────
grant select on public.profiles, public.resources, public.posts, public.comments, public.site_settings to anon;
grant insert on public.applications to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ── 파일 저장소 ──────────────────────────────────────────────────
-- lesson-files: 비공개. 경로는 "<학생 id>/<자료 번호>/<파일>". 강사와 해당 학생만 내려받을 수 있다.
-- public-media: 강사 소개 사진 등 공개 이미지. 강사만 올릴 수 있다.
insert into storage.buckets (id, name, public, file_size_limit)
values ('lesson-files', 'lesson-files', false, 20971520), ('public-media', 'public-media', true, 5242880)
on conflict (id) do nothing;

create policy "lesson-files: 강사 또는 해당 학생만 읽기" on storage.objects for select to authenticated
  using (bucket_id = 'lesson-files' and (private.is_teacher() or private.owns_student_path(name)));
create policy "lesson-files: 강사만 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'lesson-files' and private.is_teacher());
create policy "lesson-files: 강사만 수정" on storage.objects for update to authenticated
  using (bucket_id = 'lesson-files' and private.is_teacher());
create policy "lesson-files: 강사만 삭제" on storage.objects for delete to authenticated
  using (bucket_id = 'lesson-files' and private.is_teacher());
create policy "public-media: 강사만 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-media' and private.is_teacher());
create policy "public-media: 강사만 수정" on storage.objects for update to authenticated
  using (bucket_id = 'public-media' and private.is_teacher());
create policy "public-media: 강사만 삭제" on storage.objects for delete to authenticated
  using (bucket_id = 'public-media' and private.is_teacher());
