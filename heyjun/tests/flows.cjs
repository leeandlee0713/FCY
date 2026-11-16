// 기능 흐름 검증 (데모 저장소)
const { chromium } = require('playwright');
const B = process.env.HEYJUN_URL || 'http://localhost:8000/heyjun/?demo=1';
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
(async () => {
  const b = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '테스트 사유' : undefined));
  const go = async (r) => { await p.goto(B + '#/' + r); await p.waitForTimeout(300); };
  const h1 = () => p.evaluate(() => document.querySelector('h1')?.innerText || '');
  const demo = async (id) => { await go('login'); await p.click(`[data-demo="${id}"]`); await p.waitForTimeout(400); };
  const logout = async () => { await p.click('[data-act=logout]'); await p.waitForTimeout(300); };

  // 비로그인: 수업실·관리 접근 차단, 신청 가능
  await go('lessons/student-emma'); ok('visitor blocked from classroom', (await h1()).includes('볼 수 없는'));
  await go('admin'); ok('visitor blocked from admin', (await h1()).includes('볼 수 없는'));
  await go('community/new'); ok('visitor blocked from writing', (await h1()).includes('볼 수 없는'));
  await go('apply');
  await p.fill('#ap-name', 'Test Kim'); await p.fill('#ap-goal', 'Travel'); await p.fill('#ap-times', 'Weekends'); await p.fill('#ap-contact', 'test@example.com');
  await p.click('#apply-form [type=submit]'); await p.waitForTimeout(400);
  ok('application submitted', await p.locator('#apply-done').count() === 1);

  // 메뉴: 키보드로 하위 메뉴 열기
  await go('');
  await p.focus('[aria-controls=sub-learn]'); await p.keyboard.press('ArrowDown');
  ok('keyboard opens submenu', await p.evaluate(() => document.activeElement.closest('#sub-learn') !== null));
  await p.keyboard.press('Escape');
  ok('escape closes submenu', await p.getAttribute('[aria-controls=sub-learn]', 'aria-expanded') === 'false');

  // 학생 A: 본인 수업실만
  await demo('demo-emma');
  ok('student sees my classroom button', await p.locator('.auth-area a[href="#/lessons/student-emma"]').count() === 1);
  await go('lessons/student-emma'); ok('student A opens own classroom', (await h1()).includes('Emma'));
  ok('student A has no edit button', await p.locator('[data-edit]').count() === 0);
  await go('lessons/student-liam'); ok('student A blocked from student B', (await h1()).includes('볼 수 없는'));
  await go('admin'); ok('student blocked from admin', (await h1()).includes('볼 수 없는'));
  await go('learn/new'); ok('student blocked from note editor', (await h1()).includes('볼 수 없는'));
  const subA = await p.evaluate(() => document.querySelector('#sub-lessons').innerText);
  ok('student menu lists only self', subA.includes('Emma') && !subA.includes('Liam'));
  // 저장소 수준에서도 거절되는지
  const direct = await p.evaluate(async () => { const { store } = await import('./js/store.js'); const out = {};
    out.other = await store.getStudent('student-liam');
    try { await store.saveStudent({ name: 'x' }); out.save = 'allowed'; } catch { out.save = 'denied'; }
    try { await store.listApplications(); out.apps = 'allowed'; } catch { out.apps = 'denied'; }
    return out; });
  ok('store denies student → other student / admin calls', direct.other === null && direct.save === 'denied' && direct.apps === 'denied', JSON.stringify(direct));
  await logout();

  // 강사: 자료 등록·파일·학생 추가·신청 확인
  await demo('demo-teacher');
  await go('admin'); ok('teacher sees application', (await p.locator('.admin-item').first().innerText()).includes('Test Kim'));
  await go('lessons/student-emma');
  await p.click('[data-edit="2"]');
  await p.fill('#m-title-2', '숙제 2'); await p.fill('#m-desc-2', '설명입니다'); await p.fill('#m-links-2', '사전 | https://example.com/dict');
  await p.setInputFiles('#m-files-2', [{ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
    { name: 'pic.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }]);
  await p.click('[data-save="2"] [type=submit]'); await p.waitForTimeout(700);
  const mat = await p.locator('#mat-2').innerText();
  ok('teacher saved material with link/file/image', mat.includes('숙제 2') && mat.includes('note.txt') && mat.includes('사전') && await p.locator('#mat-2 img').count() === 1);
  ok('image loaded', await p.evaluate(() => document.querySelector('#mat-2 img').naturalWidth > 0));
  await go('admin/students');
  await p.fill('#st-name', 'Noah'); await p.click('#student-add [type=submit]'); await p.waitForTimeout(500);
  ok('teacher added student + nav updated', (await p.evaluate(() => document.querySelector('#sub-lessons').innerText)).includes('Noah'));
  // 새 자료 작성 → 수정 → 삭제
  await go('learn/new');
  await p.fill('#r-title', '테스트 자료'); await p.fill('#r-sum', '요약'); await p.fill('#r-exp', '설명');
  await p.fill('#r-ex', '안녕 | Hi'); await p.fill('#r-pr', '질문? | 가 ; 나 | 2 | 해설');
  await p.click('#res-form [type=submit]'); await p.waitForTimeout(500);
  ok('note created', (await h1()).includes('테스트 자료'));
  await p.click('.quiz .opt >> nth=1'); ok('practice feedback', (await p.locator('.quiz-fb').innerText()).includes('정답이에요'));
  const noteUrl = p.url();
  await p.click('a:has-text("수정")'); await p.waitForTimeout(300); await p.fill('#r-title', '테스트 자료 2'); await p.click('#res-form [type=submit]'); await p.waitForTimeout(500);
  ok('note edited', (await h1()).includes('테스트 자료 2'));
  await p.click('[data-act=delete]'); await p.waitForTimeout(500);
  await p.goto(noteUrl); await p.waitForTimeout(300); ok('note deleted', (await h1()).includes('찾을 수 없'));
  await logout();

  // 학생 A가 방금 올린 자료를 보고, 학생 B는 못 봄
  await demo('demo-emma'); await go('lessons/student-emma');
  ok('student A sees new material', (await p.locator('#mat-2').innerText()).includes('숙제 2'));
  await logout();
  await demo('demo-liam');
  const leak = await p.evaluate(async () => { const { store } = await import('./js/store.js');
    const e = await store.getStudent('student-emma'); let file = 'denied';
    const all = JSON.parse(localStorage.getItem('heyjun.demo.v1')).files;
    try { await store.fileUrl(all[0]); file = 'allowed'; } catch {}
    return { e, file }; });
  ok('student B cannot read A page or files', leak.e === null && leak.file === 'denied');
  await logout();

  // 회원가입 → 글·댓글·신고, 스팸 간격
  await go('signup');
  await p.fill('#s-name', 'Ana'); await p.fill('#s-email', 'ana@example.com'); await p.fill('#s-pass', 'password123');
  await p.click('#signup-form [type=submit]'); await p.waitForTimeout(600);
  ok('signup logs in as member', (await p.locator('.who').innerText()).includes('Ana'));
  await go('community/new');
  await p.fill('#p-title', '첫 글입니다'); await p.fill('#p-body', '안녕하세요'); await p.click('#post-form [type=submit]'); await p.waitForTimeout(500);
  ok('post created', (await h1()).includes('첫 글입니다'));
  await p.fill('#c-body', '내 댓글'); await p.click('#comment-form [type=submit]'); await p.waitForTimeout(500);
  ok('comment created', (await p.locator('.comment').innerText()).includes('내 댓글'));
  await go('community/new');
  await p.fill('#p-title', '두 번째 글'); await p.fill('#p-body', '바로 또 씀'); await p.click('#post-form [type=submit]'); await p.waitForTimeout(400);
  ok('rapid second post is rate-limited', (await p.locator('.form-status').innerText()).includes('너무 빠릅니다'));
  await go('community/sample-post-0');
  ok('member cannot edit others post', await p.locator('[data-act=del-post]').count() === 0);
  await p.click('[data-report^="post:"]'); await p.waitForTimeout(300);
  const role = await p.evaluate(async () => { const { store } = await import('./js/store.js'); try { await store.setPostHidden('sample-post-0', true); return 'allowed'; } catch { return 'denied'; } });
  ok('member cannot hide posts', role === 'denied');
  await logout();
  await go('login'); await p.fill('#l-email', 'ana@example.com'); await p.fill('#l-pass', 'wrongpass1'); await p.click('#login-form [type=submit]'); await p.waitForTimeout(400);
  ok('wrong password rejected', (await p.locator('.form-status').innerText()).includes('맞지 않습니다'));
  await p.fill('#l-pass', 'password123'); await p.click('#login-form [type=submit]'); await p.waitForTimeout(500);
  ok('login with password', (await p.locator('.who').innerText()).includes('Ana'));
  await logout();
  await demo('demo-teacher'); await go('admin/community');
  ok('teacher sees report', (await p.locator('.admin-item').innerText()).includes('테스트 사유'));
  await p.click('[data-hide]'); await p.waitForTimeout(500);
  await logout(); await go('community');
  ok('hidden post gone for visitors', !(await p.locator('#app').innerText()).includes('은/는'));

  // 학습실 검색·필터
  await go('learn'); await p.fill('#learn-q', '얼마'); await p.waitForTimeout(200);
  ok('search filters notes', await p.locator('#learn-list a.card').count() === 1);
  await go('learn?cat=grammar'); ok('category filter', await p.locator('#learn-list a.card').count() === 4);

  console.log(results.join('\n')); console.log(errs.join('\n') || 'no page errors');
  await b.close();
})();
