// 예시 콘텐츠와 게임 문제.
// 학습 자료는 "예시(Sample)"로 표시되며 강사가 관리 화면에서 고치거나 지울 수 있다.
// 게임 문제는 이 파일에서 직접 검수·교체한다.

/** 학습실 예시 자료. practice.answer는 0부터 세는 정답 위치 */
export const SAMPLE_RESOURCES = [
  {
    category: 'expression', level: 'beginner', title: '안녕하세요 — 인사하기',
    summary: '처음 만났을 때, 헤어질 때 쓰는 기본 인사. Basic greetings.',
    explanation: '"안녕하세요" is the standard polite greeting. You can use it at any time of day — morning, afternoon or evening.\n\nWhen you leave, the phrase changes depending on who is leaving. Say "안녕히 가세요" to someone who is leaving, and "안녕히 계세요" to someone who is staying.',
    examples: [
      { ko: '안녕하세요? 저는 마리아예요.', en: 'Hello. I am Maria.' },
      { ko: '만나서 반갑습니다.', en: 'Nice to meet you.' },
      { ko: '안녕히 가세요.', en: 'Goodbye. (to a person who is leaving)' },
      { ko: '안녕히 계세요.', en: 'Goodbye. (to a person who is staying)' },
    ],
    practice: [
      { q: '친구가 집에 갑니다. 나는 남아요. 뭐라고 말해요? Your friend is leaving and you stay.', options: ['안녕히 가세요', '안녕히 계세요', '만나서 반갑습니다'], answer: 0, explain: '가는 사람에게는 "안녕히 가세요". The other person is leaving (가다 = to go).' },
      { q: '"Nice to meet you" 는 한국어로?', options: ['안녕히 계세요', '만나서 반갑습니다', '감사합니다'], answer: 1, explain: '만나다 = to meet, 반갑다 = to be glad.' },
    ],
  },
  {
    category: 'expression', level: 'beginner', title: '감사합니다 · 죄송합니다',
    summary: '고마울 때와 미안할 때. Thanking and apologising politely.',
    explanation: '"감사합니다" and "고맙습니다" both mean "thank you". Both are polite, and you can use either one.\n\n"죄송합니다" is a polite "I am sorry". With friends, people say "미안해". A common answer to both thanks and apologies is "아니에요" — "it is nothing".',
    examples: [
      { ko: '도와주셔서 감사합니다.', en: 'Thank you for helping me.' },
      { ko: '늦어서 죄송합니다.', en: 'I am sorry I am late.' },
      { ko: '아니에요, 괜찮아요.', en: 'No problem, it is okay.' },
    ],
    practice: [
      { q: '수업에 늦었어요. 선생님께 뭐라고 말해요? You are late for class.', options: ['감사합니다', '죄송합니다', '안녕히 가세요'], answer: 1, explain: '늦었을 때는 "늦어서 죄송합니다".' },
      { q: '"괜찮아요" 의 뜻은?', options: ['It is okay', 'Thank you', 'See you'], answer: 0, explain: '괜찮아요 = It is okay / I am fine.' },
    ],
  },
  {
    category: 'expression', level: 'beginner', title: '이거 얼마예요? — 가게에서',
    summary: '물건 값을 묻고 주문하는 표현. Asking prices and ordering.',
    explanation: 'Point at something and say "이거 얼마예요?" to ask the price. 이거 = this, 얼마 = how much.\n\nTo ask for something, say the thing + "주세요" (please give me). Add a number after the noun: "커피 두 잔 주세요".',
    examples: [
      { ko: '이거 얼마예요?', en: 'How much is this?' },
      { ko: '오천 원이에요.', en: 'It is 5,000 won.' },
      { ko: '물 한 병 주세요.', en: 'One bottle of water, please.' },
      { ko: '카드 돼요?', en: 'Can I pay by card?' },
    ],
    practice: [
      { q: '커피를 주문하고 싶어요. I want to order a coffee.', options: ['커피 얼마예요', '커피 주세요', '커피 돼요'], answer: 1, explain: '명사 + 주세요 = Please give me …' },
      { q: '"얼마예요?" 는 무엇을 물어요?', options: ['시간 Time', '가격 Price', '이름 Name'], answer: 1, explain: '얼마 = how much.' },
    ],
  },
  {
    category: 'expression', level: 'intermediate', title: '잘 부탁드립니다',
    summary: '새 직장·모임에서 자기소개를 마칠 때. Ending a self-introduction.',
    explanation: 'There is no exact English translation. "잘 부탁드립니다" literally means "I ask for your kind favour". People say it at the end of a self-introduction, or when they start working with someone. It shows respect and a wish for a good relationship.',
    examples: [
      { ko: '오늘부터 같이 일하게 된 사라입니다. 잘 부탁드립니다.', en: 'I am Sarah and I start working with you today. I look forward to working with you.' },
      { ko: '앞으로 잘 부탁드려요.', en: 'I hope we get along well from now on.' },
    ],
    practice: [
      { q: '언제 "잘 부탁드립니다"를 써요?', options: ['밥을 먹은 뒤 After a meal', '자기소개를 마칠 때 After introducing yourself', '전화를 끊을 때 Ending a call'], answer: 1, explain: '처음 만난 사람에게 자기소개 끝에 씁니다.' },
    ],
  },
  {
    category: 'grammar', level: 'beginner', title: '은/는 — 주제를 말할 때',
    summary: '무엇에 대해 말하는지 알려 주는 조사. The topic particle.',
    explanation: '은/는 marks the topic — what the sentence is about. Attach it to a noun.\n\n• After a consonant (받침 있음): 은 — 선생님은, 책은\n• After a vowel (받침 없음): 는 — 저는, 친구는',
    examples: [
      { ko: '저는 학생이에요.', en: 'I am a student.' },
      { ko: '이름은 민수예요.', en: 'My name is Minsu.' },
      { ko: '오늘은 날씨가 좋아요.', en: 'Today the weather is nice.' },
    ],
    practice: [
      { q: '선생님___ 한국 사람이에요.', options: ['은', '는'], answer: 0, explain: '"님"에 받침(ㅁ)이 있어서 "은".' },
      { q: '친구___ 미국에서 왔어요.', options: ['은', '는'], answer: 1, explain: '"구"에 받침이 없어서 "는".' },
    ],
  },
  {
    category: 'grammar', level: 'beginner', title: '이에요/예요 — A는 B예요',
    summary: '"~이다"의 부드러운 높임 표현. Saying "A is B" politely.',
    explanation: 'Use noun + 이에요/예요 to say "is/am/are".\n\n• After a consonant: 이에요 — 학생이에요\n• After a vowel: 예요 — 의사예요\n\nFor a question, keep the same form and raise your voice at the end: 학생이에요?',
    examples: [
      { ko: '저는 회사원이에요.', en: 'I am an office worker.' },
      { ko: '이것은 사과예요.', en: 'This is an apple.' },
      { ko: '여기가 서울이에요?', en: 'Is this Seoul?' },
    ],
    practice: [
      { q: '저는 의사___.', options: ['이에요', '예요'], answer: 1, explain: '"사"에 받침이 없어서 "예요".' },
      { q: '이것은 책___.', options: ['이에요', '예요'], answer: 0, explain: '"책"에 받침(ㄱ)이 있어서 "이에요".' },
    ],
  },
  {
    category: 'grammar', level: 'beginner', title: '-고 싶다 — 하고 싶은 것',
    summary: '바라는 것을 말하는 표현. Saying what you want to do.',
    explanation: 'Verb stem + 고 싶어요 means "I want to …". Remove 다 from the dictionary form and add 고 싶어요. The stem does not change.\n\n가다 → 가고 싶어요 · 먹다 → 먹고 싶어요',
    examples: [
      { ko: '한국에 가고 싶어요.', en: 'I want to go to Korea.' },
      { ko: '김치찌개를 먹고 싶어요.', en: 'I want to eat kimchi stew.' },
      { ko: '뭐 하고 싶어요?', en: 'What do you want to do?' },
    ],
    practice: [
      { q: '"I want to watch a movie." 영화를 ___.', options: ['보고 싶어요', '봐고 싶어요', '보싶어요'], answer: 0, explain: '보다 → 보 + 고 싶어요.' },
      { q: '"배우다(to learn)" + 고 싶어요 = ?', options: ['배우고 싶어요', '배워고 싶어요'], answer: 0, explain: '어간 "배우" 뒤에 바로 "고 싶어요".' },
    ],
  },
  {
    category: 'grammar', level: 'intermediate', title: '-(으)ㄹ 수 있다 — 할 수 있는 것',
    summary: '능력과 가능성을 말하는 표현. Saying what you can do.',
    explanation: 'Verb stem + (으)ㄹ 수 있어요 means "can". The negative is (으)ㄹ 수 없어요.\n\n• Stem ends in a vowel: ㄹ 수 있어요 — 가다 → 갈 수 있어요\n• Stem ends in a consonant: 을 수 있어요 — 먹다 → 먹을 수 있어요',
    examples: [
      { ko: '저는 한국어를 읽을 수 있어요.', en: 'I can read Korean.' },
      { ko: '내일 만날 수 있어요?', en: 'Can we meet tomorrow?' },
      { ko: '매운 음식은 먹을 수 없어요.', en: 'I cannot eat spicy food.' },
    ],
    practice: [
      { q: '수영하다 → "I can swim."', options: ['수영할 수 있어요', '수영하을 수 있어요', '수영할 수 없어요'], answer: 0, explain: '어간 "수영하"가 모음으로 끝나서 ㄹ 수 있어요.' },
      { q: '읽다 → "I cannot read it."', options: ['읽을 수 있어요', '읽을 수 없어요', '읽ㄹ 수 없어요'], answer: 1, explain: '못 할 때는 "(으)ㄹ 수 없어요".' },
    ],
  },
];

/** 데모 모드에서만 보이는 예시 커뮤니티 글 */
export const SAMPLE_POSTS = [
  { topic: 'question', title: '[예시] "은/는"과 "이/가"는 어떻게 달라요?', body: '예시 글입니다. This is a sample post.\n\n"저는 학생이에요"와 "제가 학생이에요"의 차이가 궁금해요.',
    comments: ['예시 댓글입니다. 은/는은 주제, 이/가는 새로운 정보나 주어를 강조할 때 써요.'] },
  { topic: 'life', title: '[예시] 한국에서 교통카드 사는 방법', body: '예시 글입니다. This is a sample post.\n\n편의점에서 교통카드를 사고 충전할 수 있어요. 지하철과 버스에서 모두 쓸 수 있습니다.', comments: [] },
];

/** 게임 A — 한글 짝 맞추기: 단어 → 그림 */
export const MATCH_ITEMS = [
  { ko: '사과', en: 'apple', pic: '🍎' }, { ko: '파인애플', en: 'pineapple', pic: '🍍' },
  { ko: '바나나', en: 'banana', pic: '🍌' }, { ko: '포도', en: 'grapes', pic: '🍇' },
  { ko: '수박', en: 'watermelon', pic: '🍉' }, { ko: '딸기', en: 'strawberry', pic: '🍓' },
  { ko: '우유', en: 'milk', pic: '🥛' }, { ko: '빵', en: 'bread', pic: '🍞' },
  { ko: '고양이', en: 'cat', pic: '🐱' }, { ko: '개', en: 'dog', pic: '🐶' },
  { ko: '물고기', en: 'fish', pic: '🐟' }, { ko: '새', en: 'bird', pic: '🐦' },
  { ko: '나무', en: 'tree', pic: '🌳' }, { ko: '꽃', en: 'flower', pic: '🌸' },
  { ko: '집', en: 'house', pic: '🏠' }, { ko: '자동차', en: 'car', pic: '🚗' },
  { ko: '버스', en: 'bus', pic: '🚌' }, { ko: '책', en: 'book', pic: '📖' },
  { ko: '신발', en: 'shoe', pic: '👟' }, { ko: '시계', en: 'watch', pic: '⌚' },
  { ko: '우산', en: 'umbrella', pic: '☂️' }, { ko: '달', en: 'moon', pic: '🌙' },
  { ko: '별', en: 'star', pic: '⭐' }, { ko: '해', en: 'sun', pic: '☀️' },
];

/** 게임 B — 한글 블록 조립. 낱자 분해는 hangul.js가 자동으로 한다. */
export const BLOCK_WORDS = {
  beginner: [ // 받침 없는 글자
    { word: '소', en: 'cow', pic: '🐮' }, { word: '코', en: 'nose', pic: '👃' },
    { word: '새', en: 'bird', pic: '🐦' }, { word: '차', en: 'tea', pic: '🍵' },
    { word: '나무', en: 'tree', pic: '🌳' }, { word: '바지', en: 'trousers', pic: '👖' },
    { word: '모자', en: 'cap', pic: '🧢' }, { word: '포도', en: 'grapes', pic: '🍇' },
    { word: '우유', en: 'milk', pic: '🥛' }, { word: '기차', en: 'train', pic: '🚆' },
    { word: '사자', en: 'lion', pic: '🦁' }, { word: '커피', en: 'coffee', pic: '☕' },
  ],
  batchim: [ // 받침 있는 글자
    { word: '산', en: 'mountain', pic: '⛰️' }, { word: '집', en: 'house', pic: '🏠' },
    { word: '문', en: 'door', pic: '🚪' }, { word: '곰', en: 'bear', pic: '🐻' },
    { word: '밥', en: 'cooked rice', pic: '🍚' }, { word: '책', en: 'book', pic: '📖' },
    { word: '달', en: 'moon', pic: '🌙' }, { word: '별', en: 'star', pic: '⭐' },
    { word: '눈', en: 'eye', pic: '👁️' }, { word: '물', en: 'water', pic: '💧' },
    { word: '수박', en: 'watermelon', pic: '🍉' }, { word: '한국', en: 'Korea', pic: '🇰🇷' },
  ],
};

/** 게임 C — 듣고 고르기. answer를 음성으로 들려주고 options 중에서 고른다. */
export const LISTEN_ITEMS = [
  { answer: '가', options: ['가', '카', '까'], note: 'ㄱ은 부드러운 소리, ㅋ은 숨이 세게 나오는 소리, ㄲ은 힘을 준 소리예요.' },
  { answer: '나', options: ['나', '다', '라'], note: 'ㄴ = n, ㄷ = d, ㄹ = r/l.' },
  { answer: '오이', options: ['우유', '오이', '아이'], note: '오이 = cucumber.' },
  { answer: '우유', options: ['우유', '오이', '여우'], note: '우유 = milk.' },
  { answer: '사과', options: ['사자', '과자', '사과'], note: '사과 = apple, 사자 = lion, 과자 = snack.' },
  { answer: '바지', options: ['바다', '바지', '아버지'], note: '바지 = trousers, 바다 = sea.' },
  { answer: '고기', options: ['거기', '고기', '고구마'], note: '고기 = meat, 거기 = there.' },
  { answer: '물', options: ['물', '불', '풀'], note: '물 = water, 불 = fire, 풀 = grass.' },
  { answer: '눈', options: ['문', '논', '눈'], note: '눈 = eye / snow, 문 = door.' },
  { answer: '달', options: ['달', '딸', '탈'], note: '달 = moon, 딸 = daughter, 탈 = mask.' },
  { answer: '방', options: ['밤', '방', '빵'], note: '방 = room, 밤 = night, 빵 = bread.' },
  { answer: '한국', options: ['한글', '학교', '한국'], note: '한국 = Korea, 한글 = the Korean alphabet, 학교 = school.' },
  { answer: '커피', options: ['코피', '커피', '거미'], note: '커피 = coffee, 코피 = nosebleed.' },
  { answer: '어머니', options: ['아버지', '어머니', '아저씨'], note: '어머니 = mother, 아버지 = father.' },
];
