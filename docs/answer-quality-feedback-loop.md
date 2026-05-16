# Answer quality feedback loop

## Why this exists

Manual QA is no longer enough for ThisOne Instant Answer.

Recent layers improved the answer path:

- question understanding
- research strategy
- multi-model answer review

Those layers make answers safer, but they also make failures harder to spot by hand. An operator cannot manually discover every weak answer, every missing official source, or every repeated answer-structure problem. ThisOne needs a small, privacy-safe logging foundation that records answer-quality signals for later review.

## Scope of this foundation

This first step logs **Instant Answer quality metadata only**. It does not add a public UI, admin report page, answer rewrite behavior, shopping changes, analytics changes, or new user-facing output.

The Instant Answer response should behave the same for users. Quality logging runs after the final answer is produced, and logging failures must not break the user request.

## Privacy boundary

Answer quality logs are metadata only. They must not store raw private content.

Do not store:

- raw full user question when avoidable
- personal information
- uploaded document contents
- image contents
- IP address
- visitorId
- raw model outputs
- raw Serper JSON

Allowed metadata includes structured signals such as:

```json
{
  "mode": "instant-answer",
  "createdAt": "2026-05-16T00:00:00.000Z",
  "taskType": "affiliation/status",
  "evidencePreference": "official",
  "resolutionStrategy": "multi_model_review",
  "sourceQuality": "weak",
  "usedSearch": true,
  "usedDeeperResearch": true,
  "reviewUsed": false,
  "fallbackUsed": true,
  "sourceCount": 1,
  "hasOfficialSource": false,
  "answerLength": 850,
  "status": "fallback",
  "issueFlags": ["weak_sources", "official_source_missing", "fallback_used"]
}
```

## Storage boundary

Quality logs use the dedicated Redis/KV prefix only:

```text
answerQuality:
```

They must not mix with existing prefixes such as:

- `analytics:`
- `keyword:`
- `query:`
- `related:`
- `suggestion:`
- `trajectory:`
- `search:`

If KV/Redis is not configured, the logger writes `console.warn` and skips storage. The user-facing Instant Answer request must still return normally.

## Current issue flags

The foundation can record these flags:

- `no_sources`: search was attempted but no source metadata was available.
- `weak_sources`: research strategy marked source quality as weak or unavailable.
- `fallback_used`: the answer path used fallback/deeper-research caution.
- `search_failed`: a search provider request failed during the answer flow.
- `model_review_failed`: multi-model review was expected but did not complete.
- `answer_too_short`: final answer length is below the current minimum heuristic.
- `answer_too_long`: final answer length exceeds the current maximum heuristic.
- `repeated_sections`: final answer appears to repeat awkward headings such as repeated `결론` sections.
- `json_error_hidden`: reserved for future hidden JSON parse/recovery failures.
- `official_source_missing`: an official source was needed but no official/public source domain was present.
- `unsupported_claim_risk`: reserved for future model-review unsupported-claim signals.

## Future report page ideas

A later operator report page can summarize:

- most common failure flags
- Instant Answer modes with weak sources
- question types needing better intent rules
- cases where official evidence was required but missing
- repeated answer-structure problems
- search-provider failure rates
- review-failure patterns by task type or resolution strategy

## Feedback-loop direction

This is the first foundation for a self-improving feedback loop:

1. Instant Answer produces the same user-facing answer.
2. ThisOne records non-sensitive quality metadata.
3. Operators review aggregate patterns instead of isolated anecdotes.
4. The team improves question understanding, research strategy, source rules, and answer templates based on recurring failure signals.
5. Future logs show whether those changes reduce weak-source, missing-official-source, and repeated-structure issues.
