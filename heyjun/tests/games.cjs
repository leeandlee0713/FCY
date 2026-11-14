// 게임 3종 완주 검증 (모바일 화면)
const { chromium, devices } = require('playwright');
const B = process.env.HEYJUN_URL || 'http://localhost:8000/heyjun/';
const results = [];
const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  let p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  const overflow = async (tag) => { const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (ov > 1) errs.push('OVERFLOW ' + tag + ' ' + ov); };

  // A: 짝 맞추기 — 선택지 수 2→3→4, 정답·오답 피드백
  await p.goto(B + '#/games/match'); await p.waitForTimeout(400);
  await p.click('[data-act=start]');
  const counts = [];
  for (let i = 0; i < 10; i++) {
    counts.push(await p.locator('.choice').count());
    const word = await p.locator('.prompt-word').innerText();
    // 홀수 번째는 일부러 틀린다
    const labels = await p.locator('.choice').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    const data = await p.evaluate(async (w) => { const { MATCH_ITEMS } = await import('./js/content.js'); return MATCH_ITEMS.find((x) => x.ko === w).en; }, word);
    const rightIdx = labels.findIndex((l) => l === data + ' 그림');
    const pick = i % 2 ? (rightIdx + 1) % labels.length : rightIdx;
    await p.locator('.choice').nth(pick).click();
    const fb = await p.locator('.feedback .notice').innerText();
    if (i === 0) ok('match: correct feedback has symbol+text', fb.includes('✓') && fb.includes('정답'));
    if (i === 1) { ok('match: wrong feedback explains answer', fb.includes('✗') && fb.includes('정답은')); await p.screenshot({ path: require('os').tmpdir() + '/heyjun-shot.png' }); }
    await overflow('match');
    await p.click('[data-act=next]');
  }
  ok('match: choices grow 2→3→4', counts.join('') === '2223334444', counts.join(','));
  await p.waitForSelector('.result');
  ok('match: result 5/10', (await p.locator('.result .score').innerText()).startsWith('5'));
  ok('match: guest scope note', (await p.locator('.result').innerText()).includes('이 기기에만'));
  await p.click('[data-act=again]'); await p.waitForTimeout(300);
  ok('match: replay shows best record', (await p.locator('#game-root').innerText()).includes('최고 기록 5/10'));

  // B: 블록 조립 — 탭-탭과 드래그 모두
  for (const level of ['beginner', 'batchim']) {
    await p.goto(B + '#/games'); await p.goto(B + '#/games/blocks'); await p.waitForTimeout(400);
    await p.click(`[data-level=${level}]`);
    for (let i = 0; i < 10; i++) {
      const wants = await p.evaluate(async () => {
        const { decompose } = await import('./js/hangul.js');
        return null; });
      // 정답 낱자는 화면의 그림 설명(영어)으로 단어를 찾아 계산한다
      const en = await p.locator('.prompt-card strong').innerText();
      const need = await p.evaluate(async ([en, level]) => {
        const { BLOCK_WORDS } = await import('./js/content.js'); const { decompose } = await import('./js/hangul.js');
        const w = BLOCK_WORDS[level].find((x) => x.en === en).word;
        return { w, jamo: [...w].flatMap((ch) => { const d = decompose(ch); return [d.cho, d.jung, d.jong].filter(Boolean); }) };
      }, [en, level]);
      const wrong = i === 9; // 마지막 문제는 일부러 틀린다
      for (let k = 0; k < need.jamo.length; k++) {
        let jamo = need.jamo[k];
        if (wrong && k === 0) jamo = await p.locator('.block:not(.used)').evaluateAll((els, need) => els.map((e) => e.textContent).find((t) => !need.includes(t) && !'ㅏㅓㅗㅜㅡㅣㅐㅔㅑㅕㅛㅠ'.includes(t)) , need.jamo) || jamo;
        const block = p.locator(`.block:not(.used)`, { hasText: jamo }).first();
        const slot = p.locator('.slot').nth(k);
        if ((i + k) % 2 === 0) { await block.tap(); await slot.tap(); }
        else { // 드래그
          const bb = await block.boundingBox(), sb = await slot.boundingBox();
          await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down();
          await p.mouse.move(bb.x + bb.width / 2, bb.y - 30, { steps: 4 }); await p.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 6 }); await p.mouse.up();
        }
      }
      if (i === 0 && level === 'batchim') await p.screenshot({ path: require('os').tmpdir() + '/heyjun-shot.png' });
      const made = (await p.locator('.syl-out').allInnerTexts()).join('');
      if (!wrong && made !== need.w) errs.push(`blocks ${level} composed "${made}" expected "${need.w}"`);
      await overflow('blocks');
      await p.click('[data-act=check]');
      const fb = await p.locator('.feedback .notice').innerText();
      if (wrong) ok(`blocks ${level}: wrong answer shows recipe`, fb.includes('✗') && fb.includes('+'), fb.replace(/\n/g, ' ').slice(0, 60));
      await p.click('[data-act=next]');
    }
    await p.waitForSelector('.result');
    ok(`blocks ${level}: composed all, result 9/10`, (await p.locator('.result .score').innerText()).startsWith('9'));
  }
  // 모음을 자음 칸에 놓으면 거절
  await p.goto(B + '#/games'); await p.goto(B + '#/games/blocks'); await p.waitForTimeout(300); await p.click('[data-level=beginner]');
  await p.locator('.block.vowel').first().tap(); await p.locator('.slot').first().tap();
  ok('blocks: vowel rejected in consonant slot', await p.locator('.slot.filled').count() === 0 && (await p.locator('#toasts').innerText()).includes('자음'));

  // C-1: 이 브라우저(음성 재생 실패) → 명확한 안내
  await p.goto(B + '#/games'); await p.goto(B + '#/games/listen'); await p.waitForTimeout(400);
  console.log('voiceState in this browser:', await p.evaluate(async () => (await import('./js/games.js')).voiceState()));
  if (await p.locator('[data-act=test]').count()) { await p.click('[data-act=test]'); await p.waitForTimeout(800);
    ok('listen: playback failure shows notice instead of starting', (await p.locator('.sound-check').innerText()).includes('재생할 수 없습니다') && await p.locator('[data-act=start]').count() === 0); }
  // C-2: 한국어 음성이 있는 브라우저 흉내 → 완주
  const real = p;
  p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.addInitScript(() => { window.__spoken = [];
    Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [{ lang: 'ko-KR', name: 'fake' }], speak: (u) => window.__spoken.push(u.text), cancel() {}, addEventListener() {} } });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; }; });
  await p.goto(B + '#/games'); await p.goto(B + '#/games/listen'); await p.waitForTimeout(400);
  if (await p.locator('[data-act=test]').count()) {
    await p.click('[data-act=test]'); await p.click('[data-act=start]');
    let spoken = 0;
    for (let i = 0; i < 10; i++) {
      await p.click('[data-act=hear]');
      const opts = await p.locator('.choice').allInnerTexts();
      const ans = await p.evaluate(async (opts) => { const { LISTEN_ITEMS } = await import('./js/content.js');
        return LISTEN_ITEMS.find((x) => x.options.length === opts.length && x.options.every((o) => opts.includes(o))).answer; }, opts);
      await p.locator('.choice', { hasText: new RegExp('^' + ans + '$') }).click();
      if (i === 2) { ok('listen: streak shown', (await p.locator('.feedback').innerText()).includes('연속 정답')); await p.screenshot({ path: require('os').tmpdir() + '/heyjun-shot.png' }); }
      await overflow('listen');
      await p.click('[data-act=next]');
    }
    await p.waitForSelector('.result');
    const said = await p.evaluate(() => window.__spoken);
    ok('listen: speaks each answer after user action', said[0] === '안녕하세요' && said.length >= 21, String(said.length));
    const r = await p.locator('.result').innerText();
    ok('listen: 10/10, best streak 10, new record', r.includes('10') && r.includes('최고 연속 정답 10') && r.includes('새 최고 기록'));
  } else ok('listen: blocked notice shown (no Korean voice)', (await p.locator('#game-root').innerText()).includes('사용할 수 없'));
  // 음성 기능이 없는 브라우저 흉내
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => { Object.defineProperty(window, 'speechSynthesis', { value: undefined }); });
  await p2.goto(B + '#/games/listen'); await p2.waitForTimeout(500);
  ok('listen: no-speech browser gets clear notice, no start', (await p2.locator('#game-root').innerText()).includes('실행할 수 없습니다') && await p2.locator('[data-act=start],[data-act=test]').count() === 0);

  console.log(results.join('\n')); console.log(errs.join('\n') || 'no page errors');
  await b.close();
})();
