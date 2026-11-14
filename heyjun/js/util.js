export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 한국어 + 쉬운 영어 병기 */
export const bi = (ko, en) => `${ko} <span class="en" lang="en">${en}</span>`;

export function toast(msg, kind = 'ok') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'bad' ? ' bad' : '');
  el.textContent = msg;
  box.append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 6000 : 3500);
}

export function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** http(s) 주소만 통과시킨다. javascript: 같은 주소는 버린다. */
export function safeUrl(u) {
  try {
    const url = new URL(String(u).trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

export function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

/** 폼 제출 공통 처리: 저장 중 → 성공/오류 상태를 버튼과 알림 영역에 표시 */
export async function submitWith(form, fn, { okMsg } = {}) {
  const btn = form.querySelector('[type=submit]');
  const status = form.querySelector('.form-status');
  const label = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = '저장 중… Saving…'; }
  if (status) { status.hidden = true; }
  try {
    const out = await fn(Object.fromEntries(new FormData(form)));
    if (okMsg) toast(okMsg);
    return out;
  } catch (e) {
    const msg = e?.message || '오류가 발생했습니다. Something went wrong.';
    if (status) { status.hidden = false; status.className = 'form-status notice notice-bad'; status.textContent = msg; status.focus?.(); }
    else toast(msg, 'bad');
    return undefined;
  } finally {
    if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
  }
}

export const LEVELS = { beginner: ['초급', 'Beginner'], intermediate: ['중급', 'Intermediate'], advanced: ['고급', 'Advanced'] };
export const CATEGORIES = { expression: ['한국어 표현', 'Expressions'], grammar: ['한국어 문법', 'Grammar'] };
export const TOPICS = { question: ['한국어 질문', 'Questions'], experience: ['학습 경험', 'Study stories'], life: ['한국 생활 정보', 'Life in Korea'] };
