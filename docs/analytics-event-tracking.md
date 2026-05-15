# ThisOne Analytics Event Tracking

## Purpose

ThisOne needs trustworthy usage data for future traffic reports and advertiser-facing metrics. This foundation records a small set of key user actions while clearly separating internal/admin/developer/test usage from real user usage from the beginning.

This PR only logs sanitized structured events to the server console through `/api/trackEvent`. It does not add a dashboard, external analytics vendor, admin login, database, or persistent storage dependency.

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
- primitive `metadata`
- `isInternal`
- `timestamp`
- `path`

## Internal user rule

Internal/admin/developer/test traffic must be marked with `isInternal: true` and must be excluded from future advertiser-facing metrics.

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

Do not store or send:

- uploaded image data
- document contents
- full free-form private text
- resident registration numbers
- phone numbers
- account numbers
- full addresses
- long personal notes

For `query` fields:

- truncate to a maximum of 100 characters
- remove obvious phone-number patterns
- remove obvious resident-registration-number-like patterns
- remove long digit sequences

AI tool submit events intentionally record mode-level metadata only. They do not send document text, uploaded image data, or full free-form AI prompts.

## Advertiser-facing metrics rule

Future dashboards, reports, and advertiser-facing metrics must exclude every event with:

```js
isInternal === true
```

Internal/admin/developer/test usage must never be counted as public traffic.

## Current scope and future work

Current scope:

- Frontend helper: `window.ThisOneEventTracker`
- Backend receiver: `POST /api/trackEvent`
- Sanitized console logging only
- Internal/test usage flagging

Future work, not included in this PR:

- durable event storage
- admin dashboard
- advertiser reporting views
- aggregation jobs
- richer source/product click instrumentation if rendering can be safely annotated later
