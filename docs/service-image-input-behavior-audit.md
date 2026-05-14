# Service Image Input Behavior Audit

Documentation-only audit of the current service composer image-input behavior. This document records what is already implemented before any future behavior change.

Audited branch/base: current repository baseline checked out for this PR (`5be9cd3`, the latest available pre-audit commit in this workspace). No runtime code, UI code, backend API, image analysis, or image generation behavior was changed.

## Files inspected

Primary requested files:

- `index.html`
- `js/thisone_app_v3_final.js`
- `js/search_input_tools.js`
- `js/document_ai_shell.js`
- `js/instant_answer_shell.js`
- `js/web_search_shell.js`
- `js/loveme_shell.js`

Related image/paste helpers found during inspection:

- `js/api.js`
- `js/image_text_policy_patch.js`

## Summary table

| Mode | Upload button | Camera input | Paste image | Preview | Remove selected file | Backend actually uses image? | Notes |
|---|---|---|---|---|---|---|---|
| 쇼핑 | Yes | No dedicated camera input | Yes | Yes | Yes | Yes | `index.html` renders the shopping preview, delete button, textarea paste handler, and shared `#fileInput`. `search_input_tools.js` adds a plus-menu image item that opens the same input. Uploaded/pasted files become `pendingImg`; submit captures that as `queryImage`, sends it to `/api/intentInfer`, and later appends it to the AI chat payload as an image part. There is no explicit `capture="environment"`, so camera availability is only whatever the browser/OS image picker offers for `accept="image/*"`. |
| 해석 | Yes | No dedicated camera input | Yes | Yes, image files only | Yes | No | The shell accepts PDF/JPG/PNG/WebP via file input, paste, and drag/drop. JPG/PNG/WebP get an object-URL preview; PDF gets status but no image preview. Remove clears status, preview, and input state. Submit currently only shows the 준비 중 placeholder; no file/image payload is sent to a backend. |
| 즉답 | Yes | Yes | No | No | Yes | No | The plus menu has “이미지 업로드” and “사진 찍기”. Upload and camera inputs update selected-file status text and can be removed, but there is no paste handler and no preview element. `/api/chat` receives only the typed question text. |
| 서치 | Yes | Yes | No | Yes | Yes | No | The plus menu has upload and camera inputs. Selecting either one updates selected-file status and object-URL preview, and remove clears both. There is no paste handler. `/api/webSearch` receives only `{ q: query }`; the selected image is not sent. |
| 럽미 | No enabled upload | No enabled camera input | No | No | No | No | The plus menu exists, but both file/photo menu items are disabled and labeled 준비 중. There are no file inputs, capture inputs, preview elements, or remove controls. The LoveMe prompt explicitly forbids photo uploads/photo analysis, and `/api/chat` receives only typed concern text. |

## Detailed findings

### 쇼핑

- `index.html` renders `#imgPreview`, `#previewImg`, and an inline remove button calling `removeImg()`.
- The shopping textarea uses `onpaste="handlePaste(event)"`.
- The visible legacy image button opens `#fileInput`, and `#fileInput` is a shared `type="file"` input with `accept="image/*"` and `onchange="handleImg(event)"`.
- `search_input_tools.js` hides the legacy footer image button and injects a left-side plus menu. Its image menu item opens `#fileInput` after resetting its value.
- `handleImg()` reads the selected file from `event.target.files[0]` and calls `processFile()`.
- `handlePaste()` scans clipboard items and calls `processFile()` for the first item whose MIME type contains `image`.
- `processFile()` reads the file as a data URL, stores `{ data, src, type }` in `pendingImg`, writes the preview image `src`, and marks the preview container as visible.
- `removeImg()` clears `pendingImg`, hides the preview container, removes the preview `src`, and clears `#fileInput.value`.
- On submit, `prepareSendContext()` copies `pendingImg` into `queryImage`, then calls `removeImg()` to clear visible/queued state.
- If `queryImage` exists, `handleImageSearch()` sends it to `ThisOneAPI.requestIntentInfer('', trajectory, queryImage)`. `js/api.js` posts that image field to `/api/intentInfer` after live-preview normalization checks.
- Later AI analysis also appends the image to the chat message as an `image_url` part when `queryImage.data` exists.
- `js/image_text_policy_patch.js` wraps shopping image handling: it records last image metadata, clears typed text when an image is attached after text input, normalizes image payloads for vision, and wraps `removeImg()` to ensure `pendingImg` is cleared.

### 해석

- `js/document_ai_shell.js` defines supported upload/paste file types as PDF, JPG, PNG, and WebP.
- The composer renders a file-add button, hidden file input accepting those supported types, upload status row, image preview element, and remove button.
- `handleFiles()` chooses the first supported file, shows selected-file status, enables remove, and calls `setImagePreview()`.
- `setImagePreview()` only previews JPG/PNG/WebP. PDF files are accepted but do not get an image preview.
- A document-level paste listener is installed while the panel is active. It accepts supported clipboard files, reports unsupported files, and also handles pasted text status when paste occurs outside the question textarea.
- Drag/drop on the upload area also calls `handleFiles()`.
- `clearSelectedFile()` clears file input value, upload status, preview URL, preview `src`, status row visibility, and remove button visibility.
- The current submit button handler only sets the “해석 기능은 준비 중입니다” placeholder. It does not read or send the selected/pasted file to an API.

### 즉답

- `js/instant_answer_shell.js` renders a plus menu with image upload and camera actions.
- The upload input is `accept="image/*"`; the camera input is `accept="image/*" capture="environment"`.
- Clicking either menu item opens the corresponding hidden input.
- Change handlers call `setSelectedFileStatus()`, which stores the active input and displays status text in the form `선택된 이미지: filename` or `선택된 사진: filename`.
- Selecting upload clears the camera input, and selecting camera clears the upload input, so only one selected-file input is active at a time.
- `clearSelectedFileStatus()` clears the active input and hides selected-file status. It is wired to the remove button and mode cleanup.
- No paste listener, clipboard image handling, or preview image element exists in this shell.
- `requestInstantAnswer()` posts to `/api/chat` with `messages: [{ role: 'user', content: question }]`; selected image/camera files are not included.

### 서치

- `js/web_search_shell.js` renders a plus menu with image upload and camera actions.
- The upload input is `accept="image/*"`; the camera input is `accept="image/*" capture="environment"`.
- The shell renders selected-file status text, an image preview element, and a remove button.
- Clicking upload/camera opens the corresponding hidden input.
- Change handlers call `setSelectedFileStatus()`, which stores the active input, clears the other input, creates an object URL, writes preview `src`/`alt`, shows the preview, and displays selected-file text.
- `clearSelectedFileStatus()` clears the active input, revokes the object URL, removes preview `src`, hides preview/status, clears status text, and is wired to remove plus mode cleanup.
- No paste listener or clipboard image handling exists in this shell.
- `requestWebSearch()` posts only `{ q: query }` to `/api/webSearch`; selected image/camera files are not included in the request.

### 럽미

- `js/loveme_shell.js` renders a plus menu, but the menu items are disabled and labeled “파일 추가 준비 중” and “사진 기능 준비 중”.
- There are no enabled upload controls, file inputs, camera/capture inputs, selected-file status elements, preview elements, remove controls, paste listeners, or clipboard image handlers.
- The LoveMe system prompt explicitly says not to ask for photo uploads or face analysis and separately says no photo analysis or photo upload requests.
- `requestLoveMeAnswer()` posts to `/api/chat` with only typed concern text in `messages`; there is no file or image payload path.
