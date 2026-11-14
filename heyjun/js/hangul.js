// 한글 음절 조합·분해 (유니코드 한글 음절 규칙)
export const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
export const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
export const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

export const isVowel = (j) => JUNG.includes(j);

/** 자음(초성)+모음(중성)+받침(종성, 없으면 '') → 완성된 음절. 규칙에 맞지 않으면 null */
export function compose(cho, jung, jong = '') {
  const c = CHO.indexOf(cho), v = JUNG.indexOf(jung), f = JONG.indexOf(jong);
  if (c < 0 || v < 0 || f < 0) return null;
  return String.fromCharCode(0xac00 + (c * 21 + v) * 28 + f);
}

/** 음절 하나 → { cho, jung, jong } */
export function decompose(ch) {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return { cho: CHO[Math.floor(code / 588)], jung: JUNG[Math.floor((code % 588) / 28)], jong: JONG[code % 28] };
}

/** 조립 중인 칸 상태를 화면에 보일 글자로 바꾼다. 아직 조합할 수 없으면 놓인 낱자를 그대로 보여 준다. */
export function preview(cho, jung, jong) {
  if (cho && jung) return compose(cho, jung, jong || '') ?? (cho + jung + (jong || ''));
  return (cho || '') + (jung || '') + (jong || '');
}

/** 단어 → 조립 설명 문자열. 예: 나무 → "ㄴ+ㅏ / ㅁ+ㅜ" */
export function recipe(word) {
  return [...word].map((ch) => {
    const d = decompose(ch);
    return d ? [d.cho, d.jung, d.jong].filter(Boolean).join('+') : ch;
  }).join(' / ');
}
