// 데모 저장소: 서버가 연결되지 않았을 때 이 브라우저(localStorage + IndexedDB)에만 저장한다.
// 실제 서버와 같은 규칙(누가 무엇을 볼 수 있는지)을 흉내 내지만, 브라우저 안에서만 지켜지는 규칙이므로
// 보안 장치가 아니다. 실제 보호는 supabase/schema.sql의 RLS와 저장소 정책이 맡는다.
import { withStoryTemplate, storyTemplate } from './resources.js';
import { uid } from './util.js';
import { SAMPLE_RESOURCES, SAMPLE_POSTS } from './content.js';

const KEY = 'heyjun.demo.v1';
const now = () => new Date().toISOString();

async function hash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function seed() {
  const teacher = { id: 'demo-teacher', email: 'teacher@demo.heyjun', name: '강사 (데모)', role: 'teacher', pass: null };
  const emma = { id: 'demo-emma', email: 'emma@demo.heyjun', name: 'Emma (예시 학생)', role: 'student', pass: null };
  const liam = { id: 'demo-liam', email: 'liam@demo.heyjun', name: 'Liam (예시 학생)', role: 'student', pass: null };
  const member = { id: 'demo-member', email: 'member@demo.heyjun', name: 'Mina (예시 회원)', role: 'member', pass: null };
  const sA = { id: 'student-emma', name: 'Emma', note: '예시 학생', user_id: emma.id, created_at: now() };
  const sB = { id: 'student-liam', name: 'Liam', note: '예시 학생', user_id: liam.id, created_at: now() };
  const posts = [], comments = [];
  SAMPLE_POSTS.forEach((p, i) => {
    const id = 'sample-post-' + i;
    posts.push({ id, author_id: member.id, topic: p.topic, title: p.title, body: p.body, hidden: false, is_sample: true, created_at: now(), updated_at: now() });
    p.comments.forEach((c, j) => comments.push({ id: `sample-c-${i}-${j}`, post_id: id, author_id: teacher.id, body: c, created_at: now() }));
  });
  return {
    users: [teacher, emma, liam, member], session: null,
    students: [sA, sB],
    materials: [
      { student_id: sA.id, slot: 1, title: '[예시] 자기소개 연습', description: 'Emma 학생 전용 예시 자료입니다. 다른 학생에게는 보이지 않습니다.', links: [], updated_at: now() },
      { student_id: sB.id, slot: 1, title: '[예시] 숫자 읽기', description: 'Liam 학생 전용 예시 자료입니다.', links: [], updated_at: now() },
    ],
    files: [],
    resources: SAMPLE_RESOURCES.map((r, i) => ({ ...r, id: 'sample-res-' + i, is_sample: true, published: true, created_at: new Date(Date.now() - i * 864e5).toISOString(), updated_at: now() })),
    posts, comments, reports: [], applications: [], settings: {}, scores: {},
  };
}

// 첨부 파일 원본은 IndexedDB에 둔다(localStorage 용량 한계 때문).
function idb() {
  return new Promise((res, rej) => {
    const open = indexedDB.open('heyjun-demo-files', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('files');
    open.onsuccess = () => res(open.result);
    open.onerror = () => rej(new Error('이 브라우저에서는 파일을 저장할 수 없습니다.'));
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('files', mode);
    const req = fn(tx.objectStore('files'));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}

export async function createLocalStore() {
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db || !db.users) db = seed();
  db.classroomNotes ||= [];
  const save = () => localStorage.setItem(KEY, JSON.stringify(db));
  save();

  const subs = [];
  const me = () => db.users.find((u) => u.id === db.session) || null;
  const pub = (u) => (u ? { id: u.id, email: u.email, name: u.name, role: u.role } : null);
  const emit = () => subs.forEach((f) => f(pub(me())));
  const isTeacher = () => me()?.role === 'teacher';
  const needLogin = () => { if (!me()) throw new Error('로그인이 필요합니다. Please log in.'); return me(); };
  const needTeacher = () => { if (!isTeacher()) throw new Error('강사만 할 수 있습니다. Teacher only.'); };
  const canSeeStudent = (s) => !!s && (isTeacher() || (me() && s.user_id === me().id));
  const nameOf = (id) => db.users.find((u) => u.id === id)?.name || '탈퇴한 회원';
  const roleOf = (id) => db.users.find((u) => u.id === id)?.role || 'member';

  function checkSpam(list, body, seconds) {
    const u = me();
    if (isTeacher()) return;
    const last = list.filter((x) => x.author_id === u.id).map((x) => Date.parse(x.created_at)).sort().pop();
    if (last && Date.now() - last < seconds * 1000) throw new Error(`너무 빠릅니다. ${seconds}초 뒤에 다시 써 주세요. Please wait a moment.`);
    if ((body.match(/https?:\/\//gi) || []).length > 3) throw new Error('링크는 3개까지만 넣을 수 있습니다. Up to 3 links.');
  }
  const viewPost = (p) => ({ ...p, author_name: nameOf(p.author_id), author_role: roleOf(p.author_id),
    comment_count: db.comments.filter((c) => c.post_id === p.id).length });

  return {
    mode: 'demo',
    get user() { return pub(me()); },
    onAuth(cb) { subs.push(cb); },

    demoAccounts() {
      return db.users.filter((u) => u.id.startsWith('demo-')).map(pub);
    },
    async demoLogin(id) { db.session = id; save(); emit(); },

    async signUp({ email, password, name }) {
      email = String(email).trim().toLowerCase();
      if (db.users.some((u) => u.email === email)) throw new Error('이미 가입된 이메일입니다. This email is already registered.');
      const u = { id: uid(), email, name: String(name).trim().slice(0, 40) || 'Member', role: 'member', pass: await hash(password) };
      db.users.push(u); db.session = u.id; save(); emit();
      return { needsVerification: false };
    },
    async signIn({ email, password }) {
      const u = db.users.find((x) => x.email === String(email).trim().toLowerCase());
      if (!u || !u.pass || u.pass !== await hash(password)) throw new Error('이메일 또는 비밀번호가 맞지 않습니다. Wrong email or password.');
      db.session = u.id; save(); emit();
    },
    async signOut() { db.session = null; save(); emit(); },

    // ── 학생 · 수업자료 ─────────────────────────────
    async listStudents() {
      return db.students.filter(canSeeStudent).map((s) => ({ ...s,
        linked_email: isTeacher() ? (db.users.find((u) => u.id === s.user_id)?.email || '') : undefined }));
    },
    async getStudent(id) {
      const s = db.students.find((x) => x.id === id);
      if (!canSeeStudent(s)) return null;
      const materials = [1, 2, 3].map((slot) => {
        const m = db.materials.find((x) => x.student_id === id && x.slot === slot);
        return { slot, title: m?.title || '', description: m?.description || '', links: m?.links || [],
          files: db.files.filter((f) => f.student_id === id && f.slot === slot) };
      });
      return { student: { ...s }, materials };
    },
    async saveStudent({ id, name, note }) {
      needTeacher();
      name = String(name || '').trim();
      if (!name) throw new Error('학생 이름을 입력해 주세요.');
      if (id) Object.assign(db.students.find((s) => s.id === id), { name, note: note || '' });
      else db.students.push({ id: uid(), name, note: note || '', user_id: null, created_at: now() });
      save();
    },
    async deleteStudent(id) {
      needTeacher();
      for (const f of db.files.filter((x) => x.student_id === id)) await idbDo('readwrite', (st) => st.delete(f.id));
      db.files = db.files.filter((f) => f.student_id !== id);
      db.materials = db.materials.filter((m) => m.student_id !== id);
      db.students = db.students.filter((s) => s.id !== id);
      db.classroomNotes = db.classroomNotes.filter((r) => r.student_id !== id);
      save();
    },
    async linkStudent(id, email) {
      needTeacher();
      const s = db.students.find((x) => x.id === id);
      email = String(email || '').trim().toLowerCase();
      if (!email) {
        const old = db.users.find((u) => u.id === s.user_id);
        if (old && old.role === 'student') old.role = 'member';
        s.user_id = null; save(); return;
      }
      const u = db.users.find((x) => x.email === email);
      if (!u) throw new Error('그 이메일로 가입한 회원이 없습니다. 학생이 먼저 회원가입을 해야 합니다.');
      if (db.students.some((x) => x.user_id === u.id && x.id !== id)) throw new Error('이미 다른 학생 메뉴에 연결된 계정입니다.');
      s.user_id = u.id;
      if (u.role === 'member') u.role = 'student';
      save();
    },
    async saveMaterial(studentId, slot, { title, description, links }) {
      needTeacher();
      let m = db.materials.find((x) => x.student_id === studentId && x.slot === slot);
      if (!m) { m = { student_id: studentId, slot }; db.materials.push(m); }
      Object.assign(m, { title, description, links, updated_at: now() });
      save();
    },
    async uploadFile(studentId, slot, file) {
      needTeacher();
      if (file.size > 20 * 1048576) throw new Error('파일은 20MB까지 올릴 수 있습니다.');
      const id = uid();
      await idbDo('readwrite', (st) => st.put(file, id));
      db.files.push({ id, student_id: studentId, slot, name: file.name, mime: file.type, size: file.size, created_at: now() });
      save();
    },
    async deleteFile(fileId) {
      needTeacher();
      await idbDo('readwrite', (st) => st.delete(fileId));
      db.files = db.files.filter((f) => f.id !== fileId); save();
    },
    async fileUrl(file) {
      const meta = db.files.find((f) => f.id === file.id);
      if (!meta || !canSeeStudent(db.students.find((s) => s.id === meta.student_id))) throw new Error('이 파일을 볼 권한이 없습니다.');
      const blob = await idbDo('readonly', (st) => st.get(file.id));
      if (!blob) throw new Error('파일을 찾을 수 없습니다.');
      return URL.createObjectURL(blob);
    },

    async listClassroomNotes(studentId) {
      if (!canSeeStudent(db.students.find(s=>s.id===studentId))) return [];
      return db.classroomNotes.filter(r=>r.student_id===studentId && (isTeacher()||r.published)).sort((a,b)=>b.created_at.localeCompare(a.created_at));
    },
    async getClassroomNote(studentId, id) {
      return (await this.listClassroomNotes(studentId)).find(r=>r.id===id) || null;
    },
    async saveClassroomNote(studentId, r) {
      needTeacher();
      if (!db.students.some(s=>s.id===studentId)) throw new Error('수업실이 없습니다. Classroom not found.');
      if (!['lesson','diary','conversation'].includes(r.category) || !r.title.trim()) throw new Error('제목과 카테고리를 확인하세요. Check title and category.');
      const row = {category:r.category,title:r.title,summary:r.summary,explanation:r.explanation,examples:r.examples,practice:r.practice,published:r.published,updated_at:now()};
      if (r.id) {
        const existing=db.classroomNotes.find(n=>n.id===r.id && n.student_id===studentId);
        if (!existing) throw new Error('자료가 없습니다. Note not found.');
        Object.assign(existing,row);save();return r.id;
      }
      const id=uid();db.classroomNotes.push({...row,id,student_id:studentId,created_at:now()});save();return id;
    },
    async deleteClassroomNote(studentId,id) {
      needTeacher();db.classroomNotes=db.classroomNotes.filter(r=>!(r.id===id&&r.student_id===studentId));save();
    },

    // ── 학습실 ─────────────────────────────────────
    async listResources() {
      return withStoryTemplate(db.resources.filter((r) => r.published || isTeacher()).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },
    async getResource(id) {
      if (storyTemplate(id)) return storyTemplate(id);
      const r = db.resources.find((x) => x.id === id);
      return r && (r.published || isTeacher()) ? { ...r } : null;
    },
    async saveResource(r) {
      needTeacher();
      if (storyTemplate(r.id)) r = {...r,id:undefined};
      if (r.id) Object.assign(db.resources.find((x) => x.id === r.id), r, { updated_at: now() });
      else { r = { ...r, id: uid(), is_sample: false, created_at: now(), updated_at: now() }; db.resources.push(r); }
      save(); return r.id;
    },
    async deleteResource(id) { needTeacher(); db.resources = db.resources.filter((r) => r.id !== id); save(); },

    // ── 커뮤니티 ───────────────────────────────────
    async listPosts() {
      const u = me();
      return db.posts.filter((p) => !p.hidden || isTeacher() || p.author_id === u?.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)).map(viewPost);
    },
    async getPost(id) {
      const p = db.posts.find((x) => x.id === id);
      if (!p || (p.hidden && !isTeacher() && p.author_id !== me()?.id)) return null;
      const comments = db.comments.filter((c) => c.post_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => ({ ...c, author_name: nameOf(c.author_id), author_role: roleOf(c.author_id) }));
      return { post: viewPost(p), comments };
    },
    async savePost({ id, topic, title, body }) {
      const u = needLogin();
      if (id) {
        const p = db.posts.find((x) => x.id === id);
        if (!p || (p.author_id !== u.id && !isTeacher())) throw new Error('본인 글만 고칠 수 있습니다.');
        Object.assign(p, { topic, title, body, updated_at: now() }); save(); return id;
      }
      checkSpam(db.posts, body, 30);
      const p = { id: uid(), author_id: u.id, topic, title, body, hidden: false, is_sample: false, created_at: now(), updated_at: now() };
      db.posts.push(p); save(); return p.id;
    },
    async deletePost(id) {
      const u = needLogin();
      const p = db.posts.find((x) => x.id === id);
      if (!p || (p.author_id !== u.id && !isTeacher())) throw new Error('본인 글만 지울 수 있습니다.');
      db.posts = db.posts.filter((x) => x.id !== id);
      db.comments = db.comments.filter((c) => c.post_id !== id); save();
    },
    async setPostHidden(id, hidden) { needTeacher(); db.posts.find((p) => p.id === id).hidden = hidden; save(); },
    async saveComment({ id, post_id, body }) {
      const u = needLogin();
      if (id) {
        const c = db.comments.find((x) => x.id === id);
        if (!c || (c.author_id !== u.id && !isTeacher())) throw new Error('본인 댓글만 고칠 수 있습니다.');
        c.body = body; save(); return;
      }
      checkSpam(db.comments, body, 10);
      db.comments.push({ id: uid(), post_id, author_id: u.id, body, created_at: now() }); save();
    },
    async deleteComment(id) {
      const u = needLogin();
      const c = db.comments.find((x) => x.id === id);
      if (!c || (c.author_id !== u.id && !isTeacher())) throw new Error('본인 댓글만 지울 수 있습니다.');
      db.comments = db.comments.filter((x) => x.id !== id); save();
    },
    async report({ target_type, target_id, reason }) {
      const u = needLogin();
      if (db.reports.some((r) => r.target_id === target_id && r.reporter_id === u.id)) throw new Error('이미 신고한 글입니다. Already reported.');
      db.reports.push({ id: uid(), target_type, target_id, reason, reporter_id: u.id, resolved: false, created_at: now() }); save();
    },
    async listReports() {
      needTeacher();
      return db.reports.filter((r) => !r.resolved).map((r) => {
        const c = r.target_type === 'comment' ? db.comments.find((x) => x.id === r.target_id) : null;
        const p = db.posts.find((x) => x.id === (c ? c.post_id : r.target_id));
        return { ...r, reporter_name: nameOf(r.reporter_id), post_id: p?.id, excerpt: (c ? c.body : p?.title) || '(삭제됨)' };
      });
    },
    async resolveReport(id) { needTeacher(); db.reports.find((r) => r.id === id).resolved = true; save(); },

    // ── 수업 신청 ──────────────────────────────────
    async submitApplication(a) {
      const recent = db.applications.filter((x) => Date.now() - Date.parse(x.created_at) < 60000).length;
      if (recent >= 3) throw new Error('잠시 뒤에 다시 시도해 주세요. Please try again later.');
      db.applications.push({ ...a, id: uid(), status: 'new', created_at: now() }); save();
    },
    async listApplications() { needTeacher(); return [...db.applications].sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async setApplicationStatus(id, status) { needTeacher(); db.applications.find((a) => a.id === id).status = status; save(); },
    async deleteApplication(id) { needTeacher(); db.applications = db.applications.filter((a) => a.id !== id); save(); },

    // ── 강사 소개 · 운영 정보 ───────────────────────
    async getTeacherProfile() { return db.settings.teacher_profile || {}; },
    async saveTeacherProfile(p) { needTeacher(); db.settings.teacher_profile = p; save(); },
    async uploadPublicImage(file) {
      needTeacher();
      if (file.size > 400 * 1024) throw new Error('데모 모드에서는 400KB 이하 사진만 넣을 수 있습니다.');
      return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    },

    // ── 게임 기록(회원별) ───────────────────────────
    async getScore(game) { const u = me(); return (u && db.scores[u.id]?.[game]) || null; },
    async saveScore(game, rec) { const u = needLogin(); (db.scores[u.id] ||= {})[game] = rec; save(); },
  };
}
