const {chromium}=require('playwright');const assert=require('node:assert/strict');
const base=process.env.HEYJUN_BASE||'http://localhost:8000/heyjun/';
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});try{
const p=await browser.newPage();p.setDefaultTimeout(15000);p.setDefaultNavigationTimeout(30000);const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
const go=async path=>{await p.goto(base+'?demo=1#/'+path);await p.waitForSelector('#app[data-ready]');};
await go('login');await p.click('[data-demo=demo-teacher]');await p.waitForSelector('h1');
await go('learn/new');await p.selectOption('#r-cat','storybook');await p.fill('#r-title','검증 동화');await p.fill('#r-sum','Story test');await p.fill('#r-exp','Introduction');await p.fill('#r-ex','새가 날아요. | A bird flies.');await p.fill('#r-pr','누가 날아요? | 새 ; 개 | 1 | 새 = bird');await p.click('#res-form button[type=submit]');await p.waitForSelector('article');
assert.match(await p.locator('article').innerText(),/동화 읽기/);const id=new URL(p.url()).hash.split('/').pop();
await go('learn/'+id+'/edit');await p.fill('#r-title','수정된 동화');await p.click('#res-form button[type=submit]');await p.waitForSelector('article');await p.reload();await p.waitForSelector('#app[data-ready]');assert.match(await p.locator('h1').innerText(),/수정된 동화/);
await go('learn?cat=storybook');assert.match(await p.locator('#app').innerText(),/수정된 동화/);assert.doesNotMatch(await p.locator('#app').innerText(),/안녕하세요 — 인사하기/);
await go('learn/'+id);await p.click('[data-act=delete]');await p.waitForURL(url=>url.hash==='#/learn');await go('learn/'+id);assert.match(await p.locator('h1').innerText(),/찾을 수 없습니다/);
console.log('PASS story create/edit/reload/filter/delete (demo storage)');
for(const width of [390,768,1440]){await p.setViewportSize({width,height:900});for(const route of ['', 'learn?cat=storybook','learn/sample-story-seed','games','verify']){await go(route);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width} ${route}`);}await go('');await p.screenshot({path:require('node:path').join(process.env.HEYJUN_TEST_OUTPUT || require('node:os').tmpdir(),`heyjun-after-${width}.png`),fullPage:true});}
console.log('PASS responsive home/story/games/auth at 390, 768, 1440px');
// Real auth server: invalid token must return an error without leaving the deployed app.
await p.goto(base+'#/verify');await p.waitForSelector('#verify-form',{timeout:60000});
await p.fill('#verify-link','https://reccmjdcnmpqkplagiiz.supabase.co/auth/v1/verify?type=signup&token='+'a'.repeat(64));
await p.click('#verify-form button');await p.waitForFunction(()=>document.querySelector('#verify-form .form-status')?.textContent.length>0);
assert.equal(new URL(p.url()).hash,'#/verify');assert.equal(await p.inputValue('#verify-link'),'');assert.ok(await p.locator('#verify-form .form-status').isVisible());
console.log('PASS real auth rejects invalid token on site; link cleared, no localhost navigation');
await p.goto('about:blank');await p.goto(base+'#error=access_denied&error_code=otp_expired&error_description=Expired');await p.waitForSelector('#verify-form');assert.equal(new URL(p.url()).hash,'#/verify');assert.match(await p.locator('#app').innerText(),/인증을 완료하지 못했습니다/);
console.log('PASS expired callback error cleaned and shown');
assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
