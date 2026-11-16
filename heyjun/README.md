# HEYJUN Korean

외국인 대상 한국어 강사 이혜준의 1인 교육 사이트. 무료 학습 자료·한글 게임·커뮤니티로 방문자를 모으고 1:1 수업 신청으로 잇는다.
빌드 없는 정적 사이트다. 저장소 루트에서 `python3 -m http.server 8000`을 띄우고 `http://localhost:8000/heyjun/`을 연다.

## 두 가지 동작 방식

| | 실제 운영 (기본) | 데모 모드 |
|---|---|---|
| 조건 | `js/config.js`에 Supabase URL·publishable key가 있음 | 주소 끝에 `?demo=1`을 붙이거나 `js/config.js`를 비움 |
| 저장 | Supabase (로그인·Postgres·파일 저장소) | 이 브라우저에만 (localStorage, IndexedDB) |
| 권한 | 서버의 RLS·저장소 정책이 강제 | 화면과 브라우저 코드에서만 흉내 |
| 표시 | 일반 화면 | 화면 맨 위에 「데모 모드」 띠, 로그인 화면에 예시 계정 |

데모 모드의 권한은 보안 장치가 아니다. 역할별 화면을 미리 보는 용도로만 쓴다.

## Supabase

프로젝트 「HEYJUN Korean」(ref `reccmjdcnmpqkplagiiz`, 서울 리전)에 연결되어 있다. `supabase/schema.sql`과 `supabase/seed.sql`이 적용된 상태다.
새 프로젝트로 옮길 때는 SQL Editor에서 두 파일을 차례로 실행하고 `js/config.js`의 URL과 publishable key를 바꾼다. service_role 키는 넣지 않는다.

- 강사 계정: `private.admin_emails`에 등록된 이메일(schema.sql 참고)로 회원가입하고 인증 메일의 링크를 누르면 자동으로 강사(관리자)가 된다. 관리자 계정을 따로 만들지 않는다.
- Supabase 대시보드 Authentication → URL Configuration의 Site URL을 사이트 주소(`https://leeandlee0713.github.io/FCY/heyjun/`)로 맞춰야 인증 메일의 링크가 사이트로 돌아온다.
- 기본 메일 발송은 시간당 몇 통으로 제한된다. 가입자가 늘면 Supabase에 SMTP(메일 발송 서비스)를 연결한다.

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

로컬 서버를 띄운 상태에서 Playwright로 역할별 접근, 자료 등록·수정·삭제, 커뮤니티, 신청, 게임 완주를 확인한다(데모 저장소 기준, `?demo=1`).

`tests/live.cjs`는 같은 흐름을 실서버에서 확인한다. 인증된 테스트 계정 4개가 필요하며 파일 머리말에 적혀 있다.

`tests/rls.sql`은 빈 로컬 Postgres에 `schema.sql`을 올리고 방문자·회원·학생 A/B·강사 권한 40가지를 확인한다. heyjun 폴더에서 `psql -f tests/rls.sql`로 실행한다.

## 아직 채워야 하는 것

강사 사진·소개 문장·경력·교육 철학·수업 방식과 수업료·후기·문의 정보는 「입력 대기」로 표시된다. 강사가 「관리 → 강사 소개 · 운영 정보」에서 입력한다.
학습 자료 8편과 데모 커뮤니티 글은 「예시」로 표시되며 관리 화면에서 고치거나 지운다.
게임 그림은 기기의 이모지를 쓴다. 블록 조립의 선택적 음성 힌트만 브라우저 한국어 음성을 사용한다. 문장 만들기는 음성 설치 없이 실행된다.


## 2026-11 수정: 게임·동화책·이메일 인증

- `js/content.js`: 짝 맞추기/블록 조립의 Beginner, Intermediate, Advanced 어휘 각 10개 이상, 문장 만들기 12문제. 한 판은 무작위 10문제. 이전 `#/games/listen` 링크도 문장 만들기로 열린다.
- 짝 맞추기/블록 기록은 기존처럼 각 게임의 모든 레벨을 합산해 회원 DB에 저장한다. 새 문장 만들기 기록은 이 브라우저의 localStorage에 계정 ID별로 분리 저장한다(비회원은 별도 키). 기존 듣기 기록을 덮어쓰지 않으며 다른 기기로 동기화하지 않는다. 화면에 이 범위를 표시한다.
- 학습실은 문법/표현/동화책. 동화책이 없을 때 학습용 창작 예시 원본을 제공한다. 강사는 원본을 수정·저장해 본인 자료로 등록한 후 수정/삭제할 수 있다. 일반 자료와 같은 작성 양식에서 동화 본문을 `한국어 | English` 줄 단위로 작성한다.
- 기존 운영 DB의 category CHECK를 변경하지 않고 호환되도록 `js/resources.js`에서 동화책을 `category=expression`, `examples[0]._heyjun_kind=storybook_v1` 표식으로 직렬화한다. 화면/관리에서는 storybook으로 복원한다. 원래 문법/표현 자료는 변경하지 않는다. 기존 resources RLS가 그대로 쓰기·공개 권한을 검사한다. 이 방식에는 DB 관리자 설정이나 마이그레이션이 필요 없다.
- `js/auth.js`의 복귀 주소는 실제 GitHub Pages 경로로 고정했다. `#/verify`에서 메일 재발송 및 복사한 원본 인증 링크를 Supabase `verifyOtp`로 확인할 수 있다. 다른 프로젝트/비밀번호 재설정 링크는 거절하고 링크를 저장하거나 그 주소로 이동하지 않는다. 인증 완료 시 Supabase 세션으로 로그인한다. 관리자 승격은 기존 서버 트리거가 인증된 `hyejunlee23@gmail.com`에만 적용한다. 프런트엔드에서 역할을 부여하지 않는다.

### 인증 서버에 남아 있는 설정

2026-11-16 실서버의 가짜 만료 토큰 진단 요청은 HTTP 303과 `http://localhost:3000` 복귀 주소를 반환했다. 배포 주소를 redirect_to로 지정해도 같았다. 현재 연결된 Supabase 계정에는 HEYJUN 프로젝트 권한이 없으며 FCY MAP 프로젝트만 보인다. 따라서 서버 설정을 변경했다고 주장할 수 없다.

HEYJUN 프로젝트 소유자가 Authentication → URL Configuration에서 다음 **두 항목**을 설정해야 메일 링크 클릭만으로 복귀한다:

- Site URL: `https://leeandlee0713.github.io/FCY/heyjun/`
- Redirect URLs: `https://leeandlee0713.github.io/FCY/heyjun/`

[설정 화면](https://supabase.com/dashboard/project/reccmjdcnmpqkplagiiz/auth/url-configuration)

그 전에도 사이트의 **이메일 인증 도움** 화면에서 메일의 링크 주소를 복사해 인증 요청을 보낼 수 있다. 이미 링크를 눌렀다면 인증 자체는 끝났을 수 있으므로 먼저 로그인하고, 만료 오류가 나면 재발송한다. 실제 Gmail 수신과 유효한 링크로 완료하는 전체 과정은 해당 메일함 접근 없이 검증할 수 없다.

### 추가 검증

```bash
node --test heyjun/tests/*.test.mjs
node heyjun/tests/games.cjs
node heyjun/tests/flows.cjs
node heyjun/tests/revision.cjs
```

Playwright와 Chromium이 필요하다. `CHROMIUM_PATH`로 브라우저 경로를 지정할 수 있다. 게임 검증은 7개 게임/레벨 조합 70문제 완주, 터치·드래그, 오답·정답, 결과·재시작을 확인한다. revision 검증은 동화책 CRUD(데모), 390/768/1440px 화면, 실제 인증 서버의 무효 토큰 거절 및 만료 콜백 처리를 확인한다. 데모 권한 검증 결과는 운영 DB의 계정별 RLS 검증을 대신하지 않는다.
