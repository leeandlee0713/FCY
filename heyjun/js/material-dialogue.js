import { esc } from './util.js';

// Existing Material 1/2/3 descriptions are plain text. Format at read time only;
// never rewrite the saved text, speaker names, inline glosses or attachments.
export const isDialogueMaterial = (title) => /대화|conversation|dialogue|dialog/i.test(String(title || ''));
const hasKorean = (s) => /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(s);
const speakerLine = (s) => /^[^:：\n]{1,40}[:：]/.test(s);

export function materialDialogue(text) {
  return `<div class="prose conversation-reader material-dialogue">${String(text || '').trim().split(/\n\s*\n/).filter(Boolean).map(group => {
    const lines = group.split('\n').map(s => s.trim()).filter(Boolean);
    // A topic followed by named speakers, e.g. 자기소개 / 혜준: ... / 마이크: ...
    const heading = lines.length > 1 && !speakerLine(lines[0]) && lines.slice(1).some(speakerLine) ? lines.shift() : '';
    const turns = [];
    for (const line of lines) {
      const divider = line.indexOf('|');
      if (divider > 0) {
        turns.push({ ko: line.slice(0, divider).trim(), en: line.slice(divider + 1).trim() });
      } else if (!hasKorean(line) && /[a-z]/i.test(line) && turns.length && hasKorean(turns.at(-1).ko) && !turns.at(-1).en) {
        turns.at(-1).en = line;
      } else turns.push({ ko: line, en: '' });
    }
    return `<section class="dialogue-topic">${heading ? `<h4>${esc(heading)}</h4>` : ''}${turns.map(turn => `<div class="example conversation-line"><span class="ko"${hasKorean(turn.ko) ? ' lang="ko"' : ''}>${esc(turn.ko)}</span>${turn.en ? `<span class="muted" lang="en">${esc(turn.en)}</span>` : ''}</div>`).join('')}</section>`;
  }).join('')}</div>`;
}
