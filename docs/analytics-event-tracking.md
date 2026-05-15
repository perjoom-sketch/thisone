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
- This PR adds Redis/Upstash REST-backed aggregate counters for real visitor, page-view, event, mode, and event-name counts.
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

## Persistent aggregate storage configuration

By default, analytics events are written as structured server logs only. To enable real admin summary counts, configure an Upstash Redis REST-compatible store:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

When both variables are configured, `lib/analyticsStore.js` writes only aggregate counters and visitor sets through Redis REST pipeline commands. The Redis layer increments daily totals for events, internal events, external events, page views, mode usage, and event-name usage. For `page_view`, it adds the anonymous `visitorId` to daily visitor sets so unique visitors are counted with `SCARD`. Internal and external visitor sets are maintained separately.

Redis keys follow this pattern:

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

The date key is derived in KST (`YYYY-MM-DD`). Redis requests use short timeouts so tracking never delays the user-facing app flow.

### Legacy webhook storage

If Redis variables are not configured, the previous optional webhook storage path remains available:

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

Redis storage is required for real counts. If `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are not configured, the API returns `ok: true`, `storageConfigured: false`, and a zero-count placeholder message instead of inventing data or scraping logs.

When Redis is configured, `GET /api/analyticsSummary` reads the last 30 KST date keys and returns aggregate-only data:

- today, last 7 days, and last 30 days
- total/internal/external event counts
- page views
- total/internal/external unique visitor counts
- mode breakdowns
- event-name breakdowns
- daily rows for the last 30 days

Future advertiser-facing reports must exclude every event and visitor set where `isInternal === true`; internal usage may be shown only as a separate audit/readiness number. Raw sensitive event data, raw visitor IDs, IP addresses, user text, and raw queries should never be displayed in the admin summary page or any future advertiser-facing report.

## Fallback behavior

Analytics tracking must never break the app.

- If Redis variables are set, `storeAnalyticsEvent(event)` writes Redis aggregate counters and returns `{ ok: true, stored: "redis" }`.
- If Redis storage fails, `storeAnalyticsEvent(event)` writes a short warning, falls back to the structured console event, and returns `{ ok: true, stored: "console-fallback" }`.
- If Redis variables and `ANALYTICS_STORAGE_URL` are not set, `storeAnalyticsEvent(event)` writes the structured console event and returns `{ ok: true, stored: "console" }`.
- If `ANALYTICS_STORAGE_URL` is set and the remote endpoint returns a successful response, `storeAnalyticsEvent(event)` returns `{ ok: true, stored: "remote" }`.
- If the remote endpoint fails, times out, or cannot be reached, `storeAnalyticsEvent(event)` writes a short warning (`[ThisOne Analytics Storage Fallback]`), falls back to the structured console event, and returns `{ ok: true, stored: "console-fallback" }`.

Remote storage errors are intentionally not surfaced to users, and full event payloads are not logged with storage failure warnings.

## Internal user rule

Internal/admin/developer/test traffic must be marked with `isInternal: true`. Internal events are still stored so ThisOne can audit testing and usage quality, but future dashboards, reports, and advertiser-facing metrics must exclude every event with:

```js
isInternal === true
```

Do not drop internal events at storage time. Preserve the `isInternal` flag and exclude those events only when building future advertiser-facing reports.

The frontend checks this localStorage key:

```js
thisone_internal_user = "true"
```

If the key is present and set to `"true"`, events include `isInternal: true`. If it is absent, events include `isInternal: false`.

The frontend also creates an anonymous local visitor ID for aggregate unique visitor counting only:

```js
thisone_visitor_id = "anonymous-random-id"
```

The ID is generated with `crypto.randomUUID()` when available and falls back to a random string. It must not contain email, name, IP address, account data, fingerprinting data, or any other direct identifier.

## How to mark yourself as internal

Use either localStorage directly:

```js
localStorage.setItem("thisone_internal_user", "true");
```

Or use the helper:

```js
window.ThisOneEventTracker.setInternalUser(true);
```

## How to remove internal mode

```js
window.ThisOneEventTracker.setInternalUser(false);
```

After internal mode is removed, new events include `isInternal: false`.

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
- Redis/Upstash REST aggregate counter storage
- Optional legacy webhook-style persistent event storage
- Internal/test usage flagging
- Internal aggregate summary page at `/tools/analytics-summary.html`

Future work, not included in this PR:

- public admin dashboard with authentication
- advertiser reporting views
- GA4 or Google Search Console integration
- richer source/product click instrumentation if rendering can be safely annotated later
