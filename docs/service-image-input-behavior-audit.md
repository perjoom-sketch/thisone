# Service Image Input Behavior Audit

This audit documents the current image paste/upload behavior across the five service composers before any implementation changes. It is documentation-only: no runtime behavior, UI, backend API, image analysis, or image generation behavior was changed.

## Scope inspected

- `index.html`
- `js/thisone_app_v3_final.js`
- `js/search_input_tools.js`
- `js/document_ai_shell.js`
- `js/instant_answer_shell.js`
- `js/web_search_shell.js`
- `js/loveme_shell.js`
- Related helpers found during audit:
  - `js/api.js`
  - `js/image_text_policy_patch.js`

## Summary table

| Mode | Upload button | Camera input | Paste image | Preview | Remove selected file | Backend actually uses image? | Notes |
|---|---|---|---|---|---|---|---|
| 쇼핑 | Yes | No explicit camera capture input | Yes, from the main textarea paste handler | Yes | Yes | Yes | Uses shared `#fileInput` with `accept="image/*"`; the plus-menu helper opens that same input. Pasted/uploaded images become `pendingImg`, are sent to intent inference, and are also appended to the later AI analysis message. |
| 해석 | Yes | No | Yes | Yes, for JPG/PNG/WebP only | Yes | No | Accepts PDF/JPG/PNG/WebP through file input, paste, and drag/drop. Current submit only shows a ready/placeholder message; selected files are not sent to a backend. |
| 즉답 | Yes | Yes | No | No | Yes | No | Upload and camera inputs only set visible selected-file text. The answer request sends only the typed question to `/api/chat`. |
| 서치 | Yes | Yes | No | Yes | Yes | No | Upload and camera inputs set selected-file state and image preview, but search request sends only `{ q: query }` to `/api/webSearch`. |
| 럽미 | No enabled upload | No enabled camera input | No | No | No | No | Plus menu exists, but both file/photo menu items are disabled and labeled as 준비 중. Prompt explicitly forbids asking for photo uploads or face analysis. |

## Evidence by mode

### 쇼핑

- UI: the landing composer contains `#imgPreview`, `#previewImg`, a remove button calling `removeImg()`, the main textarea with `onpaste="handlePaste(event)"`, an image-upload button opening `#fileInput`, and the hidden `#fileInput` with `accept="image/*"`.
- Helper: `search_input_tools.js` hides the legacy footer image button and injects a plus menu whose image item opens the same `#fileInput`.
- State/preview/remove: `handleImg()` and `handlePaste()` both call `processFile()`, which reads the file into `pendingImg` and shows the preview. `removeImg()` clears `pendingImg`, hides the preview, removes the preview `src`, and clears `#fileInput`.
- Backend use: `prepareSendContext()` captures `pendingImg` into `queryImage`; `handleImageSearch()` passes it to `ThisOneAPI.requestIntentInfer()`. Later AI analysis also appends the image as an `image_url` message part when `queryImage.data` exists. `api.js` posts the image payload to `/api/intentInfer`, and `image_text_policy_patch.js` adds image normalization/policy wrappers around the same shopping image flow.

### 해석

- UI: the document composer renders a file add button, hidden `#documentAiFileInput` accepting PDF/JPG/PNG/WebP, selected-file status row, image preview, and a remove button.
- Supported files/paste: `SUPPORTED_FILE_TYPES` allows PDF/JPG/PNG/WebP; `handlePaste()` listens on `document` while the panel is active, accepts supported clipboard files, and also handles unsupported pasted files/text with status messages.
- Preview/remove: preview is only shown for JPG/PNG/WebP; `clearSelectedFile()` clears file input value, status, preview URL, preview `src`, and remove-button visibility.
- Backend use: the submit button currently sets the ready/placeholder message only. No selected file or pasted image is sent to a backend in this shell.
- Extra input behavior: drag/drop is wired to `handleFiles()` for the upload area.

### 즉답

- UI: the instant-answer composer renders a plus menu with “이미지 업로드” and “사진 찍기”, backed by hidden `accept="image/*"` upload input and hidden `accept="image/*" capture="environment"` camera input.
- Selected-file status/remove: change handlers call `setSelectedFileStatus()`, which stores the active input and displays a label plus file name. `clearSelectedFileStatus()` clears the active input and hides the selected-file status.
- Missing behavior: no paste handler and no preview image element are implemented for this shell.
- Backend use: `requestInstantAnswer()` posts a chat payload whose user content is only the text question; selected image/camera files are not included.

### 서치

- UI: the web-search composer renders a plus menu with upload/camera actions, hidden `accept="image/*"` upload input, hidden `accept="image/*" capture="environment"` camera input, selected-file status, image preview, and remove button.
- Preview/remove: `setSelectedFileStatus()` creates an object URL preview and shows file-name status; `clearSelectedFileStatus()` clears the active input, revokes the preview URL, removes preview `src`, hides preview/status, and clears text.
- Missing behavior: no paste handler is implemented for this shell.
- Backend use: `requestWebSearch()` posts only `{ q: query }` to `/api/webSearch`; selected image/camera files are not included.

### 럽미

- UI: the LoveMe composer has a plus menu, but its file/photo menu items are disabled and labeled “파일 추가 준비 중” and “사진 기능 준비 중”. There are no file inputs, camera capture inputs, preview elements, or remove controls.
- Paste/backend use: no paste handler exists for image input. `requestLoveMeAnswer()` posts only typed concern text to `/api/chat`.
- Product guidance: the LoveMe system prompt explicitly says not to ask for photo uploads or face analysis, and repeats that no photo analysis or photo upload requests should be made.
