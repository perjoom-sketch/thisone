# ThisOne Analytics Event Tracking

## Purpose

ThisOne needs trustworthy usage data for future traffic reports and advertiser-facing metrics. The analytics event foundation records a small set of key user actions while clearly separating internal/admin/developer/test usage from real user usage from the beginning.

Analytics storage is optional. The app does not require a database, dashboard, external analytics vendor, or persistent storage service to run.

## Implementation history

- #321 introduced the internal event tracking foundation.
- #323 introduced optional analytics event storage through `lib/analyticsStore.js` and `ANALYTICS_STORAGE_URL`.
- #326 audited and cleaned analytics tracking.
- #327 added the first internal analytics summary page at `/tools/analytics-summary.html`.
- #328 localized the analytics summary page and added CSS-only charts.
- #329 added Redis/Upstash REST-backed aggregate counters for real visitor, page-view, event, mode, and event-name counts.
- This PR excludes `/tools/analytics-summary.html` from tracked service usage so admin refreshes and controls do not affect advertiser-facing usage metrics.
- The analytics aggregate store can use the existing Vercel KV REST environment variables as well as Upstash-style names.
- #322 was closed without being merged and should not be referenced as an active implementation.

## Event names

Allowed event names are intentionally limited:

| Event name | When it is used |
| --- | --- |
| `page_view` | The tracker loads once for a page view. |
| `mode_open` | A top-level mode opens. |
| `shopping_search_submit` | A shopping search is submitted. |
| `ai_tool_submit` | An AI tool submit action starts for document-ai, instant-answer, loveme, or home-meal. |
| `source_click` | A source/result link is clicked when safe to detect without rendering refactors. |
| `product_click` | A shopping product/result link is clicked when safe to detect without product-card refactors. |

Current event payloads may include:

- `eventName`
- `mode`
- sanitized `query` for shopping search only
- primitive sanitized `metadata`
- `isInternal`
- `timestamp`
- `path`
- `userAgentCategory`
- anonymous `visitorId` generated in localStorage with key `thisone_visitor_id`

The browser-side tracker computes `isInternal` immediately before every event is sent by calling the shared `isInternalUser()` helper. That helper returns `true` only when `localStorage.thisone_internal_user === "true"` or a visible `thisone_internal_user=true` cookie exists. The companion `setInternalUser(false)` helper removes the localStorage marker and expires the host-only cookie plus `.thisone.me`, `thisone.me`, and `www.thisone.me` cookie variants so real-user classification is unambiguous after clearing internal mode.

## Persistent aggregate storage configuration

By default, analytics events are written as structured server logs only. ThisOne uses Vercel KV for persistent key-value storage, and Vercel KV can expose REST credentials with Vercel-style variable names:

```env
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=
```

`KV_REST_API_READ_ONLY_TOKEN` is optional for event writes, but the analytics summary read path uses it when available. If a read-only token is not present, summary reads fall back to `KV_REST_API_TOKEN`.

Upstash-compatible variable names remain supported and continue to work without creating a new KV store:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Analytics aggregation is enabled when either `KV_REST_API_URL` + `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` is configured. When REST credentials are configured, `lib/analyticsStore.js` writes only aggregate counters and visitor sets through Redis/KV REST pipeline commands. The Redis/KV layer increments daily totals for events, internal events, external events, page views, mode usage, and event-name usage. For `page_view`, it adds the anonymous `visitorId` to daily visitor sets so unique visitors are counted with `SCARD`. Internal and external visitor sets are maintained separately.

Analytics keys use the `analytics:` prefix and must remain separate from keyword/search KV keys. Do not reuse these keys for keyword storage or search keyword logic. Analytics keys follow this pattern:

```text
analytics:day:{YYYY-MM-DD}:events
analytics:day:{YYYY-MM-DD}:events:internal
analytics:day:{YYYY-MM-DD}:events:external
analytics:day:{YYYY-MM-DD}:pageViews
analytics:day:{YYYY-MM-DD}:visitors
analytics:day:{YYYY-MM-DD}:visitors:internal
analytics:day:{YYYY-MM-DD}:visitors:external
analytics:day:{YYYY-MM-DD}:mode:{mode}
analytics:day:{YYYY-MM-DD}:eventName:{eventName}
```

The date key is derived in KST (`YYYY-MM-DD`). Redis/KV requests use short timeouts so tracking never delays the user-facing app flow.

### Legacy webhook storage

If Vercel KV or Upstash-compatible Redis variables are not configured, the previous optional webhook storage path remains available:

```env
ANALYTICS_STORAGE_URL=
ANALYTICS_STORAGE_TOKEN=
```

`ANALYTICS_STORAGE_URL` receives sanitized analytics event JSON with `POST`, and `ANALYTICS_STORAGE_TOKEN` is sent as an optional bearer token.


## Internal analytics summary

The first admin-facing analytics summary page is available at:

```text
/tools/analytics-summary.html
```

This page is an internal readiness and aggregate inspection tool only. It is not linked from public navigation and is not an advertiser-facing dashboard. It fetches `GET /api/analyticsSummary` and renders only aggregate counts for today, the last 7 days, the last 30 days, mode breakdowns, and event-name breakdowns.

The analytics admin page is excluded from tracked ThisOne service usage. Loading or refreshing `/tools/analytics-summary.html` must not emit `page_view` events, create visitor counts, or increment `events`, `pageViews`, `visitors`, `externalVisitors`, or `internalVisitors`. Admin controls on this page use the same tracker helpers as event sending to classify this browser as internal test traffic or real user traffic, fetch summaries, and call reset controls, but those admin page views and admin actions should not affect advertiser-facing metrics. The page shows only localStorage/cookie/final `isInternal` diagnostics for this classification and must not expose visitor IDs or raw queries.

Vercel KV or Upstash-compatible Redis storage is required for real counts. If neither `KV_REST_API_URL` + `KV_REST_API_TOKEN` nor `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` is configured, the API returns `ok: true`, `storageConfigured: false`, and a zero-count placeholder message instead of inventing data or scraping logs.

When readable KV/Redis REST credentials are configured, `GET /api/analyticsSummary` reads the last 30 KST date keys and returns aggregate-only data. The summary read path prefers `KV_REST_API_READ_ONLY_TOKEN`, then falls back to `KV_REST_API_TOKEN`, then falls back to `UPSTASH_REDIS_REST_TOKEN`:

- today, last 7 days, and last 30 days
- total/internal/external event counts
- page views
- total/internal/external unique visitor counts
- mode breakdowns
- event-name breakdowns
- daily rows for the last 30 days

Future advertiser-facing reports must exclude every event and visitor set where `isInternal === true`; internal usage may be shown only as a separate audit/readiness number. Raw sensitive event data, raw visitor IDs, IP addresses, user text, and raw queries should never be displayed in the admin summary page or any future advertiser-facing report.



## Admin analytics reset

The admin summary page includes an internal-only **통계 초기화** section for removing setup/test analytics counters. This control is not linked from public navigation and does not add login/auth. It uses a safety gate instead: the operator must type the exact confirmation text `통계 초기화` before the reset button is enabled.

The reset endpoint is:

```text
POST /api/resetAnalytics
```

Request body:

```json
{
  "range": "today",
  "confirmText": "통계 초기화"
}
```

Allowed `range` values are `today`, `last7Days`, `last30Days`, and `all`. The default UI range is **오늘**. **전체 통계** is intentionally labeled as a caution option and still requires the exact confirmation text.

The endpoint must only delete keys that start with the analytics prefix:

```text
analytics:
```

For date-limited resets, it scans and deletes only matching KST day keys such as `analytics:day:{YYYY-MM-DD}:*`. For `all`, it scans `analytics:*`. It must never use `FLUSHDB` and must never delete or modify keyword/search KV data, including keys that begin with:

```text
keyword:
query:
related:
suggestion:
trajectory:
search:
```

If KV/Redis REST credentials are not configured, the reset API returns a safe error message: `KV 저장소가 설정되지 않아 초기화할 수 없습니다.` Responses do not expose raw KV keys; they only return the requested range, a deleted-key count when Redis/KV reports one, and a safe status message.

## Fallback behavior

Analytics tracking must never break the app.

- If Vercel KV or Upstash-compatible Redis variables are set, `storeAnalyticsEvent(event)` writes aggregate counters and returns `{ ok: true, stored: "redis" }`.
- If KV/Redis storage fails, `storeAnalyticsEvent(event)` writes a short warning, falls back to the structured console event, and returns `{ ok: true, stored: "console-fallback" }`.
- If KV/Redis variables and `ANALYTICS_STORAGE_URL` are not set, `storeAnalyticsEvent(event)` writes the structured console event and returns `{ ok: true, stored: "console" }`.
- If `ANALYTICS_STORAGE_URL` is set and the remote endpoint returns a successful response, `storeAnalyticsEvent(event)` returns `{ ok: true, stored: "remote" }`.
- If the remote endpoint fails, times out, or cannot be reached, `storeAnalyticsEvent(event)` writes a short warning (`[ThisOne Analytics Storage Fallback]`), falls back to the structured console event, and returns `{ ok: true, stored: "console-fallback" }`.

Remote storage errors are intentionally not surfaced to users, and full event payloads are not logged with storage failure warnings.

## Internal user rule

Internal/admin/developer/test traffic must be marked with `isInternal: true`. Internal events are still stored so ThisOne can audit testing and usage quality, but future dashboards, reports, and advertiser-facing metrics must exclude every event with:

```js
isInternal === true
```

Do not drop internal events at storage time. Preserve the `isInternal` flag and exclude those events only when building future advertiser-facing reports.

The frontend keeps the existing localStorage key:

```js
thisone_internal_user = "true"
```

It also uses a shared cookie fallback so the same browser remains marked internal across both `https://thisone.me` and `https://www.thisone.me`:

```http
thisone_internal_user=true; Domain=.thisone.me; Path=/; Max-Age=31536000; SameSite=Lax; Secure
```

If either the localStorage key or the shared cookie is present and set to `"true"`, events include `isInternal: true`. If neither storage location is set, events include `isInternal: false`.

The frontend also creates an anonymous local visitor ID for aggregate unique visitor counting only:

```js
thisone_visitor_id = "anonymous-random-id"
```

The ID is generated with `crypto.randomUUID()` when available and falls back to a random string. It must not contain email, name, IP address, account data, fingerprinting data, or any other direct identifier.

## How to mark yourself as internal

The preferred operator flow is now the admin settings panel on:

```text
/tools/analytics-summary.html
```

Open the page, find **운영자 설정**, then click **이 브라우저의 사용 기록을 내부 테스트로 분류**. The panel calls `window.ThisOneEventTracker.setInternalUser(true)`, which writes the current browser's local `thisone_internal_user` flag, writes the shared `.thisone.me` cookie, optionally writes a host-only cookie, and updates the visible status to **현재 브라우저: 내부 테스트로 분류됨**. This setting is stored in the current browser/device; the shared cookie keeps the setting consistent when the operator moves between the apex and `www` hosts in that browser.

Use localStorage directly only as a fallback, and set the shared and host-only cookies at the same time when the current host supports `.thisone.me` cookies:

```js
localStorage.setItem("thisone_internal_user", "true");
document.cookie = "thisone_internal_user=true; Domain=.thisone.me; Path=/; Max-Age=31536000; SameSite=Lax; Secure";
document.cookie = "thisone_internal_user=true; Path=/; Max-Age=31536000; SameSite=Lax; Secure";
```

Prefer the shared tracker helper:

```js
window.ThisOneEventTracker.setInternalUser(true);
```

## How to remove internal mode

The preferred operator flow is to open `/tools/analytics-summary.html`, find **운영자 설정**, then click **이 브라우저의 사용 기록을 실제 사용자로 분류**. The panel calls `window.ThisOneEventTracker.setInternalUser(false)`, removes the current browser's local flag, expires the shared `.thisone.me` cookie, expires explicit `thisone.me` and `www.thisone.me` cookie variants, expires any host-only cookie with the same name, and updates the visible status to **현재 브라우저: 실제 사용자로 분류됨**.

Use localStorage directly only as a fallback, and expire the shared, explicit host-domain, and host-only cookies at the same time:

```js
localStorage.removeItem("thisone_internal_user");
document.cookie = "thisone_internal_user=; Path=/; Max-Age=0; SameSite=Lax; Secure";
document.cookie = "thisone_internal_user=; Domain=.thisone.me; Path=/; Max-Age=0; SameSite=Lax; Secure";
document.cookie = "thisone_internal_user=; Domain=thisone.me; Path=/; Max-Age=0; SameSite=Lax; Secure";
document.cookie = "thisone_internal_user=; Domain=www.thisone.me; Path=/; Max-Age=0; SameSite=Lax; Secure";
```

Prefer the shared tracker helper:

```js
window.ThisOneEventTracker.setInternalUser(false);
```

After internal mode is removed, new events include `isInternal: false`. Future advertiser reports must exclude every stored event and visitor set where `isInternal === true`.

## Privacy rules

Only sanitized events may be written to remote storage. Never store or send:

- uploaded image data
- document contents
- full free-form private text
- phone numbers
- resident registration numbers
- account numbers
- full addresses
- base64 content
- passwords
- long personal notes
- raw visitor IDs in summary output
- IP addresses

For `query` fields:

- truncate to a maximum of 100 characters
- remove obvious phone-number patterns
- remove obvious resident-registration-number-like patterns
- remove long digit sequences

AI tool submit events intentionally record mode-level metadata only. They do not send document text, uploaded image data, or full free-form AI prompts.

## Current scope and future work

Current scope:

- Frontend helper: `window.ThisOneEventTracker`
- Backend receiver: `POST /api/trackEvent`
- Sanitized structured console logging
- Vercel KV and Upstash-compatible REST aggregate counter storage
- Optional legacy webhook-style persistent event storage
- Internal/test usage flagging
- Internal aggregate summary page at `/tools/analytics-summary.html` excluded from tracked service usage

Future work, not included in this PR:

- public admin dashboard with authentication
- advertiser reporting views
- GA4 or Google Search Console integration
- richer source/product click instrumentation if rendering can be safely annotated later
