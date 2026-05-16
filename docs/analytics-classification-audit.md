# Analytics Classification Audit

## Purpose

This document audits the current ThisOne analytics classification and summary-dashboard behavior. It now reflects the traffic-classification split added after the original audit.

The key finding is that the **browser classification setting** and the **dashboard data view** are separate concepts:

- The browser setting controls the `isInternal` value attached to **future events from the current browser/profile**.
- The analytics summary page reads **shared central aggregate totals** from KV/Redis and can display them by dashboard view 기준: 전체, 실제 사용자만, 내부 테스트만. This dashboard filter is separate from the current browser's classification setting.

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

The current write path increments these global/shared counters and sets both backward-compatible totals and split internal/external counters:

- `analytics:day:{YYYY-MM-DD}:events`
- `analytics:day:{YYYY-MM-DD}:events:internal` or `analytics:day:{YYYY-MM-DD}:events:external`
- `analytics:day:{YYYY-MM-DD}:eventName:{eventName}`
- `analytics:day:{YYYY-MM-DD}:eventName:{eventName}:internal` or `analytics:day:{YYYY-MM-DD}:eventName:{eventName}:external`
- `analytics:day:{YYYY-MM-DD}:mode:{mode}`
- `analytics:day:{YYYY-MM-DD}:mode:{mode}:internal` or `analytics:day:{YYYY-MM-DD}:mode:{mode}:external`
- `analytics:day:{YYYY-MM-DD}:eventNames`
- `analytics:day:{YYYY-MM-DD}:modes`

For `page_view` events only, it also writes:

- `analytics:day:{YYYY-MM-DD}:pageViews`
- `analytics:day:{YYYY-MM-DD}:pageViews:internal` or `analytics:day:{YYYY-MM-DD}:pageViews:external`
- `analytics:day:{YYYY-MM-DD}:visitors`
- `analytics:day:{YYYY-MM-DD}:visitors:internal` or `analytics:day:{YYYY-MM-DD}:visitors:external`

### What is split by internal/external

Currently split by internal/external:

- total event count via `events:internal` and `events:external`
- page view count via `pageViews:internal` and `pageViews:external`
- unique visitor sets for page views via `visitors:internal` and `visitors:external`
- mode breakdowns via `mode:{mode}:internal` and `mode:{mode}:external`
- event-name breakdowns via `eventName:{eventName}:internal` and `eventName:{eventName}:external`

Backward-compatible total keys are still written and read. The dashboard therefore supports 전체 totals while also showing 실제 사용자 and 내부 테스트 split views.

Important nuance: historical days stored before this split was deployed may have total `pageViews`, `mode:{mode}`, and `eventName:{eventName}` values without the matching split keys. Those missing split keys are read as `0`; the summary does not infer old split values from totals.

### How daily aggregates are read

`readAnalyticsSummary()` reads the last 30 KST date keys. For each date it reads:

- total events
- external events
- internal events
- page views
- external page views
- internal page views
- total visitors
- external visitors
- internal visitors
- known modes
- known event names

It then reads the per-mode and per-event-name total, external, and internal counts and returns:

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

The summary UI now has a separate **통계 보기 기준** dashboard filter with three options:

- 전체
- 실제 사용자만
- 내부 테스트만

This filter changes which stored aggregate numbers are displayed for period metrics, mode breakdowns, and event-name breakdowns. It is not tied to the current browser classification control.

### Does changing classification change only future tracking?

Yes. Changing the browser classification affects new events emitted after the change. It does not rewrite existing KV/Redis counts, and it does not change which aggregate totals the summary page fetches or renders.

## 5. Identified UX problem

The current UI can be misleading because it places a browser-level classification control near central dashboard metrics.

The setting means:

> "Classify future events from this browser/profile as internal test or real user."

It does not mean:

> "Filter the dashboard to show internal test data or real-user data."

This explains the operator confusion: if Chrome says "internal test" and Edge says "real user", it is natural to expect the dashboard numbers to differ. In the current design, they do not differ because both pages read the same central aggregate summary.

## 6. Current dashboard sections

The admin page intentionally separates two controls:

### A. 현재 브라우저 기록 분류

This controls how future events from the current browser/profile are classified. It changes outgoing `isInternal` on new tracking payloads only.

### B. 통계 보기 기준

This controls which already-stored dashboard aggregates are displayed:

- 전체: total events, total page views, total visitors, total mode counts, and total event-name counts
- 실제 사용자만: external events, external page views, external visitors, external mode counts, and external event-name counts
- 내부 테스트만: internal events, internal page views, internal visitors, internal mode counts, and internal event-name counts

The UI includes the helper text: “실제 사용자/내부 테스트 분리 집계는 이 기능 배포 이후 발생한 기록부터 정확히 반영됩니다.”

## 7. Historical data compatibility

Old days can lack split `pageViews`, mode-count, and event-name-count keys. The reader treats those missing split keys as `0` and keeps total keys unchanged for backward compatibility. It does not infer old internal/external values from total counts.

## Direct answers to audit questions

1. **What does “internal test” setting actually do?** It marks future events from the current browser/profile with `isInternal: true` by writing localStorage/cookie state used by the tracker.
2. **Does it only affect future events from the current browser?** Yes. It affects future event payloads from the current browser/profile storage context.
3. **Does it filter the dashboard numbers?** The browser classification setting does not. The separate `통계 보기 기준` dashboard filter does change which stored aggregate values are displayed.
4. **Where is `isInternal` calculated?** In `js/thisone_event_tracker.js`, via `isInternalUser()` and `buildEvent()`.
5. **Where is `isInternal` sent in the tracking payload?** In the browser event JSON sent by `sendEvent()` to `/api/trackEvent`; the server preserves it through `sanitizeEvent()` and aggregate storage.
6. **How are internal/external visitor counts stored?** For `page_view` events, the visitor ID is added to total visitors plus either `visitors:internal` or `visitors:external` daily sets.
7. **Are pageViews and events split by internal/external, or only visitors?** Total events, page views, visitors, mode breakdowns, and event-name breakdowns are now split by internal/external, while backward-compatible total keys remain.
8. **Does `analytics-summary.html` read shared central totals regardless of browser classification?** Yes. It fetches `/api/analyticsSummary`, which reads shared KV/Redis aggregates.
9. **Does changing browser classification change only future tracking, not the dashboard view?** Yes. Use the separate `통계 보기 기준` control to change the dashboard display.
10. **Is the current UI wording misleading?** Yes. It can imply that the setting changes the dashboard view, when it only changes future event classification.
11. **Do we need a separate dashboard filter?** Yes, and the admin page now provides it after extending page-view and breakdown aggregates.
