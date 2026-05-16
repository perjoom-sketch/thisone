# Cross-Mode Context Handoff Outline

> **Status:** Design outline only. No implementation yet.

## 1. Problem Discovery
- **Users do not naturally think in tabs.** They think in goals or questions, not application features.
- During usage, users often do not know which mode (해석, 쇼핑, 서치, 즉답) they actually need for their specific intent.
- Leaving one mode and manually switching tabs to ask a related question breaks the thought flow and creates unnecessary friction.

## 2. Philosophy
**"탭은 기능 구분일 뿐, 사용자의 사고 흐름은 끊기면 안 된다."**
- The AI should proactively help users continue their natural thinking flow across the platform.
- Modes should feel deeply connected and fluid, acting as different lenses on the same problem rather than isolated tools.

## 3. Current Example Flow
- **Scenario:** A user uploads a product manual in *해석 (Document AI)* mode.
- **Action:** The user reads the explanation.
- **New Intentions:** The user may suddenly want to:
  - Find product alternatives (쇼핑).
  - Search the public web for related issues (서치).
  - Ask a simpler quick question about usage (즉답).
- **Current UX Friction:** The user must mentally map their intent to a tab, manually switch tabs, and re-upload or re-type the context.

## 4. Proposed Future Direction
**Introduce: "Context Handoff"**
- A conceptual architecture utilizing a `currentContext` object.
- It will rely on a lightweight, transient context passed seamlessly between frontend modes.
- There will be no permanent memory or backend session storage at this stage.

## 5. Possible UX Patterns
*Note: These are possible future patterns only.*
- **“이 제품 쇼핑으로 찾아보기”:** Seamlessly bridges Document AI or Image search to Shopping.
- **“웹에서 더 검색하기”:** Shifts the current topic to the Web Search mode.
- **“즉답으로 다시 물어보기”:** Shifts complex queries into the Quick Q&A mode.
- **“해석 이어가기”:** Moves an image uploaded in Quick Q&A over to Document AI for deeper analysis.

## 6. Context Card Concept
A small, persistent context indicator that visually grounds the user:
- Displays the current active context (e.g., current document, current product, or current search topic).
- Includes lightweight actions:
  - Continue asking
  - Switch mode (Handoff)
  - Clear context

## 7. Important Constraints
To keep the architecture simple and predictable, do **NOT**:
- Add hidden long-term memory or session storage.
- Add supplemental autonomous background agents.
- Auto-switch tabs aggressively without explicit user intent.
- Create complex, multi-window UI layouts.

## 8. Mobile Principle
The mobile experience must adhere to the following principles:
- **Minimal:** No heavy UI elements.
- **Lightweight:** Fast transitions and small state objects.
- **Low cognitive load:** Clear, single-path choices.
- **One-flow feeling:** The app should feel like a single continuous conversation, regardless of the active tab.
