// 실제 저장소: Supabase(로그인 · Postgres · 파일 저장소).
// 접근 권한은 supabase/schema.sql의 RLS·저장소 정책이 서버에서 강제한다. 여기 코드는 요청만 보낸다.
import { encodeResource, decodeResource, withStoryTemplate, storyTemplate } from './resources.js';
import { uid } from './util.js';
import { AUTH_RETURN_URL, signupToken } from './auth.js';

const MESSAGES = {
  RATE_LIMIT: '너무 빠릅니다. 잠시 뒤에 다시 시도해 주세요. Please wait a moment.',
  TOO_MANY_LINKS: '링크는 3개까지만 넣을 수 있습니다. Up to 3 links.',
  NO_SUCH_MEMBER: '그 이메일로 가입한 회원이 없습니다. 학생이 먼저 회원가입을 해야 합니다.',
  ALREADY_LINKED: '이미 다른 학생 메뉴에 연결된 계정입니다.',
  FORBIDDEN: '권한이 없습니다. You do not have permission.',
  'Invalid login credentials': '이메일 또는 비밀번호가 맞지 않습니다. Wrong email or password.',
  'Email not confirmed': '이메일 인증을 먼저 완료해 주세요. Please confirm your email first.',
  'User already registered': '이미 가입된 이메일입니다. This email is already registered.',
};
function fail(error) {
  const raw = error?.message || String(error);
  const key = Object.keys(MESSAGES).find((k) => raw.includes(k));
  if (key) return new Error(MESSAGES[key]);
  if (error?.code === '42501' || /row-level security/i.test(raw)) return new Error(MESSAGES.FORBIDDEN);
  if (error?.code === '23505') return new Error('이미 등록되어 있습니다. Already exists.');
  return new Error('요청을 처리하지 못했습니다. ' + raw);
}
const ok = ({ data, error }) => { if (error) throw fail(error); return data; };
// 주소에 들어온 id가 uuid 모양이 아니면 서버에 묻지 않고 '없음'으로 처리한다.
const isId = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));

export async function createLiveStore({ url, key }) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const callback = new URLSearchParams(location.hash.slice(1));
  const hasCallback = callback.has('access_token') || callback.has('error') || new URLSearchParams(location.search).has('code');
  const sb = createClient(url, key);
  let authNotice = '';
  let user = null;
  const subs = [];

  async function loadUser(session) {
    if (!session) { user = null; return; }
    const { data } = await sb.from('profiles').select('display_name, role').eq('id', session.user.id).maybeSingle();
    user = { id: session.user.id, email: session.user.email, name: data?.display_name || 'Member', role: data?.role || 'member' };
  }
  const initial = await sb.auth.getSession();
  await loadUser(initial.data.session);
  if (hasCallback) {
    authNotice = callback.has('error') || initial.error || !initial.data.session?.user?.email_confirmed_at ? '인증을 완료하지 못했습니다. 링크가 만료되었다면 다시 보내기를 이용하세요. Confirmation failed. Request a new email.' : '이메일 인증 후 로그인되었습니다. Email confirmed. You are signed in.';
    const clean = new URL(location.href); clean.hash = '/verify'; clean.searchParams.delete('code');
    history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
  }
  sb.auth.onAuthStateChange((_event, session) => {
    // 콜백 안에서 바로 다른 요청을 보내면 멈출 수 있어 한 박자 늦춘다.
    setTimeout(async () => { await loadUser(session); subs.forEach((f) => f(user)); }, 0);
  });

  const needLogin = () => { if (!user) throw new Error('로그인이 필요합니다. Please log in.'); return user; };
  const author = (row) => ({ author_name: row.author?.display_name || 'Member', author_role: row.author?.role || 'member' });

  return {
    mode: 'live',
    get authNotice() { return authNotice; },
    get user() { return user; },
    onAuth(cb) { subs.push(cb); },

    async signUp({ email, password, name }) {
      const data = ok(await sb.auth.signUp({ email, password,
        options: { data: { display_name: String(name).trim().slice(0, 40) }, emailRedirectTo: AUTH_RETURN_URL } }));
      return { needsVerification: !data.session };
    },
    async resendVerification(email) {
      ok(await sb.auth.resend({type:'signup', email:email.trim(), options:{emailRedirectTo:AUTH_RETURN_URL}}));
    },
    async verifyEmailLink(link) {
      const result = ok(await sb.auth.verifyOtp(signupToken(link)));
      if (!result.session || !result.user?.email_confirmed_at) throw new Error('인증 상태를 확인하지 못했습니다. Please log in to check your confirmation.');
      await loadUser(result.session);
      authNotice = '이메일 인증이 완료되었습니다. 로그인되었습니다. Email confirmed. You are signed in.';
      subs.forEach(f=>f(user));
      return true;
    },
    async signIn({ email, password }) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signOut() { ok(await sb.auth.signOut()); },

    // ── 학생 · 수업자료 ─────────────────────────────
    async listStudents() {
      if (!user) return [];
      const rows = ok(await sb.from('students').select('*').order('created_at'));
      if (user.role !== 'teacher') return rows;
      const emails = ok(await sb.rpc('student_accounts')) || [];
      return rows.map((s) => ({ ...s, linked_email: emails.find((e) => e.student_id === s.id)?.email || '' }));
    },
    async getStudent(id) {
      if (!user || !isId(id)) return null;
      const student = ok(await sb.from('students').select('*').eq('id', id).maybeSingle());
      if (!student) return null; // 권한이 없으면 서버가 행을 돌려주지 않는다.
      const mats = ok(await sb.from('lesson_materials').select('*').eq('student_id', id));
      const files = ok(await sb.from('lesson_files').select('*').eq('student_id', id).order('created_at'));
      const materials = [1, 2, 3].map((slot) => {
        const m = mats.find((x) => x.slot === slot);
        return { slot, title: m?.title || '', description: m?.description || '', links: m?.links || [], files: files.filter((f) => f.slot === slot) };
      });
      return { student, materials };
    },
    async saveStudent({ id, name, note }) {
      const row = { name: String(name || '').trim(), note: note || '' };
      if (!row.name) throw new Error('학생 이름을 입력해 주세요.');
      ok(id ? await sb.from('students').update(row).eq('id', id) : await sb.from('students').insert(row));
    },
    async deleteStudent(id) {
      const files = ok(await sb.from('lesson_files').select('path').eq('student_id', id));
      if (files.length) ok(await sb.storage.from('lesson-files').remove(files.map((f) => f.path)));
      ok(await sb.from('students').delete().eq('id', id));
    },
    async linkStudent(id, email) { ok(await sb.rpc('link_student_account', { p_student: id, p_email: email || '' })); },
    async saveMaterial(studentId, slot, { title, description, links }) {
      ok(await sb.from('lesson_materials').upsert({ student_id: studentId, slot, title, description, links, updated_at: new Date().toISOString() }));
    },
    async uploadFile(studentId, slot, file) {
      if (file.size > 20 * 1048576) throw new Error('파일은 20MB까지 올릴 수 있습니다.');
      const ext = (file.name.match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();
      const path = `${studentId}/${slot}/${uid()}${ext}`;
      ok(await sb.storage.from('lesson-files').upload(path, file, { contentType: file.type || undefined }));
      ok(await sb.from('lesson_files').insert({ student_id: studentId, slot, path, name: file.name.slice(0, 200), mime: file.type || '', size: file.size }));
    },
    async deleteFile(fileId) {
      const f = ok(await sb.from('lesson_files').select('path').eq('id', fileId).maybeSingle());
      if (!f) return;
      ok(await sb.storage.from('lesson-files').remove([f.path]));
      ok(await sb.from('lesson_files').delete().eq('id', fileId));
    },
    async fileUrl(file) {
      // 10분짜리 서명 주소. 권한이 없는 계정은 서버가 발급을 거절한다.
      return ok(await sb.storage.from('lesson-files').createSignedUrl(file.path, 600, { download: file.mime?.startsWith('image/') ? false : file.name })).signedUrl;
    },

    // ── 학습실 ─────────────────────────────────────
    async listResources() { return withStoryTemplate(ok(await sb.from('resources').select('*').order('created_at', { ascending: false })).map(decodeResource)); },
    async getResource(id) { if (storyTemplate(id)) return storyTemplate(id); if (!isId(id)) return null; return decodeResource(ok(await sb.from('resources').select('*').eq('id', id).maybeSingle())); },
    async saveResource(r) {
      if (storyTemplate(r.id)) r = {...r,id:undefined};
      r = encodeResource(r);
      const row = { category: r.category, level: r.level, title: r.title, summary: r.summary, explanation: r.explanation,
        examples: r.examples, practice: r.practice, published: r.published, updated_at: new Date().toISOString() };
      if (r.id) { ok(await sb.from('resources').update(row).eq('id', r.id)); return r.id; }
      return ok(await sb.from('resources').insert(row).select('id').single()).id;
    },
    async deleteResource(id) { ok(await sb.from('resources').delete().eq('id', id)); },

    // ── 커뮤니티 ───────────────────────────────────
    async listPosts() {
      const rows = ok(await sb.from('posts').select('*, author:profiles(display_name, role), comments(count)').order('created_at', { ascending: false }).limit(200));
      return rows.map((p) => ({ ...p, ...author(p), comment_count: p.comments?.[0]?.count || 0 }));
    },
    async getPost(id) {
      if (!isId(id)) return null;
      const p = ok(await sb.from('posts').select('*, author:profiles(display_name, role)').eq('id', id).maybeSingle());
      if (!p) return null;
      const cs = ok(await sb.from('comments').select('*, author:profiles(display_name, role)').eq('post_id', id).order('created_at'));
      return { post: { ...p, ...author(p), comment_count: cs.length }, comments: cs.map((c) => ({ ...c, ...author(c) })) };
    },
    async savePost({ id, topic, title, body }) {
      needLogin();
      if (id) { ok(await sb.from('posts').update({ topic, title, body }).eq('id', id)); return id; }
      return ok(await sb.from('posts').insert({ topic, title, body }).select('id').single()).id;
    },
    async deletePost(id) { needLogin(); ok(await sb.from('posts').delete().eq('id', id)); },
    async setPostHidden(id, hidden) { ok(await sb.from('posts').update({ hidden }).eq('id', id)); },
    async saveComment({ id, post_id, body }) {
      needLogin();
      ok(id ? await sb.from('comments').update({ body }).eq('id', id) : await sb.from('comments').insert({ post_id, body }));
    },
    async deleteComment(id) { needLogin(); ok(await sb.from('comments').delete().eq('id', id)); },
    async report({ target_type, target_id, reason }) {
      needLogin();
      const { error } = await sb.from('reports').insert({ target_type, target_id, reason });
      if (error?.code === '23505') throw new Error('이미 신고한 글입니다. Already reported.');
      if (error) throw fail(error);
    },
    async listReports() {
      const rows = ok(await sb.from('reports').select('*, reporter:profiles(display_name)').eq('resolved', false).order('created_at', { ascending: false }));
      const out = [];
      for (const r of rows) {
        let post_id = null, excerpt = '(삭제됨)';
        if (r.target_type === 'comment') {
          const c = ok(await sb.from('comments').select('body, post_id').eq('id', r.target_id).maybeSingle());
          if (c) { post_id = c.post_id; excerpt = c.body; }
        } else {
          const p = ok(await sb.from('posts').select('id, title').eq('id', r.target_id).maybeSingle());
          if (p) { post_id = p.id; excerpt = p.title; }
        }
        out.push({ ...r, reporter_name: r.reporter?.display_name || 'Member', post_id, excerpt });
      }
      return out;
    },
    async resolveReport(id) { ok(await sb.from('reports').update({ resolved: true }).eq('id', id)); },

    // ── 수업 신청 ──────────────────────────────────
    async submitApplication(a) {
      // 방문자는 신청 내용을 다시 읽을 권한이 없으므로 저장만 하고 결과 행은 요청하지 않는다.
      ok(await sb.from('applications').insert({ name: a.name, level: a.level, goal: a.goal, times: a.times, contact: a.contact, message: a.message || '' }));
    },
    async listApplications() { return ok(await sb.from('applications').select('*').order('created_at', { ascending: false })); },
    async setApplicationStatus(id, status) { ok(await sb.from('applications').update({ status }).eq('id', id)); },
    async deleteApplication(id) { ok(await sb.from('applications').delete().eq('id', id)); },

    // ── 강사 소개 · 운영 정보 ───────────────────────
    async getTeacherProfile() {
      return ok(await sb.from('site_settings').select('value').eq('key', 'teacher_profile').maybeSingle())?.value || {};
    },
    async saveTeacherProfile(p) {
      ok(await sb.from('site_settings').upsert({ key: 'teacher_profile', value: p, updated_at: new Date().toISOString() }));
    },
    async uploadPublicImage(file) {
      if (file.size > 5 * 1048576) throw new Error('사진은 5MB까지 올릴 수 있습니다.');
      const ext = (file.name.match(/\.[A-Za-z0-9]{1,8}$/) || ['.jpg'])[0].toLowerCase();
      const path = `teacher/${uid()}${ext}`;
      ok(await sb.storage.from('public-media').upload(path, file, { contentType: file.type || undefined }));
      return sb.storage.from('public-media').getPublicUrl(path).data.publicUrl;
    },

    // ── 게임 기록(회원별) ───────────────────────────
    async getScore(game) {
      if (!user) return null;
      const r = ok(await sb.from('game_scores').select('best_score, best_streak, plays').eq('user_id', user.id).eq('game', game).maybeSingle());
      return r ? { score: r.best_score, streak: r.best_streak, plays: r.plays } : null;
    },
    async saveScore(game, rec) {
      needLogin();
      ok(await sb.from('game_scores').upsert({ user_id: user.id, game, best_score: rec.score, best_streak: rec.streak, plays: rec.plays, updated_at: new Date().toISOString() }));
    },
  };
}
