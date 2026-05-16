# Analytics reset audit after traffic split

## 1. Current reset data flow

The current analytics reset path is:

```text
tools/analytics-summary.html
→ POST /api/resetAnalytics
→ api/resetAnalytics.js
→ resetAnalyticsKeys(range)
→ lib/analyticsStore.js
→ SCAN analytics patterns
→ DEL matched analytics keys
→ tools/analytics-summary.html reloads GET /api/analyticsSummary
```

Detailed flow:

1. The operator opens `/tools/analytics-summary.html`, selects a reset range, and must type the exact confirmation text `통계 초기화` before the reset button is enabled.
2. `submitAnalyticsReset()` sends `POST /api/resetAnalytics` with `{ range, confirmText }`.
3. `api/resetAnalytics.js` accepts only `POST`, validates that `range` is one of `today`, `last7Days`, `last30Days`, or `all`, validates the confirmation text, and calls `resetAnalyticsKeys(body.range)`.
4. `resetAnalyticsKeys()` normalizes the range, builds one or more analytics-only scan patterns, scans Redis/KV for matching keys, and deletes matched keys with `DEL`.
5. On a successful reset response, `submitAnalyticsReset()` displays the deleted-key count, clears the confirmation input, and calls `await loadSummary()` to fetch the current aggregate summary again.
6. `loadSummary()` fetches `GET /api/analyticsSummary` and passes the fresh response to `renderSummary()`.

## 2. Current reset key patterns

`resetAnalyticsKeys(range)` uses these range patterns:

| Reset range | Pattern behavior | Effective pattern |
| --- | --- | --- |
| `today` | One KST date key for today | `analytics:day:{today}:*` |
| `last7Days` | Seven KST date keys from `getRecentDateKeys(7)` | `analytics:day:{date}:*` for each date |
| `last30Days` | Thirty KST date keys from `getRecentDateKeys(30)` | `analytics:day:{date}:*` for each date |
| `all` | Entire analytics namespace only | `analytics:*` |

The reset implementation does **not** scan broad non-analytics patterns, does **not** call `FLUSHDB`, and additionally filters scanned keys so only strings starting with `analytics:` are accepted for deletion. This means the reset path is scoped to analytics aggregate keys and should not delete keyword/search/related/suggestion/trajectory data such as `keyword:`, `query:`, `related:`, `suggestion:`, `trajectory:`, or `search:` keys.

## 3. Whether #355 split keys are covered

The #355 split key families are covered by the current wildcard patterns because all listed total and split keys share the same date prefix:

```text
analytics:day:{date}:
```

For date-limited resets, `analytics:day:{date}:*` matches every suffix below for each selected KST date:

- `analytics:day:{date}:events`
- `analytics:day:{date}:events:internal`
- `analytics:day:{date}:events:external`
- `analytics:day:{date}:pageViews`
- `analytics:day:{date}:pageViews:internal`
- `analytics:day:{date}:pageViews:external`
- `analytics:day:{date}:visitors`
- `analytics:day:{date}:visitors:internal`
- `analytics:day:{date}:visitors:external`
- `analytics:day:{date}:mode:{mode}`
- `analytics:day:{date}:mode:{mode}:internal`
- `analytics:day:{date}:mode:{mode}:external`
- `analytics:day:{date}:eventName:{eventName}`
- `analytics:day:{date}:eventName:{eventName}:internal`
- `analytics:day:{date}:eventName:{eventName}:external`
- `analytics:day:{date}:modes`
- `analytics:day:{date}:eventNames`

For `all`, `analytics:*` also covers these keys and any older or future analytics keys under the `analytics:` namespace.

Conclusion: the current reset key patterns include the #355 internal/external split keys. I did not find evidence that split analytics keys are missed by the backend reset pattern.

## 4. UI reload behavior after reset

The UI does reload summary data after reset:

1. `submitAnalyticsReset()` awaits the reset API response.
2. If the response is successful and `payload.ok === true`, it displays a success message with `payload.deletedKeys`.
3. It clears the confirmation field.
4. It calls `await loadSummary()`.
5. `loadSummary()` fetches `/api/analyticsSummary` and calls `renderSummary(payload)`.
6. `renderSummary()` replaces `currentSummary` and `currentResponseState` with the new response before rendering cards, charts, and breakdown rows.

The traffic filter can re-render from cached state only after the current summary has been replaced. The filter change handler calls `renderSummary({ ...currentResponseState, summary: currentSummary })`, so it can reuse the current in-memory response, but after a successful reset reload that in-memory response should be the fresh summary.

## 5. Possible reasons reset appears not to work

The audit points to operator-experience and interpretation issues more strongly than a missing backend split-key deletion issue.

### A. The reset API returns success when `deletedKeys` is `0`

`resetAnalyticsKeys()` returns `ok: true` even when no matching analytics keys are deleted. The message becomes `삭제할 analytics: 통계 키가 없습니다.`, but the API status is still success. The UI then displays a success-style completion message such as `초기화 완료: 0개 analytics: 키 삭제`.

This can look like reset succeeded while numbers remain because the selected range had no matching keys, the wrong range was selected, or the viewed dashboard period includes dates outside the reset range.

### B. Dashboard period and reset range can differ

The reset range is date-based. The dashboard can still show larger periods:

- Resetting `today` deletes only `analytics:day:{today}:*`.
- The dashboard can still show `last7Days` and `last30Days` totals from earlier dates.
- If the operator expects all cards to become zero after a `today` reset, the remaining last-7-days or last-30-days values may make the reset appear ineffective.

### C. Traffic view filter can hide the reset mental model

The reset UI deletes by date range only. It does not reset only the selected dashboard traffic view.

Examples:

- Viewing `internal` and resetting `today` deletes total, internal, and external keys for today.
- Viewing `external` and resetting `last7Days` deletes all traffic classifications for those dates, not only external traffic.
- The current UI has both a dashboard traffic filter and a reset range selector, but no reset traffic selector. Operators may infer that the current traffic view controls reset scope, but it does not.

### D. Historical totals remain outside the selected range

Total keys and split keys for dates inside the selected reset range are both covered. However, totals outside the selected range remain. Therefore:

- `today` will leave previous days visible in `last7Days` and `last30Days`.
- `last7Days` will leave days 8 through 30 visible in `last30Days`.
- `last30Days` will not remove analytics keys older than 30 days if any future admin/reporting view reads them.
- `all` is the only current reset range that scans the whole `analytics:` namespace.

### E. Admin analytics page tracking is not the likely cause

The analytics summary page itself should not create new counts after reset:

- The frontend tracker checks `/tools/analytics-summary.html` and returns before building or sending analytics events.
- The frontend `trackPageView()` also returns early on that path.
- The backend `/api/trackEvent` handler skips events whose sanitized path includes `/tools/analytics-summary.html`.

This means loading or reloading the admin summary page should not emit `page_view` or `mode_open` analytics events that would recreate counts.

### F. Redis/KV eventual observation or concurrent traffic can recreate counts

If real users or test browsers continue sending events after reset, new `analytics:day:{date}:*` keys can be recreated immediately. This is expected behavior, not reset failure. A reset should be evaluated with `deletedKeys`, the selected range, the selected dashboard period, and any concurrent traffic in mind.

## 6. Confirmed root cause if found

No backend deletion bug was confirmed in this audit.

Confirmed findings:

- `resetAnalyticsKeys()` covers the #355 split keys because it deletes by `analytics:day:{date}:*` or `analytics:*`.
- Total and split keys for a selected date range are covered by the same wildcard pattern.
- The reset path remains analytics-prefix scoped and should not delete keyword/search/related/suggestion/trajectory data.
- The dashboard reloads `/api/analyticsSummary` after a successful reset and replaces the current summary state.
- The admin summary page is excluded from analytics tracking on both the frontend tracker and backend event endpoint.
- The API treats `deletedKeys: 0` as a successful reset result, and the UI presents it as a success completion. This is the clearest confirmed source of operator confusion.
- Dashboard range and traffic-view semantics can make a successful date-scoped reset look ineffective when the operator is viewing a broader period or assumes reset follows the current traffic filter.

## 7. Recommended fix PR

Smallest safe next PR: improve reset feedback and add focused tests without changing reset deletion semantics.

Recommended scope:

1. Keep backend deletion behavior unchanged: continue deleting only `analytics:` keys by date range or all analytics namespace.
2. Update the reset UI copy to distinguish:
   - `deletedKeys > 0`: reset completed and N analytics keys were deleted.
   - `deletedKeys === 0`: no matching analytics keys were found for the selected range; this is not evidence that broader dashboard periods were reset.
3. Add an explanatory note near the reset controls:
   - reset scope is controlled only by reset range, not by the traffic-view filter;
   - `today` does not clear last-7-days or last-30-days historical totals outside today;
   - `all` is the only option that scans every `analytics:` key.
4. Add tests for `getAnalyticsResetPatterns()` covering:
   - `today` → `analytics:day:{today}:*`;
   - `last7Days` and `last30Days` → one `analytics:day:{date}:*` pattern per KST date;
   - `all` → `analytics:*`.
5. Add a scan/delete unit test with representative #355 keys to prove that total, internal, external, mode, eventName, `modes`, and `eventNames` keys are included while non-analytics keys are not deleted.
6. Add or document a manual verification step that checks the response payload's `deletedKeys`, the selected reset range, and the dashboard period being viewed after `loadSummary()` completes.

This next PR should be UI copy plus tests only. It should not change KV key names, analytics aggregation, dashboard filtering logic, event tracking, shopping/AI modes, or dependencies.
