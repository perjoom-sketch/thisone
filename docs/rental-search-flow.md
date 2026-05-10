# 렌탈 상품 검색 흐름 조사 정리

> 범위: 이 문서는 현재 구현 기준으로 일반검색, AI분석, `excludeRental`, `explicitRecurringIntent`, 검색어 의도별 렌탈 후보 처리 흐름을 정리한다. 이번 정책은 일반 네이버 검색 결과에 이미 섞여 들어온 렌탈 상품을 새로 제거하는 것이 아니라, 추가 렌탈 보강과 AI 필터 이후 렌탈 복원을 명시 recurring intent 기반으로 제한하는 데 초점을 둔다.

## 핵심 전제

- 기본 검색 요청은 `/api/search`에서 네이버 쇼핑 검색 → 설정 필터 → 렌탈 후보 보강 → 범용 AI 필터 → 렌탈 후보 복원 → 외부 평판 신호 보강 순서로 처리된다.
- `excludeRental=true`는 최우선 명시 설정 필터로 동작하며, 렌탈성 후보를 제거하고 렌탈 후보 보강과 렌탈 후보 복원을 모두 건너뛰게 한다.
- `excludeRental=false` 또는 미지정이어도 렌탈 후보 보강/복원은 자동 실행되지 않는다.
- 검색어에 명시 recurring intent가 있어 `explicitRecurringIntent=true`일 때만 `${query} 렌탈` 추가 검색을 허용한다.
- `explicitRecurringIntent=true`일 때만 AI 필터 이후 렌탈성 후보 복원을 허용한다.
- `explicitRecurringIntent=false`이면 일반 구매 검색에서는 렌탈 후보 보강/복원을 하지 않는다.
- 단, 일반 네이버 검색 결과 자체에 이미 섞여 들어온 렌탈 상품을 이번 정책에서 무조건 제거하지는 않는다. 제거/분리/감점은 별도 정책 영역이다.
- 범용 AI 필터는 “애매하면 살린다” 원칙과 “관리형 품목의 렌탈은 무관 후보가 아니다” 원칙을 프롬프트 및 로컬 폴백 판단에 반영한다.
- 검색어 정규화는 사용자가 `렌탈` 또는 `구독`을 명시한 일부 가전/관리형 검색어에만 `렌탈 구독 서비스` 표현을 덧붙인다.

## 명시 recurring intent 판정

`explicitRecurringIntent=true`는 검색어에 다음 표현 중 하나가 포함될 때 성립한다.

- `렌탈`
- `구독`
- `대여`
- `임대`
- `정기배송`
- `정기 구독`
- `월납`
- `월 납부`
- `월 이용료`
- `약정`
- `의무사용`
- `의무구독`
- `계약기간`

## 전체 처리 순서

| 단계 | 처리 위치 | 입력/조건 | 현재 동작 | 렌탈 영향 |
|---|---|---|---|---|
| 1. 검색어 수신 | `api/search.js` handler | `q` 또는 `query` 파라미터 | 빈 검색어는 400 응답, 그 외 검색 시작 | 렌탈 판단 전 단계 |
| 2. 검색어 정규화 | `improveQuery(q)` | 원문 검색어 | 쇼핑 조건 수식어를 일부 제거하고, 사용자가 `렌탈`/`구독`을 명시한 일부 품목은 검색어에 `렌탈 구독 서비스`를 보강 | 명시 렌탈/구독 의도 검색어에서만 일반검색 질의가 렌탈 방향으로 확장됨 |
| 3. 일반검색 | `fetchNaverShopItemsExactFirst(q, improvedQ)` | 원문/정규화 검색어 | 원문 우선 검색 후 결과가 적으면 정규화 검색어로 보강 | 네이버 결과 자체에 렌탈 상품이 섞일 수 있음 |
| 4. 결과 매핑 | `mapNaverItems(data.items)` | 네이버 쇼핑 원본 items | title, 가격, 몰명, 카테고리, 배송 정보를 내부 item 구조로 변환 | 렌탈 여부 플래그를 여기서 직접 확정하지는 않음 |
| 5. 명시 설정 필터 | `applySearchSettings(items, req.query)` | `excludeRental`, 중고/직구/무료배송/가격 등 | `excludeRental=true`이면 렌탈성 텍스트가 있는 item을 rejected로 이동하고, 검색어에서 `explicitRecurringIntent`를 계산 | 사용자 제외 설정은 렌탈 의도보다 우선함 |
| 6. 렌탈 후보 보강 | `enrichRentalCapableItems(improvedQ, items, settings)` | `excludeRental=false`, `explicitRecurringIntent=true`, 렌탈 가능 검색어, 기존 렌탈 후보 부족 | `${query} 렌탈`로 추가 검색 후 렌탈성 후보만 병합 | 명시 recurring intent가 없으면 추가 렌탈 검색을 하지 않음 |
| 7. AI분석/범용 필터 | `applyUniversalAIFilter({ query: q, items })` | 일반검색+설정 필터+허용된 렌탈 보강 후 후보 | Gemini → OpenAI → 로컬 폴백 순으로 의미 필터링 | 관리형 품목 렌탈은 제거 기준이 아니라 상품 유형/비교 관점으로 취급 |
| 8. 렌탈 후보 복원 | `restoreRentalItemsIfAllowed(universalItems, itemsBeforeUniversalFilter, settings)` | AI 필터 결과와 필터 전 후보 | `excludeRental=false`이고 `explicitRecurringIntent=true`일 때만 AI 필터에서 빠진 렌탈성 원본 후보를 뒤에 복원 | 명시 recurring intent가 없으면 AI 필터 이후 렌탈 후보를 되붙이지 않음 |
| 9. 평판/검색 신호 보강 | YouTube/review signals | 최종 후보 | 유튜브 평판, 외부 검색 신호, 긍정 신호를 붙임 | 렌탈 포함 여부를 직접 결정하지 않음 |
| 10. 응답 디버그 | response body | 최종 items/rejected/debug | `searchSettingsDebug`, `universalFilterDebug` 등에 설정/보강/필터 정보를 포함 | `searchSettingsDebug.applied.explicitRecurringIntent`, 렌탈 보강/복원 여부를 추적 가능 |

## `excludeRental` 및 `explicitRecurringIntent` 상태별 흐름

| 상태 | 일반검색 결과 내 렌탈 후보 | 렌탈 후보 보강 | AI분석 이후 렌탈 복원 | `rejectedItems` 렌탈 노출 | 해석 |
|---|---|---|---|---|---|
| `excludeRental=true` | 설정 필터에서 렌탈성 item 제거 | 실행 안 함 | 실행 안 함 | 설정 필터 rejected에 “설정: 렌탈 제외”로 포함 가능 | 사용자가 렌탈 제외를 명시한 최우선 흐름 |
| `excludeRental=false` 또는 미지정 + `explicitRecurringIntent=false` | 검색 결과에 이미 있으면 이번 정책에서 새로 제거하지는 않음 | 실행 안 함 | 실행 안 함 | AI rejected 중 렌탈성 item은 응답 rejected에서 제외될 수 있음 | 일반 구매 검색에서는 추가로 렌탈을 끌어오거나 되붙이지 않는 흐름 |
| `excludeRental=false` 또는 미지정 + `explicitRecurringIntent=true` | 검색 결과에 있으면 유지 | 렌탈 가능 검색어이고 기존 렌탈 후보가 부족하면 `${query} 렌탈` 추가 검색 | AI 필터에서 빠진 렌탈성 후보를 원본 후보에서 복원 | AI rejected 중 렌탈성 item은 응답 rejected에서 제외될 수 있음 | 사용자가 렌탈/구독/대여 등 recurring intent를 명시한 흐름 |

## 검색어 의도별 흐름

| 검색어/의도 유형 | 대표 예시 | 정규화/일반검색 | `excludeRental=false` 흐름 | `excludeRental=true` 흐름 | 주의점 |
|---|---|---|---|---|---|
| 일반 구매 의도 | `로봇청소기`, `공기청정기`, `정수기`, `음식물처리기` | 원문 우선, 필요 시 정규화 검색어 보강 | `explicitRecurringIntent=false`이므로 렌탈 후보 보강/복원은 실행하지 않음. 단, 일반검색 결과에 이미 섞인 렌탈 상품은 이번 정책에서 무조건 제거하지 않음 | 렌탈성 후보는 설정 필터에서 제거 | 일반 구매 검색의 렌탈 제거/분리/감점은 다음 정책에서 별도 처리 |
| 명시 렌탈/구독/대여 의도 | `정수기 렌탈`, `공기청정기 구독`, `안마의자 월 납부` | 일부 품목에서 `렌탈 구독 서비스` 표현이 검색어에 추가될 수 있음 | `explicitRecurringIntent=true`이면 렌탈 후보 보강/복원이 허용됨 | 사용자가 동시에 렌탈 제외를 켜면 설정 필터가 우선 | 검색어 의도와 사용자 설정이 충돌하면 `excludeRental=true`가 우선 |
| rental-capable 범위 밖의 명시 대여 의도 | `노트북 대여` | 원문 우선 검색 | `explicitRecurringIntent=true`지만 현재 렌탈 후보 보강은 기존 rental-capable 품목 범위 안에서만 동작하므로 추가 보강 확대 대상은 아님 | 렌탈성 후보는 설정 필터에서 제거 | 노트북처럼 rental-capable 목록에 없는 품목의 보강 확대는 다음 PR에서 별도로 다룸 |
| 관리형 품목 의도 | `정수기`, `비데`, `안마의자`, `음식물처리기` | 일반검색 기반 | 명시 recurring intent가 없으면 렌탈 보강/복원은 하지 않지만, AI 필터와 로컬 폴백에서 렌탈을 무관 후보로 보지 않음 | 렌탈 제외 설정이면 제거 | 렌탈은 제거 기준이 아니라 구매/렌탈 비교 관점으로 설명될 수 있음 |
| 액세서리/부품 의도 | `필터`, `리필`, `노즐`, `브러시` 포함 검색 | intent detector가 부품 의도로 분기 가능 | 부품 의도에 맞는 후보 중심으로 필터링되며, 렌탈 여부보다 액세서리 여부가 중요 | 렌탈성 후보는 설정 필터로 먼저 제거될 수 있음 | `비데 노즐`, `김서방마스크 리필` 등 일부 예외는 본품 의도 오판을 줄이도록 처리 |
| 애매한 검색어 | 브랜드/모델명만 있는 검색 | 원문 우선 검색 | 범용 필터는 애매하면 살리는 방향. 단, 명시 recurring intent가 없으면 렌탈 보강/복원은 실행하지 않음 | 렌탈 제외 설정이 켜져 있으면 제거 | 렌탈 보강 여부는 명시 recurring intent와 rental-capable 검색어 패턴 모두에 좌우됨 |

## 일반검색 / AI분석 / 렌탈 정책 상호작용 표

| 축 | 일반검색 | AI분석 | `excludeRental` / `explicitRecurringIntent` | 결과 영향 |
|---|---|---|---|---|
| 후보 생성 | 네이버 쇼핑 API와 exact-first 보강이 담당 | 후보 생성이 아니라 후보 의미 분류 담당 | `excludeRental=true`는 생성된 후보 중 렌탈성 후보를 제거 | 생성과 필터가 분리되어 있음 |
| 렌탈 후보 추가 | 일반검색 결과에 이미 렌탈 상품이 섞일 수 있음 | 추가 검색을 직접 수행하지 않음 | `excludeRental=false`이고 `explicitRecurringIntent=true`이며 rental-capable 품목일 때만 별도 렌탈 검색 허용 | 일반 구매 검색에서는 추가 렌탈 보강을 하지 않음 |
| 렌탈 후보 제거 | 일반검색 단계 자체에서는 제거하지 않음 | 명확한 무관/판촉/액세서리 판단 시 제외 가능하나 관리형 렌탈은 보존 원칙 | `excludeRental=true`이면 설정 필터가 가장 명확한 제거 경로 | 이번 정책은 일반검색에 이미 포함된 렌탈 상품을 새로 일괄 제거하지 않음 |
| 렌탈 후보 복원 | AI 이전 후보를 보관 | 필터링 결과에서 빠진 렌탈 후보가 있을 수 있음 | `excludeRental=false`이고 `explicitRecurringIntent=true`일 때만 복원 | 일반 구매 검색에서는 AI가 제외한 렌탈 후보를 다시 붙이지 않음 |
| 디버그 확인 | `naverQueryDebug`, `searchSettingsDebug.rentalEnrichment` | `universalFilterDebug` | `searchSettingsDebug.applied.excludeRental`, `searchSettingsDebug.applied.explicitRecurringIntent` | 런타임 조사 시 어느 단계에서 변했는지 추적 가능 |

## 현재 한계 및 후속 과제

- 이번 PR은 기존 rental-capable 품목 범위 안에서만 `explicitRecurringIntent`를 적용한다.
- 따라서 `노트북 대여`처럼 `explicitRecurringIntent=true`이지만 rental-capable 목록에 없는 품목은 `${query} 렌탈`/대여성 추가 검색 보강 대상으로 확대되지 않는다.
- rental-capable 목록 밖 품목의 렌탈/대여 보강 확대, 일반 구매 검색에서의 렌탈 후보 제거/분리/감점 정책은 다음 PR에서 별도로 다룬다.

## 조사 기준 파일

- `api/search.js`: 검색 API의 전체 파이프라인, `excludeRental` 설정 필터, `explicitRecurringIntent` 판정, 렌탈 후보 보강/복원, 응답 디버그 구성.
- `lib/queryNormalizer.js`: 검색어 정규화와 명시 렌탈/구독 검색어 확장 조건.
- `lib/universalFilter.js`: AI 필터 모델/폴백 체인, 관리형 렌탈 판단 프롬프트, 로컬 폴백의 렌탈 보존 로직.
- `lib/intentDetector.js`: 본품/액세서리 검색 의도 분기.
- `js/api.js`: 클라이언트 검색/의도분석 요청과 타임아웃, AI 채팅 요청 전 렌탈 reasoning instruction 적용.
