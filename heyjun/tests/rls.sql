-- schema.sql의 접근 권한을 실제 Postgres에서 확인한다.
-- 빈 로컬 Postgres에서: psql -v ON_ERROR_STOP=1 -f tests/rls.sql  (heyjun 폴더에서 실행)
-- Supabase가 제공하는 auth·storage 부분은 아래에 최소한으로 흉내 낸다.
\set ON_ERROR_STOP 1
\set QUIET 1
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated;
grant all on storage.objects to anon, authenticated;

\i supabase/schema.sql
\i supabase/seed.sql

-- 가입: 강사(관리자 이메일), 학생 A·B, 일반 회원
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'HyejunLee23@gmail.com', '{"display_name":"혜준"}'),
  ('00000000-0000-0000-0000-00000000000b', 'a@example.com', '{"display_name":"A"}'),
  ('00000000-0000-0000-0000-00000000000c', 'b@example.com', '{"display_name":"B"}'),
  ('00000000-0000-0000-0000-00000000000d', 'm@example.com', '{"display_name":"M"}');

create schema t; grant usage on schema t to anon, authenticated;
create function t.as_user(p text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(p, ''), false); end $$;
create function t.fails(p_sql text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return true; end $$;
create function t.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint; begin execute p_sql; get diagnostics n = row_count; return n; end $$;
create table t.results (name text, pass boolean);
grant all on t.results to anon, authenticated;

insert into t.results select '인증 전에는 관리자 이메일도 일반 회원', (select role from profiles where display_name = '혜준') = 'member';
update auth.users set email_confirmed_at = now();
insert into t.results select '이메일 인증 후 관리자 이메일만 강사가 됨',
  (select role from profiles where display_name = '혜준') = 'teacher' and (select count(*) from profiles where role = 'teacher') = 1;

-- 강사: 학생 만들기, 계정 연결, 자료·파일 등록
set role authenticated; select t.as_user('00000000-0000-0000-0000-00000000000a');
insert into students (id, name) values ('10000000-0000-0000-0000-00000000000a', 'A'), ('10000000-0000-0000-0000-00000000000b', 'B');
select link_student_account('10000000-0000-0000-0000-00000000000a', 'a@example.com');
select link_student_account('10000000-0000-0000-0000-00000000000b', 'b@example.com');
insert into lesson_materials (student_id, slot, title) values ('10000000-0000-0000-0000-00000000000a', 1, 'A 자료'), ('10000000-0000-0000-0000-00000000000b', 1, 'B 자료');
insert into lesson_files (student_id, slot, path, name) values ('10000000-0000-0000-0000-00000000000b', 1, '10000000-0000-0000-0000-00000000000b/1/x.pdf', 'x.pdf');
insert into storage.objects (bucket_id, name) values ('lesson-files', '10000000-0000-0000-0000-00000000000a/1/a.pdf'), ('lesson-files', '10000000-0000-0000-0000-00000000000b/1/x.pdf');
insert into t.results select '강사는 모든 학생·자료를 봄', (select count(*) from students) = 2 and (select count(*) from lesson_materials) = 2;
insert into t.results select '연결된 계정은 학생 역할이 됨', (select count(*) from profiles where role = 'student') = 2;
insert into t.results select '강사는 연결 계정 이메일을 봄', (select count(*) from student_accounts()) = 2;
insert into t.results select '이미 연결된 계정은 다른 학생에 연결 불가', t.fails($$select link_student_account('10000000-0000-0000-0000-00000000000b', 'a@example.com')$$);

-- 학생 A
select t.as_user('00000000-0000-0000-0000-00000000000b');
insert into t.results select '학생 A는 본인 메뉴만 봄', (select array_agg(name) from students) = array['A'];
insert into t.results select '학생 A는 본인 자료만 봄', (select array_agg(title) from lesson_materials) = array['A 자료'];
insert into t.results select '학생 A는 학생 B의 파일 목록을 못 봄', (select count(*) from lesson_files) = 0;
insert into t.results select '학생 A는 저장소에서 본인 파일만 봄', (select array_agg(name) from storage.objects) = array['10000000-0000-0000-0000-00000000000a/1/a.pdf'];
insert into t.results select '학생은 저장소에 올릴 수 없음', t.fails($$insert into storage.objects (bucket_id, name) values ('lesson-files', '10000000-0000-0000-0000-00000000000a/1/hack.pdf')$$);
insert into t.results select '학생은 자료를 고칠 수 없음', t.affected($$update lesson_materials set title = 'hack'$$) = 0;
insert into t.results select '학생은 학생을 만들 수 없음', t.fails($$insert into students (name) values ('hack')$$);
insert into t.results select '학생은 자신을 강사로 바꿀 수 없음', t.fails($$update profiles set role = 'teacher' where id = auth.uid()$$);
insert into t.results select '학생은 계정 연결 함수를 쓸 수 없음', t.fails($$select link_student_account('10000000-0000-0000-0000-00000000000b', 'a@example.com')$$);
insert into t.results select '학생은 이름은 바꿀 수 있음', t.affected($$update profiles set display_name = 'A2' where id = auth.uid()$$) = 1;
insert into t.results select '학생은 남의 프로필을 못 바꿈', t.affected($$update profiles set display_name = 'x' where id <> auth.uid()$$) = 0;
insert into t.results select '학생은 수업 신청 목록을 못 봄', (select count(*) from applications) = 0;
insert into t.results select '학생은 학습 자료를 못 씀', t.fails($$insert into resources (category, title) values ('grammar', 'hack')$$);
insert into t.results select '학생은 운영 정보를 못 바꿈', t.fails($$insert into site_settings (key) values ('teacher_profile')$$);

-- 일반 회원: 커뮤니티
select t.as_user('00000000-0000-0000-0000-00000000000d');
insert into t.results select '회원은 학생 메뉴가 전혀 안 보임', (select count(*) from students) = 0 and (select count(*) from lesson_materials) = 0 and (select count(*) from storage.objects) = 0;
insert into posts (id, topic, title, body) values ('20000000-0000-0000-0000-000000000001', 'question', '첫 글', '안녕하세요');
insert into t.results select '회원이 글을 씀', (select count(*) from posts) = 1;
insert into t.results select '연속 글쓰기는 제한됨', t.fails($$insert into posts (topic, title, body) values ('question', '둘째 글', '바로 또')$$);
insert into t.results select '남의 이름으로 글을 쓸 수 없음', t.fails($$insert into posts (author_id, topic, title, body) values ('00000000-0000-0000-0000-00000000000b', 'life', '사칭', '사칭 글')$$);
insert into comments (post_id, body) values ('20000000-0000-0000-0000-000000000001', '댓글');
insert into t.results select '링크가 많은 댓글은 거절됨', t.fails($$insert into comments (post_id, body) values ('20000000-0000-0000-0000-000000000001', 'http://a http://b http://c http://d')$$);
select t.as_user('00000000-0000-0000-0000-00000000000b');
insert into t.results select '남의 글은 수정·삭제 불가', t.affected($$update posts set title = 'hack'$$) = 0 and t.affected($$delete from posts$$) = 0 and t.affected($$delete from comments$$) = 0;
insert into reports (target_type, target_id, reason) values ('post', '20000000-0000-0000-0000-000000000001', '스팸');
insert into t.results select '같은 글을 두 번 신고할 수 없음', t.fails($$insert into reports (target_type, target_id, reason) values ('post', '20000000-0000-0000-0000-000000000001', '또')$$);
insert into t.results select '신고 내용은 회원에게 안 보임', (select count(*) from reports) = 0;
select t.as_user('00000000-0000-0000-0000-00000000000a');
update posts set hidden = true;
insert into t.results select '강사는 신고를 보고 글을 숨김', (select count(*) from reports) = 1 and (select bool_and(hidden) from posts);
select t.as_user('00000000-0000-0000-0000-00000000000d');
insert into t.results select '글쓴이는 숨김을 스스로 풀 수 없음', t.fails($$update posts set hidden = false$$);
insert into game_scores (game, best_score) values ('match', 7);
select t.as_user('00000000-0000-0000-0000-00000000000b');
insert into t.results select '게임 기록은 계정별로 분리됨', (select count(*) from game_scores) = 0;

-- 비로그인 방문자
reset role; set role anon; select t.as_user(null);
insert into t.results select '방문자는 공개 학습 자료를 읽음', (select count(*) from resources) = 8;
insert into t.results select '방문자에게 숨긴 글은 안 보임', (select count(*) from posts) = 0;
insert into t.results select '방문자는 학생·자료·신청 테이블에 접근 불가',
  t.fails('select 1 from students') and t.fails('select 1 from lesson_materials') and t.fails('select 1 from lesson_files') and t.fails('select 1 from applications');
insert into t.results select '방문자는 저장소 파일을 못 봄', (select count(*) from storage.objects) = 0;
insert into t.results select '방문자는 관리자 이메일 목록을 못 읽음', t.fails('select 1 from private.admin_emails');
insert into applications (name, level, goal, times, contact) values ('Kim', '초급', '여행', '주말', 'k@example.com');
insert into t.results select '방문자는 수업 신청을 보낼 수 있음', true;
insert into t.results select '방문자는 글을 쓸 수 없음', t.fails($$insert into posts (topic, title, body) values ('life', '익명', '익명 글')$$);
insert into t.results select '방문자는 계정 연결 함수를 쓸 수 없음', t.fails($$select link_student_account('10000000-0000-0000-0000-00000000000b', 'm@example.com')$$);
reset role;
insert into t.results select '강사 화면에 신청이 저장됨', (select count(*) from applications) = 1;

\set QUIET 0
\pset footer off
select case when pass then 'PASS' else 'FAIL' end as result, name from t.results order by pass, name;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from t.results;
