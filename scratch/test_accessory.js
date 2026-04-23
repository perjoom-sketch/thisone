function isAccessoryLike(title, query) {
  const t = String(title || '').toLowerCase();
  const q = String(query || '').toLowerCase();

  const ACCESSORY_KEYWORDS = [
    '부품', '악세사리', '액세서리', '필터', '소모품', '보호필름', '충전기', 
    '호환', '더스트백', '먼지봉투', '브러쉬', '물걸레', '패드', '세척액', 
    '카트리지', '키트', '거름망', '헤파필터', '걸레', '전원선', '교체용', '여분', '노즐', '케이스'
  ];

  const ACCESSORY_EXCEPTIONS = {
    '패드': ['아이패드', '키패드', '마우스패드', '터치패드', '노트패드', '런치패드', 'ipad'],
    '필터': ['공기청정기 필터', '정수기 필터', '샤워기 필터', '수전 필터'],
    '케이스': ['아이패드 케이스', '맥북 케이스', '이어폰 케이스']
  };

  const activeKeywords = ACCESSORY_KEYWORDS.filter(kw => !q.includes(kw.toLowerCase()));
  
  for (const kw of activeKeywords) {
    if (!t.includes(kw.toLowerCase())) continue;
    
    const exceptions = ACCESSORY_EXCEPTIONS[kw] || [];
    const hasException = exceptions.some(ex => t.includes(ex.toLowerCase()));
    
    if (!hasException) return true;
  }
  return false;
}

const testCases = [
  { title: '애플 아이패드 프로 M4 256GB', query: '아이패드 프로 M4', expected: false },
  { title: '로보락 S8 MaxV Ultra 사이드 브러쉬', query: '로보락 S8 MaxV Ultra', expected: true },
  { title: '아이패드 프로 11인치 케이스', query: '아이패드 프로 M4', expected: true },
  { title: '삼성 비스포크 AI 콤보 세탁기', query: '비스포크 AI 콤보', expected: false },
  { title: '비스포크 AI 콤보 보호필름', query: '비스포크 AI 콤보', expected: true },
  { title: '다이슨 에어랩 멀티 스타일러 정품', query: '다이슨 에어랩 멀티 스타일러', expected: false },
  { title: '다이슨 에어랩 필터', query: '다이슨 에어랩 멀티 스타일러', expected: true },
  { title: '공기청정기 HEPA 필터', query: '공기청정기 필터', expected: false },
  { title: '게이밍 마우스패드 대형', query: '마우스패드', expected: false },
  { title: '로보락 더스트백 5매', query: '로보락 S8 MaxV Ultra', expected: true },
];

let passCount = 0;
testCases.forEach((tc, idx) => {
  const result = isAccessoryLike(tc.title, tc.query);
  const passed = result === tc.expected;
  if (passed) passCount++;
  console.log(`[Test ${idx + 1}] ${passed ? 'PASS' : 'FAIL'} | Title: "${tc.title}", Query: "${tc.query}", Result: ${result}, Expected: ${tc.expected}`);
});

console.log(`\nFinal Result: ${passCount}/${testCases.length} Passed`);
if (passCount === testCases.length) {
  process.exit(0);
} else {
  process.exit(1);
}
