# ThisOne shared intent analysis foundation

ThisOne modes should not each invent their own question-understanding rules. A user can ask the same real-world question through 즉답, 해석, 럽미, 집밥, 쇼핑, or 서치, and every mode benefits from the same first step: understand what the user is trying to verify before search or final answer generation begins.

## Why this layer exists

Raw user input is often conversational. If a mode searches or answers against the full sentence too literally, it can miss the important noun phrase, institution, role word, or evidence requirement. For example, a question like `안전한 일터 지킴이들은 고용노동부 직원이야?` is not just a casual yes/no sentence. It asks for affiliation or status, contains an institution, and should prefer official evidence.

The shared helper in `lib/intentAnalysis.js` provides a generic, rule-based foundation for this first step. It does **not** generate final answers and does **not** call an AI model.

## Helper contract

Use:

```js
const { analyzeUserIntent } = require('../lib/intentAnalysis');

const intent = analyzeUserIntent({
  text: userText,
  mode: 'instant-answer'
});
```

Output shape:

```js
{
  normalizedText: string,
  language: 'ko' | 'en' | 'unknown',
  taskType: string,
  entities: string[],
  roleWords: string[],
  institutionWords: string[],
  needsCurrentInfo: boolean,
  needsOfficialSource: boolean,
  evidencePreference: 'official' | 'web' | 'user_provided' | 'general',
  searchQueries: string[],
  answerStrategy: 'source_backed' | 'careful_general' | 'ask_for_context'
}
```

## Responsibilities

The shared intent layer prepares:

- normalized Korean question text with unnecessary conversational endings removed;
- likely task type, such as affiliation/status, authority/role, how-to, eligibility, comparison, recommendation, or troubleshooting;
- entity, role, and institution hints;
- whether official or current evidence should be preferred;
- three to five keyword-like search queries that are more useful than searching the raw sentence;
- answer strategy guidance for the mode.

## Non-responsibilities

Final answer generation remains mode-specific.

- 즉답 can use the search queries to gather source-backed context and keep its existing answer format.
- 해석 can use the same structure later to decide what needs explanation versus verification.
- 럽미 can later keep its own tone while using the shared layer only for understanding and evidence hints.
- 집밥 can later keep its safety and recipe constraints while using entities as ingredient or context hints.
- 쇼핑 and 서치 can later use the search query guidance without changing ranking or analytics in this PR.

This foundation must not hardcode answers, one-off topic rules, fake sources, or mode-specific final response behavior.

## Current first adopter

`api/instantAnswer.js` is the first minimal integration. It analyzes the question before public search and uses `intent.searchQueries` instead of relying on a raw-question-only search query. The existing 즉답 response format, AI fallback chain, and source-backed behavior remain mode-specific.
