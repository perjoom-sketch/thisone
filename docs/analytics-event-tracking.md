# ThisOne Analytics Event Tracking

## Purpose

ThisOne needs trustworthy usage data for future traffic reports and advertiser-facing metrics. The analytics event foundation records a small set of key user actions while clearly separating internal/admin/developer/test usage from real user usage from the beginning.

Analytics storage is optional. The app does not require a database, dashboard, external analytics vendor, or persistent storage service to run.

## Event names

Allowed event names are intentionally limited:

| Event name | When it is used |
| --- | --- |
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

## Persistent storage configuration

By default, analytics events are written as structured server logs only. To persist sanitized events for future dashboards or advertiser reports, configure a webhook-style storage endpoint with environment variables:

```env
ANALYTICS_STORAGE_URL=
ANALYTICS_STORAGE_TOKEN=
```

- `ANALYTICS_STORAGE_URL`: optional HTTPS endpoint that receives sanitized analytics event JSON with `POST`.
- `ANALYTICS_STORAGE_TOKEN`: optional bearer token. When set, requests include `Authorization: Bearer <token>`.

When `ANALYTICS_STORAGE_URL` is configured, ThisOne sends this sanitized payload shape to the endpoint:

```js
{
  eventName,
  mode,
  query,
  metadata,
  isInternal,
  timestamp,
  path,
  userAgentCategory
}
```

The storage request uses a short timeout of about 2 seconds so tracking never delays the user-facing app flow.

## Fallback behavior

Analytics tracking must never break the app.

- If `ANALYTICS_STORAGE_URL` is not set, `storeAnalyticsEvent(event)` writes the structured console event and returns `{ ok: true, stored: "console" }`.
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
- full private text
- phone numbers
- resident registration numbers
- account numbers
- full addresses
- base64 content
- passwords
- long personal notes

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
- Optional webhook-style persistent event storage
- Internal/test usage flagging

Future work, not included in this PR:

- admin dashboard
- advertiser reporting views
- aggregation jobs
- GA4 or Google Search Console integration
- richer source/product click instrumentation if rendering can be safely annotated later
