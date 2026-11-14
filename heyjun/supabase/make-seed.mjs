// js/content.js의 예시 학습 자료로 seed.sql을 만든다. 실행: node heyjun/supabase/make-seed.mjs
import { writeFileSync } from 'node:fs';
import { SAMPLE_RESOURCES } from '../js/content.js';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = SAMPLE_RESOURCES.map((r, i) => `  (${q(r.category)}, ${q(r.level)}, ${q(r.title)}, ${q(r.summary)}, ${q(r.explanation)}, ${q(JSON.stringify(r.examples))}::jsonb, ${q(JSON.stringify(r.practice))}::jsonb, true, now() - interval '${i} days')`);
writeFileSync(new URL('./seed.sql', import.meta.url),
  `-- 예시 학습 자료(「예시」로 표시됨). schema.sql 다음에 한 번만 실행한다. make-seed.mjs가 만든 파일이다.\n`
  + `insert into public.resources (category, level, title, summary, explanation, examples, practice, is_sample, created_at) values\n${rows.join(',\n')};\n`);
