# ThisOne project file tree backup

이 문서는 현재 저장소의 파일 구조를 사람이 읽기 쉬운 형태로 백업한 스냅샷이다. 런타임 코드, API, 스타일, 스크립트 동작은 변경하지 않는다.

## 파일 트리 스냅샷

```text
.
├── .ai_instructions
├── AGENTS.md
├── ads/
│   ├── .gitkeep
│   ├── thisone_banner_A_mobile_320x100.png
│   ├── thisone_banner_A_mobile_320x100@2x.png
│   ├── thisone_banner_A_pc_728x90.png
│   ├── thisone_banner_A_pc_728x90@2x.png
│   ├── thisone_banner_B_mobile_320x100.png
│   ├── thisone_banner_B_mobile_320x100@2x.png
│   ├── thisone_banner_B_pc_728x90.png
│   └── thisone_banner_B_pc_728x90@2x.png
├── api/
│   ├── aliexpress.js
│   ├── analyticsSummary.js
│   ├── autocomplete.js
│   ├── chat.js
│   ├── cron/
│   │   └── synthetic-search.js
│   ├── diagnose-review-signals.js
│   ├── diagnose-search.js
│   ├── documentAi.js
│   ├── homeMeal.js
│   ├── inquiry.js
│   ├── instantAnswer.js
│   ├── intentInfer.js
│   ├── logStore.js
│   ├── loveme.js
│   ├── review-signal-diagnostics.js
│   ├── search/
│   │   ├── full.js
│   │   └── raw.js
│   ├── search.js
│   ├── stats.js
│   ├── track.js
│   ├── trackEvent.js
│   ├── trends.js
│   └── webSearch.js
├── assets/
│   ├── piki/
│   │   ├── piki-annoyed.png
│   │   ├── piki-throwing-left.png
│   │   ├── piki-throwing-right.png
│   │   ├── piki-working-left.png
│   │   └── piki-working-right.png
│   └── thisone-logo-rough.png
├── data/
│   ├── categoryMap.json
│   ├── search-keyword-db.json
│   └── synthetic-queries.json
├── docs/
│   ├── aliexpress-integration-suspended.md
│   ├── analytics-event-tracking.md
│   ├── piki-transparent-asset-workflow.md
│   ├── project-file-tree.md
│   ├── rental-search-flow.md
│   ├── service-image-input-behavior-audit.md
│   ├── source-backed-ai-principle.md
│   └── thisone-signal-event-schema.md
├── js/
│   ├── ai_tool_voice_input.js
│   ├── api.js
│   ├── composer_image_input.js
│   ├── config.js
│   ├── default_patience_patch.js
│   ├── document_ai_shell.js
│   ├── esc_cancel_patch.js
│   ├── home_meal_shell.js
│   ├── image_text_policy_patch.js
│   ├── inquiry_admin_patch.js
│   ├── inquiry_manager.js
│   ├── instant_answer_shell.js
│   ├── loveme_shell.js
│   ├── mobile_search_safety_patch.js
│   ├── model_dedupe_patch.js
│   ├── productFamilies.js
│   ├── ranking.js
│   ├── rental_policy.js
│   ├── result_cards.js
│   ├── search_dropdown.js
│   ├── search_help_modal.js
│   ├── search_input_tools.js
│   ├── sort.js
│   ├── thisone_app_v3_final.js
│   ├── thisone_event_tracker.js
│   ├── thisone_ui_v3.js
│   ├── trajectoryLogger.js
│   ├── voice_search.js
│   └── web_search_shell.js
├── lib/
│   ├── analyticsStore.js
│   ├── canonicalIntent.js
│   ├── categoryRole.js
│   ├── intentDetector.js
│   ├── queryNormalizer.js
│   ├── ranking.js
│   ├── recurringOffer.js
│   ├── rental_policy.js
│   ├── reviewSignals.js
│   ├── searchAdapter.js
│   ├── universalFilter.js
│   └── youtubeReputation.js
├── styles/
│   ├── main.css
│   ├── main.css.bak.20260420
│   ├── main.css.new
│   ├── search-two-row.css
│   └── theme-modern.css
├── tools/
│   ├── analytics-summary.html
│   ├── batch-diagnostics.html
│   ├── review-signal-diagnostics.html
│   ├── search-diagnostics.html
│   └── seed-autocomplete.html
├── git-sync.ps1
├── index.html
├── index.html.bak.20260420
├── index.html.new
├── package.json
├── robots.txt
├── sitemap.xml
├── sort_youtube_ranking_diagnosis.md
├── test.js
└── vercel.json
```

## 주요 최상위 파일과 디렉터리

- `AGENTS.md`: 이 저장소에서 작업할 때 지켜야 하는 레이아웃, 반응형, 검증, 배포 전 확인 규칙.
- `.ai_instructions`: AI 작업 관련 보조 지침 파일.
- `index.html`: ThisOne 웹 앱의 메인 HTML 엔트리.
- `api/`: Vercel 서버리스 API 엔드포인트 모음.
- `js/`: 브라우저에서 실행되는 프런트엔드 기능 모듈.
- `styles/`: 메인 UI, 검색 행, 현대화 테마 관련 CSS.
- `lib/`: API와 서버 로직에서 공유하는 검색, 랭킹, 분석, 정규화 유틸리티.
- `tools/`: 운영자/개발자용 진단 및 요약 HTML 도구 페이지.
- `docs/`: 설계 원칙, 감사 기록, 데이터 스키마, 작업 흐름 문서.
- `ads/`: ThisOne 배너 광고 이미지 자산.
- `assets/`: 로고와 Piki 캐릭터 이미지 자산.
- `data/`: 카테고리 매핑, 검색 키워드 DB, 합성 검색어 데이터.
- `package.json`: Node 의존성 정의.
- `vercel.json`: Vercel 배포 헤더 및 라우팅 설정.
- `git-sync.ps1`: Git 동기화용 PowerShell 보조 스크립트.
- `test.js`: 로컬 테스트 또는 실험용 JavaScript 파일.
- `sort_youtube_ranking_diagnosis.md`: YouTube 랭킹/정렬 진단 문서.

## `api/` 파일 목적

- `api/aliexpress.js`: AliExpress API 서명, 요청, 상품 검색 연동을 담당한다.
- `api/analyticsSummary.js`: 수집된 analytics 이벤트를 요약해 도구 페이지에서 읽을 수 있는 형태로 제공한다.
- `api/autocomplete.js`: 검색어 자동완성 후보와 캐시를 제공한다.
- `api/chat.js`: 채팅형 질의 응답 및 AI 폴백 흐름을 처리한다.
- `api/cron/synthetic-search.js`: 예약 실행용 합성 검색 작업 엔드포인트.
- `api/diagnose-review-signals.js`: 리뷰 신호 수집/판정 로직을 진단한다.
- `api/diagnose-search.js`: 검색 결과 분류, 필터링, 의도 판정 상태를 진단한다.
- `api/documentAi.js`: 문서/증명서 관련 AI 질의 응답 서비스를 제공한다.
- `api/homeMeal.js`: 집밥/식단 관련 AI 서비스 엔드포인트.
- `api/inquiry.js`: 사용자 문의 접수 또는 조회 API.
- `api/instantAnswer.js`: 즉답형 AI 응답 서비스를 제공한다.
- `api/intentInfer.js`: 사용자 검색어의 의도와 카테고리를 추론한다.
- `api/logStore.js`: 로그 저장 또는 조회를 위한 API.
- `api/loveme.js`: LoveMe 서비스용 백엔드 API.
- `api/review-signal-diagnostics.js`: 리뷰 신호 진단 결과를 별도 형태로 제공한다.
- `api/search.js`: 메인 상품 검색 API.
- `api/search/full.js`: 전체 검색 흐름 또는 상세 검색 결과 제공용 하위 엔드포인트.
- `api/search/raw.js`: 가공 전 원본 검색 결과 확인용 하위 엔드포인트.
- `api/stats.js`: 서비스 통계 또는 카운터 조회 API.
- `api/track.js`: 기존 추적 이벤트 수집용 API.
- `api/trackEvent.js`: analytics 이벤트 수집 전용 API.
- `api/trends.js`: 트렌드/인기 검색 관련 API.
- `api/webSearch.js`: 웹 검색 기반 응답 또는 보조 검색 API.

## `js/` 파일 목적

- `js/ai_tool_voice_input.js`: AI 도구 영역의 음성 입력을 보조한다.
- `js/api.js`: 프런트엔드에서 API를 호출하는 공통 래퍼.
- `js/composer_image_input.js`: 입력 컴포저의 이미지 첨부 UI/상태를 관리한다.
- `js/config.js`: 클라이언트 전역 설정과 상수.
- `js/default_patience_patch.js`: 기본 대기/인내 메시지 UX 패치.
- `js/document_ai_shell.js`: 문서 AI 모드 프런트엔드 셸.
- `js/esc_cancel_patch.js`: ESC 키 취소 동작 패치.
- `js/home_meal_shell.js`: 집밥/식단 모드 프런트엔드 셸.
- `js/image_text_policy_patch.js`: 이미지/텍스트 입력 정책 UI 패치.
- `js/inquiry_admin_patch.js`: 문의 관리자 화면 보조 패치.
- `js/inquiry_manager.js`: 문의 관리 UI와 데이터 흐름.
- `js/instant_answer_shell.js`: 즉답 모드 프런트엔드 셸.
- `js/loveme_shell.js`: LoveMe 모드 프런트엔드 셸.
- `js/mobile_search_safety_patch.js`: 모바일 검색 UI 안정화 패치.
- `js/model_dedupe_patch.js`: 모델/결과 중복 방지 패치.
- `js/productFamilies.js`: 제품군 분류 또는 제품 패밀리 데이터 처리.
- `js/ranking.js`: 클라이언트 측 랭킹 보조 로직.
- `js/rental_policy.js`: 렌탈/구독 관련 프런트엔드 정책 로직.
- `js/result_cards.js`: 검색 결과 행/카드 렌더링 로직.
- `js/search_dropdown.js`: 검색 드롭다운 UI 동작.
- `js/search_help_modal.js`: 검색 도움말 모달 UI.
- `js/search_input_tools.js`: 검색 입력창 주변 도구와 입력 보조 기능.
- `js/sort.js`: 결과 정렬 UI/로직.
- `js/thisone_app_v3_final.js`: ThisOne 메인 앱 오케스트레이션 스크립트.
- `js/thisone_event_tracker.js`: 프런트엔드 analytics 이벤트 전송 스크립트.
- `js/thisone_ui_v3.js`: ThisOne v3 UI 렌더링 및 상태 관리.
- `js/trajectoryLogger.js`: 사용자 흐름 또는 검색 궤적 로깅 보조.
- `js/voice_search.js`: 검색 음성 입력 기능.
- `js/web_search_shell.js`: 웹 검색 모드 프런트엔드 셸.

## `styles/` 파일

- `styles/main.css`: 메인 레이아웃, 검색 화면, 결과 목록, 반응형 스타일의 중심 CSS.
- `styles/search-two-row.css`: 검색 영역의 두 줄 레이아웃 관련 CSS.
- `styles/theme-modern.css`: 현대화된 색상, 표면, UI 톤 관련 CSS.
- `styles/main.css.bak.20260420`: 과거 `main.css` 백업본.
- `styles/main.css.new`: 새 스타일 작업 또는 비교용 파일.

## `tools/` 페이지

- `tools/analytics-summary.html`: analytics 이벤트 요약을 확인하는 도구 페이지.
- `tools/batch-diagnostics.html`: 여러 진단 작업을 묶어서 실행/확인하는 페이지.
- `tools/review-signal-diagnostics.html`: 리뷰 신호 진단용 페이지.
- `tools/search-diagnostics.html`: 검색 결과와 검색 파이프라인 진단용 페이지.
- `tools/seed-autocomplete.html`: 자동완성 시드 데이터 입력/확인용 페이지.

## `docs/` 파일

- `docs/aliexpress-integration-suspended.md`: AliExpress 연동 보류 상태와 관련 기록.
- `docs/analytics-event-tracking.md`: analytics 이벤트 수집 설계와 추적 흐름 문서.
- `docs/piki-transparent-asset-workflow.md`: Piki 투명 이미지 자산 작업 절차.
- `docs/project-file-tree.md`: 현재 프로젝트 파일 트리 백업 문서.
- `docs/rental-search-flow.md`: 렌탈/구독 검색 흐름과 판정 원칙.
- `docs/service-image-input-behavior-audit.md`: 서비스별 이미지 입력 동작 감사 문서.
- `docs/source-backed-ai-principle.md`: 외부 근거 기반 AI 응답 원칙.
- `docs/thisone-signal-event-schema.md`: 향후 ThisOne 신호 이벤트 스키마 계획.

## SEO 파일

- `sitemap.xml`: 검색 엔진에 ThisOne 사이트 URL과 갱신 우선순위를 알려주는 사이트맵.
- `robots.txt`: 크롤러 접근 허용 정책과 사이트맵 위치를 안내한다.

## Analytics 관련 파일

- `api/trackEvent.js`: 클라이언트 analytics 이벤트를 서버에서 검증하고 저장하는 수집 엔드포인트.
- `api/analyticsSummary.js`: 저장된 analytics 이벤트의 기간별 요약과 breakdown을 제공하는 조회 엔드포인트.
- `api/resetAnalytics.js`: 현재 저장소에는 존재하지 않는다.
- `lib/analyticsStore.js`: analytics 이벤트 저장 키, 집계, 요약 조회를 담당하는 서버 공용 저장소 유틸리티.
- `js/thisone_event_tracker.js`: 브라우저에서 page view, source click, search submit 등 이벤트를 수집 API로 전송하는 스크립트.
- `tools/analytics-summary.html`: analytics 요약 API를 호출해 운영자가 읽을 수 있는 표로 보여주는 HTML 도구.

## 주의할 점

- analytics KV key와 keyword/search KV key를 섞지 않는다.
- analytics key는 반드시 `analytics:` prefix를 사용한다.
- keyword/search 데이터는 향후 ThisOne 관련 키워드 교체를 위해 사용하는 데이터로 구분한다.
- 작은 PR 단위로만 변경한다.
- 명시적으로 요구되지 않는 한 하나의 PR에서 여러 서비스 모드를 동시에 수정하지 않는다.
- 명시적으로 요청되지 않는 한 Piki 또는 이미지 생성 기능을 추가하지 않는다.
- 이 문서는 구조 스냅샷이며, 비밀값이나 환경 변수 값을 포함하지 않는다.
