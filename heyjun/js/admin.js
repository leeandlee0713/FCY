// 강사 전용 관리 화면. 화면을 숨기는 것과 별개로, 실제 권한은 서버(RLS)에서 다시 확인한다.
import { $, $$, esc, bi, toast, fmtDate, submitWith, LEVELS, CATEGORIES } from './util.js';
import { store } from './store.js';
import { forbidden, refresh, refreshNav } from './views.js';

const TABS = {
  applications: ['수업 신청', 'Applications'],
  students: ['학생 · 수업실', 'Students'],
  resources: ['학습 자료', 'Notes'],
  community: ['커뮤니티 관리', 'Community'],
  profile: ['강사 소개 · 운영 정보', 'Profile'],
};
const empty = (t, s = '') => `<div class="empty"><b>${t}</b>${s}</div>`;
const status = '<p class="form-status" role="alert" tabindex="-1" hidden></p>';
const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); refresh(); } catch (e) { toast(e.message, 'bad'); } };

export async function adminView(tab = 'applications') {
  if (store.user?.role !== 'teacher') return forbidden(bi('강사 전용 관리 화면입니다.', 'This area is for the teacher only.'));
  if (!TABS[tab]) tab = 'applications';
  const body = await ({ applications, students, resources, community, profile })[tab]();
  const html = `<div class="wrap page"><header class="page-head"><h1>${bi('관리', 'Admin')}</h1></header>
    <nav class="tabs chips" aria-label="관리 메뉴">${Object.entries(TABS).map(([k, v]) => `<a class="chip" href="#/admin/${k}" ${k === tab ? 'aria-current="true"' : ''}>${bi(...v)}</a>`).join('')}</nav>
    ${body.html}</div>`;
  return { title: '관리 · ' + TABS[tab][0], html, mount: body.mount };
}

async function applications() {
  const rows = await store.listApplications();
  const label = { new: '새 신청', contacted: '연락함', done: '완료' };
  return { html: `<h2>${bi('1:1 수업 신청', 'Lesson applications')} <span class="meta">${rows.filter((r) => r.status === 'new').length}건 새 신청</span></h2>
    ${rows.length ? `<div class="stack">${rows.map((a) => `<article class="card admin-item">
      <div class="row-between"><h3 style="margin:0">${esc(a.name)} <span class="tag ${a.status === 'new' ? 'tag-peach' : ''}">${label[a.status]}</span></h3><span class="meta">${fmtDate(a.created_at)}</span></div>
      <div><strong>수준</strong> ${esc(a.level)}</div><div><strong>목표</strong> ${esc(a.goal)}</div>
      <div><strong>가능 시간</strong> ${esc(a.times)}</div><div><strong>연락처</strong> ${esc(a.contact)}</div>
      ${a.message ? `<div><strong>남긴 말</strong> ${esc(a.message)}</div>` : ''}
      <div class="btn-row">
        <label class="sr-only" for="st-${esc(a.id)}">처리 상태</label>
        <select id="st-${esc(a.id)}" data-status="${esc(a.id)}" style="width:auto">${Object.entries(label).map(([k, v]) => `<option value="${k}" ${k === a.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="btn btn-danger btn-sm" data-del="${esc(a.id)}">${bi('삭제', 'Delete')}</button>
      </div></article>`).join('')}</div>`
      : empty(bi('아직 신청이 없습니다', 'No applications yet'), '신청 양식으로 들어온 내용이 여기에 쌓입니다.')}`,
  mount(root) {
    $$('[data-status]', root).forEach((s) => s.addEventListener('change', () => act(() => store.setApplicationStatus(s.dataset.status, s.value), '상태를 바꿨습니다.')));
    $$('[data-del]', root).forEach((b) => b.addEventListener('click', () => confirm('이 신청을 삭제할까요?') && act(() => store.deleteApplication(b.dataset.del), '삭제했습니다.')));
  } };
}

async function students() {
  const rows = await store.listStudents();
  return { html: `<h2>${bi('학생 · 수업실', 'Students and classrooms')}</h2>
    <form class="card form" id="student-add" style="max-width:none;margin-bottom:24px">
      <h3 style="margin:0">${bi('학생 추가', 'Add a student')}</h3>
      <div class="grid g2">
        <div class="field"><label for="st-name">${bi('학생 이름 (메뉴에 표시)', 'Student name')}</label><input id="st-name" name="name" type="text" required maxlength="40"></div>
        <div class="field"><label for="st-note">${bi('메모 (선택)', 'Note (optional)')}</label><input id="st-note" name="note" type="text" maxlength="200"></div>
      </div>${status}
      <div><button class="btn btn-primary" type="submit">${bi('추가', 'Add')}</button></div>
    </form>
    ${rows.length ? `<div class="stack">${rows.map((s) => `<article class="card admin-item" data-student="${esc(s.id)}">
      <div class="row-between"><h3 style="margin:0">${esc(s.name)} ${s.note ? `<span class="meta">${esc(s.note)}</span>` : ''}</h3>
        <div class="btn-row"><a class="btn btn-secondary btn-sm" href="#/lessons/${esc(s.id)}">${bi('수업실 열기', 'Open classroom')}</a>
          <button class="btn btn-ghost btn-sm" data-rename>${bi('이름 수정', 'Rename')}</button>
          <button class="btn btn-danger btn-sm" data-del>${bi('삭제', 'Delete')}</button></div></div>
      <form class="btn-row" data-link>
        <label for="lk-${esc(s.id)}"><strong>${bi('연결된 계정', 'Linked account')}</strong></label>
        <input id="lk-${esc(s.id)}" name="email" type="email" placeholder="학생이 가입한 이메일" value="${esc(s.linked_email || '')}" style="flex:1 1 220px;width:auto">
        <button class="btn btn-secondary btn-sm" type="submit">${bi('연결', 'Link')}</button>
        ${s.linked_email ? `<button class="btn btn-ghost btn-sm" type="button" data-unlink>${bi('연결 해제', 'Unlink')}</button>` : ''}
      </form>
      <p class="meta">${s.linked_email ? '이 계정으로 로그인한 학생만 이 수업실을 볼 수 있습니다.' : '계정을 연결하기 전에는 강사만 이 수업실을 볼 수 있습니다. 학생이 먼저 회원가입을 해야 연결할 수 있습니다.'}</p>
    </article>`).join('')}</div>` : empty(bi('아직 학생이 없습니다', 'No students yet'), '학생을 추가하면 「1:1 수업」 메뉴에 이름이 생깁니다.')}`,
  mount(root) {
    const add = $('#student-add', root);
    add.addEventListener('submit', async (e) => {
      e.preventDefault();
      const done = await submitWith(add, async (d) => { await store.saveStudent({ name: d.name, note: d.note }); return true; }, { okMsg: '학생을 추가했습니다.' });
      if (done) { refreshNav(); refresh(); }
    });
    $$('[data-student]', root).forEach((card) => {
      const id = card.dataset.student, s = rows.find((x) => x.id === id);
      $('[data-rename]', card).addEventListener('click', () => {
        const name = prompt('학생 이름', s.name);
        if (name && name.trim()) act(async () => { await store.saveStudent({ id, name: name.trim(), note: s.note }); refreshNav(); }, '이름을 바꿨습니다.');
      });
      $('[data-del]', card).addEventListener('click', () => confirm(`${s.name} 학생과 수업자료·파일을 모두 삭제할까요? 되돌릴 수 없습니다.`)
        && act(async () => { await store.deleteStudent(id); refreshNav(); }, '삭제했습니다.'));
      $('[data-link]', card).addEventListener('submit', (e) => {
        e.preventDefault();
        const email = new FormData(e.target).get('email').trim();
        if (!email) { toast('이메일을 입력해 주세요.', 'bad'); return; }
        act(() => store.linkStudent(id, email), '계정을 연결했습니다.');
      });
      $('[data-unlink]', card)?.addEventListener('click', () => act(() => store.linkStudent(id, ''), '연결을 해제했습니다.'));
    });
  } };
}

async function resources() {
  const rows = await store.listResources();
  return { html: `<div class="row-between" style="margin-bottom:16px"><h2 style="margin:0">${bi('학습 자료', 'Study notes')}</h2>
      <a class="btn btn-primary" href="#/learn/new">+ ${bi('새 자료 작성', 'New note')}</a></div>
    ${rows.length ? `<div class="card table-wrap"><table><thead><tr><th>제목</th><th>분류</th><th>수준</th><th>상태</th><th><span class="sr-only">작업</span></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><a href="#/learn/${esc(r.id)}">${esc(r.title)}</a></td><td>${CATEGORIES[r.category]?.[0]}</td><td>${LEVELS[r.level]?.[0]}</td>
        <td>${r.published === false ? '비공개' : '공개'}${r.is_sample ? ' · 예시' : ''}</td>
        <td><span class="btn-row"><a class="btn btn-secondary btn-sm" href="#/learn/${esc(r.id)}/edit">${bi('수정', 'Edit')}</a>
          ${r.is_template ? '<span class="meta">예시 원본 · Template</span>' : `<button class="btn btn-danger btn-sm" data-del="${esc(r.id)}">${bi('삭제', 'Delete')}</button>`}</span></td></tr>`).join('')}
    </tbody></table></div>` : empty(bi('아직 자료가 없습니다', 'No notes yet'))}`,
  mount(root) {
    $$('[data-del]', root).forEach((b) => b.addEventListener('click', () => confirm('이 자료를 삭제할까요? 되돌릴 수 없습니다.') && act(() => store.deleteResource(b.dataset.del), '삭제했습니다.')));
  } };
}

async function community() {
  const [reports, posts] = await Promise.all([store.listReports(), store.listPosts()]);
  const hidden = posts.filter((p) => p.hidden);
  return { html: `<h2>${bi('신고된 글', 'Reports')}</h2>
    ${reports.length ? `<div class="stack">${reports.map((r) => `<article class="card admin-item">
      <div><span class="tag tag-peach">${r.target_type === 'comment' ? '댓글' : '글'}</span> <strong>${esc(String(r.excerpt).slice(0, 120))}</strong></div>
      <div><strong>신고 이유</strong> ${esc(r.reason)}</div><div class="meta">신고자 ${esc(r.reporter_name)} · ${fmtDate(r.created_at)}</div>
      <div class="btn-row">${r.post_id ? `<a class="btn btn-secondary btn-sm" href="#/community/${esc(r.post_id)}">${bi('글 보기', 'Open post')}</a>` : ''}
        ${r.post_id && r.target_type === 'post' ? `<button class="btn btn-danger btn-sm" data-hide="${esc(r.post_id)}" data-report="${esc(r.id)}">${bi('글 숨기기', 'Hide post')}</button>` : ''}
        ${r.target_type === 'comment' && r.post_id ? `<button class="btn btn-danger btn-sm" data-delc="${esc(r.target_id)}" data-report="${esc(r.id)}">${bi('댓글 삭제', 'Delete comment')}</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-resolve="${esc(r.id)}">${bi('문제 없음 · 처리 완료', 'Dismiss')}</button></div>
    </article>`).join('')}</div>` : empty(bi('처리할 신고가 없습니다', 'No open reports'))}
    <h2 style="margin-top:48px">${bi('숨긴 글', 'Hidden posts')}</h2>
    ${hidden.length ? `<div class="card"><ul class="list-plain">${hidden.map((p) => `<li class="row-between" style="padding:8px 0"><a href="#/community/${esc(p.id)}"><strong>${esc(p.title)}</strong>
      <div class="meta">${esc(p.author_name)} · ${fmtDate(p.created_at)}</div></a><button class="btn btn-secondary btn-sm" data-unhide="${esc(p.id)}">${bi('다시 공개', 'Unhide')}</button></li>`).join('')}</ul></div>`
      : empty(bi('숨긴 글이 없습니다', 'No hidden posts'))}
    <p class="meta" style="margin-top:24px">모든 글과 댓글은 커뮤니티 화면에서 바로 수정·삭제·숨김 처리할 수 있습니다.</p>`,
  mount(root) {
    $$('[data-resolve]', root).forEach((b) => b.addEventListener('click', () => act(() => store.resolveReport(b.dataset.resolve), '처리했습니다.')));
    $$('[data-hide]', root).forEach((b) => b.addEventListener('click', () => act(async () => { await store.setPostHidden(b.dataset.hide, true); await store.resolveReport(b.dataset.report); }, '글을 숨겼습니다.')));
    $$('[data-delc]', root).forEach((b) => b.addEventListener('click', () => confirm('이 댓글을 삭제할까요?') && act(async () => { await store.deleteComment(b.dataset.delc); await store.resolveReport(b.dataset.report); }, '댓글을 삭제했습니다.')));
    $$('[data-unhide]', root).forEach((b) => b.addEventListener('click', () => act(() => store.setPostHidden(b.dataset.unhide, false), '다시 공개했습니다.')));
  } };
}

async function profile() {
  const p = await store.getTeacherProfile();
  const area = (name, label, hint, rows = 4) => `<div class="field"><label for="pf-${name}">${label}</label>
    <textarea id="pf-${name}" name="${name}" rows="${rows}">${esc(p[name] || '')}</textarea>${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
  return { html: `<h2>${bi('강사 소개 · 운영 정보', 'Teacher profile and contact')}</h2>
    <p class="muted read">비워 둔 항목은 사이트에 「입력 대기」로 표시됩니다. 실제 경력·가격·후기만 적어 주세요.</p>
    <form class="form card" id="profile-form" style="max-width:760px">
      <div class="field"><label for="pf-headline">${bi('핵심 소개 문장', 'Headline')}</label><input id="pf-headline" name="headline" type="text" maxlength="200" value="${esc(p.headline || '')}"></div>
      <div class="field"><label for="pf-photo-file">${bi('소개 사진', 'Photo')}</label><input id="pf-photo-file" name="photo_file" type="file" accept="image/*">
        <input type="hidden" name="photo" value="${esc(p.photo || '')}">
        <p class="hint">${p.photo ? '사진이 등록되어 있습니다. 새 파일을 고르면 바뀝니다.' : '아직 사진이 없습니다.'}</p></div>
      ${area('career', bi('경력', 'Experience'), '한 줄에 하나씩 적습니다.')}
      ${area('philosophy', bi('교육 철학', 'Teaching philosophy'), '')}
      ${area('method', bi('수업 방식 · 수업료', 'How lessons work, prices'), '')}
      ${area('reviews', bi('수강 후기', 'Reviews'), '실제 후기만, 한 줄에 하나씩: <code>이름 | 후기 내용</code>')}
      ${area('contact', bi('문의 · 운영 정보', 'Contact'), '첫 줄은 사이트 맨 아래에도 표시됩니다. 예: 문의 이메일, 수업 가능 시간')}
      ${status}<div><button class="btn btn-primary" type="submit">${bi('저장', 'Save')}</button></div>
    </form>`,
  mount(root) {
    const form = $('#profile-form', root);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = form.querySelector('[name=photo_file]').files[0];
      const done = await submitWith(form, async (d) => {
        const photo = file ? await store.uploadPublicImage(file) : d.photo;
        await store.saveTeacherProfile({ headline: d.headline.trim(), photo, career: d.career.trim(), philosophy: d.philosophy.trim(),
          method: d.method.trim(), reviews: d.reviews.trim(), contact: d.contact.trim() });
        return true;
      }, { okMsg: '저장했습니다. Saved.' });
      if (done) refresh();
    });
  } };
}
