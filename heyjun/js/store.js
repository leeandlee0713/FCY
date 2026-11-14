// 저장소 선택: config.js에 Supabase 정보가 있으면 실제 서버, 없으면 데모(이 브라우저에만 저장).
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export let store = null;

export async function initStore() {
  if (SUPABASE_URL && SUPABASE_KEY) {
    const { createLiveStore } = await import('./store-supabase.js');
    store = await createLiveStore({ url: SUPABASE_URL, key: SUPABASE_KEY });
  } else {
    const { createLocalStore } = await import('./store-local.js');
    store = await createLocalStore();
  }
  return store;
}

// 게임 기록: 로그인한 회원은 계정에, 비회원은 이 기기에만 저장한다.
const GUEST_KEY = 'heyjun.scores.guest';
const guestScores = () => { try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || {}; } catch { return {}; } };

export async function loadBest(game) {
  if (store.user) { try { return await store.getScore(game); } catch { return null; } }
  return guestScores()[game] || null;
}

/** 이번 판 결과를 반영해 최고 기록을 갱신한다. 반환: { best, isNew, saved } */
export async function recordResult(game, { score, streak }) {
  const prev = (await loadBest(game)) || { score: 0, streak: 0, plays: 0 };
  const best = { score: Math.max(prev.score, score), streak: Math.max(prev.streak, streak), plays: (prev.plays || 0) + 1 };
  const isNew = score > prev.score;
  let saved = true;
  if (store.user) { try { await store.saveScore(game, best); } catch { saved = false; } }
  else { const all = guestScores(); all[game] = best; try { localStorage.setItem(GUEST_KEY, JSON.stringify(all)); } catch { saved = false; } }
  return { best, isNew, saved };
}
