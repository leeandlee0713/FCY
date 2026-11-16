import { STORY_SAMPLES } from './content.js';
const marker = { ko:'', en:'', _heyjun_kind:'storybook_v1' };
export function encodeResource(r) {
  return r.category === 'storybook' ? {...r, category:'expression', examples:[marker,...r.examples]} : r;
}
export function decodeResource(r) {
  if (!r) return r;
  return r.examples?.[0]?._heyjun_kind === 'storybook_v1' ? {...r, category:'storybook', examples:r.examples.slice(1)} : r;
}
export function withStoryTemplate(rows) {
  return rows.some(r=>r.category==='storybook') ? rows : [...rows,...STORY_SAMPLES.map(r=>({...r,is_template:true}))];
}
export function storyTemplate(id) { const r=STORY_SAMPLES.find(r=>r.id===id); return r ? {...r,is_template:true} : null; }
