# Shared attachment input foundation

## Scope and principle

This document is an investigation and architecture proposal only. It does not change runtime behavior.

The guiding product principle is:

> Shared input engine, mode-specific upload policy.

Future ThisOne modes should not re-implement file picker, paste, drag/drop, preview, chip, remove, or unsupported-file handling separately. A shared input engine should own the common interaction surface, while each mode owns a strict policy for what it accepts and how it serializes attachments for its API.

## 1. Current state

| Mode | Text input | File picker | Image upload | PDF upload | Drag/drop | Paste image | Voice input | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 해석 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Uses `ThisOneComposerImageInput` with a document-aware policy and local drop handling. Text paste into the textarea is also handled as text input. |
| 즉답 | Yes | UI present | UI present | No | No | Yes | Yes | Composer renders/attaches the image component, but submit currently sends only `question`; selected image is not included in the API payload. |
| 서치 | Yes | UI present | UI present | No | No | Yes | Yes | Web-search mode renders/attaches the image component, but submit currently sends only `q`. Shopping search has a separate image upload/paste path. |
| 럽미 | Yes | UI present | UI present | No | No | Yes | Yes | Composer renders/attaches the image component, but submit currently sends only text `concern/messages/system`; selected image is not included. |
| 집밥 | Yes | UI present | UI present | No | No | Yes | Yes | Composer renders/attaches the image component, but human 집밥 submit currently requires text and sends only `{ mode: 'human', input }`. |
| 쇼핑 | Yes | Yes | Yes | No | No | Yes | Not in the shopping composer | Uses legacy `#fileInput`, `pendingImg`, and `handlePaste(event)` on `#msgInput`; image is sent to intent inference and product analysis flows. |

Important nuance: the shared `ThisOneComposerImageInput` currently installs a document-level paste handler by default. Therefore, modes that attach it can accept pasted images even when the shell does not explicitly declare paste support. This behavior is convenient but too implicit for mode-specific upload policy.

## 2. Current implementation map

### 해석

- Shell file: `js/document_ai_shell.js`
- Composer/input component: `global.ThisOneComposerImageInput.render`, `renderControls`, and `attach` with `DOCUMENT_AI_UPLOAD_POLICY`.
- File input element: generated hidden input `#documentAiImageUploadInput` inside `ThisOneComposerImageInput.renderControls`.
- Accept value: `application/pdf,image/jpeg,image/png,image/webp,text/plain,.pdf,.txt`.
- Paste handler: two layers exist:
  - `ThisOneComposerImageInput.attach` listens on `document` for accepted files from the clipboard.
  - `document_ai_shell.js` contains document/text clipboard helper functions and constants for pasted image/text messages, but the active paste file selection is delegated to the composer component.
- Drag/drop handler: shell-level listeners on `#documentAiUpload` call `imageInput.setFile(event.dataTransfer.files[0])`.
- API payload format: client sends JSON `{ question, file, imageDataUrl }`, where `file` is `{ name, type, dataUrl }` and `imageDataUrl` is a legacy image-only compatibility field. Server parses `body.file` and legacy `imageDataUrl` in `api/documentAi.js`.

### 즉답

- Shell file: `js/instant_answer_shell.js`
- Composer/input component: `global.ThisOneComposerImageInput.render`, `renderControls`, and `attach` with `{ id: 'instantAnswerImage' }` and default image-only policy.
- File input element: generated hidden input `#instantAnswerImageUploadInput`.
- Accept value: default `image/*` from `ThisOneComposerImageInput`.
- Paste handler: document-level paste handler from `ThisOneComposerImageInput.attach`.
- Drag/drop handler: none in the shell.
- API payload format: client sends JSON `{ question }` to `/api/instantAnswer`; `api/instantAnswer.js` requires `req.body.question` and does not parse attachments.

### 서치

- Shell file: `js/web_search_shell.js`
- Composer/input component: `global.ThisOneComposerImageInput.render`, `renderControls`, and `attach` with `{ id: 'webSearchImage' }` and default image-only policy.
- File input element: generated hidden input `#webSearchImageUploadInput`.
- Accept value: default `image/*` from `ThisOneComposerImageInput`.
- Paste handler: document-level paste handler from `ThisOneComposerImageInput.attach`.
- Drag/drop handler: none in the shell.
- API payload format: client sends JSON `{ q: query }` to `/api/webSearch`; server reads `body.q || body.query` and performs text web search only.

### 럽미

- Shell file: `js/loveme_shell.js`
- Composer/input component: `global.ThisOneComposerImageInput.render`, `renderControls`, and `attach` with `{ id: 'loveMeImage' }` and default image-only policy.
- File input element: generated hidden input `#loveMeImageUploadInput`.
- Accept value: default `image/*` from `ThisOneComposerImageInput`.
- Paste handler: document-level paste handler from `ThisOneComposerImageInput.attach`.
- Drag/drop handler: none in the shell.
- API payload format: client sends JSON `{ concern, messages, system }` to `/api/loveme`; server validates `req.body.concern`, sanitizes `req.body.messages`, and does not parse image/file data.

### 집밥

- Shell file: `js/home_meal_shell.js`
- Composer/input component: `global.ThisOneComposerImageInput.render`, `renderControls`, and `attach` with `{ id: 'homeMealImage' }` and default image-only policy.
- File input element: generated hidden input `#homeMealImageUploadInput`.
- Accept value: default `image/*` from `ThisOneComposerImageInput`.
- Paste handler: document-level paste handler from `ThisOneComposerImageInput.attach`.
- Drag/drop handler: none in the shell.
- API payload format: client sends JSON `{ mode: 'human', input }` to `/api/homeMeal`; server validates `mode === 'human'` and non-empty `input`, and does not parse image/file data. Current UI still blocks empty text even if an image is selected.

### 쇼핑

- Shell file: shopping is primarily in `index.html`, `js/search_input_tools.js`, and `js/thisone_app_v3_final.js` rather than an AI-tool shell.
- Composer/input component: legacy landing/search composer, plus `search_input_tools.js` inserts a plus menu next to `#msgInput`.
- File input element: static hidden `#fileInput` in `index.html`.
- Accept value: `image/*`.
- Paste handler: inline `onpaste="handlePaste(event)"` on `#msgInput`; `handlePaste` finds image clipboard items and calls `processFile(file)`.
- Drag/drop handler: none found in the shopping composer.
- API payload format:
  - `processFile` stores `pendingImg = { data, src, type }`.
  - `prepareSendContext` moves `pendingImg` into `queryImage` and clears the preview.
  - Image search sends `queryImage` to `ThisOneAPI.requestIntentInfer('', trajectory, queryImage)`.
  - Product analysis later appends an OpenAI-compatible `image_url` content part built from `queryImage.data`.

## 3. Problems found

1. **Image-only component name and default behavior**
   - The current shared component is named `ThisOneComposerImageInput` and defaults to `accept: 'image/*'`, `allowImages: true`, `allowDocuments: false`, and an image-only unsupported message.
   - 해석 now passes a document-aware policy, but the name and defaults still communicate image-only behavior. This creates a repeat risk: a mode needing documents can accidentally inherit image-only defaults.

2. **Duplicated input logic**
   - AI-tool modes use `ThisOneComposerImageInput` for file picker, preview, remove, and paste.
   - 해석 separately owns drag/drop on its upload container.
   - 쇼핑 owns a separate legacy implementation: `#fileInput`, `handleImg`, `handlePaste`, `processFile`, `removeImg`, `pendingImg`, and preview synchronization.
   - Search plus menu behavior is duplicated between AI-tool composer controls and shopping `search_input_tools.js`.

3. **Mode policy is mixed with component implementation**
   - The shared component both provides UI behavior and decides file acceptance defaults.
   - Mode shells often pass only an `id`, so the component silently decides `image/*` and paste behavior.
   - API payload shape is still hand-built in each shell, which makes attachment state easy to forget during submit.

4. **Drag/drop and paste are not consistently available**
   - Paste is globally attached by the component, but not explicitly controlled by mode policy.
   - Drag/drop exists for 해석 only.
   - 쇼핑 has paste and file picker, but no shared preview/chip/remove engine and no drag/drop.

5. **Risk of one mode's restrictions leaking into another mode**
   - Because default behavior is image-only and implicit, using the component without an explicit policy can unintentionally restrict future document-capable modes.
   - Conversely, broadening the component default to documents would be unsafe because 럽미, 집밥, 서치, and 쇼핑 should remain image-only unless explicitly expanded.
   - Paste is document-level; without policy gating, an active mode can react to clipboard files even when product design intended text-only behavior.

## 4. Proposed architecture

Introduce a shared attachment input component with an explicit policy object.

Recommended name for a new component:

```js
ThisOneAttachmentInput
```

Acceptable incremental refactor name if reusing the current file/component:

```js
ThisOneComposerImageInput → ThisOneComposerAttachmentInput
```

The component should own common interaction behavior only:

- file picker
- drag-and-drop
- paste handling
- preview / file chip display
- remove selected attachment
- friendly unsupported-file messages
- cleanup of object URLs and event listeners
- explicit active-mode checks

Each mode should own policy and payload serialization.

Suggested policy shape:

```js
{
  id,
  uploadLabel,
  accept,
  allowImages,
  allowDocuments,
  allowPaste,
  allowDrop,
  previewMode,
  unsupportedMessage,
  maxFiles,
  onChange
}
```

Recommended additions for implementation PRs:

- `mobileUploadLabel`: keep the existing mobile label capability from `ThisOneComposerImageInput`.
- `fileChipLabel`: keep the existing chip copy capability.
- `serializeAttachment`: optional mode-owned helper, not core component behavior, to convert selected attachments into the API payload shape.
- `onReject(file, reason)`: preserve existing user-friendly rejection flow.
- `scopeElement`: optional drop/paste target boundary. Paste should only fire when the mode is active and focus/context belongs to the current composer.

Policy enforcement rules:

1. The component must not decide business semantics from mode name.
2. `allowDocuments: false` must reject PDF/text even if `accept` is accidentally broad.
3. `allowImages: false` must reject image files even if `accept` includes `image/*`.
4. `allowPaste: false` must avoid installing or acting on paste handlers.
5. `allowDrop: false` must avoid installing or acting on drag/drop handlers.
6. `maxFiles` should start at `1` to preserve current behavior.
7. The component should expose `getFiles()` or `getAttachment()` but not auto-send data to APIs.
8. API payload builders must live in the mode shell or a mode-specific adapter.

## 5. Mode policy table

| Mode | Upload label | Allowed files | Paste | Drop | Preview |
|---|---|---|---|---|---|
| 해석 | 문서·사진 업로드 | PDF, JPG, PNG, WebP, text/plain, `.pdf`, `.txt` | Enabled for image/file; textarea text paste remains normal text | Enabled | Auto: image preview for images, file chip for documents |
| 즉답 | 이미지 추가 | Future image only; no document support until API supports it | Future opt-in for image paste; keep current text flow first | Disabled initially | Image preview when enabled |
| 서치 | 이미지로 검색 | Image only | Enabled for image search | Enabled for image search | Image preview |
| 럽미 | 이미지 업로드 | Image only; no PDF | Enabled | Enabled | Image preview |
| 집밥 | 재료 사진 업로드 | Image only; no PDF | Enabled | Enabled | Image preview |
| 쇼핑 | 이미지 업로드 | Image only | Enabled | Enabled | Image preview |

## 6. Migration plan

Small PR sequence only:

1. **PR 1: `docs: add shared attachment input foundation`**
   - Add this audit/proposal document only.
   - Do not change behavior.

2. **PR 2: `refactor: introduce shared attachment input component`**
   - Introduce `ThisOneAttachmentInput` or `ThisOneComposerAttachmentInput`.
   - Preserve current behavior by wrapping or aliasing existing `ThisOneComposerImageInput` behavior.
   - Add explicit policy fields for `allowPaste`, `allowDrop`, `allowImages`, and `allowDocuments` without changing existing mode outcomes.

3. **PR 3: `refactor: migrate Interpretation mode to attachment policy`**
   - Move 해석 to the new component/policy.
   - Preserve current PDF/image/text upload behavior and privacy copy.
   - Keep payload `{ question, file, imageDataUrl }` unless the API migration is explicitly included.

4. **PR 4: `feat: add image paste/drop support to LoveMe and HomeMeal`**
   - Use image-only policies.
   - Do not allow PDF.
   - Do not change LoveMe safety copy or HomeMeal pet/food safety rules.

5. **PR 5: `feat: add image upload/paste/drop support to Search image flow`**
   - Migrate 서치 image search and/or shopping image search to the shared engine.
   - Keep text search behavior unchanged.
   - Preserve image-only policy.

6. **PR 6: `optional later: add attachment support to Instant Answer`**
   - Add image support only after the Instant Answer API payload and safety review are ready.
   - Must not break current text-only answer flow.

## 7. Non-goals

Do not:

- Change AI prompts.
- Change ranking/search logic.
- Change analytics.
- Change KV.
- Add image generation.
- Make all modes accept all file types.
- Allow PDF in LoveMe/HomeMeal/Search unless explicitly needed.
- Change runtime behavior in this audit PR.

## 8. Safety/privacy notes

- Never store raw file contents in analytics.
- Never log base64/file content.
- Do not send uploaded files to unrelated modes.
- Keep 개인정보 안내 for 해석.
- For LoveMe, avoid medical/surgery claims.
- For 집밥, pet/food safety rules remain separate.
- Keep attachment payloads mode-scoped; clearing or switching modes should clear selected attachments.
- Keep unsupported-file messages friendly and mode-specific.
- Avoid broad document defaults. A document-capable policy must be explicit.

## 9. Proposed next implementation PR

Recommended smallest safe next PR after this documentation:

```text
refactor: introduce shared attachment input component
```

That PR should only introduce the shared component while preserving current behavior. It should not migrate every mode at once, should not broaden accepted file types, and should not change API payloads. The safest implementation shape is an adapter-compatible component that can emulate current `ThisOneComposerImageInput` defaults while requiring explicit policies for any new mode migrations.
