const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.HEYJUN_BASE||'http://localhost:8000/heyjun/';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:1000}});p.setDefaultTimeout(15000);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());let seq=0;
  const go=async path=>{await p.goto(base+`?demo=1&qa=${++seq}#/`+path);await p.waitForSelector('#app[data-ready]');};
  const login=async id=>{await go('login');await p.click(`[data-demo=${id}]`);await p.waitForURL(u=>u.hash==='#/');};
  const root='lessons/student-emma';
  await login('demo-teacher');await go(root);
  assert.equal(await p.locator('#class-list .empty').count(),1);assert.equal(await p.locator('.chips .chip').count(),4);
  assert.equal(await p.locator('select').count(),0);assert.equal(await p.locator('.material').count(),3);
  const ids=[];
  for(const category of ['lesson','diary','conversation']){
    await go(root);await p.click(`a[href="#/${root}/notes/new"]`);await p.waitForSelector('#res-form');
    assert.equal(await p.locator('#r-level,[name=level]').count(),0);
    assert.deepEqual(await p.locator('#r-cat option').evaluateAll(xs=>xs.map(x=>x.value)),['lesson','diary','conversation']);
    assert.match(await p.locator('#res-form').innerText(),/학생에게 표시/);
    await p.selectOption('#r-cat',category);await p.fill('#r-title','검증 '+category);await p.fill('#r-sum','개인 자료 검색용 '+category);
    await p.fill('#r-exp','개인 수업 설명');await p.fill('#r-ex','저는 공부해요. | I study.');await p.fill('#r-pr','study 뜻은? | 공부하다 ; 먹다 | 1 | 공부하다 = study');
    if(category==='diary')await p.uncheck('[name=published]');
    await p.click('#res-form button[type=submit]');await p.waitForSelector('article');ids.push(new URL(p.url()).hash.split('/').pop());
    await p.locator('.opt').first().click();assert.match(await p.locator('.quiz-fb').innerText(),/정답/);
  }
  await go(root);assert.equal(await p.locator('#class-list .card').count(),3);
  await p.fill('#class-q','conversation');assert.equal(await p.locator('#class-list .card').count(),1);
  await go(root+'?cat=diary');assert.equal(await p.locator('#class-list .card').count(),1);assert.match(await p.locator('#class-list').innerText(),/작성 중/);
  await go(root+'/notes/'+ids[0]+'/edit');await p.fill('#r-title','수정된 수업내용');await p.click('#res-form button[type=submit]');await p.waitForSelector('article');await p.reload();await p.waitForSelector('article');assert.match(await p.locator('h1').innerText(),/수정된 수업내용/);
  await go('learn/new');assert.equal(await p.locator('#r-level').count(),1);await go('learn');assert.equal(await p.locator('#learn-level').count(),1);assert.doesNotMatch(await p.locator('#learn-list').innerText(),/개인 자료 검색용/);
  console.log('PASS teacher CRUD, persistence, categories, search, exercises, no levels; public study unchanged');
  for(const width of [390,768,1440]){
    await p.setViewportSize({width,height:900});
    for(const path of [root,root+'/notes/new',root+'/notes/'+ids[0]]){
      await go(path);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow: ${width} ${path}`);
    }
    await go(root);await p.screenshot({path:require('node:path').join(require('node:os').tmpdir(),`classroom-${width}.png`),fullPage:true});
  }
  await p.setViewportSize({width:1440,height:1000});
  await login('demo-emma');await go(root);assert.equal(await p.locator('#class-list .card').count(),2);assert.equal(await p.locator(`a[href="#/${root}/notes/new"]`).count(),0);
  await go(root+'/notes/'+ids[1]);assert.match(await p.locator('h1').innerText(),/찾을 수 없습니다/);
  await go(root+'/notes/'+ids[0]+'/edit');assert.match(await p.locator('h1').innerText(),/볼 수 없는/);
  await login('demo-liam');await go('lessons/student-liam/notes/'+ids[0]);assert.match(await p.locator('h1').innerText(),/찾을 수 없습니다/);
  await go(root+'/notes/'+ids[0]);assert.match(await p.locator('h1').innerText(),/볼 수 없는/);
  await login('demo-member');await go(root);assert.match(await p.locator('h1').innerText(),/볼 수 없는/);
  await p.evaluate(async()=>{const {store}=await import('./js/store.js');await store.signOut();});await go(root);assert.match(await p.locator('h1').innerText(),/볼 수 없는/);
  await login('demo-teacher');await go(root+'/notes/'+ids[0]);await p.click('[data-act=delete]');await p.waitForURL(u=>u.hash==='#/'+root);await go(root);assert.equal(await p.locator('#class-list .card').count(),2);
  // A failed write remains an error on the form; no false success or navigation.
  await go(root+'/notes/new');await p.fill('#r-title','저장 실패 테스트');await p.evaluate(async()=>{const {store}=await import('./js/store.js');store.saveClassroomNote=async()=>{throw Error('저장 오류 테스트');};});await p.click('#res-form button[type=submit]');assert.match(await p.locator('.form-status').innerText(),/저장 오류 테스트/);
  assert.deepEqual(errors,[]);console.log('PASS roles, draft privacy, direct URL isolation, delete/error states, 390/768/1440px, no page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
