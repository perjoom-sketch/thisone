# ThisOne Signal Event Schema Planning

## 1. Overview

This document defines a provisional, documentation-only event schema plan for future ThisOne signal data. It covers search, raw result rendering, Piki analysis, recommendations, clicks, abandonment, rental/subscription indicators, filters, sorting, and review-derived product signals.

The schema is intended to describe what could be measured in a future privacy-preserving signal system. It does not implement collection, storage, analytics SDKs, database tables, frontend behavior, API behavior, or user tracking.

All fields in this document are provisional and subject to change before any implementation decision.

## 2. Principles

- Documentation only: this file is a planning reference and does not change runtime behavior.
- Provisional fields: every field listed here is a candidate field, not a committed implementation contract.
- Product-signal first: record purchase intent, product context, quality signals, offer patterns, and ranking feedback rather than personal identity.
- Privacy-preserving by default: avoid direct identifiers and avoid storing data that can identify a person.
- Minimality: only define fields that can support search quality, recommendation quality, or product-signal analysis.
- Separation of concerns: event planning should remain separate from storage, analytics SDKs, API logic, and UI logic.
- Aggregation-friendly: future usage should favor category-level and product-level aggregates over individual-level histories.

## 3. Event types

The provisional event type catalog is:

| Event type | Purpose |
| --- | --- |
| `search_started` | A user begins a ThisOne search query flow. |
| `raw_results_rendered` | Initial search results are rendered before or outside Piki analysis. |
| `piki_analysis_started` | Piki analysis begins for a query or result set. |
| `piki_analysis_completed` | Piki analysis completes and emits product or recommendation signals. |
| `recommendation_rendered` | A recommendation row or ranked result is shown. |
| `product_clicked` | A product, offer, merchant, or detail link is selected. |
| `search_abandoned` | A search session ends without a qualifying result interaction. |
| `recurring_offer_detected` | A rental, subscription, membership, installment, or recurring-payment offer is detected. |
| `review_signal_detected` | A weakness, strength, quality, sentiment, or review-derived product signal is detected. |
| `no_result_or_low_quality_result` | Results are empty, too sparse, mismatched, or below quality thresholds. |
| `filter_applied` | A filter is applied to a result set. |
| `sort_changed` | Result sorting is changed. |

## 4. Common fields

All common fields are provisional.

| Field | Type | Description |
| --- | --- | --- |
| `event_name` | string | One of the event types listed in this document. |
| `event_schema_version` | string | Provisional schema version, for example `signal-plan-v0`. |
| `event_timestamp` | ISO-8601 string | Time the event would be generated. |
| `anonymous_session_id` | string | Anonymous or hashed session identifier only. |
| `anonymous_request_id` | string | Anonymous request correlation identifier. |
| `surface` | string | Surface where the event occurred, such as `web_search`, `piki`, or `recommendation`. |
| `locale` | string | Locale or market context, when available without identifying the user. |
| `device_class` | string | Coarse device category such as `desktop`, `tablet`, or `mobile`; no full user-agent storage. |
| `viewport_bucket` | string | Coarse viewport bucket such as `wide`, `laptop`, or `mobile`. |
| `query_hash` | string | Optional normalized query hash for aggregation. |
| `query_text_redacted` | string | Optional redacted query text only if personal data has been removed. |
| `category_id` | string | Product category identifier, if inferred. |
| `category_name` | string | Human-readable product category, if inferred. |
| `result_set_id` | string | Anonymous identifier for the rendered result set. |
| `source_system` | string | Coarse origin such as `local_search`, `naver`, `piki`, or `manual_rule`. |
| `quality_flags` | string[] | Candidate quality flags, such as `low_confidence` or `insufficient_results`. |
| `experiment_bucket` | string | Optional non-identifying experiment bucket, if future experiments exist. |

## 5. Search events

### `search_started`

Purpose: describe the beginning of a search flow.

Provisional fields:

| Field | Type | Description |
| --- | --- | --- |
| `query_hash` | string | Hash of a normalized query. |
| `query_text_redacted` | string | Redacted query text, if retained for debugging or quality review. |
| `detected_category_id` | string | Category inferred at search start. |
| `detected_intent` | string | Coarse purchase intent such as `compare`, `buy`, `rental`, or `research`. |
| `intent_confidence` | number | Confidence score for detected intent. |
| `search_entry_point` | string | Entry point such as `hero_search`, `header_search`, or `repeat_search`. |

### `raw_results_rendered`

Purpose: describe initial result rendering quality before deeper recommendation analysis.

Provisional fields:

| Field | Type | Description |
| --- | --- | --- |
| `result_count` | number | Number of raw results rendered. |
| `visible_result_count` | number | Number of results visible in the initial viewport. |
| `top_result_product_id` | string | Anonymous or internal product identifier for the first result. |
| `merchant_count` | number | Number of distinct merchants represented. |
| `price_min` | number | Lowest observed price, if available. |
| `price_max` | number | Highest observed price, if available. |
| `result_quality_score` | number | Provisional search quality score. |
| `low_quality_reasons` | string[] | Reasons such as `no_exact_match`, `category_mismatch`, or `price_missing`. |

### `no_result_or_low_quality_result`

Purpose: mark searches that need quality improvement.

Provisional fields:

| Field | Type | Description |
| --- | --- | --- |
| `result_count` | number | Number of available results. |
| `quality_score` | number | Provisional quality score. |
| `failure_reason` | string | Primary reason such as `no_results`, `low_relevance`, or `insufficient_price_data`. |
| `fallback_used` | string | Future fallback source, if applicable. |
| `candidate_recovery_action` | string | Future action such as `broaden_query`, `category_rewrite`, or `manual_review`. |

### `filter_applied`

Purpose: describe result refinement behavior without storing identity.

Provisional fields:

| Field | Type | Description |
| --- | --- | --- |
| `filter_type` | string | Filter category such as `price`, `brand`, `merchant`, `delivery`, `rental`, or `rating`. |
| `filter_value_bucket` | string | Coarse value bucket; avoid exact personal or sensitive values. |
| `result_count_before` | number | Result count before filtering. |
| `result_count_after` | number | Result count after filtering. |

### `sort_changed`

Purpose: describe how users change ranking order.

Provisional fields:

| Field | Type | Description |
| --- | --- | --- |
| `previous_sort` | string | Previous sort mode. |
| `new_sort` | string | New sort mode such as `recommended`, `lowest_price`, `review_score`, or `value`. |
| `result_count` | number | Result count when sorting changed. |

## 6. Piki analysis events

### `piki_analysis_started`

Purpose: describe the start of Piki product analysis.

Provisional fields:

| Field | Type | Description |
| --- | --- | --- |
| `analysis_id` | string | Anonymous analysis identifier. |
| `input_result_count` | number | Number of products or offers submitted for analysis. |
| `analysis_mode` | string | Mode such as `comparison`, `certification_candidate`, or `weakness_scan`. |
| `category_id` | string | Category being analyzed. |
| `timeout_budget_ms` | number | Planned analysis timeout budget, if tracked in the future. |

### `piki_analysis_completed`

Purpose: describe Piki analysis outputs and quality without storing personal identity.

Provisional fields:

| Field | Type | Description |
| --- | --- | --- |
| `analysis_id` | string | Anonymous analysis identifier. |
| `analysis_status` | string | `completed`, `partial`, `fallback`, or `failed`. |
| `analyzed_product_count` | number | Number of products analyzed. |
| `top_recommendation_product_id` | string | Internal product identifier for the top recommendation. |
| `confidence_score` | number | Confidence in the analysis output. |
| `detected_plus_signals` | string[] | Positive product signals. |
| `detected_minus_signals` | string[] | Negative product signals. |
| `detected_value_signals` | string[] | Value-related product signals. |
| `fallback_reason` | string | Reason for partial or fallback analysis, if any. |

## 7. Recommendation events

### `recommendation_rendered`

Purpose: describe recommendation visibility and ranking context.

Provisional fields:

| Field | Type | Description |
| --- | --- | --- |
| `recommendation_id` | string | Anonymous recommendation instance identifier. |
| `product_id` | string | Internal or anonymous product identifier. |
| `rank_position` | number | Position in the rendered list. |
| `badge_type` | string | Badge such as `value`, `trust`, or `thisone_pick`. |
| `recommendation_reason_codes` | string[] | Reason codes such as `best_value`, `low_review_risk`, or `strong_specs`. |
| `price_bucket` | string | Coarse price bucket. |
| `merchant_count` | number | Number of merchants supporting the recommendation. |
| `confidence_score` | number | Recommendation confidence score. |

## 8. Click events

### `product_clicked`

Purpose: describe product interaction for ranking feedback without identifying the user.

Provisional fields:

| Field | Type | Description |
| --- | --- | --- |
| `product_id` | string | Internal or anonymous product identifier. |
| `recommendation_id` | string | Recommendation identifier, if clicked from a recommendation. |
| `rank_position` | number | Rendered rank position at click time. |
| `click_target_type` | string | Target such as `product_row`, `price_link`, `merchant_link`, `review_link`, or `details`. |
| `badge_type` | string | Badge associated with the clicked product, if any. |
| `outbound_domain_hash` | string | Hash or coarse merchant identifier only; avoid full URL if it contains tracking parameters. |
| `price_bucket` | string | Coarse price bucket at click time. |

## 9. Abandonment events

### `search_abandoned`

Purpose: describe searches that ended without a meaningful downstream action.

Provisional fields:

| Field | Type | Description |
| --- | --- | --- |
| `abandonment_stage` | string | Stage such as `before_results`, `after_raw_results`, `after_piki`, or `after_recommendations`. |
| `elapsed_time_bucket` | string | Coarse duration bucket, not exact behavioral trace. |
| `result_count` | number | Number of results available before abandonment. |
| `top_quality_score` | number | Best available result quality score. |
| `possible_reason_codes` | string[] | Candidate reasons such as `low_relevance`, `price_too_high`, `missing_reviews`, or `recurring_offer_confusion`. |

## 10. Rental / subscription events

### `recurring_offer_detected`

Purpose: identify products or offers that involve recurring payments, rental plans, subscriptions, memberships, or installment-like structures.

Provisional fields:

| Field | Type | Description |
| --- | --- | --- |
| `product_id` | string | Internal or anonymous product identifier. |
| `offer_id` | string | Anonymous offer identifier. |
| `recurring_offer_type` | string | `rental`, `subscription`, `membership`, `installment`, or `unknown_recurring`. |
| `billing_period` | string | Coarse period such as `monthly`, `annual`, or `unknown`. |
| `contract_length_bucket` | string | Coarse term bucket such as `under_1_year`, `1_to_3_years`, or `over_3_years`. |
| `upfront_cost_bucket` | string | Coarse upfront-cost bucket. |
| `monthly_cost_bucket` | string | Coarse recurring-cost bucket. |
| `ownership_signal` | string | `owned`, `leased`, `rented`, `unclear`, or `not_applicable`. |
| `detection_confidence` | number | Confidence that the offer is recurring. |
| `consumer_risk_flags` | string[] | Signals such as `long_contract`, `unclear_total_cost`, or `cancellation_fee_possible`. |

## 11. Review signal events

### `review_signal_detected`

Purpose: describe product strengths, weaknesses, and hesitation signals derived from review-like sources without storing reviewer identity.

Provisional fields:

| Field | Type | Description |
| --- | --- | --- |
| `product_id` | string | Internal or anonymous product identifier. |
| `review_signal_id` | string | Anonymous signal identifier. |
| `signal_type` | string | `plus`, `minus`, `value`, `durability`, `usability`, `service`, `delivery`, or `quality`. |
| `signal_label` | string | Normalized label such as `battery_life`, `noise`, `cleaning_power`, or `installation`. |
| `signal_polarity` | string | `positive`, `negative`, `mixed`, or `neutral`. |
| `signal_strength` | number | Provisional strength score. |
| `evidence_count_bucket` | string | Coarse count bucket for supporting review mentions. |
| `source_type` | string | Coarse source such as `review_summary`, `merchant_review`, `community_summary`, or `manual_rule`. |
| `certification_candidate_impact` | string | `supports`, `weakens`, `neutral`, or `unknown`. |

## 12. Privacy notes

- Do not store raw IP addresses.
- Do not store full user-agent strings.
- Do not store names, emails, phone numbers, or personal identity.
- Use anonymous or hashed session identifiers only.
- Store purchase-intent and product-signal data, not personal identity.
- Mark all fields as provisional.
- Avoid full outbound URLs when a coarse merchant identifier or hashed domain is enough.
- Avoid exact location unless a future privacy review explicitly approves a coarse market or locale field.
- Do not retain raw review text if normalized review-signal labels are sufficient.
- Prefer aggregation and deletion policies that reduce individual session traceability.

## 13. Future use cases

- Search quality improvement.
- Plus/minus/value signal analysis.
- Recurring/rental offer detection.
- Product weakness maps.
- Category-level purchase hesitation analysis.
- Piki certification candidate scoring.
- Manufacturer insight reports.
- Ranking feedback loops.

## 14. Non-goals

- No event collection is implemented by this document.
- No storage layer, database schema, or migration is implemented.
- No analytics SDK is added.
- No frontend runtime behavior is modified.
- No API behavior is modified.
- No user data is collected or stored.
- No secrets, credentials, environment variables, or third-party tracking tools are added.
- No decision is made here about retention periods, vendor selection, dashboards, or operational ownership.
