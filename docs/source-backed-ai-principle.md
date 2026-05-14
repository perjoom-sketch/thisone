# ThisOne source-backed AI principle

## Purpose

This document defines the source-backed AI trust principle for all ThisOne services before further implementation. It is documentation only: it does not change runtime code, APIs, prompts, UI, or shopping ranking logic.

## Core principle

AI is not the source of truth. External data is the trust layer. AI is the interpreter and organizer of source-backed information.

ThisOne should not present AI-only opinions as objective answers. For every service, AI should work from external or user-provided evidence, such as:

- Search results
- Product data
- Review signals
- Reputation signals
- Public sources
- Uploaded documents/photos
- User-provided context

AI can summarize, compare, interpret, explain, organize, and recommend based on evidence. AI should not invent facts, pretend unsupported claims are objective, hide where information came from, or replace public/source-backed context with pure opinion.

## Why AI-only answers are not enough for trust

AI-only answers can be helpful for drafting, wording, explanation, and conversation, but they are not enough for user trust when the answer depends on facts, evidence, current context, product reality, public information, or the user’s own provided material.

AI-only answers are risky because:

- They can sound confident even when the claim is unsupported.
- They can mix correct facts with stale, incomplete, or invented details.
- They do not show the user where the answer came from.
- They can blur the line between objective evidence and AI interpretation.
- They can turn recommendations into arbitrary model opinions instead of evidence-based guidance.

ThisOne’s trust layer must come from evidence. AI adds value by making that evidence understandable, useful, and natural in Korean.

## External data as the trust layer

External data is the trust layer for ThisOne services. Depending on the service, that evidence may include public web sources, search results, product databases, prices, seller information, reviews, reputation signals, plus/minus signals, rental/subscription/used/option signals, uploaded documents/photos, or user-provided context.

The trust layer should answer the question: “What information is this answer based on?”

AI should be built on top of that layer. It should not replace it.

## AI as interpreter and organizer, not source of truth

AI is the interpreter, organizer, and recommender built on top of source-backed information. Its job is to:

- Summarize evidence into a shorter answer.
- Compare alternatives using the available signals.
- Interpret what the evidence means for the user.
- Explain complex information in natural Korean.
- Organize messy source material into a useful structure.
- Recommend based on evidence, not imagination.

AI’s job is not to:

- Invent facts.
- Pretend unsupported claims are objective.
- Hide where information came from.
- Replace public or source-backed context with pure opinion.
- Present model memory as verified evidence.

When evidence is weak, missing, conflicting, or outdated, AI should say so instead of filling the gap with false certainty.

## Source transparency rule

When public sources are used, show the sources. The user should be able to see that the answer is not purely AI-generated.

Source transparency means:

- Public sources should be visible when they support the answer.
- Source names, links, or compact source summaries should be shown when the service format allows.
- Evidence-based statements should be distinguishable from AI interpretation.
- Conflicting or weak public sources should be acknowledged instead of hidden.
- The answer should not imply certainty beyond what the evidence supports.

Source transparency does not require exposing every internal step or every raw result. It requires enough visibility for the user to understand what public/source-backed context informed the answer.

## Privacy rule

Source-backed answering must protect private user data.

- Uploaded documents/photos, pasted text, chat messages, personal details, and user-provided context are private input unless the user clearly provides them for public lookup.
- Private user content should not be sent to public search as-is.
- Search queries should be minimized and should avoid sensitive personal information.
- Public source context should be gathered only when it is useful for the user’s answer.
- The answer should clearly distinguish private input from public/source-backed context.

Privacy is part of trust. Evidence-backed answers should not require unnecessary exposure of user-provided private content.

## User-provided private content vs. public source context

ThisOne should distinguish between two different evidence types.

### User-provided private content

User-provided private content includes uploaded documents/photos, screenshots, pasted text, conversation history, personal concerns, and details the user provides directly to ThisOne.

This content can be the main evidence layer for services that interpret a document, photo, or personal situation. However, private content is not the same as public verification.

For private content:

- AI may summarize, explain, classify, or interpret what the user provided.
- Public context may be added through Serper when it improves the answer.
- The answer should not describe private content as publicly verified unless public sources independently support it.
- Sensitive details should not be exposed through unnecessary public search queries.

### Public source context

Public source context includes search results, public web pages, official pages, articles, documentation, public reputation signals, and other externally available information.

For public source context:

- It can support objective or current claims.
- It should be visible when used.
- AI should summarize and explain it rather than copying it blindly.
- If sources are missing, weak, or conflicting, the answer should say so.

## Per-service principle

### 쇼핑

Shopping recommendations should not be arbitrary AI opinions. Shopping has its own recommendation and ranking logic, and this document does not change that runtime logic.

For shopping, the evidence layer includes product data, price, seller information, reviews, reputation, plus/minus signals, rental/subscription/used/option signals, availability, and other shopping-specific signals.

AI’s role is to organize those signals into an honest recommendation. “광고가 아닌 추천” means recommendation based on evidence, not paid placement or AI imagination.

Shopping AI should:

- Explain why a product is recommended using product and trust signals.
- Separate evidence from interpretation.
- Avoid inventing product facts, review claims, seller credibility, or price advantages.
- Preserve the existing shopping ranking logic unless a separate shopping-specific implementation task changes it.

### 해석

For 해석, the uploaded or user-provided text, document, image, or photo is the private input layer.

Public context should be gathered through Serper when useful, such as when the content references public events, brands, people, policies, cultural context, slang, technical terminology, or objective claims.

AI explains the document or content using both the uploaded/private material and any useful public context. It should separate “사용자가 제공한 내용 기준 해석” from “공개 자료 기준 배경 맥락” when both are used.

### 즉답

For 즉답, Serper should provide public/contextual information when the question benefits from current or objective data.

AI should answer naturally in Korean using that context. It should provide the direct answer first, then explain the source-backed basis when useful.

If the question is purely creative, subjective, personal, or does not require public/objective trust, AI-only assistance may be acceptable, but it should not be presented as objective fact without evidence.

### 서치

For 서치, search results are the source layer.

AI may summarize or organize search results when that capability is added later, but it should not replace source visibility. The user must still be able to see that the answer comes from search/source context rather than pure AI generation.

서치 should:

- Keep sources visible.
- Use AI to reduce noise and organize results only on top of source context.
- Acknowledge weak, conflicting, or insufficient sources.
- Avoid presenting AI-only summaries as if they were search-backed answers.

### 럽미

For 럽미, the user concern is the personal input layer.

Styling references and public context should support the advice when useful. AI turns the user’s concern, provided context, styling references, and public context into practical styling guidance.

럽미 should:

- Treat personal concerns and uploaded photos as private input.
- Avoid exposing private personal details through public search.
- Use public context for general styling references, trend context, product-independent guidance, or safety/reputation context when useful.
- Make advice practical, empathetic, and evidence-informed rather than arbitrary AI opinion.

## Recommended answer structure

When a service uses source-backed information, the recommended answer structure is:

1. **Direct answer**: Give the useful Korean answer first.
2. **Evidence used**: Briefly show what evidence layer informed the answer, such as product signals, search results, public sources, uploaded content, or user-provided context.
3. **AI interpretation**: Explain what the evidence means for the user.
4. **Caveats**: State uncertainty, missing information, weak evidence, or conflicting signals.
5. **Sources or evidence summary**: Show public sources when public sources are used, or summarize private/user-provided evidence without exposing unnecessary details.

Each service may adapt this structure to its UX, but the separation between evidence and AI interpretation should remain clear.

## Implementation warning

Implementation must happen one service at a time.

Do not implement all services at once. Do not use this principle as a broad runtime rewrite across shopping, 해석, 즉답, 서치, and 럽미.

Each service should be designed, implemented, tested, and reviewed independently because each service has different evidence sources, privacy risks, answer formats, source-transparency needs, and user expectations.

Before implementing any service, define that service’s:

- Evidence layer.
- Trigger conditions for using public context or Serper.
- Query minimization and privacy rules.
- Source or evidence display format.
- AI interpretation and recommendation behavior.
- Fallback behavior when evidence is unavailable, weak, or conflicting.
- Tests for source-backed and AI-only/private-input paths.
