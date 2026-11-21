import { classroomList } from './classroom-notes.js';
// 화면들. 각 함수는 { title, html, mount(root) } 를 돌려준다.
import { $, $$, esc, bi, toast, fmtDate, fmtSize, safeUrl, submitWith, LEVELS, CATEGORIES, CLASS_CATEGORIES, TOPICS } from './util.js';
import { store } from './store.js';
import { GAME_LIST, mountGame } from './games.js';

export const refresh = () => window.dispatchEvent(new Event('heyjun:refresh'));
export const refreshNav = () => window.dispatchEvent(new Event('heyjun:nav'));
const go = (hash) => { if (location.hash === hash) refresh(); else location.hash = hash; };

const page = (head, body) => `<div class="wrap page"><header class="page-head">${head}</header>${body}</div>`;
const pending = (what) => `<span class="pending">${bi(`입력 대기 · ${what}`, 'To be added by the teacher')}</span>`;
const sampleTag = `<span class="tag tag-sample">${bi('예시', 'Sample')}</span>`;
const levelTag = (l) => `<span class="tag tag-peach">${bi(...(LEVELS[l] || LEVELS.beginner))}</span>`;
const catTag = (c) => `<span class="tag">${bi(...(CATEGORIES[c] || CATEGORIES.expression))}</span>`;
const topicTag = (t) => `<span class="tag tag-lav">${bi(...(TOPICS[t] || TOPICS.question))}</span>`;
const empty = (title, text, action = '') => `<div class="empty"><b>${title}</b>${text}${action ? `<div class="btn-row" style="justify-content:center;margin-top:16px">${action}</div>` : ''}</div>`;
const status = '<p class="form-status" role="alert" tabindex="-1" hidden></p>';
const honeypot = '<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>';
const paragraphs = (text) => String(text || '').split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('');

export const notFound = () => ({ title: '페이지 없음', html: page(`<h1>${bi('페이지를 찾을 수 없습니다', 'Page not found')}</h1>`, `<a class="btn btn-primary" href="#/">${bi('첫 화면으로', 'Go home')}</a>`) });
export const errorView = (e) => ({ title: '오류', html: page(`<h1>${bi('문제가 생겼습니다', 'Something went wrong')}</h1>`,
  `<p class="notice notice-bad" role="alert">${esc(e?.message || e)}</p><button class="btn btn-secondary" onclick="location.reload()">${bi('다시 시도', 'Try again')}</button>`) });
export const forbidden = (text) => ({ title: '접근 권한 없음', html: page(`<h1>${bi('볼 수 없는 페이지입니다', 'You cannot view this page')}</h1>`,
  `<p class="notice notice-bad" role="alert">${text || bi('이 페이지를 볼 권한이 없습니다.', 'You do not have permission to view this page.')}</p>
   <div class="btn-row">${store.user ? '' : `<a class="btn btn-primary" href="#/login">${bi('로그인', 'Log in')}</a>`}<a class="btn btn-secondary" href="#/">${bi('첫 화면으로', 'Go home')}</a></div>`) });

function resourceCard(r) {
  return `<a class="card" href="#/learn/${esc(r.id)}">
    <div class="tags">${catTag(r.category)}${levelTag(r.level)}${r.is_sample ? sampleTag : ''}${r.published === false ? `<span class="tag tag-sample">${bi('비공개', 'Draft')}</span>` : ''}</div>
    <h3>${esc(r.title)}</h3><p class="muted">${esc(r.summary)}</p></a>`;
}

// ── 첫 화면 ──────────────────────────────────────────────────────
export async function home() {
  const [resources, posts, profile, students] = await Promise.all([
    store.listResources().catch(() => []), store.listPosts().catch(() => []),
    store.getTeacherProfile().catch(() => ({})), store.user ? store.listStudents().catch(() => []) : [],
  ]);
  const u = store.user;
  const mine = u && u.role !== 'teacher' ? students[0] : null;
  const html = `
  <section class="hero"><div class="wrap">
    ${mine ? `<div class="card tint-sage classroom-cta"><div><strong>${esc(u.name)}님, 안녕하세요.</strong> ${bi('수업자료가 준비되어 있습니다.', 'Your lesson materials are ready.')}</div>
      <a class="btn btn-primary" href="#/lessons/${esc(mine.id)}">${bi('내 수업실 가기', 'Go to my classroom')}</a></div>` : ''}
    <div class="hero-grid">
      <div>
        <h1>외국인을 위한 한국어,<br>편안하게 시작하세요</h1>
        <p class="lead">한국어를 처음 배우는 성인 학습자를 위한 1:1 수업과 무료 학습 공간입니다.</p>
        <p class="lead-en" lang="en">Korean for adult learners from anywhere. Study free notes and games at your own pace, or learn 1:1 with teacher Hyejun Lee.</p>
        <div class="btn-row">
          <a class="btn btn-primary btn-lg" href="#/learn">${bi('무료로 한국어 배우기', 'Learn Korean free')}</a>
          <a class="btn btn-secondary btn-lg" href="#/apply">${bi('1:1 수업 신청', 'Apply for 1:1 lessons')}</a>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div><b>한글</b><span class="en">Hangul</span></div><div><b>안녕</b><span class="en">Hello</span></div>
        <div><b>감사</b><span class="en">Thanks</span></div><div><b>친구</b><span class="en">Friend</span></div>
      </div>
    </div>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="section-head"><h2>${bi('무료 학습실', 'Free study room')}</h2><a href="#/learn">${bi('전체 자료 보기', 'All notes')} →</a></div>
    <div class="grid g3">
      <a class="card tint-sage" href="#/learn?cat=expression"><div class="card-icon" aria-hidden="true">💬</div><h3>${bi('한국어 표현', 'Expressions')}</h3>
        <p>인사, 가게, 자기소개처럼 바로 쓰는 말. <span class="en" lang="en">Phrases you can use today.</span></p></a>
      <a class="card tint-peach" href="#/learn?cat=grammar"><div class="card-icon" aria-hidden="true">📘</div><h3>${bi('한국어 문법', 'Grammar')}</h3>
        <p>조사와 문장 끝을 쉬운 설명과 예문으로. <span class="en" lang="en">Particles and endings, explained simply.</span></p></a>
      <a class="card tint-lav" href="#/learn?cat=storybook"><div class="card-icon" aria-hidden="true">📚</div><h3>${bi('동화책', 'Storybooks')}</h3><p>${bi('짧은 이야기를 한국어와 영어로 읽어요.', 'Read short stories in Korean and English.')}</p></a>
    </div>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="section-head"><h2>${bi('한글 배우기 게임', 'Hangul games')}</h2><span class="muted small">${bi('설치 없이 바로 시작 · 시간 제한 없음', 'No install · no time limit')}</span></div>
    <div class="grid g3">
      ${GAME_LIST.map((g) => `<a class="card" href="#/games/${g.id}"><div class="card-icon" aria-hidden="true">${g.icon}</div>
        <h3>${bi(g.ko, g.en)}</h3><p class="muted">${g.desc}<br><span class="en" lang="en">${g.descEn}</span></p></a>`).join('')}
    </div>
  </div></section>

  <section class="section"><div class="wrap grid g2">
    <div class="card">
      <span class="tag">${bi('강사 소개', 'Teacher')}</span>
      <h2 style="margin-top:8px">이혜준 <span class="en" lang="en">Hyejun Lee</span></h2>
      <p>${profile.headline ? esc(profile.headline) : pending('핵심 소개 문장')}</p>
      <a class="btn btn-secondary" href="#/teacher">${bi('강사 소개 보기', 'Meet the teacher')}</a>
    </div>
    <div class="card tint-lav">
      <span class="tag tag-lav">${bi('1:1 수업', '1:1 lessons')}</span>
      <h2 style="margin-top:8px">${bi('나에게 맞춘 수업', 'Lessons made for you')}</h2>
      <p>수준과 목표에 맞춘 수업자료를 학생 전용 수업실에서 받습니다. <span class="en" lang="en">Get materials made for your level in your private classroom.</span></p>
      <a class="btn btn-primary" href="#/apply">${bi('1:1 수업 신청', 'Apply')}</a>
    </div>
  </div></section>

  <section class="section"><div class="wrap grid g2">
    <div>
      <div class="section-head"><h2>${bi('새 학습 자료', 'Latest notes')}</h2><a href="#/learn">${bi('더 보기', 'More')} →</a></div>
      ${resources.length ? `<ul class="list-plain">${resources.slice(0, 4).map((r) => `<li><a href="#/learn/${esc(r.id)}"><strong>${esc(r.title)}</strong>
        <div class="meta">${CATEGORIES[r.category]?.[0] || ''} · ${LEVELS[r.level]?.[0] || ''}${r.is_sample ? ' · 예시' : ''}</div></a></li>`).join('')}</ul>`
        : empty(bi('아직 자료가 없습니다', 'No notes yet'), '')}
    </div>
    <div>
      <div class="section-head"><h2>${bi('커뮤니티 새 글', 'Latest posts')}</h2><a href="#/community">${bi('더 보기', 'More')} →</a></div>
      ${posts.length ? `<ul class="list-plain">${posts.slice(0, 4).map((p) => `<li><a href="#/community/${esc(p.id)}"><strong>${esc(p.title)}</strong>
        <div class="meta">${TOPICS[p.topic]?.[0] || ''} · ${esc(p.author_name)} · ${fmtDate(p.created_at)}</div></a></li>`).join('')}</ul>`
        : empty(bi('첫 글을 남겨 보세요', 'Be the first to post'), '', `<a class="btn btn-secondary" href="#/community/new">${bi('글쓰기', 'Write')}</a>`)}
    </div>
  </div></section>

  <section class="section"><div class="wrap">
    <h2>${bi('문의 · 운영 정보', 'Contact')}</h2>
    <div class="read">${profile.contact ? paragraphs(profile.contact) : pending('문의 방법, 수업 가능 시간, 운영 정보')}</div>
  </div></section>`;
  return { title: '', html };
}

// ── 강사 소개 ────────────────────────────────────────────────────
export async function teacher() {
  const p = await store.getTeacherProfile();
  const list = (text) => `<ul>${String(text).split('\n').filter((x) => x.trim()).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const reviews = String(p.reviews || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((r) => r[1]);
  const photo = safeUrl(p.photo) || (String(p.photo || '').startsWith('data:image/') ? p.photo : '');
  const html = page(`<span class="tag">${bi('강사 소개', 'Teacher')}</span><h1 style="margin-top:8px">이혜준 <span class="en" lang="en">Hyejun Lee</span></h1>
      <p>${p.headline ? esc(p.headline) : ''}</p>`,
    `<div class="grid g2" style="align-items:start">
      <div class="card" style="text-align:center">
        ${photo ? `<img src="${esc(photo)}" alt="강사 이혜준 사진" style="border-radius:16px;max-height:420px;object-fit:cover">`
          : `<div class="empty" role="img" aria-label="사진 준비 중"><b>${bi('소개 사진', 'Photo')}</b>${bi('입력 대기', 'To be added')}</div>`}
        <div class="btn-row" style="justify-content:center;margin-top:24px">
          <a class="btn btn-primary btn-lg" href="#/apply">${bi('1:1 수업 신청', 'Apply for 1:1 lessons')}</a>
        </div>
      </div>
      <div class="stack">
        ${p.headline ? '' : `<div>${pending('핵심 소개 문장')}</div>`}
        <section><h2>${bi('경력', 'Experience')}</h2>${p.career ? list(p.career) : pending('강사 경력')}</section>
        <section><h2>${bi('교육 철학', 'Teaching philosophy')}</h2>${p.philosophy ? paragraphs(p.philosophy) : pending('교육 철학')}</section>
        <section><h2>${bi('수업 방식', 'How lessons work')}</h2>${p.method ? paragraphs(p.method) : pending('수업 방식, 수업료 안내')}</section>
      </div>
    </div>
    <section class="section" style="margin-top:48px">
      <h2>${bi('수강 후기', 'Student reviews')}</h2>
      ${reviews.length ? `<div class="grid g3">${reviews.map(([name, text]) => `<figure class="card" style="margin:0"><blockquote style="margin:0 0 8px">${esc(text)}</blockquote><figcaption class="meta">— ${esc(name)}</figcaption></figure>`).join('')}</div>`
        : empty(bi('후기를 준비 중입니다', 'Reviews are coming soon'), bi('실제 수강생의 후기를 받으면 이곳에 싣습니다.', 'Real student reviews will appear here.'))}
    </section>
    <div class="card tint-sage row-between"><div><h2 style="margin:0">${bi('수업이 궁금하신가요?', 'Interested in lessons?')}</h2>
      <p class="muted" style="margin:4px 0 0">${bi('수준과 목표를 알려 주시면 연락드립니다.', 'Tell me your level and goal. I will contact you.')}</p></div>
      <a class="btn btn-primary btn-lg" href="#/apply">${bi('1:1 수업 신청', 'Apply')}</a></div>`);
  return { title: '강사 소개', html };
}

// ── 1:1 수업 신청 ────────────────────────────────────────────────
export function apply() {
  const html = page(`<h1>${bi('1:1 수업 신청', 'Apply for 1:1 lessons')}</h1>
    <p>${bi('아래 내용을 보내 주시면 강사가 확인하고 연락드립니다.', 'Send this short form. The teacher will read it and contact you.')}</p>`,
    `<form class="form card" id="apply-form" novalidate>
      <div class="field"><label for="ap-name">${bi('이름', 'Name')}</label><input id="ap-name" name="name" type="text" required maxlength="60" autocomplete="name"></div>
      <div class="field"><label for="ap-level">${bi('한국어 수준', 'Korean level')}</label>
        <select id="ap-level" name="level" required>
          <option value="처음 배움 · Complete beginner">처음 배웁니다 · Complete beginner</option>
          <option value="초급 · Beginner">초급 · Beginner (한글을 읽을 수 있어요)</option>
          <option value="중급 · Intermediate">중급 · Intermediate</option>
          <option value="고급 · Advanced">고급 · Advanced</option>
        </select></div>
      <div class="field"><label for="ap-goal">${bi('배우는 목표', 'Your goal')}</label>
        <textarea id="ap-goal" name="goal" required maxlength="1000" rows="3"></textarea>
        <p class="hint">${bi('예: 여행, 회사 생활, TOPIK 시험, 가족과 대화', 'e.g. travel, work, TOPIK, talking with family')}</p></div>
      <div class="field"><label for="ap-times">${bi('가능한 시간대', 'Times you are free')}</label>
        <input id="ap-times" name="times" type="text" required maxlength="500">
        <p class="hint">${bi('예: 평일 저녁 7시 이후(한국 시간)', 'e.g. weekday evenings after 7 pm, Korea time')}</p></div>
      <div class="field"><label for="ap-contact">${bi('연락처', 'How to contact you')}</label>
        <input id="ap-contact" name="contact" type="text" required minlength="3" maxlength="200" autocomplete="email">
        <p class="hint">${bi('이메일, 카카오톡 ID 등', 'Email, KakaoTalk ID, etc.')}</p></div>
      <div class="field"><label for="ap-msg">${bi('남기실 말 (선택)', 'Message (optional)')}</label><textarea id="ap-msg" name="message" maxlength="2000" rows="3"></textarea></div>
      ${honeypot}${status}
      <div><button class="btn btn-primary btn-lg" type="submit">${bi('신청 보내기', 'Send application')}</button></div>
    </form>`);
  return { title: '1:1 수업 신청', html, mount(root) {
    const form = $('#apply-form', root);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const done = await submitWith(form, async (d) => {
        if (d.website) return true; // 자동 입력 봇은 조용히 무시한다
        await store.submitApplication({ name: d.name.trim(), level: d.level, goal: d.goal.trim(), times: d.times.trim(), contact: d.contact.trim(), message: d.message.trim() });
        return true;
      });
      if (done) {
        form.outerHTML = `<div class="card notice-ok" role="status" tabindex="-1" id="apply-done"><h2>✓ ${bi('신청이 접수되었습니다', 'Application received')}</h2>
          <p>${bi('강사가 확인한 뒤 남겨 주신 연락처로 연락드립니다.', 'The teacher will contact you soon.')}</p>
          <a class="btn btn-secondary" href="#/learn">${bi('기다리는 동안 무료로 배우기', 'Learn free while you wait')}</a></div>`;
        $('#apply-done', root).focus();
      }
    });
  } };
}

// ── 1:1 수업(안내 · 학생 목록) ───────────────────────────────────
export async function lessons() {
  const u = store.user;
  const students = u ? await store.listStudents() : [];
  let top = '';
  if (u?.role === 'teacher') {
    top = `<section class="section" style="padding-top:0"><div class="section-head"><h2>${bi('학생별 수업실', 'Classrooms')}</h2><a class="btn btn-secondary btn-sm" href="#/admin/students">${bi('학생 관리', 'Manage students')}</a></div>
      ${students.length ? `<div class="grid g3">${students.map((s) => `<a class="card" href="#/lessons/${esc(s.id)}"><h3>${esc(s.name)}</h3>
        <p class="meta">${s.linked_email ? esc(s.linked_email) : bi('계정 연결 전', 'No account linked')}</p></a>`).join('')}</div>`
        : empty(bi('아직 학생이 없습니다', 'No students yet'), bi('학생을 추가하면 학생별 수업실이 만들어집니다.', 'Add a student to create a classroom.'), `<a class="btn btn-primary" href="#/admin/students">${bi('학생 추가', 'Add a student')}</a>`)}</section>`;
  } else if (students.length) {
    top = `<section class="section" style="padding-top:0"><h2>${bi('내 수업실', 'My classroom')}</h2>
      <div class="grid g3">${students.map((s) => `<a class="card tint-sage" href="#/lessons/${esc(s.id)}"><h3>${esc(s.name)}</h3><p>${bi('수업자료 보기', 'Open my materials')} →</p></a>`).join('')}</div></section>`;
  }
  const html = page(`<span class="tag tag-lav">${bi('프리미엄', 'Premium')}</span><h1 style="margin-top:8px">${bi('1:1 수업', '1:1 lessons')}</h1>
    <p>${bi('한 사람의 수준과 목표에 맞춰 진행하는 수업입니다.', 'Private lessons built around your level and your goal.')}</p>`,
    `${top}
    <div class="grid g3">
      <div class="card"><div class="card-icon" aria-hidden="true">📝</div><h3>1. ${bi('신청', 'Apply')}</h3><p>${bi('수준·목표·가능 시간을 알려 주세요.', 'Tell me your level, goal and free times.')}</p></div>
      <div class="card"><div class="card-icon" aria-hidden="true">🗓️</div><h3>2. ${bi('상담', 'Talk')}</h3><p>${bi('강사가 연락드려 수업 계획을 정합니다.', 'I contact you and we make a plan.')}</p></div>
      <div class="card"><div class="card-icon" aria-hidden="true">📂</div><h3>3. ${bi('내 수업실', 'Your classroom')}</h3><p>${bi('나만 볼 수 있는 수업자료를 받습니다.', 'You get materials only you can see.')}</p></div>
    </div>
    <div class="card tint-sage row-between" style="margin-top:32px"><div><h2 style="margin:0">${bi('수업을 시작해 볼까요?', 'Ready to start?')}</h2>
      ${u ? '' : `<p class="muted" style="margin:4px 0 0">${bi('이미 수업 중인 학생은 로그인하세요.', 'Already a student? Log in.')}</p>`}</div>
      <div class="btn-row"><a class="btn btn-primary btn-lg" href="#/apply">${bi('1:1 수업 신청', 'Apply')}</a>
      ${u ? '' : `<a class="btn btn-secondary btn-lg" href="#/login">${bi('학생 로그인', 'Student log in')}</a>`}</div></div>`);
  return { title: '1:1 수업', html };
}

// ── 학생 전용 수업실 ─────────────────────────────────────────────
export async function classroom(id, query = {}) {
  if (!store.user) return forbidden(bi('학생 전용 수업실입니다. 로그인해 주세요.', 'This is a private classroom. Please log in.'));
  const data = await store.getStudent(id);
  if (!data) return forbidden(bi('이 수업실은 해당 학생과 강사만 볼 수 있습니다.', 'Only this student and the teacher can open this classroom.'));
  const isTeacher = store.user.role === 'teacher';
  const { student, materials } = data;
  const notes = classroomList(id, await store.listClassroomNotes(id), query, isTeacher);
  const fileById = new Map(materials.flatMap((m) => m.files).map((f) => [f.id, f]));
  const isImg = (f) => (f.mime || '').startsWith('image/');

  const viewCard = (m) => {
    const blank = !m.title && !m.description && !m.links.length && !m.files.length;
    const imgs = m.files.filter(isImg), docs = m.files.filter((f) => !isImg(f));
    return `<section class="card material" id="mat-${m.slot}">
      <div class="row-between"><h3><span class="tag">${bi(`수업자료 ${m.slot}`, `Material ${m.slot}`)}</span> ${esc(m.title)}</h3>
        ${isTeacher ? `<button class="btn btn-secondary btn-sm" data-edit="${m.slot}">${bi('수정', 'Edit')}</button>` : ''}</div>
      ${blank ? `<p class="muted">${bi('아직 등록된 자료가 없습니다.', 'Nothing here yet.')}</p>` : ''}
      ${m.description ? `<div class="prose">${paragraphs(m.description)}</div>` : ''}
      ${imgs.length ? `<div class="thumbs">${imgs.map((f) => `<figure><img data-img="${esc(f.id)}" alt="${esc(f.name)}"><figcaption>${esc(f.name)}</figcaption></figure>`).join('')}</div>` : ''}
      ${docs.length ? `<ul class="file-list">${docs.map((f) => `<li><button class="btn btn-secondary btn-sm" data-open="${esc(f.id)}">📎 ${esc(f.name)}</button><span class="meta">${fmtSize(f.size)}</span></li>`).join('')}</ul>` : ''}
      ${m.links.length ? `<ul>${m.links.map((l) => `<li><a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.label || l.url)}</a></li>`).join('')}</ul>` : ''}
    </section>`;
  };
  const editCard = (m) => `<section class="card material" id="mat-${m.slot}">
    <form class="form" data-save="${m.slot}" style="max-width:none">
      <h3><span class="tag">${bi(`수업자료 ${m.slot}`, `Material ${m.slot}`)}</span> ${bi('수정', 'Edit')}</h3>
      <div class="field"><label for="m-title-${m.slot}">${bi('제목', 'Title')}</label><input id="m-title-${m.slot}" name="title" type="text" maxlength="120" value="${esc(m.title)}"></div>
      <div class="field"><label for="m-desc-${m.slot}">${bi('설명', 'Description')}</label><textarea id="m-desc-${m.slot}" name="description" maxlength="10000">${esc(m.description)}</textarea></div>
      <div class="field"><label for="m-links-${m.slot}">${bi('링크', 'Links')}</label>
        <textarea id="m-links-${m.slot}" name="links" rows="3">${esc(m.links.map((l) => `${l.label} | ${l.url}`).join('\n'))}</textarea>
        <p class="hint">한 줄에 하나씩: <code>이름 | https://주소</code></p></div>
      <div class="field"><label for="m-files-${m.slot}">${bi('파일·이미지 추가', 'Add files or images')}</label><input id="m-files-${m.slot}" name="files" type="file" multiple>
        <p class="hint">${bi('파일 하나에 20MB까지. 이 학생과 강사만 내려받을 수 있습니다.', 'Up to 20 MB each. Only this student and the teacher can download.')}</p></div>
      ${m.files.length ? `<ul class="file-list">${m.files.map((f) => `<li><span>${esc(f.name)}</span><span class="meta">${fmtSize(f.size)}</span>
        <button type="button" class="btn btn-danger btn-sm" data-del-file="${esc(f.id)}">${bi('삭제', 'Delete')}</button></li>`).join('')}</ul>` : ''}
      ${status}
      <div class="btn-row"><button class="btn btn-primary" type="submit">${bi('저장', 'Save')}</button>
        <button class="btn btn-ghost" type="button" data-cancel>${bi('취소', 'Cancel')}</button></div>
    </form></section>`;

  const html = page(`<span class="tag tag-lav">${bi('학생 전용', 'Private classroom')}</span><h1 style="margin-top:8px">${esc(student.name)} <span class="en" lang="en">classroom</span></h1>
    <p>${isTeacher ? bi('이 페이지는 강사와 이 학생만 볼 수 있습니다.', 'Only you and this student can see this page.') : bi('이 페이지는 나와 강사만 볼 수 있습니다.', 'Only you and the teacher can see this page.')}</p>`,
    ` ${notes.html}<section class="section"><h2>${bi('수업 파일·이미지·링크', 'Lesson files, images and links')}</h2><div class="stack" id="materials">${materials.map(viewCard).join('')}</div></section>`);

  return { title: `${student.name} 수업실`, html, mount(root) {
    notes.mount(root);
    const box = $('#materials', root);
    const loadImages = () => $$('[data-img]', box).forEach(async (img) => {
      try { img.src = await store.fileUrl(fileById.get(img.dataset.img)); } catch { img.alt = '이미지를 불러오지 못했습니다'; }
    });
    loadImages();
    box.addEventListener('click', async (e) => {
      const open = e.target.closest('[data-open]');
      if (open) {
        const f = fileById.get(open.dataset.open);
        try {
          const url = await store.fileUrl(f);
          const a = Object.assign(document.createElement('a'), { href: url, download: f.name, target: '_blank', rel: 'noopener' });
          document.body.append(a); a.click(); a.remove();
        } catch (err) { toast(err.message, 'bad'); }
        return;
      }
      const edit = e.target.closest('[data-edit]');
      if (edit) { const m = materials[+edit.dataset.edit - 1]; $(`#mat-${m.slot}`, box).outerHTML = editCard(m); $(`#m-title-${m.slot}`, box).focus(); return; }
      if (e.target.closest('[data-cancel]')) { refresh(); return; }
      const del = e.target.closest('[data-del-file]');
      if (del && confirm('이 파일을 삭제할까요?')) {
        try { await store.deleteFile(del.dataset.delFile); toast('파일을 삭제했습니다.'); refresh(); } catch (err) { toast(err.message, 'bad'); }
      }
    });
    box.addEventListener('submit', async (e) => {
      const form = e.target.closest('[data-save]');
      if (!form) return;
      e.preventDefault();
      const slot = +form.dataset.save;
      const files = [...form.querySelector('[name=files]').files];
      const done = await submitWith(form, async (d) => {
        const links = d.links.split('\n').map((line) => {
          const [a, b] = line.split('|').map((x) => x.trim());
          const url = safeUrl(b || a);
          return url ? { label: b ? a : url, url } : null;
        }).filter(Boolean);
        await store.saveMaterial(student.id, slot, { title: d.title.trim(), description: d.description.trim(), links });
        for (const f of files) await store.uploadFile(student.id, slot, f);
        return true;
      }, { okMsg: '저장했습니다. Saved.' });
      if (done) refresh();
    });
  } };
}

// ── 학습실 ───────────────────────────────────────────────────────
export async function learn(query = {}) {
  const all = await store.listResources();
  const isTeacher = store.user?.role === 'teacher';
  const cat = CATEGORIES[query.cat] ? query.cat : '';
  const html = page(`<h1>${bi('학습실', 'Study room')}</h1><p>${bi('누구나 무료로 볼 수 있는 한국어 표현과 문법 자료입니다.', 'Free notes on Korean expressions and grammar. No login needed.')}</p>`,
    `<div class="filters">
      <div class="chips" role="group" aria-label="카테고리">
        <a class="chip" href="#/learn" ${cat ? '' : 'aria-current="true"'}>${bi('전체', 'All')}</a>
        ${Object.entries(CATEGORIES).map(([k, v]) => `<a class="chip" href="#/learn?cat=${k}" ${cat === k ? 'aria-current="true"' : ''}>${bi(...v)}</a>`).join('')}
      </div>
      ${isTeacher ? `<a class="btn btn-primary" href="#/learn/new">+ ${bi('새 자료 작성', 'New note')}</a>` : ''}
    </div>
    <div class="filters">
      <div class="grow"><label class="sr-only" for="learn-q">자료 검색</label><input id="learn-q" type="search" placeholder="검색 Search (예: 인사, particle)" value="${esc(query.q || '')}"></div>
      <div><label class="sr-only" for="learn-level">학습 수준</label><select id="learn-level">
        <option value="">${'모든 수준 · All levels'}</option>${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}">${v[0]} · ${v[1]}</option>`).join('')}</select></div>
    </div>
    <p class="meta" id="learn-count" aria-live="polite"></p>
    <div class="grid g2" id="learn-list"></div>`);
  return { title: '학습실', html, mount(root) {
    const q = $('#learn-q', root), level = $('#learn-level', root), list = $('#learn-list', root);
    const draw = () => {
      const term = q.value.trim().toLowerCase();
      const rows = all.filter((r) => (!cat || r.category === cat) && (!level.value || r.level === level.value)
        && (!term || [r.title, r.summary, r.explanation].join(' ').toLowerCase().includes(term)));
      $('#learn-count', root).textContent = `자료 ${rows.length}개 · ${rows.length} notes`;
      list.innerHTML = rows.length ? rows.map(resourceCard).join('')
        : `<div style="grid-column:1/-1">${all.length ? empty(bi('찾는 자료가 없습니다', 'No notes found'), bi('검색어나 조건을 바꿔 보세요.', 'Try another word or filter.'))
          : empty(bi('아직 자료가 없습니다', 'No notes yet'), bi('곧 새 자료가 올라옵니다.', 'New notes are coming soon.'))}</div>`;
    };
    q.addEventListener('input', draw); level.addEventListener('change', draw); draw();
  } };
}

export async function learnDetail(id, { studentId } = {}) {
  if (studentId && (!store.user || !await store.getStudent(studentId))) return forbidden();
  const r = studentId ? await store.getClassroomNote(studentId, id) : await store.getResource(id);
  const categories = studentId ? CLASS_CATEGORIES : CATEGORIES;
  const base = studentId ? `#/lessons/${studentId}` : '#/learn';
  const detailBase = studentId ? `${base}/notes` : base;
  if (!r) return notFound();
  const isTeacher = store.user?.role === 'teacher';
  const html = page(`<p><a href="${base}?cat=${esc(r.category)}">← ${bi(...categories[r.category])}</a></p>
    <div class="tags">${studentId ? `<span class="tag">${bi(...categories[r.category])}</span>` : catTag(r.category)}${studentId ? '' : levelTag(r.level)}${r.is_sample ? sampleTag : ''}</div>
    ${studentId ? `<p class="notice small">${bi('이 수업실의 학생과 강사만 볼 수 있습니다.', 'Only this student and the teacher can read this note.')}</p>` : ''}<h1>${esc(r.title)}</h1><p>${esc(r.summary)}</p>
    ${r.is_sample ? `<p class="notice small">${bi('이 자료는 예시입니다. 강사가 실제 자료로 바꿀 수 있습니다.', 'This is a sample note. The teacher can replace it.')}</p>` : ''}
    ${isTeacher ? `<div class="btn-row"><a class="btn btn-secondary btn-sm" href="${detailBase}/${esc(r.id)}/edit">${bi('수정', 'Edit')}</a>
      ${r.is_template ? '' : `<button class="btn btn-danger btn-sm" data-act="delete">${bi('삭제', 'Delete')}</button>`}</div>` : ''}`,
    `<article class="prose stack">
      <section><h2>1. ${bi('설명', 'Explanation')}</h2>${paragraphs(r.explanation) || `<p class="muted">${bi('설명이 아직 없습니다.', 'No explanation yet.')}</p>`}</section>
      <section><h2>2. ${r.category === 'storybook' ? bi('동화 읽기', 'Read the story') : bi('예문', 'Examples')}</h2>
        ${(r.examples || []).length ? r.examples.map((x) => `<div class="example"><span class="ko" lang="ko">${esc(x.ko)}</span><span class="muted" lang="en">${esc(x.en)}</span></div>`).join('')
          : `<p class="muted">${bi('예문이 아직 없습니다.', 'No examples yet.')}</p>`}</section>
      <section><h2>3. ${bi('간단한 연습', 'Quick practice')}</h2>
        ${(r.practice || []).length ? r.practice.map((p, i) => `<div class="quiz" data-quiz="${i}"><p><strong>Q${i + 1}.</strong> ${esc(p.q)}</p>
          <div class="opts">${p.options.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join('')}</div>
          <div class="quiz-fb" aria-live="polite"></div></div>`).join('')
          : `<p class="muted">${bi('연습 문제가 아직 없습니다.', 'No practice yet.')}</p>`}</section>
    </article>
    ${studentId ? '' : `<div class="card tint-lav row-between" style="margin-top:32px"><div><strong>${bi('더 깊이 배우고 싶다면', 'Want to go deeper?')}</strong></div>
      <a class="btn btn-secondary" href="#/apply">${bi('1:1 수업 신청', 'Apply for 1:1 lessons')}</a></div>`}`);
  return { title: r.title, html, mount(root) {
    $$('.quiz', root).forEach((quiz) => {
      const p = r.practice[+quiz.dataset.quiz];
      quiz.addEventListener('click', (e) => {
        const btn = e.target.closest('.opt');
        if (!btn || btn.disabled) return;
        const right = +btn.dataset.k === +p.answer;
        $$('.opt', quiz).forEach((b) => { b.disabled = true; if (+b.dataset.k === +p.answer) b.classList.add('is-right'); });
        if (!right) btn.classList.add('is-wrong');
        $('.quiz-fb', quiz).innerHTML = `<p class="notice ${right ? 'notice-ok' : 'notice-bad'}" style="margin-top:8px">${right ? '✓ ' + bi('정답이에요!', 'Correct!') : '✗ ' + bi(`정답은 "${esc(p.options[p.answer])}"입니다.`, 'Not quite.')} ${esc(p.explain || '')}</p>`;
      });
    });
    $('[data-act=delete]', root)?.addEventListener('click', async () => {
      if (!confirm('이 자료를 삭제할까요? 되돌릴 수 없습니다.')) return;
      try { if (studentId) await store.deleteClassroomNote(studentId, r.id); else await store.deleteResource(r.id); toast('삭제했습니다.'); go(base); } catch (e) { toast(e.message, 'bad'); }
    });
  } };
}

export async function learnEdit(id, { studentId } = {}) {
  if (store.user?.role !== 'teacher') return forbidden(bi('학습 자료는 강사만 작성할 수 있습니다.', 'Only the teacher can write notes.'));
  if (studentId && !await store.getStudent(studentId)) return forbidden();
  const categories = studentId ? CLASS_CATEGORIES : CATEGORIES;
  const base = studentId ? `#/lessons/${studentId}` : '#/learn';
  const detailBase = studentId ? `${base}/notes` : base;
  const r = id ? (studentId ? await store.getClassroomNote(studentId, id) : await store.getResource(id)) : { category: studentId ? 'lesson' : 'expression', ...(studentId ? {} : {level: 'beginner'}), title: '', summary: '', explanation: '', examples: [], practice: [], published: true };
  if (!r) return notFound();
  const opt = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v[0]} · ${v[1]}</option>`).join('');
  const html = page(`<p><a href="${base}">${bi('자료 목록으로', 'Back to notes')}</a></p><h1>${id ? bi('자료 수정', 'Edit note') : bi('새 자료 작성', 'New note')}</h1>${studentId ? `<p>${bi('이 학생의 개인 수업실에 저장됩니다.', 'Saved only in this student’s private classroom.')}</p>` : ''}`,
    `<form class="form card" id="res-form" style="max-width:760px">${r.is_template ? '<p class="notice">예시 원본입니다. 저장하면 관리할 수 있는 새 동화책이 등록됩니다. Save to create your own editable story.</p>' : ''}
      <div class="${studentId ? '' : 'grid g2'}">
        <div class="field"><label for="r-cat">${bi('카테고리', 'Category')}</label><select id="r-cat" name="category">${opt(categories, r.category)}</select></div>
        ${studentId ? '' : `<div class="field"><label for="r-level">${bi('학습 수준', 'Level')}</label><select id="r-level" name="level">${opt(LEVELS, r.level)}</select></div>`}
      </div>
      <div class="field"><label for="r-title">${bi('제목', 'Title')}</label><input id="r-title" name="title" type="text" required maxlength="120" value="${esc(r.title)}"></div>
      <div class="field"><label for="r-sum">${bi('짧은 설명', 'Short summary')}</label><input id="r-sum" name="summary" type="text" maxlength="300" value="${esc(r.summary)}"></div>
      <div class="field"><label for="r-exp">1. ${bi('설명', 'Explanation')}</label><textarea id="r-exp" name="explanation" rows="8">${esc(r.explanation)}</textarea>
        <p class="hint">빈 줄로 문단을 나눕니다.</p></div>
      <div class="field"><label for="r-ex">2. ${bi('예문', 'Examples')}</label>
        <textarea id="r-ex" name="examples" rows="5">${esc((r.examples || []).map((x) => `${x.ko} | ${x.en}`).join('\n'))}</textarea>
        <p class="hint">한 줄에 하나씩: <code>한국어 문장 | English meaning</code></p></div>
      <div class="field"><label for="r-pr">3. ${bi('간단한 연습', 'Practice')}</label>
        <textarea id="r-pr" name="practice" rows="5">${esc((r.practice || []).map((p) => `${p.q} | ${p.options.join(' ; ')} | ${+p.answer + 1} | ${p.explain || ''}`).join('\n'))}</textarea>
        <p class="hint">한 줄에 한 문제: <code>질문 | 보기1 ; 보기2 ; 보기3 | 정답 번호 | 해설</code></p></div>
      <div class="field"><label><input type="checkbox" name="published" ${r.published !== false ? 'checked' : ''}> ${studentId ? bi('학생에게 표시', 'Visible to this student') : bi('공개하기', 'Published')}</label></div>
      ${status}
      <div class="btn-row"><button class="btn btn-primary" type="submit">${bi('저장', 'Save')}</button><a class="btn btn-ghost" href="${id ? `${detailBase}/${esc(id)}` : base}">${bi('취소', 'Cancel')}</a></div>
    </form>`);
  return { title: id ? '자료 수정' : '새 자료', html, mount(root) {
    const form = $('#res-form', root);
    const labels = () => { root.querySelector('label[for=r-ex]').textContent = form.category.value === 'storybook' ? '2. 동화 본문 · Story text (한국어 | English)' : '2. 예문 · Examples'; };
    form.category.onchange = labels; labels();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const newId = await submitWith(form, async (d) => {
        const examples = d.examples.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]).map(([ko, en = '']) => ({ ko, en }));
        const practice = d.practice.split('\n').filter((l) => l.trim()).map((l, n) => {
          const [q, opts = '', ans = '1', explain = ''] = l.split('|').map((x) => x.trim());
          const options = opts.split(';').map((x) => x.trim()).filter(Boolean);
          const answer = parseInt(ans, 10) - 1;
          if (!q || options.length < 2 || !(answer >= 0 && answer < options.length)) throw new Error(`연습 ${n + 1}번째 줄의 형식을 확인해 주세요. (질문 | 보기1 ; 보기2 | 정답 번호 | 해설)`);
          return { q, options, answer, explain };
        });
        const note = { id: id || undefined, category: d.category, title: d.title.trim(), summary: d.summary.trim(),
          explanation: d.explanation.trim(), examples, practice, published: !!d.published };
        return studentId ? store.saveClassroomNote(studentId, note) : store.saveResource({ ...note, level: d.level });
      }, { okMsg: '저장했습니다. Saved.' });
      if (newId) go(`${detailBase}/${newId}`);
    });
  } };
}

// ── 커뮤니티 ─────────────────────────────────────────────────────
export async function community(query = {}) {
  const all = await store.listPosts();
  const topic = TOPICS[query.topic] ? query.topic : '';
  const rows = all.filter((p) => !topic || p.topic === topic);
  const u = store.user;
  const html = page(`<h1>${bi('커뮤니티', 'Community')}</h1><p>${bi('한국어 질문, 공부 이야기, 한국 생활 정보를 나누는 곳입니다. 누구나 읽을 수 있고, 회원은 글과 댓글을 쓸 수 있습니다.', 'Ask about Korean, share how you study, and trade tips for life in Korea. Anyone can read. Members can write.')}</p>`,
    `<div class="filters">
      <div class="chips" role="group" aria-label="주제">
        <a class="chip" href="#/community" ${topic ? '' : 'aria-current="true"'}>${bi('전체', 'All')}</a>
        ${Object.entries(TOPICS).map(([k, v]) => `<a class="chip" href="#/community?topic=${k}" ${topic === k ? 'aria-current="true"' : ''}>${bi(...v)}</a>`).join('')}
      </div>
      ${u ? `<a class="btn btn-primary" href="#/community/new">${bi('글쓰기', 'Write a post')}</a>` : `<a class="btn btn-secondary" href="#/login">${bi('로그인하고 글쓰기', 'Log in to write')}</a>`}
    </div>
    ${rows.length ? `<div class="card"><ul class="list-plain">${rows.map((p) => `<li><a href="#/community/${esc(p.id)}">
        <div class="tags">${topicTag(p.topic)}${p.is_sample ? sampleTag : ''}${p.hidden ? `<span class="tag tag-sample">${bi('숨김', 'Hidden')}</span>` : ''}</div>
        <strong>${esc(p.title)}</strong>
        <div class="meta">${esc(p.author_name)}${p.author_role === 'teacher' ? ' · 강사' : ''} · ${fmtDate(p.created_at)} · ${bi(`댓글 ${p.comment_count}`, 'comments')}</div></a></li>`).join('')}</ul></div>`
      : empty(bi('아직 글이 없습니다', 'No posts yet'), bi('첫 글을 남겨 보세요.', 'Be the first to write.'), u ? `<a class="btn btn-primary" href="#/community/new">${bi('글쓰기', 'Write a post')}</a>` : '')}`);
  return { title: '커뮤니티', html };
}

export async function post(id) {
  const data = await store.getPost(id);
  if (!data) return notFound();
  const { post: p, comments } = data;
  const u = store.user;
  const canEdit = (authorId) => u && (u.id === authorId || u.role === 'teacher');
  const html = page(`<p><a href="#/community">← ${bi('커뮤니티', 'Community')}</a></p>
    <div class="tags">${topicTag(p.topic)}${p.is_sample ? sampleTag : ''}${p.hidden ? `<span class="tag tag-sample">${bi('숨김 처리된 글', 'Hidden')}</span>` : ''}</div>
    <h1>${esc(p.title)}</h1>
    <p class="meta">${esc(p.author_name)}${p.author_role === 'teacher' ? ' · 강사' : ''} · ${fmtDate(p.created_at)}</p>`,
    `<article class="card prose" style="max-width:none">${paragraphs(p.body)}
      <div class="btn-row" style="margin-top:16px">
        ${canEdit(p.author_id) ? `<a class="btn btn-secondary btn-sm" href="#/community/${esc(p.id)}/edit">${bi('수정', 'Edit')}</a>
          <button class="btn btn-danger btn-sm" data-act="del-post">${bi('삭제', 'Delete')}</button>` : ''}
        ${u?.role === 'teacher' ? `<button class="btn btn-secondary btn-sm" data-act="hide">${p.hidden ? bi('숨김 해제', 'Unhide') : bi('숨기기', 'Hide')}</button>` : ''}
        ${u && u.id !== p.author_id ? `<button class="btn btn-ghost btn-sm" data-report="post:${esc(p.id)}">${bi('신고', 'Report')}</button>` : ''}
      </div></article>
    <section style="margin-top:32px"><h2>${bi(`댓글 ${comments.length}`, 'Comments')}</h2>
      ${comments.length ? comments.map((c) => `<div class="comment" data-comment="${esc(c.id)}"><p>${esc(c.body)}</p>
        <div class="row-between"><span class="meta">${esc(c.author_name)}${c.author_role === 'teacher' ? ' · 강사' : ''} · ${fmtDate(c.created_at)}</span>
          <span class="btn-row">${canEdit(c.author_id) ? `<button class="btn btn-ghost btn-sm" data-edit-c="${esc(c.id)}">${bi('수정', 'Edit')}</button><button class="btn btn-ghost btn-sm" data-del-c="${esc(c.id)}">${bi('삭제', 'Delete')}</button>` : ''}
          ${u && u.id !== c.author_id ? `<button class="btn btn-ghost btn-sm" data-report="comment:${esc(c.id)}">${bi('신고', 'Report')}</button>` : ''}</span></div></div>`).join('')
        : `<p class="muted">${bi('아직 댓글이 없습니다.', 'No comments yet.')}</p>`}
      ${u ? `<form class="form" id="comment-form" style="margin-top:24px">
          <div class="field"><label for="c-body">${bi('댓글 쓰기', 'Write a comment')}</label><textarea id="c-body" name="body" required maxlength="2000" rows="3"></textarea></div>
          ${honeypot}${status}<div><button class="btn btn-primary" type="submit">${bi('댓글 등록', 'Post comment')}</button></div></form>`
        : `<p class="notice" style="margin-top:24px">${bi('댓글을 쓰려면 로그인해 주세요.', 'Log in to comment.')} <a href="#/login">${bi('로그인', 'Log in')}</a></p>`}
    </section>`);
  return { title: p.title, html, mount(root) {
    const run = async (fn, msg) => { try { await fn(); if (msg) toast(msg); return true; } catch (e) { toast(e.message, 'bad'); return false; } };
    root.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.act === 'del-post' && confirm('이 글을 삭제할까요? 되돌릴 수 없습니다.')) { if (await run(() => store.deletePost(p.id), '삭제했습니다.')) go('#/community'); }
      else if (t.dataset.act === 'hide') { if (await run(() => store.setPostHidden(p.id, !p.hidden), p.hidden ? '다시 공개했습니다.' : '숨겼습니다.')) refresh(); }
      else if (t.dataset.delC && confirm('이 댓글을 삭제할까요?')) { if (await run(() => store.deleteComment(t.dataset.delC), '삭제했습니다.')) refresh(); }
      else if (t.dataset.editC) {
        const c = comments.find((x) => x.id === t.dataset.editC);
        const body = prompt('댓글 수정 · Edit comment', c.body);
        if (body && body.trim() && body !== c.body) { if (await run(() => store.saveComment({ id: c.id, body: body.trim().slice(0, 2000) }), '수정했습니다.')) refresh(); }
      } else if (t.dataset.report) {
        const [target_type, target_id] = t.dataset.report.split(':');
        const reason = prompt('신고하는 이유를 적어 주세요. · Why are you reporting this?');
        if (reason && reason.trim()) await run(() => store.report({ target_type, target_id, reason: reason.trim().slice(0, 500) }), '신고가 접수되었습니다. 강사가 확인합니다.');
      }
    });
    const form = $('#comment-form', root);
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const done = await submitWith(form, async (d) => { if (!d.website) await store.saveComment({ post_id: p.id, body: d.body.trim() }); return true; }, { okMsg: '댓글을 등록했습니다.' });
      if (done) refresh();
    });
  } };
}

export async function postEdit(id) {
  const u = store.user;
  if (!u) return forbidden(bi('글을 쓰려면 로그인해 주세요.', 'Please log in to write.'));
  let p = { topic: 'question', title: '', body: '' };
  if (id) {
    const data = await store.getPost(id);
    if (!data) return notFound();
    if (data.post.author_id !== u.id && u.role !== 'teacher') return forbidden(bi('본인 글만 고칠 수 있습니다.', 'You can edit only your own posts.'));
    p = data.post;
  }
  const html = page(`<h1>${id ? bi('글 수정', 'Edit post') : bi('글쓰기', 'Write a post')}</h1>`,
    `<form class="form card" id="post-form" style="max-width:760px">
      <div class="field"><label for="p-title">${bi('제목', 'Title')}</label><input id="p-title" name="title" type="text" required minlength="2" maxlength="120" value="${esc(p.title)}"></div>
      <div class="field"><label for="p-topic">${bi('주제', 'Topic')}</label><select id="p-topic" name="topic">
        ${Object.entries(TOPICS).map(([k, v]) => `<option value="${k}" ${k === p.topic ? 'selected' : ''}>${v[0]} · ${v[1]}</option>`).join('')}</select></div>
      <div class="field"><label for="p-body">${bi('내용', 'Content')}</label><textarea id="p-body" name="body" required minlength="2" maxlength="5000" rows="10">${esc(p.body)}</textarea>
        <p class="hint">${bi('한국어나 영어로 편하게 써 주세요. 링크는 3개까지 넣을 수 있습니다.', 'Write in Korean or English. Up to 3 links.')}</p></div>
      ${honeypot}${status}
      <div class="btn-row"><button class="btn btn-primary" type="submit">${id ? bi('저장', 'Save') : bi('등록', 'Post')}</button>
        <a class="btn btn-ghost" href="${id ? `#/community/${esc(id)}` : '#/community'}">${bi('취소', 'Cancel')}</a></div>
    </form>`);
  return { title: id ? '글 수정' : '글쓰기', html, mount(root) {
    const form = $('#post-form', root);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const newId = await submitWith(form, async (d) => {
        if (d.website) return null;
        return store.savePost({ id: id || undefined, topic: d.topic, title: d.title.trim(), body: d.body.trim() });
      }, { okMsg: '저장했습니다. Saved.' });
      if (newId) go(`#/community/${newId}`);
    });
  } };
}

// ── 게임 ─────────────────────────────────────────────────────────
export function games() {
  const html = page(`<h1>${bi('한글 배우기 게임', 'Hangul games')}</h1>
    <p>${bi('설치 없이 PC와 휴대폰에서 바로 할 수 있습니다. 한 판은 10문제이고 시간 제한이 없습니다.', 'Play on a computer or phone with nothing to install. Each round has 10 questions and no time limit.')}</p>`,
    `<div class="grid g3">${GAME_LIST.map((g, i) => `<div class="card ${['tint-sage', 'tint-lav', 'tint-peach'][i]}"><div class="card-icon" aria-hidden="true">${g.icon}</div>
      <h2>${bi(g.ko, g.en)}</h2><p>${g.desc}<br><span class="en" lang="en">${g.descEn}</span></p>
      <a class="btn btn-primary" href="#/games/${g.id}">${bi('게임 시작', 'Play')}</a></div>`).join('')}</div>`);
  return { title: '한글 게임', html };
}
export function game(id) {
  if (id === 'listen') id = 'sentence';
  const g = GAME_LIST.find((x) => x.id === id);
  const html = page(`<p><a href="#/games">← ${bi('게임 목록', 'All games')}</a></p><h1 class="sr-only">${g.ko}</h1>`, '<div class="game" id="game-root"></div>');
  return { title: g.ko, html, mount: (root) => mountGame(id, $('#game-root', root)) };
}

// ── 로그인 · 회원가입 ────────────────────────────────────────────
export function login() {
  const demo = store.mode === 'demo';
  const html = page(`<h1>${bi('로그인', 'Log in')}</h1>`,
    `<div class="grid g2" style="align-items:start">
      <form class="form card" id="login-form">
        <div class="field"><label for="l-email">${bi('이메일', 'Email')}</label><input id="l-email" name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label for="l-pass">${bi('비밀번호', 'Password')}</label><input id="l-pass" name="password" type="password" required autocomplete="current-password"></div>
        ${status}
        <div class="btn-row"><button class="btn btn-primary btn-lg" type="submit">${bi('로그인', 'Log in')}</button>
          <a class="btn btn-ghost" href="#/signup">${bi('회원가입', 'Sign up')}</a><a class="btn btn-ghost" href="#/verify">${bi('이메일 인증 도움', 'Confirm email')}</a></div>
      </form>
      ${demo ? `<div class="card tint-lav"><h2>${bi('데모 계정으로 둘러보기', 'Try a demo account')}</h2>
        <p class="small">${bi('서버 연결 전이라 아래 예시 계정으로 각 역할의 화면을 볼 수 있습니다. 실제 운영에서는 이 상자가 사라집니다.', 'Until the server is connected you can preview each role with these sample accounts. This box disappears in the live site.')}</p>
        <div class="stack">${store.demoAccounts().map((a) => `<button class="btn btn-secondary" style="width:100%" data-demo="${esc(a.id)}">${esc(a.name)}</button>`).join('')}</div></div>` : ''}
    </div>`);
  return { title: '로그인', html, mount(root) {
    const form = $('#login-form', root);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const done = await submitWith(form, async (d) => { await store.signIn({ email: d.email, password: d.password }); return true; }, { okMsg: '로그인했습니다. Welcome back.' });
      if (done) go('#/');
    });
    $$('[data-demo]', root).forEach((b) => b.addEventListener('click', async () => { await store.demoLogin(b.dataset.demo); toast('데모 계정으로 로그인했습니다.'); go('#/'); }));
  } };
}

export function signup() {
  const html = page(`<h1>${bi('회원가입', 'Sign up')}</h1><p>${bi('회원이 되면 커뮤니티에 글을 쓰고 게임 기록을 계정에 저장할 수 있습니다.', 'Members can write in the community and keep game records on their account.')}</p>`,
    `<form class="form card" id="signup-form">
      <div class="field"><label for="s-name">${bi('이름(닉네임)', 'Name or nickname')}</label><input id="s-name" name="name" type="text" required maxlength="40" autocomplete="nickname">
        <p class="hint">${bi('커뮤니티에 표시됩니다.', 'Shown in the community.')}</p></div>
      <div class="field"><label for="s-email">${bi('이메일', 'Email')}</label><input id="s-email" name="email" type="email" required autocomplete="email"></div>
      <div class="field"><label for="s-pass">${bi('비밀번호', 'Password')}</label><input id="s-pass" name="password" type="password" required minlength="8" autocomplete="new-password">
        <p class="hint">${bi('8자 이상', 'At least 8 characters')}</p></div>
      ${honeypot}${status}
      <div class="btn-row"><button class="btn btn-primary btn-lg" type="submit">${bi('가입하기', 'Create account')}</button>
        <a class="btn btn-ghost" href="#/login">${bi('이미 계정이 있어요', 'I have an account')}</a></div>
    </form>`);
  return { title: '회원가입', html, mount(root) {
    const form = $('#signup-form', root);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const out = await submitWith(form, (d) => (d.website ? null : store.signUp({ email: d.email, password: d.password, name: d.name })));
      if (!out) return;
      if (out.needsVerification) {
        form.outerHTML = `<div class="card notice-ok" role="status"><h2>✉️ ${bi('이메일을 확인해 주세요', 'Check your email')}</h2>
          <p>${bi('보내 드린 메일의 인증 링크를 누르면 가입이 끝납니다. 그다음 로그인해 주세요.', 'Click the link in the email we sent to finish signing up. Then log in.')}</p>
          <a class="btn btn-primary" href="#/verify">${bi('인증 링크가 안 열리나요?', 'Link not opening?')}</a> <a class="btn btn-secondary" href="#/login">${bi('로그인으로', 'Go to log in')}</a></div>`;
      } else { toast('가입을 환영합니다! Welcome!'); go('#/'); }
    });
  } };
}

export function verifyEmail() {
  const demo = store.mode === 'demo';
  return { title:'이메일 인증', html:page(`<h1>${bi('이메일 인증', 'Confirm your email')}</h1><p>${bi('메일 링크가 열리지 않으면 메일에서 링크 주소를 복사해 아래에 붙여 넣으세요. 링크는 인증에만 사용하며 저장하지 않습니다.', 'If the email link does not open, copy its link address and paste it below. The link is used only for verification and is not stored.')}</p>`,
    `${store.authNotice ? `<p class="notice" role="status">${esc(store.authNotice)}</p>` : ''}
    ${demo ? `<p class="notice">${bi('데모에서는 실제 메일을 보내거나 인증하지 않습니다.', 'Demo mode cannot send or verify real emails.')}</p>` : `<div class="stack">
    <form class="form card" id="verify-form"><div class="field"><label for="verify-link">${bi('인증 메일의 링크 주소', 'Confirmation link from your email')}</label><input id="verify-link" name="link" type="password" required autocomplete="off" spellcheck="false"></div>${status}<button class="btn btn-primary" type="submit">${bi('이메일 인증하기', 'Confirm email')}</button></form>
    <form class="form card" id="resend-form"><h2>${bi('인증 메일 다시 받기', 'Resend email')}</h2><p>${bi('이미 누른 링크는 사용되었을 수 있습니다. 만료되었으면 새 메일을 받으세요.', 'A clicked link may already be used. Request a fresh email if it has expired.')}</p><div class="field"><label for="verify-email">${bi('가입한 이메일', 'Your signup email')}</label><input id="verify-email" name="email" type="email" required autocomplete="email"></div>${status}<button class="btn btn-secondary" type="submit">${bi('다시 보내기', 'Resend')}</button></form></div>`}
    <div class="btn-row" style="margin-top:24px"><a class="btn btn-secondary" href="#/login">${bi('로그인', 'Log in')}</a><a class="btn btn-ghost" href="#/">${bi('홈으로', 'Back home')}</a></div>`), mount(root) {
      if(demo)return;
      const verify=$('#verify-form',root), resend=$('#resend-form',root);
      verify.onsubmit=async e=>{e.preventDefault();if(!verify.reportValidity())return;
        const link=verify.link.value; verify.link.value='';
        const done=await submitWith(verify,()=>store.verifyEmailLink(link));
        if(done){toast('이메일 인증 완료 · Email confirmed');go('#/');}
      };
      resend.onsubmit=async e=>{e.preventDefault();if(!resend.reportValidity())return;
        const done=await submitWith(resend,async d=>{await store.resendVerification(d.email);return true;},{okMsg:'요청을 접수했습니다. 받은편지함·스팸함을 확인하세요. Check your inbox and spam folder.'});
        if(done){const b=resend.querySelector('button');b.disabled=true;setTimeout(()=>{b.disabled=false;},60000);}
      };
    }};
}
