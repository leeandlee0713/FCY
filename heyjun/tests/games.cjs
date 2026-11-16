const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const B=process.env.HEYJUN_URL||'http://localhost:8000/heyjun/?demo=1';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function go(id){await page.goto(B+'#/games/'+id);await page.waitForSelector('#app[data-ready]');}
 async function overflow(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');}
 for(const game of ['match','blocks'])for(const level of ['beginner','intermediate','advanced']){
  await go(game);await page.click(`[data-level=${level}]`);
  for(let i=0;i<10;i++){
   if(game==='match'){
    const word=await page.locator('.prompt-word').innerText();
    const en=await page.evaluate(async([w,l])=>(await import('./js/content.js')).MATCH_LEVELS[l].find(x=>x.ko===w).en,[word,level]);
    assert.equal(await page.locator('.choice').count(),i<3?2:i<6?3:4);
    if(i===1)await page.locator(`.choice:not([aria-label="${en} 그림"])`).first().click();
    else await page.getByRole('button',{name:en+' 그림',exact:true}).click();
   }else{
    const en=await page.locator('.prompt-card strong').innerText();
    const need=await page.evaluate(async([en,l])=>{
     const {BLOCK_WORDS}=await import('./js/content.js');const{decompose}=await import('./js/hangul.js');
     return [...BLOCK_WORDS[l].find(x=>x.en===en).word].flatMap(c=>{const d=decompose(c);return[d.cho,d.jung,d.jong].filter(Boolean);});
    },[en,level]);
    for(let k=0;k<need.length;k++){
     const block=page.locator('.block:not(.used)').filter({hasText:new RegExp('^'+need[k]+'$')}).first();
     const slot=page.locator('.slot').nth(k);
     if(i===0&&k===0){
      await block.scrollIntoViewIfNeeded(); await slot.scrollIntoViewIfNeeded();
      // Both targets must be in the viewport for a real pointer drag.
      await page.setViewportSize({width:390,height:1400});
      const aa=await block.boundingBox(),bb=await slot.boundingBox();
      await page.mouse.move(aa.x+aa.width/2,aa.y+aa.height/2);await page.mouse.down();await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2,{steps:10});await page.mouse.up();
      await page.setViewportSize({width:390,height:844});
     }else{await block.tap();await slot.tap();}
    }
    await page.click('[data-act=check]');
   }
   await overflow();assert.match(await page.locator('.feedback').innerText(),game==='match'&&i===1?/✗/:/✓/);
   await page.click('[data-act=next]');
  }
  await page.waitForSelector('.result');assert.match(await page.locator('.score').innerText(),game==='match'?/^9/:/^10/);
  await page.click('[data-act=again]');await page.waitForSelector('[data-level=advanced]');
  console.log('PASS',game,level,'10 questions + replay + overflow');
 }
 await go('sentence');await page.click('[data-act=start]');
 for(let i=0;i<10;i++){
  const prompt=await page.locator('.prompt-card h2').innerText();
  const answer=await page.evaluate(async en=>(await import('./js/content.js')).SENTENCE_ITEMS.find(x=>x.en===en).answer,prompt);
  await page.locator('.choice').filter({hasText:answer}).click();
  assert.match(await page.locator('.feedback').innerText(),/✓/);await overflow();await page.click('[data-act=next]');
 }
 await page.waitForSelector('.result');assert.match(await page.locator('.score').innerText(),/^10/);
 await page.click('[data-act=again]');await page.waitForSelector('[data-act=start]');
 assert.match(await page.locator('#game-root').innerText(),/최고 기록 10/);
 await go('listen');assert.match(await page.locator('#game-root').innerText(),/문장 만들기/);
 assert.deepEqual(errors,[]);console.log('PASS sentence 10 questions, local best, replay, legacy route; no browser errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
