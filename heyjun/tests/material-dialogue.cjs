// Regression: the original numbered Material 2, not the new classroom notes route.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.HEYJUN_BASE || 'http://localhost:8000/heyjun/';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(base + '?demo=1#/login'); await p.click('[data-demo=demo-teacher]'); await p.waitForURL(u => u.hash === '#/');
    await p.goto(base + '?demo=1#/lessons/student-emma'); await p.waitForSelector('#mat-2');
    await p.click('#mat-2 [data-edit]');
    const text = '자기소개\n선생님: 안녕하세요. 만나서 반가워요.\n학생: 저는 미국 사람이에요.\n선생님: 직업이 뭐예요? | Teacher: What do you do?\n학생: 저는 회사원이에요.\n\n뭐해요? E.g. 장보러 가요 go grocery shopping\n선생님: 지금 어디에 가요?\nTeacher: Where are you going now?\n학생: 저는 지금 회사에 가요. <안전한 텍스트>';
    await p.fill('#m-title-2', '대화'); await p.fill('#m-desc-2', text);
    await p.click('#mat-2 button[type=submit]'); await p.waitForSelector('#mat-2 .material-dialogue');
    assert.equal(await p.locator('#mat-2 .conversation-line').count(), 6);
    assert.equal(await p.locator('#mat-2 .dialogue-topic h4').count(), 2);
    assert.equal(await p.locator('#mat-2 [lang=en]').filter({ hasText: 'Teacher:' }).count(), 2);
    assert.match(await p.locator('#mat-2').innerText(), /<안전한 텍스트>/);
    assert.equal(await p.locator('#mat-2').evaluate(el => el.classList.contains('card')), false);
    for (const width of [390, 768, 1440]) {
      await p.setViewportSize({ width, height: 1000 });
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.equal(await p.locator('#mat-2 .conversation-line').first().evaluate(el => getComputedStyle(el).borderLeftWidth), '4px');
      await p.locator('#mat-2').screenshot({ path: require('node:path').join(require('node:os').tmpdir(), `material-dialogue-${width}.png`) });
    }
    await p.click('#mat-2 [data-edit]'); assert.equal(await p.inputValue('#m-desc-2'), text);
    await p.click('#mat-2 [data-cancel]'); await p.waitForSelector('#mat-2 .material-dialogue');
    await p.reload(); await p.waitForSelector('#mat-2 .material-dialogue');
    assert.equal(await p.locator('#mat-1.card').count(), 1);
    await p.goto(base + '?demo=1#/login'); await p.click('[data-demo=demo-emma]'); await p.waitForURL(u => u.hash === '#/');
    await p.goto(base + '?demo=1#/lessons/student-emma'); await p.waitForSelector('#mat-2 .material-dialogue');
    assert.equal(await p.locator('#mat-2 [data-edit]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS original Material 2: save, storybook turns/topics/translations, escaped text, original text preserved, reload, student view, 390/768/1440px');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
