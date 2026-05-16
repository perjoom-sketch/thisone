# Analytics Classification Audit

## Purpose

This document audits the current ThisOne analytics classification and summary-dashboard behavior. It is documentation-only and does not propose behavior changes in this PR.

The key finding is that the **browser classification setting** and the **dashboard data view** are separate concepts:

- The browser setting controls the `isInternal` value attached to **future events from the current browser/profile**.
- The analytics summary page reads and renders **shared central aggregate totals** from KV/Redis. It does not filter those totals based on the current browser's classification.

## 1. Current data flow

```text
Browser event
→ js/thisone_event_tracker.js
→ POST /api/trackEvent
→ api/trackEvent.js
→ lib/analyticsStore.js
→ KV/Redis analytics:* aggregate keys
→ GET /api/analyticsSummary
→ api/analyticsSummary.js
→ tools/analytics-summary.html
```

Detailed flow:

1. `js/thisone_event_tracker.js` builds allowed analytics events in the browser. It adds `isInternal`, anonymous `visitorId`, timestamp, path, mode, sanitized query, and sanitized metadata.
2. The browser sends the event JSON to `/api/trackEvent` with `fetch()`.
3. `api/trackEvent.js` parses the request body, fills `userAgentCategory` when missing, sanitizes the event through `sanitizeEvent()`, skips admin summary page paths, and calls `storeAnalyticsEvent(event)`.
4. `lib/analyticsStore.js` writes Redis/KV aggregate commands when KV/Redis REST credentials are configured. If storage is unavailable or fails, tracking falls back safely to console or legacy remote storage without surfacing errors to users.
5. `api/analyticsSummary.js` reads the aggregate summary from `readAnalyticsSummary()`, normalizes the shape, and returns JSON to the summary page.
6. `tools/analytics-summary.html` calls `GET /api/analyticsSummary` and renders the returned aggregate numbers.

## 2. Browser classification behavior

### What the setting does

The setting marks the **current browser/profile** as either internal test traffic or real-user traffic for future outgoing tracking events.

The browser tracker stores and reads the classification using:

- `localStorage` key: `thisone_internal_user`
- cookie name: `thisone_internal_user`
- shared cookie domain: `.thisone.me`
- additional clear targets: `.thisone.me`, `thisone.me`, and `www.thisone.me`

`isInternal` is calculated in `js/thisone_event_tracker.js` by `isInternalUser()`, which returns true when either `localStorage.thisone_internal_user === "true"` or a visible `thisone_internal_user=true` cookie exists.

### Current browser/profile scope

The setting is local to the browser storage context:

- Chrome and Edge have separate localStorage/cookie jars, so one can be internal while the other is real user.
- Different browser profiles can also differ.
- Different devices can differ.
- The setting does not modify historical events that have already been stored.

### www/non-www behavior after #340

After #340 (`fix: share internal analytics setting across domains`), setting internal mode writes both:

- a shared `.thisone.me` cookie, intended to work across `thisone.me` and `www.thisone.me`; and
- a host-only cookie as an additional same-host fallback.

As a result, the same browser can keep the internal classification when moving between apex and `www` hosts, assuming the shared cookie is accepted and visible.

### Clearing behavior after #347

After #347 (`fix: correctly clear internal analytics classification`), clearing internal mode removes the localStorage marker and expires multiple cookie variants:

- host-only cookie
- `.thisone.me`
- `thisone.me`
- `www.thisone.me`

After clearing, future events from that browser are sent with `isInternal: false` as long as neither localStorage nor a visible cookie still marks the browser internal.

## 3. Stored aggregate behavior

### Global/shared counts

KV/Redis stores daily aggregate keys under the `analytics:` prefix. These keys are central/shared for the app environment, not per browser. Every browser that opens the summary page reads the same backing keys.

The current write path increments these global/shared counters and sets:

- `analytics:day:{YYYY-MM-DD}:events`
- `analytics:day:{YYYY-MM-DD}:events:internal` or `analytics:day:{YYYY-MM-DD}:events:external`
- `analytics:day:{YYYY-MM-DD}:eventName:{eventName}`
- `analytics:day:{YYYY-MM-DD}:mode:{mode}`
- `analytics:day:{YYYY-MM-DD}:eventNames`
- `analytics:day:{YYYY-MM-DD}:modes`

For `page_view` events only, it also writes:

- `analytics:day:{YYYY-MM-DD}:pageViews`
- `analytics:day:{YYYY-MM-DD}:visitors`
- `analytics:day:{YYYY-MM-DD}:visitors:internal` or `analytics:day:{YYYY-MM-DD}:visitors:external`

### What is split by internal/external

Currently split by internal/external:

- total event count via `events:internal` and `events:external`
- unique visitor sets for page views via `visitors:internal` and `visitors:external`

Currently **not** split by internal/external:

- `pageViews` is a single total count only.
- `mode:{mode}` is a single total count only.
- `eventName:{eventName}` is a single total count only.
- `byMode` and `byEventName` breakdowns are therefore not filterable by internal/external with the current aggregate keys.

Important nuance: events are split by internal/external at the total-event level, but event-name and mode breakdowns are not split. Page views are stored as one global total, while visitors are split into internal/external sets.

### How daily aggregates are read

`readAnalyticsSummary()` reads the last 30 KST date keys. For each date it reads:

- total events
- external events
- internal events
- page views
- total visitors
- external visitors
- internal visitors
- known modes
- known event names

It then reads the per-mode and per-event-name totals and returns:

- `today`
- `last7Days`
- `last30Days`
- `byMode`
- `byEventName`
- `daily`

## 4. Dashboard behavior

### Why Chrome and Edge show the same dashboard numbers

Chrome and Edge can have different browser classifications because classification is stored in each browser/profile. However, `tools/analytics-summary.html` fetches `/api/analyticsSummary`, which reads shared central aggregate totals from KV/Redis.

Therefore:

- Chrome classified as internal test reads the same central summary totals.
- Edge classified as real user reads the same central summary totals.
- The dashboard numbers can be identical on both browsers, and that is expected with the current implementation.

### Does classification filter the dashboard?

No. The current browser classification controls the `isInternal` value on future tracking payloads. It does **not** apply a dashboard view filter.

The summary UI displays some internal/external aggregate fields that already exist, such as external/internal visitors and external events. But the page does not switch the whole dashboard between "all", "real users only", and "internal tests only" based on the operator setting.

### Does changing classification change only future tracking?

Yes. Changing the browser classification affects new events emitted after the change. It does not rewrite existing KV/Redis counts, and it does not change which aggregate totals the summary page fetches or renders.

## 5. Identified UX problem

The current UI can be misleading because it places a browser-level classification control near central dashboard metrics.

The setting means:

> "Classify future events from this browser/profile as internal test or real user."

It does not mean:

> "Filter the dashboard to show internal test data or real-user data."

This explains the operator confusion: if Chrome says "internal test" and Edge says "real user", it is natural to expect the dashboard numbers to differ. In the current design, they do not differ because both pages read the same central aggregate summary.

## 6. Recommendation

Recommended approach: **Option C first, then Option B.**

### Option C: extend aggregation before adding a full dashboard filter

Before adding a dashboard-wide filter, extend aggregation so all displayed metrics can be filtered consistently. At minimum, add split keys for:

- `externalPageViews`
- `internalPageViews`
- `externalEvents`
- `internalEvents` (already exists at total level)
- internal/external mode breakdowns
- internal/external event-name breakdowns

The current store already has `events:internal`, `events:external`, `visitors:internal`, and `visitors:external`, but it does not split page views, mode breakdowns, or event-name breakdowns. A full dashboard filter would otherwise have to mix filtered and unfiltered metrics, which would likely create more confusion.

### Option B: add a separate dashboard view filter after split data exists

Once the aggregate data supports consistent filtering, add a distinct dashboard filter control:

- 전체
- 실제 사용자만
- 내부 테스트만

This filter should be visually and textually separate from the current-browser classification setting.

### Option A: short-term wording improvement

As a smaller interim UI PR, keep the shared dashboard but rename the setting to:

> 현재 브라우저 기록 분류

Add explanatory copy:

> 이 설정은 통계 화면의 숫자를 바꾸는 필터가 아닙니다.

This is the lowest-risk UX clarification and can happen before the aggregation/filter work.

## 7. Proposed next PR

Suggested next PR title:

```text
fix: clarify analytics browser classification setting
```

Suggested scope:

- Rename the operator setting label to `현재 브라우저 기록 분류`.
- Add helper text stating that the setting only affects future events from the current browser/profile.
- Add helper text stating that it is not a dashboard filter and does not change the displayed summary numbers.
- Do not change tracking logic, KV keys, or summary API behavior in that PR.

A follow-up data/model PR can then add internal/external split aggregate keys for page views and breakdowns before introducing the full dashboard filter.

## Direct answers to audit questions

1. **What does “internal test” setting actually do?** It marks future events from the current browser/profile with `isInternal: true` by writing localStorage/cookie state used by the tracker.
2. **Does it only affect future events from the current browser?** Yes. It affects future event payloads from the current browser/profile storage context.
3. **Does it filter the dashboard numbers?** No. It does not filter dashboard totals.
4. **Where is `isInternal` calculated?** In `js/thisone_event_tracker.js`, via `isInternalUser()` and `buildEvent()`.
5. **Where is `isInternal` sent in the tracking payload?** In the browser event JSON sent by `sendEvent()` to `/api/trackEvent`; the server preserves it through `sanitizeEvent()` and aggregate storage.
6. **How are internal/external visitor counts stored?** For `page_view` events, the visitor ID is added to total visitors plus either `visitors:internal` or `visitors:external` daily sets.
7. **Are pageViews and events split by internal/external, or only visitors?** Total events are split by `events:internal` and `events:external`; visitors are split; `pageViews` are not split; mode and event-name breakdowns are not split.
8. **Does `analytics-summary.html` read shared central totals regardless of browser classification?** Yes. It fetches `/api/analyticsSummary`, which reads shared KV/Redis aggregates.
9. **Does changing browser classification change only future tracking, not the dashboard view?** Yes.
10. **Is the current UI wording misleading?** Yes. It can imply that the setting changes the dashboard view, when it only changes future event classification.
11. **Do we need a separate dashboard filter?** Yes, if operators need to view 전체 / 실제 사용자만 / 내부 테스트만. However, the aggregate model should first be extended so page views and breakdowns can be filtered consistently.
