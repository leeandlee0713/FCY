// 한글 배우기 게임 3종. 설치 없이 브라우저에서 실행된다.
// 공통 흐름: 시작 화면 → 문제 → 피드백 → 결과 → 다시 하기. 시간 제한은 없다.
import { esc, bi, shuffle, toast } from './util.js';
import { MATCH_LEVELS, BLOCK_WORDS, SENTENCE_ITEMS } from './content.js';
import { decompose, preview, recipe, isVowel, CHO, JUNG } from './hangul.js';
import { store, loadBest, recordResult } from './store.js';

const ROUND = 10;

// ── 한국어 음성(브라우저 내장 음성 합성) ──────────────────────────
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
if (synth) { synth.getVoices(); synth.addEventListener?.('voiceschanged', () => synth.getVoices()); }
const koVoice = () => (synth ? synth.getVoices().find((v) => /^ko/i.test(v.lang)) : null);
/** 'none' 음성 기능 없음 · 'missing' 한국어 음성 없음 · 'ok' 한국어 음성 있음 · 'unknown' 목록을 알 수 없음 */
export function voiceState() {
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return 'none';
  const voices = synth.getVoices();
  if (!voices.length) return 'unknown';
  return koVoice() ? 'ok' : 'missing';
}
function speak(text, onError) {
  if (voiceState() === 'none') { onError?.(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.rate = 0.8;
  const v = koVoice(); if (v) u.voice = v;
  u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') onError?.(); };
  synth.cancel(); synth.speak(u);
}

const GAMES = {
  match: { ko: '한글 짝 맞추기', en: 'Word & Picture', icon: '🍎', desc: '단어를 읽고 뜻에 맞는 그림을 고르세요.', descEn: 'Read the word and pick the right picture.' },
  blocks: { ko: '한글 블록 조립', en: 'Build the Block', icon: '🧩', desc: '자음·모음 블록으로 글자를 만드세요.', descEn: 'Put consonant and vowel blocks together.' },
  sentence: { ko: '문장 만들기', en: 'Build a Sentence', icon: '✍️', desc: '영어 뜻에 맞는 한국어 문장을 고르며 동사를 연습하세요.', descEn: 'Choose the Korean sentence. Practice verbs and endings.' },
};
export const GAME_LIST = Object.entries(GAMES).map(([id, g]) => ({ id, ...g }));

const scopeNote = (id) => id === 'sentence' ? bi('문장 만들기 기록은 이 브라우저에 계정별로 저장됩니다.', 'Sentence records stay in this browser, separately for each account.') : (store.user
  ? bi('기록은 내 계정에 저장됩니다.', 'Your record is saved to your account.')
  : bi('기록은 이 기기에만 저장됩니다. 로그인하면 계정에 저장됩니다.', 'Saved on this device only. Log in to keep it on your account.'));

function bestLine(best) {
  if (!best) return `<p class="muted">${bi('아직 기록이 없습니다.', 'No record yet.')}</p>`;
  return `<p class="muted">${bi(`최고 기록 ${best.score}/${ROUND} · 최고 연속 정답 ${best.streak}`, `Best ${best.score}/${ROUND} · best streak ${best.streak}`)}</p>`;
}
function topBar(i, score, streak) {
  return `<div class="game-top"><span>${bi(`문제 ${i + 1} / ${ROUND}`, `Question ${i + 1} of ${ROUND}`)}</span>
    <span>${bi(`정답 ${score}`, 'correct')} · ${bi(`연속 ${streak}`, 'streak')}</span></div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${ROUND}" aria-valuenow="${i}" aria-label="진행도"><i style="width:${(i / ROUND) * 100}%"></i></div>`;
}
const nextBtn = (last) => `<button class="btn btn-primary btn-lg" data-act="next">${last ? bi('결과 보기', 'See result') : bi('다음 문제', 'Next')}</button>`;

async function showResult(root, id, { score, bestStreak }, restart) {
  root.innerHTML = `<div class="loading">${bi('기록 저장 중…', 'Saving…')}</div>`;
  const { best, isNew, saved } = await recordResult(id, { score, streak: bestStreak });
  const msg = score === ROUND ? bi('완벽해요!', 'Perfect!') : score >= 7 ? bi('잘했어요!', 'Well done!') : bi('좋은 연습이었어요.', 'Good practice. Try again!');
  root.innerHTML = `<div class="card result" tabindex="-1">
    <h2>${msg}</h2>
    <p class="score">${score} <span class="en">/ ${ROUND}</span></p>
    <p>${bi(`이번 판 최고 연속 정답 ${bestStreak}`, `Best streak this round: ${bestStreak}`)}</p>
    ${isNew ? `<p class="notice notice-ok">★ ${bi('새 최고 기록입니다!', 'New best record!')}</p>` : ''}
    ${bestLine(best)}
    <p class="small muted">${saved ? scopeNote(id) : bi('기록을 저장하지 못했습니다.', 'The record could not be saved.')}</p>
    <div class="btn-row">
      <button class="btn btn-primary btn-lg" data-act="again">${bi('다시 하기', 'Play again')}</button>
      <a class="btn btn-secondary btn-lg" href="#/games">${bi('다른 게임', 'Other games')}</a>
    </div></div>`;
  root.querySelector('[data-act=again]').onclick = restart;
  root.querySelector('.result').focus();
}

async function startScreen(root, id, extraHtml, startLabel = bi('시작하기', 'Start')) {
  const g = GAMES[id];
  const best = await loadBest(id);
  root.innerHTML = `<div class="card stack">
    <div class="card-icon" aria-hidden="true">${g.icon}</div>
    <h2>${bi(g.ko, g.en)}</h2>
    <p>${g.desc}<br><span class="en" lang="en">${g.descEn}</span></p>
    <p class="muted">${bi(`한 판은 ${ROUND}문제이고 시간 제한이 없습니다.`, `${ROUND} questions per round. No time limit.`)}</p>
    ${bestLine(best)}<p class="small muted">${scopeNote(id)}</p>
    ${extraHtml || `<div class="btn-row"><button class="btn btn-primary btn-lg" data-act="start">${startLabel}</button></div>`}
  </div>`;
}

// ── 게임 A: 한글 짝 맞추기 (단어 → 그림 고르기) ───────────────────
const levelButtons = `<p><strong>${bi('레벨을 선택하세요', 'Choose a level')}</strong></p><p class="small muted">${bi('짝 맞추기·블록 기록은 각 게임의 모든 레벨을 합산합니다.', 'Word and block records combine all levels within each game.')}</p><div class="btn-row">${[['beginner','초급','Beginner'],['intermediate','중급','Intermediate'],['advanced','고급','Advanced']].map(([key,ko,en])=>`<button class="btn btn-primary btn-lg" data-level="${key}">${bi(ko,en)}</button>`).join('')}</div>`;
async function playMatch(root) {
  await startScreen(root, 'match', levelButtons);
  root.querySelectorAll('[data-level]').forEach(b => b.onclick = () => run(b.dataset.level));
  function run(level) {
    const pool = MATCH_LEVELS[level];
    const questions = shuffle(pool).slice(0, ROUND);
    let i = 0, score = 0, streak = 0, bestStreak = 0;
    const ask = () => {
      const item = questions[i];
      const n = i < 3 ? 2 : i < 6 ? 3 : 4; // 처음에는 그림 2개, 이후 3~4개
      const options = shuffle([item, ...shuffle(pool.filter((x) => x.ko !== item.ko)).slice(0, n - 1)]);
      root.innerHTML = `${topBar(i, score, streak)}
        <div class="prompt-card"><p class="muted">${bi('이 단어의 그림은?', 'Which picture matches this word?')}</p>
          <div class="prompt-word" lang="ko">${esc(item.ko)}</div></div>
        <div class="choices ${n === 2 ? 'two' : ''}" role="group" aria-label="그림 선택지">
          ${options.map((o, k) => `<button class="choice" data-k="${k}" aria-label="${esc(o.en)} 그림"><span class="pic" aria-hidden="true">${o.pic}</span></button>`).join('')}
        </div><div class="feedback" aria-live="polite"></div>`;
      root.querySelectorAll('.choice').forEach((btn) => {
        btn.onclick = () => {
          const picked = options[+btn.dataset.k];
          const right = picked.ko === item.ko;
          root.querySelectorAll('.choice').forEach((b) => {
            b.disabled = true;
            const o = options[+b.dataset.k];
            if (o.ko === item.ko) { b.classList.add('is-right'); b.insertAdjacentHTML('beforeend', '<span class="mark" aria-hidden="true">✓</span>'); }
            else if (b === btn) { b.classList.add('is-wrong'); b.insertAdjacentHTML('beforeend', '<span class="mark" aria-hidden="true">✗</span>'); }
          });
          if (right) { score++; streak++; bestStreak = Math.max(bestStreak, streak); } else streak = 0;
          root.querySelector('.feedback').innerHTML = (right
            ? `<p class="notice notice-ok">✓ ${bi('정답이에요!', 'Correct!')} <strong lang="ko">${esc(item.ko)}</strong> = ${esc(item.en)} ${item.pic}</p>`
            : `<p class="notice notice-bad">✗ ${bi('아쉬워요.', 'Not quite.')} ${bi(`정답은 ${item.pic} <strong>${esc(item.ko)}</strong>입니다.`, `The answer is ${esc(item.en)}.`)}
               ${bi(`고른 그림 ${picked.pic}은 "${esc(picked.ko)}"예요.`, `You picked ${esc(picked.en)}.`)}</p>`) + nextBtn(i === ROUND - 1);
          const nb = root.querySelector('[data-act=next]');
          nb.onclick = () => { i++; if (i < ROUND) ask(); else showResult(root, 'match', { score, bestStreak }, () => playMatch(root)); };
          nb.focus();
        };
      });
    };
    ask();
  };
}

// ── 게임 B: 한글 블록 조립 ────────────────────────────────────────
const POS_LABEL = { cho: '자음', jung: '모음', jong: '받침' };
async function playBlocks(root) {
  await startScreen(root, 'blocks', levelButtons);
  root.querySelectorAll('[data-level]').forEach((b) => { b.onclick = () => run(b.dataset.level); });

  function run(level) {
    const questions = shuffle(BLOCK_WORDS[level]).slice(0, ROUND).sort((a, b) => a.word.length - b.word.length);
    let i = 0, score = 0, streak = 0, bestStreak = 0;
    let slots, blocks, picked, checked;

    function setup() {
      const item = questions[i];
      slots = []; checked = null; picked = null;
      [...item.word].forEach((ch, s) => {
        const d = decompose(ch);
        slots.push({ s, pos: 'cho', want: d.cho, block: null }, { s, pos: 'jung', want: d.jung, block: null });
        if (d.jong) slots.push({ s, pos: 'jong', want: d.jong, block: null });
      });
      const need = slots.map((x) => x.want);
      const pool = shuffle([...CHO.filter((c) => !'ㄲㄸㅃㅆㅉ'.includes(c)), ...JUNG.slice(0, 21).filter((v) => 'ㅏㅓㅗㅜㅡㅣㅐㅔㅑㅕㅛㅠ'.includes(v))]
        .filter((j) => !need.includes(j))).slice(0, 3);
      blocks = shuffle([...need, ...pool]).map((jamo, id) => ({ id, jamo }));
      draw();
      root.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    const blockIn = (slot) => blocks.find((b) => b.id === slot.block);
    const used = (b) => slots.some((x) => x.block === b.id);
    const sylText = (s) => {
      const get = (pos) => { const sl = slots.find((x) => x.s === s && x.pos === pos); return sl && sl.block != null ? blockIn(sl).jamo : ''; };
      return preview(get('cho'), get('jung'), get('jong'));
    };
    function place(blockId, slotIdx) {
      const slot = slots[slotIdx], b = blocks.find((x) => x.id === blockId);
      if (!slot || !b || checked) return;
      if (isVowel(b.jamo) !== (slot.pos === 'jung')) {
        toast(slot.pos === 'jung' ? '가운데 칸에는 모음(ㅏ, ㅗ …)을 놓아요. Put a vowel here.' : '이 칸에는 자음(ㄱ, ㄴ …)을 놓아요. Put a consonant here.', 'bad');
        return;
      }
      slots.forEach((x) => { if (x.block === blockId) x.block = null; });
      slot.block = blockId; picked = null; draw();
    }

    function draw() {
      const item = questions[i];
      const syls = [...item.word];
      const full = slots.every((x) => x.block != null);
      const canSpeak = voiceState() !== 'none' && voiceState() !== 'missing';
      root.innerHTML = `${topBar(i, score, streak)}
        <div class="prompt-card">
          <div class="prompt-pic" role="img" aria-label="${esc(item.en)}">${item.pic}</div>
          <p><strong lang="en">${esc(item.en)}</strong></p>
          ${canSpeak ? `<button class="btn btn-secondary" data-act="hear">🔊 ${bi('소리 힌트', 'Hear the word')}</button>`
            : `<p class="small muted">${bi('이 기기에는 한국어 음성이 없어 소리 힌트를 쓸 수 없습니다.', 'No Korean voice on this device, so the sound hint is off.')}</p>`}
        </div>
        <div class="syllables">
          ${syls.map((ch, s) => `<div class="syl ${checked ? (checked[s] ? 'is-right' : 'is-wrong') : ''}">
            <div class="syl-out" lang="ko" aria-label="지금 만든 글자">${esc(sylText(s)) || '&nbsp;'}</div>
            <div class="slots">${slots.map((sl, idx) => sl.s !== s ? '' : `<button class="slot ${sl.block != null ? 'filled' : ''} ${picked != null && sl.block == null ? 'target' : ''}" data-slot="${idx}" ${checked ? 'disabled' : ''}
              aria-label="${s + 1}번째 글자 ${POS_LABEL[sl.pos]} 칸${sl.block != null ? ', ' + blockIn(sl).jamo : ', 비어 있음'}">${sl.block != null ? esc(blockIn(sl).jamo) : ''}<small>${POS_LABEL[sl.pos]}</small></button>`).join('')}</div>
          </div>`).join('')}
        </div>
        ${checked ? '' : `<p class="help-line">${bi('블록을 끌어다 놓거나, 블록 → 칸 순서로 누르세요.', 'Drag a block, or tap a block and then a slot.')}</p>
        <div class="tray" aria-label="블록">
          ${blocks.map((b) => `<button class="block ${isVowel(b.jamo) ? 'vowel' : ''} ${used(b) ? 'used' : ''} ${picked === b.id ? 'picked' : ''}" data-block="${b.id}" ${used(b) ? 'tabindex="-1" aria-hidden="true"' : ''}
            aria-pressed="${picked === b.id}" aria-label="${isVowel(b.jamo) ? '모음' : '자음'} ${b.jamo}">${b.jamo}</button>`).join('')}
        </div>
        <div class="btn-row" style="justify-content:center;margin-top:16px">
          <button class="btn btn-ghost" data-act="reset">${bi('모두 지우기', 'Clear')}</button>
          <button class="btn btn-primary btn-lg" data-act="check" ${full ? '' : 'disabled'}>${bi('확인', 'Check')}</button>
        </div>`}
        <div class="feedback" aria-live="polite">${checked ? feedback(item) : ''}</div>`;
      bind(item);
    }
    function feedback(item) {
      const right = checked.every(Boolean);
      return (right
        ? `<p class="notice notice-ok">✓ ${bi('정답이에요!', 'Correct!')} <strong lang="ko">${esc(item.word)}</strong> = ${esc(recipe(item.word))}</p>`
        : `<p class="notice notice-bad">✗ ${bi('아쉬워요.', 'Not quite.')} ${bi(`정답은 <strong>${esc(item.word)}</strong>입니다.`, `The answer is ${esc(item.word)} (${esc(item.en)}).`)}<br>
           ${bi(`이렇게 조립해요: ${esc(recipe(item.word))}`, 'This is how it is built.')}</p>`) + nextBtn(i === ROUND - 1);
    }
    function bind(item) {
      root.querySelector('[data-act=hear]')?.addEventListener('click', () => speak(item.word, () => toast('음성을 재생하지 못했습니다. Sound could not be played.', 'bad')));
      root.querySelectorAll('.slot').forEach((el) => {
        el.onclick = () => {
          const idx = +el.dataset.slot;
          if (picked != null) place(picked, idx);
          else if (slots[idx].block != null) { slots[idx].block = null; draw(); }
        };
      });
      root.querySelectorAll('.block').forEach((el) => {
        const id = +el.dataset.block;
        let drag = null, moved = false;
        el.onpointerdown = (e) => { if (e.button > 0) return; drag = { x: e.clientX, y: e.clientY, ghost: null }; moved = false; el.setPointerCapture(e.pointerId); };
        el.onpointermove = (e) => {
          if (!drag) return;
          if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
            moved = true;
            drag.ghost = el.cloneNode(true); drag.ghost.classList.add('drag-ghost'); document.body.append(drag.ghost);
            el.style.opacity = '.35';
          }
          if (drag.ghost) { drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px'; }
        };
        const end = (e) => {
          if (!drag) return;
          const ghost = drag.ghost; drag = null; el.style.opacity = '';
          if (!ghost) return;
          ghost.remove();
          const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot');
          if (target && root.contains(target)) place(id, +target.dataset.slot);
        };
        el.onpointerup = end; el.onpointercancel = end;
        el.onclick = () => { if (moved) { moved = false; return; } picked = picked === id ? null : id; draw(); root.querySelector(`[data-block="${id}"]`)?.focus(); };
      });
      const reset = root.querySelector('[data-act=reset]');
      if (reset) reset.onclick = () => { slots.forEach((x) => { x.block = null; }); picked = null; draw(); };
      const check = root.querySelector('[data-act=check]');
      if (check) check.onclick = () => {
        checked = [...item.word].map((ch, s) => sylText(s) === ch);
        if (checked.every(Boolean)) { score++; streak++; bestStreak = Math.max(bestStreak, streak); } else streak = 0;
        draw(); root.querySelector('[data-act=next]').focus();
      };
      const nb = root.querySelector('[data-act=next]');
      if (nb) nb.onclick = () => { i++; if (i < ROUND) setup(); else showResult(root, 'blocks', { score, bestStreak }, () => playBlocks(root)); };
    }
    setup();
  }
}

// ── 게임 C: 문장 만들기 ────────────────────────────────────────
async function playSentence(root) {
  await startScreen(root, 'sentence');
  root.querySelector('[data-act=start]').onclick = () => {
    const questions = shuffle(SENTENCE_ITEMS).slice(0, ROUND);
    let i=0, score=0, streak=0, bestStreak=0;
    function ask() {
      const item=questions[i], options=shuffle(item.options);
      root.innerHTML = `${topBar(i,score,streak)}<div class="prompt-card"><p>${bi('같은 뜻의 문장을 고르세요', 'Choose the sentence with the same meaning')}</p><h2 lang="en">${esc(item.en)}</h2></div><div class="stack" role="group" aria-label="한국어 문장 선택">${options.map((o,k)=>`<button class="choice sentence-choice" data-k="${k}" lang="ko">${k+1}. ${esc(o)}</button>`).join('')}</div><div class="feedback" aria-live="polite"></div>`;
      root.querySelectorAll('.choice').forEach(btn => btn.onclick=()=>{
        const right=options[+btn.dataset.k]===item.answer;
        root.querySelectorAll('.choice').forEach(b=>{ b.disabled=true; if(options[+b.dataset.k]===item.answer)b.classList.add('is-right'); });
        if(right){score++;streak++;bestStreak=Math.max(bestStreak,streak);}else{streak=0;btn.classList.add('is-wrong');}
        root.querySelector('.feedback').innerHTML=`<p class="notice ${right?'notice-ok':'notice-bad'}">${right?'✓ 정답이에요! Correct!':'✗ 다시 배워봐요. Not quite.'}<br><strong>${esc(item.answer)}</strong><br>${esc(item.note)}</p>${nextBtn(i===ROUND-1)}`;
        const next=root.querySelector('[data-act=next]');next.onclick=()=>{if(++i<ROUND)ask();else showResult(root,'sentence',{score,bestStreak},()=>playSentence(root));};next.focus();
      });
    }
    ask();
  };
}
export function mountGame(id, root) {
  synth?.cancel();
  return {match:playMatch,blocks:playBlocks,sentence:playSentence}[id](root);
}
