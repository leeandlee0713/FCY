// 실서버(Supabase) 연결 상태에서의 흐름 검증.
// 미리 인증된 테스트 계정 4개가 있어야 한다: QA_TEACHER(강사), QA_A, QA_B(회원 → 학생으로 연결됨), QA_M(회원)
// 실행: HEYJUN_URL=... QA_PASS=... node heyjun/tests/live.cjs
const { chromium } = require('playwright');
const B = process.env.HEYJUN_URL || 'http://localhost:8000/heyjun/';
const PASS = process.env.QA_PASS;
const ACC = { teacher: 'qa-teacher@heyjun.test', a: 'qa-a@heyjun.test', b: 'qa-b@heyjun.test', m: 'qa-m@heyjun.test' };
const results = [];
const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'QA 신고 사유' : undefined));
  const ready = async () => { await p.waitForTimeout(150); await p.waitForFunction(() => document.querySelector('#app').dataset.ready, null, { timeout: 20000 }); };
  const go = async (r) => { await p.goto(B + '#/' + r); await ready(); };
  const h1 = () => p.evaluate(() => document.querySelector('h1')?.innerText || '');
  const login = async (who) => {
    await go('login'); await p.fill('#l-email', ACC[who]); await p.fill('#l-pass', PASS); await p.click('#login-form [type=submit]');
    await p.waitForSelector('[data-act=logout]', { timeout: 15000 }); await p.waitForTimeout(800); await ready();
  };
  const logout = async () => { await p.click('[data-act=logout]'); await p.waitForSelector('a[href="#/login"]'); await p.waitForTimeout(800); await ready(); };
  const api = (fn) => p.evaluate(fn);

  // 방문자
  await go('');
  ok('live mode: no demo banner', await p.locator('#demo-banner').isHidden());
  const same = await api(async () => {
    const { store } = await import('./js/store.js'); const { SAMPLE_RESOURCES } = await import('./js/content.js');
    const rows = await store.listResources();
    const sort = (v) => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v;
    const norm = (r) => JSON.stringify(sort([r.category, r.level, r.title, r.summary, r.explanation, r.examples, r.practice]));
    return { mode: store.mode, n: rows.length, equal: SAMPLE_RESOURCES.every((s) => rows.some((r) => norm(r) === norm(s))) };
  });
  ok('seeded notes match source content', same.mode === 'live' && same.n >= 8 && same.equal, JSON.stringify(same));
  await go('login'); ok('no demo accounts on live login', await p.locator('[data-demo]').count() === 0);
  await go('learn/' + await api(async () => (await (await import('./js/store.js')).store.listResources())[0].id));
  ok('visitor reads note detail', (await p.locator('.example').count()) > 0);
  await go('admin'); ok('visitor blocked from admin', (await h1()).includes('볼 수 없는'));
  await go('apply');
  await p.fill('#ap-name', 'QA 신청자'); await p.fill('#ap-goal', 'QA goal'); await p.fill('#ap-times', 'QA times'); await p.fill('#ap-contact', 'qa@heyjun.test');
  await p.click('#apply-form [type=submit]'); await p.waitForSelector('#apply-done', { timeout: 15000 });
  ok('visitor application saved', true);
  ok('visitor cannot read applications', await api(async () => { try { await (await import('./js/store.js')).store.listApplications(); return false; } catch { return true; } }));

  // 강사
  await login('teacher');
  ok('teacher has admin button', await p.locator('.auth-area a[href="#/admin"]').count() === 1);
  await go('admin'); ok('teacher sees application', (await p.locator('#app').innerText()).includes('QA 신청자'));
  await go('admin/students');
  for (const n of ['QA-A', 'QA-B']) { await p.fill('#st-name', n); await p.click('#student-add [type=submit]'); await p.waitForSelector(`[data-student] h3:has-text("${n}")`); await p.waitForTimeout(600); }
  for (const [n, who] of [['QA-A', 'a'], ['QA-B', 'b']]) {
    const card = p.locator('[data-student]', { has: p.locator(`h3:has-text("${n}")`) });
    await card.locator('input[type=email]').fill(ACC[who]); await card.locator('[data-link] [type=submit]').click();
    await p.waitForSelector(`[data-student]:has(h3:has-text("${n}")) [data-unlink]`, { timeout: 15000 }); await p.waitForTimeout(500);
  }
  ok('teacher created and linked two students', await p.locator('[data-unlink]').count() === 2);
  const ids = await api(async () => Object.fromEntries((await (await import('./js/store.js')).store.listStudents()).map((s) => [s.name, s.id])));
  await go('lessons/' + ids['QA-A']);
  await p.click('[data-edit="1"]');
  await p.fill('#m-title-1', 'QA 자료'); await p.fill('#m-desc-1', 'QA 설명'); await p.fill('#m-links-1', '사전 | https://example.com/dict');
  await p.setInputFiles('#m-files-1', [{ name: '숙제 노트.txt', mimeType: 'text/plain', buffer: Buffer.from('secret-for-A') },
    { name: 'pic.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }]);
  await p.click('[data-save="1"] [type=submit]'); await p.waitForSelector('#mat-1 img', { timeout: 20000 }); await p.waitForTimeout(1500);
  const mat = await p.locator('#mat-1').innerText();
  ok('teacher saved material + uploaded file and image', mat.includes('QA 자료') && mat.includes('숙제 노트.txt') && mat.includes('사전'));
  ok('teacher image loads via signed URL', await p.waitForFunction(() => document.querySelector('#mat-1 img')?.naturalWidth > 0, null, { timeout: 10000 }).then(() => true).catch(async () => { console.log('IMG', await p.evaluate(async () => { const i = document.querySelector('#mat-1 img'); if (!i) return 'no img'; const r = i.src ? await fetch(i.src).then((x) => x.status + ' ' + x.headers.get('content-type')).catch((e) => 'ERR ' + e.message) : 'no src'; return [i.src.slice(0, 90), i.alt, r].join(' | '); })); return false; }));
  const filePath = await api(async () => { const { store } = await import('./js/store.js'); const id = location.hash.split('/').pop();
    return (await store.getStudent(id)).materials[0].files.find((f) => f.name.endsWith('.txt')).path; });
  await go('learn/new');
  await p.fill('#r-title', 'QA 자료 글'); await p.fill('#r-exp', '설명'); await p.fill('#r-ex', '안녕 | Hi'); await p.fill('#r-pr', '질문? | 가 ; 나 | 2 | 해설');
  await p.click('#res-form [type=submit]'); await p.waitForSelector('h1:has-text("QA 자료 글")', { timeout: 15000 });
  await p.click('a:has-text("수정")'); await p.waitForSelector('#res-form'); await p.fill('#r-title', 'QA 자료 글 2'); await p.click('#res-form [type=submit]');
  await p.waitForSelector('h1:has-text("QA 자료 글 2")', { timeout: 15000 }); ok('teacher created and edited a note', true);
  await p.click('[data-act=delete]'); await p.waitForSelector('#learn-list', { timeout: 15000 }); await p.waitForTimeout(500);
  ok('teacher deleted the note', !(await p.locator('#learn-list').innerText()).includes('QA 자료 글'));
  await logout();

  // 학생 A
  await login('a');
  ok('linked account became student with classroom button', await p.locator(`.auth-area a[href="#/lessons/${ids['QA-A']}"]`).count() === 1);
  await go('lessons/' + ids['QA-A']);
  ok('student A sees own material, no edit', (await p.locator('#mat-1').innerText()).includes('QA 자료') && await p.locator('[data-edit]').count() === 0);
  await p.waitForTimeout(1500);
  ok('student A image loads', await p.waitForFunction(() => document.querySelector('#mat-1 img')?.naturalWidth > 0, null, { timeout: 10000 }).then(() => true).catch(async () => { console.log('IMG', await p.evaluate(async () => { const i = document.querySelector('#mat-1 img'); if (!i) return 'no img'; const r = i.src ? await fetch(i.src).then((x) => x.status + ' ' + x.headers.get('content-type')).catch((e) => 'ERR ' + e.message) : 'no src'; return [i.src.slice(0, 90), i.alt, r].join(' | '); })); return false; }));
  await go('lessons/' + ids['QA-B']); ok('student A blocked from student B page', (await h1()).includes('볼 수 없는'));
  const aTry = await p.evaluate(async () => { const { store } = await import('./js/store.js'); const out = {};
    out.students = (await store.listStudents()).map((s) => s.name);
    for (const [k, fn] of Object.entries({ saveStudent: () => store.saveStudent({ name: 'hack' }), apps: () => store.listApplications().then((r) => { if (!r.length) throw 0; }),
      saveNote: () => store.saveResource({ category: 'grammar', level: 'beginner', title: 'hack', summary: '', explanation: '', examples: [], practice: [], published: true }),
      profile: () => store.saveTeacherProfile({ headline: 'hack' }), link: () => store.linkStudent('00000000-0000-0000-0000-000000000000', 'x@y.z') }))
      { try { await fn(); out[k] = 'ALLOWED'; } catch { out[k] = 'denied'; } }
    return out; });
  ok('server denies student admin actions', aTry.students.join() === 'QA-A' && !Object.values(aTry).includes('ALLOWED'), JSON.stringify(aTry));
  await logout();

  // 학생 B: A의 파일 경로를 알아도 받을 수 없다
  await login('b');
  const bTry = await p.evaluate(async ([path, key, url]) => {
    const token = JSON.parse(Object.entries(localStorage).find(([k]) => k.startsWith('sb-'))[1]).access_token;
    const h = { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const sign = await fetch(`${url}/storage/v1/object/sign/lesson-files/${path}`, { method: 'POST', headers: h, body: '{"expiresIn":60}' });
    const get = await fetch(`${url}/storage/v1/object/authenticated/lesson-files/${path}`, { headers: h });
    const rows = await (await fetch(`${url}/rest/v1/lesson_files?select=*`, { headers: h })).json();
    const mats = await (await fetch(`${url}/rest/v1/lesson_materials?select=title`, { headers: h })).json();
    const me = JSON.parse(atob(token.split('.')[1])).sub;
    const promo = await fetch(`${url}/rest/v1/profiles?id=eq.${me}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: '{"role":"teacher"}' });
    const role = (await (await fetch(`${url}/rest/v1/profiles?id=eq.${me}&select=role`, { headers: h })).json())[0].role;
    return { sign: sign.status, get: get.status, files: rows.length, mats: mats.length, promo: promo.status, role };
  }, [filePath, (await import('node:fs')).readFileSync(__dirname + '/../js/config.js', 'utf8').match(/SUPABASE_KEY = '([^']+)'/)[1], (await import('node:fs')).readFileSync(__dirname + '/../js/config.js', 'utf8').match(/SUPABASE_URL = '([^']+)'/)[1]]);
  ok('student B cannot sign/download A file, list A rows, or self-promote', bTry.sign >= 400 && bTry.get >= 400 && bTry.files === 0 && bTry.mats === 0 && bTry.promo >= 400 && bTry.role === 'student', JSON.stringify(bTry));
  await logout();

  // 회원: 커뮤니티 · 게임 기록
  await login('m');
  await go('community/new');
  await p.fill('#p-title', 'QA 첫 글'); await p.fill('#p-body', 'QA 본문'); await p.click('#post-form [type=submit]'); await p.waitForSelector('h1:has-text("QA 첫 글")', { timeout: 15000 });
  const postUrl = p.url();
  await p.fill('#c-body', 'QA 댓글'); await p.click('#comment-form [type=submit]'); await p.waitForSelector('.comment', { timeout: 15000 });
  ok('member wrote post and comment', (await p.locator('.comment').innerText()).includes('QA 댓글'));
  await go('community/new'); await p.fill('#p-title', 'QA 둘째 글'); await p.fill('#p-body', '바로 또'); await p.click('#post-form [type=submit]');
  await p.waitForSelector('.form-status:not([hidden])', { timeout: 15000 });
  ok('server rate-limits rapid posting', (await p.locator('.form-status').innerText()).includes('너무 빠릅니다'));
  await go('games/match'); await p.click('[data-act=start]');
  for (let i = 0; i < 10; i++) { await p.locator('.choice').first().click(); await p.click('[data-act=next]'); }
  await p.waitForSelector('.result'); ok('member game record saved to account', (await p.locator('.result').innerText()).includes('내 계정에 저장'));
  await logout();
  await login('a'); await p.goto(postUrl); await p.waitForSelector('[data-report^="post:"]'); await p.click('[data-report^="post:"]'); await p.waitForTimeout(1500);
  ok('other member cannot edit the post', await p.locator('[data-act=del-post]').count() === 0);
  ok('game scores are per account', await api(async () => (await (await import('./js/store.js')).store.getScore('match')) === null));
  await logout();

  // 강사: 신고 처리 · 정리
  await login('teacher'); await go('admin/community');
  ok('teacher sees the report', (await p.locator('#app').innerText()).includes('QA 신고 사유'));
  await p.click('[data-hide]'); await p.waitForTimeout(2500);
  await logout(); await go('community');
  ok('hidden post not visible to visitors', !(await p.locator('#app').innerText()).includes('QA 첫 글'));
  await login('teacher');
  const cleanup = await p.evaluate(async () => { const { store } = await import('./js/store.js');
    for (const s of await store.listStudents()) if (s.name.startsWith('QA-')) await store.deleteStudent(s.id);
    for (const x of await store.listPosts()) if (x.title.startsWith('QA')) await store.deletePost(x.id);
    for (const a of await store.listApplications()) if (a.name.startsWith('QA')) await store.deleteApplication(a.id);
    return { students: (await store.listStudents()).length, posts: (await store.listPosts()).length, apps: (await store.listApplications()).length }; });
  ok('teacher deleted test students/files/posts/applications', cleanup.students === 0 && cleanup.posts === 0 && cleanup.apps === 0, JSON.stringify(cleanup));

  console.log(results.join('\n')); console.log(errs.join('\n') || 'no page errors');
  await b.close();
  if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
})();
