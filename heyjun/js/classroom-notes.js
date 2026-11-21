import { esc, bi, CLASS_CATEGORIES } from './util.js';

export function classroomList(studentId, rows, query, teacher) {
  const base = `#/lessons/${studentId}`;
  const cat = CLASS_CATEGORIES[query.cat] ? query.cat : '';
  return {
    html: `<section aria-label="개인 학습실 Private study room">
      <div class="filters"><div class="chips" role="group" aria-label="카테고리">
        <a class="chip" href="${base}" ${cat ? '' : 'aria-current="true"'}>${bi('전체', 'All')}</a>
        ${Object.entries(CLASS_CATEGORIES).map(([k,v])=>`<a class="chip" href="${base}?cat=${k}" ${cat===k?'aria-current="true"':''}>${bi(...v)}</a>`).join('')}
      </div>${teacher ? `<a class="btn btn-primary" href="${base}/notes/new">+ ${bi('새 자료 작성', 'New note')}</a>` : ''}</div>
      <div class="filters"><div class="grow"><label class="sr-only" for="class-q">자료 검색 Search notes</label><input id="class-q" type="search" placeholder="검색 Search" value="${esc(query.q||'')}"></div></div>
      <p class="meta" id="class-count" aria-live="polite"></p><div class="grid g2" id="class-list"></div></section>`,
    mount(root) {
      const q=root.querySelector('#class-q');
      const draw=()=>{
        const term=q.value.trim().toLowerCase();
        const filtered=rows.filter(r=>(!cat||cat===r.category)&&(!term||[r.title,r.summary,r.explanation,...r.examples.map(x=>x.ko+' '+x.en)].join(' ').toLowerCase().includes(term)));
        root.querySelector('#class-count').textContent=`자료 ${filtered.length}개 · ${filtered.length} notes`;
        root.querySelector('#class-list').innerHTML=filtered.length?filtered.map(r=>`<a class="card" href="${base}/notes/${esc(r.id)}"><div class="tags"><span class="tag">${bi(...CLASS_CATEGORIES[r.category])}</span>${r.published?'':`<span class="tag tag-lav">${bi('작성 중 · 강사만', 'Draft · teacher only')}</span>`}</div><h3>${esc(r.title)}</h3><p>${esc(r.summary)}</p></a>`).join(''):`<div class="empty" style="grid-column:1/-1"><b>${bi(rows.length?'찾는 자료가 없습니다':'아직 자료가 없습니다', rows.length?'No matching notes':'No notes yet')}</b>${bi(rows.length?'검색어나 카테고리를 바꿔 보세요.':teacher?'새 자료 작성 버튼으로 첫 자료를 추가하세요.':'강사가 자료를 등록하면 여기에 표시됩니다.',rows.length?'Try another search or category.':teacher?'Add your first note using New note.':'Your teacher will add notes here.')}</div>`;
      };
      q.addEventListener('input',draw);draw();
    },
  };
}
