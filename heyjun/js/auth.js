import { SUPABASE_URL } from './config.js';
export const AUTH_RETURN_URL = 'https://leeandlee0713.github.io/FCY/heyjun/';
// Never navigate to or fetch a pasted URL. Extract a signup token only from our auth server.
export function signupToken(link) {
  let url;
  try { url = new URL(link.trim()); } catch { throw new Error('인증 메일의 링크 주소를 복사해 주세요. Copy the link from your confirmation email.'); }
  if (url.origin !== new URL(SUPABASE_URL).origin || url.pathname !== '/auth/v1/verify' || !['signup','email'].includes(url.searchParams.get('type'))) {
    throw new Error('이 사이트의 회원가입 인증 링크만 사용할 수 있습니다. Use a signup confirmation link for this site.');
  }
  const token_hash = url.searchParams.get('token_hash') || url.searchParams.get('token');
  if (!token_hash || !/^[a-zA-Z0-9_-]{20,512}$/.test(token_hash)) throw new Error('인증 링크가 완전하지 않습니다. Copy the complete link.');
  return { token_hash, type: url.searchParams.get('type') };
}
