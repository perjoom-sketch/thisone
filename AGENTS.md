# AGENTS.md

==============================================
## 1. 절대 규칙 (영구 · 바꾸지 말 것)
==============================================

### 레이아웃 원칙
- 모든 레이아웃은 목록형(행 나열) 구조로 통일
- PC/모바일 동일 구조, 폭만 반응형으로 변화
- 카드 그리드 구조 금지 (쿠팡/네이버쇼핑 스타일 목록형 유지)

### 반응형 원칙
- 고정 px 너비(width, max-width) 금지
- 모든 치수는 clamp() / min() / max() / vw 기반
- 모바일 브레이크포인트: 640px (아이폰 12에서 검증됨)

### 코드 수정 원칙
- 원본 코드의 상수/설정값 임의 변경 금지
- 명시적 지시 없이 "개선" 금지
- 코드 변경과 무관한 파일 건드리기 금지

### 시스템 환경 관리
- 작업 시작 및 완료 시 반드시 노트북 저장공간(C드라이브) 확인
- 여유 공간이 5GB 미만일 경우 사용자에게 즉시 보고 및 정화 작업 제안

==============================================
## 2. 현재 작업 및 프로젝트 방향성 (이번 세션)
==============================================

### 프로젝트 방향 (Project Direction)
ThisOne은 단순 쇼핑 검색에서 확장하여 **공유형 AI 입력 서비스(shared AI input service)**로 나아갑니다.
- **핵심 원칙 (Core principle)**:
  - 입력(input)은 공통으로 공유됨
  - 처리 정책(processing policy)은 모드별로 개별 적용
  - 다중 첨부 파일은 적절한 경우 하나의 입력 번들(input bundle)로 취급됨

### 최근 병합된 PR (Merged PRs)
- #369 shared attachment input policy foundation
- #370 multiple attachments as one input bundle
- #371 multi-image paste in interpretation mode
- #372 submit all Document AI attachment bundle files

### 현재 Document AI 상태 (Current Status)
- 해석(Document AI) 모드는 컴포저에서 다중 첨부를 지원함
- 붙여넣기/첨부된 파일은 `selectedFiles[]`에 저장됨
- 프론트엔드는 백엔드로 `files[]` 배열을 전송함
- 백엔드는 `files[]`를 하나의 번들로 처리하고, 통합된 하나의 응답을 반환함
- 기존 단일 파일 동작(legacy single file behavior)은 여전히 보존됨

### 다음 우선순위 (Next Priority)
**Document AI의 PDF 읽기 신뢰성 향상 (fix PDF reading reliability)**
- PDF 전용 타임아웃 (PDF-specific timeout)
- 업로드 사이즈 검토 (upload size review)
- `pdfReadStatus` 명확한 초기화 (clear pdfReadStatus)
- 실패한 PDF를 성공한 척 읽지 않기 (never pretend to read failed PDFs)
- 아직 문서 세션(document session) 작업 안 함
- 아직 보충 검색(supplemental search) 작업 안 함

### PR 규율 (PR Discipline)
PR은 작고 분리된 상태로 유지할 것 (Keep PRs small and separated).
**절대 아래 항목을 섞지 말 것 (Do not mix)**:
- 공통 컴포저 변경 (common composer changes)
- PDF 신뢰성 (PDF reliability)
- 문서 세션 (document session)
- 후속 Q&A (follow-up Q&A)
- 보충 검색 (supplemental search)
- 분석기 (analytics)
- 쇼핑 랭킹 (shopping ranking)

### Antigravity 역할 및 보고 규칙
Antigravity는 명시적인 지시가 없는 한 파일을 편집하지 않으며, 주로 **브라우저 기반 QA(Browser-based QA)** 에 사용되어야 합니다.
- 역할: 로컬 앱 시작, 브라우저 열기, UI 테스트, 콘솔/네트워크 검사, 스크린샷 캡처, 통과/실패 보고
- **보고 스타일 (Keep report concise):**
  - 현재 브랜치 (current branch)
  - 변경된 파일 (changed files)
  - 테스트 결과 (test result)
  - 콘솔/네트워크 에러 (console/network errors)
  - 스크린샷 (브라우저 QA 시)

**(주의)** 완료되지 않은 작업을 지어내지 말 것. 패키지 파일을 변경하지 말 것.

==============================================
## 3. 검증 프로토콜 (영구 · 절대 어기지 말 것)
==============================================

### 검증 엄격 규칙

1. "완료" 선언 전 다음을 모두 만족해야 함:
   - 동일 작업 최소 3회 반복 테스트
   - 3회 모두 동일한 성공 결과
   - Vercel 로그 에러 0개
   - Console 에러 0개

2. 간헐적 성공은 실패로 간주
   - 1회 성공 + 2회 실패 = 실패
   - 3회 연속 성공해야만 통과

3. 수정 전 반드시:
   - 원인을 구체적으로 특정 (추측 금지)
   - 수정 계획을 텍스트로 명시
   - 사용자 확인 후 실행

4. 금지 표현/행동:
   - "대략 해결됐습니다" 금지
   - 근거 없는 "성공" 선언 금지
   - 한두 번 테스트로 판단 종결 금지

### 필수 검증 항목 (이번 작업)

**뷰포트 3구간 테스트:**
- 1920px (PC 대형)
- 1366px (노트북)
- 390px (iPhone 12)

**3구간 전부에서 확인:**
- 목록형 "행 나열" 구조 유지
- 좌우 빈 박스 없음
- 가로 스크롤 없음
- 글자 세로 쌓임 없음
- Console 에러 0개

**검색 테스트 (3회 연속 성공 필요):**
- 로보락 S8 MaxV Ultra
- 다이슨 에어랩 멀티 스타일러
- 비스포크 AI 콤보

### 완료 보고 제출물

1. Console 스크린샷 (PC 1920px + 노트북 1366px + 모바일 390px)
2. 검색 결과 스크린샷 (3개 제품 × 3개 뷰포트 = 9장)
3. 수정한 파일 목록 및 변경 사유
4. Network 탭 실패 요청 리포트
5. AGENTS.md 업데이트 확인

모든 검증 통과 후에만 git commit + push.
검증 스킵 절대 금지.
### 디자인 톤 원칙
- 메인 카피: 과도한 폰트 크기/굵기/검정색 금지
- 브랜드 톤: 블루 포인트 + 라이트 그레이 베이스
- 배지/보조 UI 요소는 기능과 시각적으로 연결되어야 함
  (떨어진 위치 = 의미 전달 실패)
 ### 사용 LLM 모델 (이중화 체계)
   - **Primary (1순위)**: gemini-2.5-flash
     - API 버전: v1 (안정 엔드포인트)
     - 연동: Google Generative AI SDK
   - **Secondary (2순위 폴백)**: gpt-5.4-mini
     - 역할: Gemini 503(과부하) 또는 타임아웃 발생 시 즉시 전환
     - 연동: OpenAI API (Standard Fetch)
   
   금지 모델:
   - gemini-1.0-*, gemini-1.5-* (종료됨)
   - gemini-2.0-* (2026-06-01 종료 예정)
- Fallback 체인: Gemini(AI) → OpenAI(GPT) → Naver 일반 검색(Local)
- 타임아웃: 20초 (각 단계별 개별 타임아웃 관리)
- 지연 경고 표시: 8초
### 배포 전 필수 검증 (영구 규칙)

1. 코드 수정 후 필수: node -c [파일경로]로 문법 검사
2. 문법 오류 있으면 push 금지
3. 로컬에서 최소 1회 실행 테스트
4. 위 검증 없이 "완료" 선언 금지
5. Vercel 빌드 Ready = 작동 보장이 아님을 인지

