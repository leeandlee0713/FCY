// 앱 뼈대: 저장소 초기화, 메뉴, 주소(#/...)에 따른 화면 전환
import { $, $$, esc, bi, toast } from './util.js';
import { initStore, store } from './store.js';
import * as V from './views.js';
import { adminView } from './admin.js';

const app = $('#app');
const nav = $('#site-nav');
const menuToggle = $('.menu-toggle');
let myStudents = [];

const routes = [
  [/^\/$/, V.home],
  [/^\/teacher$/, V.teacher],
  [/^\/apply$/, V.apply],
  [/^\/lessons$/, V.lessons],
  [/^\/lessons\/([\w-]+)$/, V.classroom],
  [/^\/learn$/, V.learn],
  [/^\/learn\/new$/, () => V.learnEdit(null)],
  [/^\/learn\/([\w-]+)\/edit$/, V.learnEdit],
  [/^\/learn\/([\w-]+)$/, V.learnDetail],
  [/^\/community$/, V.community],
  [/^\/community\/new$/, () => V.postEdit(null)],
  [/^\/community\/([\w-]+)\/edit$/, V.postEdit],
  [/^\/community\/([\w-]+)$/, V.post],
  [/^\/games$/, V.games],
  [/^\/games\/(match|blocks|listen)$/, V.game],
  [/^\/login$/, V.login],
  [/^\/signup$/, V.signup],
  [/^\/admin(?:\/(\w+))?$/, adminView],
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

let renderSeq = 0;
async function render({ keepScroll = false } = {}) {
  const seq = ++renderSeq;
  delete app.dataset.ready;
  const { path, query } = parseHash();
  const hit = routes.map(([re, fn]) => [path.match(re), fn]).find(([m]) => m);
  closeMenus(); nav.classList.remove('open'); menuToggle.setAttribute('aria-expanded', 'false');
  let view;
  try {
    if (!app.querySelector('.page, .hero')) app.innerHTML = `<div class="loading">${bi('불러오는 중…', 'Loading…')}</div>`;
    view = hit ? await hit[1](...hit[0].slice(1), query) : V.notFound();
  } catch (e) {
    console.error(e);
    view = V.errorView(e);
  }
  if (seq !== renderSeq) return; // 그사이 다른 화면으로 이동했다
  app.innerHTML = view.html;
  document.title = (view.title ? view.title + ' — ' : '') + 'HEYJUN Korean';
  markCurrent(path);
  try { await view.mount?.(app); } catch (e) { console.error(e); toast(e.message, 'bad'); }
  if (!keepScroll) { window.scrollTo(0, 0); }
  app.dataset.ready = String(seq); // 화면이 다 그려졌음을 알리는 표시(자동 검증에서 사용)
}

// ── 메뉴 ─────────────────────────────────────────────────────────
function lessonSub() {
  const u = store.user;
  if (u?.role === 'teacher') {
    return (myStudents.length
      ? myStudents.map((s) => `<li><a href="#/lessons/${esc(s.id)}">${esc(s.name)}</a></li>`).join('')
      : `<li class="sub-note">${bi('아직 학생이 없습니다.', 'No students yet.')}</li>`)
      + `<li><a href="#/admin/students">${bi('+ 학생 관리', 'Manage students')}</a></li>`;
  }
  if (myStudents.length) {
    return myStudents.map((s) => `<li><a href="#/lessons/${esc(s.id)}">${bi(`${esc(s.name)} · 내 수업실`, 'My classroom')}</a></li>`).join('')
      + `<li><a href="#/lessons">${bi('1:1 수업 안내', 'About lessons')}</a></li>`;
  }
  return `<li><a href="#/lessons">${bi('1:1 수업 안내', 'About lessons')}</a></li>
    <li><a href="#/apply">${bi('수업 신청', 'Apply')}</a></li>
    ${u ? '' : `<li class="sub-note">${bi('학생은 로그인하면 내 수업실이 보입니다.', 'Students: log in to see your classroom.')}</li>`}`;
}

function renderNav() {
  const u = store.user;
  const roleName = { teacher: '강사', student: '학생', member: '회원' };
  nav.innerHTML = `<ul class="nav-list">
      <li><a class="nav-link" data-top="/teacher" href="#/teacher">${bi('강사 소개', 'Teacher')}</a></li>
      <li class="has-sub">
        <button class="sub-toggle" type="button" data-top="/lessons" aria-expanded="false" aria-controls="sub-lessons">${bi('1:1 수업', 'Lessons')}</button>
        <ul class="sub" id="sub-lessons">${lessonSub()}</ul>
      </li>
      <li class="has-sub">
        <button class="sub-toggle" type="button" data-top="/learn" aria-expanded="false" aria-controls="sub-learn">${bi('학습실', 'Learn')}</button>
        <ul class="sub" id="sub-learn">
          <li><a href="#/learn?cat=expression">${bi('한국어 표현', 'Expressions')}</a></li>
          <li><a href="#/learn?cat=grammar">${bi('한국어 문법', 'Grammar')}</a></li>
          <li><a href="#/learn">${bi('전체 자료', 'All notes')}</a></li>
        </ul>
      </li>
      <li><a class="nav-link" data-top="/community" href="#/community">${bi('커뮤니티', 'Community')}</a></li>
      <li><a class="nav-link" data-top="/games" href="#/games">${bi('한글 게임', 'Games')}</a></li>
    </ul>
    <div class="auth-area">
      ${u ? `<span class="who" title="${esc(u.email)}">${esc(u.name)} · ${roleName[u.role]}</span>
          ${u.role === 'teacher' ? `<a class="btn btn-primary btn-sm" href="#/admin">${bi('관리', 'Admin')}</a>` : ''}
          ${u.role !== 'teacher' && myStudents[0] ? `<a class="btn btn-primary btn-sm" href="#/lessons/${esc(myStudents[0].id)}">${bi('내 수업실', 'My classroom')}</a>` : ''}
          <button class="btn btn-ghost btn-sm" type="button" data-act="logout">${bi('로그아웃', 'Log out')}</button>`
        : `<a class="btn btn-ghost btn-sm" href="#/login">${bi('로그인', 'Log in')}</a>
           <a class="btn btn-secondary btn-sm" href="#/signup">${bi('회원가입', 'Sign up')}</a>`}
    </div>`;
  markCurrent(parseHash().path);
}

function markCurrent(path) {
  $$('[data-top]', nav).forEach((el) => {
    if (path.startsWith(el.dataset.top)) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
}

function closeMenus(except) {
  $$('.has-sub.open', nav).forEach((li) => {
    if (li === except) return;
    li.classList.remove('open'); li.querySelector('.sub-toggle').setAttribute('aria-expanded', 'false');
  });
}
function openMenu(li, focusFirst) {
  closeMenus(li);
  li.classList.add('open'); li.querySelector('.sub-toggle').setAttribute('aria-expanded', 'true');
  if (focusFirst) li.querySelector('.sub a')?.focus();
}

nav.addEventListener('click', async (e) => {
  const toggle = e.target.closest('.sub-toggle');
  if (toggle) {
    const li = toggle.parentElement;
    if (li.classList.contains('open')) closeMenus(); else openMenu(li);
    return;
  }
  if (e.target.closest('[data-act=logout]')) {
    await store.signOut();
    toast('로그아웃했습니다. Logged out.');
    location.hash = '#/';
  }
});
// 키보드: ↓ 로 열고 ↑↓ 로 이동, Esc 로 닫기
nav.addEventListener('keydown', (e) => {
  const li = e.target.closest('.has-sub');
  if (!li) return;
  const links = $$('.sub a', li);
  const idx = links.indexOf(document.activeElement);
  if (e.key === 'Escape') { closeMenus(); li.querySelector('.sub-toggle').focus(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); if (!li.classList.contains('open')) openMenu(li, true); else links[(idx + 1) % links.length]?.focus(); }
  else if (e.key === 'ArrowUp' && li.classList.contains('open')) { e.preventDefault(); links[(idx - 1 + links.length) % links.length]?.focus(); }
});
nav.addEventListener('focusout', (e) => {
  const li = e.target.closest('.has-sub');
  if (li && !li.contains(e.relatedTarget) && matchMedia('(min-width: 1241px)').matches) closeMenus();
});
document.addEventListener('click', (e) => { if (!e.target.closest('.has-sub')) closeMenus(); });
menuToggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});

async function refreshNav() {
  try { myStudents = store.user ? await store.listStudents() : []; } catch { myStudents = []; }
  renderNav();
}

async function refreshFooter() {
  try {
    const c = (await store.getTeacherProfile()).contact;
    if (c) $('#footer-contact').textContent = c.split('\n')[0];
  } catch { /* 준비 중 문구 유지 */ }
}

// ── 시작 ─────────────────────────────────────────────────────────
(async () => {
  try {
    await initStore();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="wrap page"><p class="notice notice-bad" role="alert">${bi('서버에 연결하지 못했습니다. 잠시 뒤 새로 고침해 주세요.', 'Could not connect to the server. Please reload later.')}</p></div>`;
    return;
  }
  $('#demo-banner').hidden = store.mode !== 'demo';
  store.onAuth(async () => { await refreshNav(); render({ keepScroll: true }); });
  window.addEventListener('hashchange', () => render());
  window.addEventListener('heyjun:refresh', () => render({ keepScroll: true }));
  window.addEventListener('heyjun:nav', refreshNav);
  await refreshNav();
  refreshFooter();
  render();
})();
