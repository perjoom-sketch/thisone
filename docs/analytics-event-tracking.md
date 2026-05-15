# Analytics event tracking

ThisOne analytics events are intentionally small, internal product signals. The tracking path is limited to predefined event names and must not collect sensitive content.

## Allowed events

- `mode_open`
- `shopping_search_submit`
- `ai_tool_submit`
- `source_click`
- `product_click`

## Privacy rules

- Queries are truncated before storage.
- Phone-number-like values, resident-registration-number-like values, and long digit sequences are removed.
- Uploaded image or document content must not be stored.
- Metadata is shallow and string metadata values are limited.
- Sensitive metadata fields such as `imageDataUrl`, `documentText`, `password`, `phone`, `rrn`, `address`, and `account` are dropped.

## Storage adapter plan

The current storage adapter stores analytics events to a structured server console log only. Logs are prefixed with `[ThisOne Analytics Event]` so the events can be identified while persistent storage is not yet part of the application.

A future PR can replace `storeAnalyticsEvent` with persistent storage without rewriting `/api/trackEvent`, because event receiving, normalization, sanitization, and storage are separated in `lib/analyticsStore.js`.

Advertiser-facing traffic reports must exclude events where `isInternal=true` so internal ThisOne testing and operations do not affect external reporting.

Any future persistent storage must preserve the same privacy rules: sanitize queries, drop sensitive metadata fields, keep metadata shallow, and never store uploaded image or document contents.
