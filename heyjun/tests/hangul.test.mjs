// 실행: node --test heyjun/tests/hangul.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { compose, decompose, preview, recipe } from '../js/hangul.js';
import { BLOCK_WORDS, MATCH_ITEMS, MATCH_LEVELS, SENTENCE_ITEMS } from '../js/content.js';

test('자음+모음(+받침)을 음절로 조합한다', () => {
  assert.equal(compose('ㄱ', 'ㅏ'), '가');
  assert.equal(compose('ㅎ', 'ㅏ', 'ㄴ'), '한');
  assert.equal(compose('ㅏ', 'ㄱ'), null);
});
test('음절을 낱자로 분해하고 다시 조합하면 같다', () => {
  for (const ch of '가나무한국별책빵') {
    const d = decompose(ch);
    assert.equal(compose(d.cho, d.jung, d.jong), ch);
  }
});
test('조립 중 미리 보기와 조립 설명', () => {
  assert.equal(preview('ㄴ', '', ''), 'ㄴ');
  assert.equal(preview('ㄴ', 'ㅏ', ''), '나');
  assert.equal(recipe('나무'), 'ㄴ+ㅏ / ㅁ+ㅜ');
});
test('게임마다 문제가 10개 이상이고 형식이 맞다', () => {
  assert.ok(MATCH_ITEMS.length >= 10 && new Set(MATCH_ITEMS.map((x) => x.ko)).size === MATCH_ITEMS.length);
  assert.ok(new Set(MATCH_ITEMS.map((x) => x.pic)).size === MATCH_ITEMS.length);
  assert.ok(BLOCK_WORDS.beginner.length >= 10 && BLOCK_WORDS.batchim.length >= 10);
  for (const w of BLOCK_WORDS.beginner) for (const ch of w.word) assert.equal(decompose(ch).jong, '', w.word);
  for (const w of BLOCK_WORDS.batchim) assert.ok([...w.word].some((ch) => decompose(ch).jong), w.word);
  assert.ok(SENTENCE_ITEMS.length >= 10);
  for (const q of SENTENCE_ITEMS) assert.ok(q.options.includes(q.answer) && new Set(q.options).size === q.options.length, q.answer);
});

test('각 레벨의 10개 이상 고유 어휘와 모든 음절이 정확하게 조립된다', () => {
  for (const level of ['beginner','intermediate','advanced']) {
    const words=MATCH_LEVELS[level];
    assert.ok(words.length>=10);
    assert.equal(new Set(words.map(x=>x.pic)).size,words.length);
    assert.ok(BLOCK_WORDS[level].length>=10);
    for (const {word} of BLOCK_WORDS[level]) for (const ch of word) {
      const d=decompose(ch); assert.equal(compose(d.cho,d.jung,d.jong),ch);
    }
  }
});

test('초급과 중급의 읽기·조립 부담이 구별된다', () => {
  const beginner = new Set(MATCH_LEVELS.beginner.map(x=>x.ko));
  assert.ok([...beginner].every(w=>w.length<=2));
  for(const x of MATCH_LEVELS.intermediate) {
    assert.ok(!beginner.has(x.ko));
    assert.ok(x.ko.length>=2 && x.ko.length<=3);
    assert.equal(MATCH_LEVELS.intermediate.filter(y=>y.group===x.group).length,4);
  }
  const blockCount=w=>[...w].reduce((n,ch)=>n+2+(decompose(ch).jong?1:0),0);
  for(const {word} of BLOCK_WORDS.intermediate) {
    assert.ok(word.length>=2 && word.length<=3);
    assert.ok([...word].some(ch=>decompose(ch).jong));
    assert.ok(blockCount(word)>Math.max(...BLOCK_WORDS.beginner.map(x=>blockCount(x.word))));
  }
});
