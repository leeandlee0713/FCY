# HEYJUN Korean

외국인 대상 한국어 강사 이혜준의 1인 교육 사이트. 무료 학습 자료·한글 게임·커뮤니티로 방문자를 모으고 1:1 수업 신청으로 잇는다.
빌드 없는 정적 사이트다. 저장소 루트에서 `python3 -m http.server 8000`을 띄우고 `http://localhost:8000/heyjun/`을 연다.

## 두 가지 동작 방식

| | 데모 모드 (지금) | 실제 운영 |
|---|---|---|
| 조건 | `js/config.js`가 비어 있음 | `js/config.js`에 Supabase URL·publishable key 입력 |
| 저장 | 이 브라우저에만 (localStorage, IndexedDB) | Supabase (로그인·Postgres·파일 저장소) |
| 권한 | 화면과 브라우저 코드에서만 흉내 | 서버의 RLS·저장소 정책이 강제 |
| 표시 | 화면 맨 위에 「데모 모드」 띠, 로그인 화면에 예시 계정 | 띠와 예시 계정이 사라짐 |

데모 모드의 권한은 보안 장치가 아니다. 실제 학생 자료는 Supabase를 연결한 뒤에 올린다.

## Supabase 연결 순서

1. Supabase 프로젝트를 만든다.
2. SQL Editor에서 `supabase/schema.sql` 전체를 실행하고, 이어서 `supabase/seed.sql`(예시 학습 자료)을 실행한다.
3. Authentication 설정에서 이메일 인증(Confirm email)을 켜 두고, Site URL을 사이트 주소로 맞춘다.
4. `js/config.js`에 Project URL과 publishable key를 넣는다. service_role 키는 넣지 않는다.
5. 강사가 `private.admin_emails`에 등록된 이메일(schema.sql 참고)로 회원가입하고 인증 메일의 링크를 누르면 자동으로 강사(관리자)가 된다. 관리자 계정을 따로 만들지 않는다.

기본 메일 발송은 시간당 몇 통으로 제한된다. 가입자가 늘면 Supabase에 SMTP(메일 발송 서비스)를 연결한다.

## 역할과 권한

| | 방문자 | 회원 | 학생 | 강사 |
|---|---|---|---|---|
| 학습실·커뮤니티 읽기, 게임, 수업 신청 | ○ | ○ | ○ | ○ |
| 커뮤니티 글·댓글 쓰기, 신고, 게임 기록 계정 저장 | | ○ | ○ | ○ |
| 본인 수업실(수업자료 1~3, 파일) 보기 | | | ○ | ○ |
| 학생·수업자료·학습 자료·신청·신고·강사 소개 관리 | | | | ○ |

학생은 강사가 「관리 → 학생 · 수업실」에서 학생을 만들고 그 학생이 가입한 이메일을 연결하면 생긴다.
수업자료 파일은 `lesson-files` 저장소의 `<학생 id>/<자료 번호>/` 아래에 들어가고, 강사와 해당 학생만 내려받을 수 있다.

## 파일

- `index.html`, `css/style.css` — 뼈대와 디자인 토큰(색·폰트·간격·모서리는 `:root`에서 고친다)
- `js/app.js` 메뉴와 화면 전환 · `js/views.js` 화면 · `js/admin.js` 강사 관리 화면 · `js/games.js` 게임 3종
- `js/content.js` — 예시 학습 자료와 게임 문제(여기서 검수·교체)
- `js/store-local.js` 데모 저장소 · `js/store-supabase.js` 실제 저장소 · `js/store.js` 둘 중 선택
- `supabase/schema.sql` 테이블·권한 · `supabase/seed.sql` 예시 자료(`node supabase/make-seed.mjs`로 다시 만든다)

## 검증

```bash
node --test heyjun/tests/hangul.test.mjs
```

한글 조합과 게임 문제 형식을 확인한다.

```bash
node heyjun/tests/flows.cjs
```

```bash
node heyjun/tests/games.cjs
```

로컬 서버를 띄운 상태에서 Playwright로 역할별 접근, 자료 등록·수정·삭제, 커뮤니티, 신청, 게임 완주를 확인한다(데모 저장소 기준).

`tests/rls.sql`은 빈 로컬 Postgres에 `schema.sql`을 올리고 방문자·회원·학생 A/B·강사 권한 40가지를 확인한다. heyjun 폴더에서 `psql -f tests/rls.sql`로 실행한다.

## 아직 채워야 하는 것

강사 사진·소개 문장·경력·교육 철학·수업 방식과 수업료·후기·문의 정보는 「입력 대기」로 표시된다. 강사가 「관리 → 강사 소개 · 운영 정보」에서 입력한다.
학습 자료 8편과 데모 커뮤니티 글은 「예시」로 표시되며 관리 화면에서 고치거나 지운다.
게임 그림은 기기의 이모지를 쓴다. 한국어 음성은 브라우저 내장 음성을 쓰며, 음성이 없는 기기에서는 듣기 게임이 시작되지 않고 안내가 나온다.
