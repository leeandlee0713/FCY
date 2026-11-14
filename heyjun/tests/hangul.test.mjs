// 실행: node --test heyjun/tests/hangul.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { compose, decompose, preview, recipe } from '../js/hangul.js';
import { BLOCK_WORDS, MATCH_ITEMS, LISTEN_ITEMS } from '../js/content.js';

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
  assert.ok(LISTEN_ITEMS.length >= 10);
  for (const q of LISTEN_ITEMS) assert.ok(q.options.includes(q.answer) && new Set(q.options).size === q.options.length, q.answer);
});
