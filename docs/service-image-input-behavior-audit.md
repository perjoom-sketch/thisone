# Service Image Input Behavior Audit

This audit documents the current service image input behavior after the LoveMe Serper backend merge. It is documentation-only: no runtime code, UI, backend API, image analysis, or image generation behavior was changed.

## Scope inspected

- `index.html`
- `js/thisone_app_v3_final.js`
- `js/search_input_tools.js`
- `js/api.js`
- `js/document_ai_shell.js`
- `js/instant_answer_shell.js`
- `js/web_search_shell.js`
- `js/loveme_shell.js`
- `api/loveme.js`

## LoveMe backend/frontend routing status

LoveMe now has an `/api/loveme` backend foundation in `api/loveme.js`.

- The backend file exports a Vercel-style POST handler and CORS/OPTIONS handling.
- It accepts a text `concern`, sanitizes text-only chat messages, optionally builds Serper-powered styling search context, then asks Gemini for a LoveMe styling answer.
- Serper search is fail-soft: Serper failures are logged and LoveMe falls back to a Gemini-only answer.
- The backend contract currently returns JSON `{ answer, usedSearch }`; it does not accept or process image files.

Current frontend status: **LoveMe frontend still calls `/api/chat`, not `/api/loveme`.**

- `js/loveme_shell.js` builds a chat payload with `model`, `system`, and text-only `messages`.
- `requestLoveMeAnswer()` sends that payload to `/api/chat`.
- The rendered LoveMe composer has disabled file/photo menu items and no active file input, camera input, preview, remove control, or image paste flow.

## Summary table

| Mode | Upload button | Camera input | Paste image | Preview | Remove selected file | Endpoint used by submit/search | Backend actually uses image? | Current behavior |
|---|---|---|---|---|---|---|---|---|
| 쇼핑 | Yes | No explicit camera capture input | Yes | Yes | Yes | `/api/intentInfer`, `/api/search/*`, `/api/chat` | Yes | Shared shopping image flow stores uploaded/pasted image in `pendingImg`; image is sent to intent inference and later included in the AI ranking chat message. |
| 해석 | Yes | No | Yes | Yes, for JPG/PNG/WebP only | Yes | None for file/content submit | No | Accepts PDF/JPG/PNG/WebP selections, paste, and drag/drop, but submit only displays the ready placeholder. |
| 즉답 | Yes | Yes | No | No | Yes | `/api/chat` | No | Upload/camera inputs only show selected-file status; the answer request sends text-only chat content. |
| 서치 | Yes | Yes | No | Yes | Yes | `/api/webSearch` | No | Upload/camera inputs show selected image/photo status and preview; the web search request sends only `{ q }`. |
| 럽미 | No enabled upload | No enabled camera input | No | No | No | `/api/chat` from frontend; `/api/loveme` exists but is not used by frontend | No | LoveMe has a backend foundation at `/api/loveme`, but the active frontend remains text-only through `/api/chat`; file/photo menu items are disabled. |

## Evidence by mode

### 쇼핑

- UI entry points: the landing composer includes an image preview, remove button, textarea paste handler, image-upload button, and hidden `#fileInput` with `accept="image/*"`.
- Plus-menu helper: `search_input_tools.js` opens the same `#fileInput` from the shopping plus menu.
- State/preview/remove: `handleImg()` and `handlePaste()` call `processFile()`, which reads the selected/pasted image into `pendingImg` and displays the preview. `removeImg()` clears `pendingImg`, hides/removes preview state, and clears `#fileInput`.
- Submit behavior: `prepareSendContext()` captures `pendingImg` into `queryImage`, then clears the visible attachment. If `queryImage` exists, `sendMsg()` runs `handleImageSearch()` before the normal search path.
- Backend image use: `handleImageSearch()` sends the image to `ThisOneAPI.requestIntentInfer()`, which posts `{ query, trajectory, image }` to `/api/intentInfer`. Later AI analysis appends the same image as an `image_url` message part before calling `/api/chat`.

### 해석

- UI entry points: the document composer renders a file add button, hidden `#documentAiFileInput`, selected-file status row, image preview, and remove button.
- Supported inputs: `SUPPORTED_FILE_TYPES` allows PDF/JPG/PNG/WebP. The shell accepts file input changes, drag/drop, and paste while the document panel is active.
- Preview/remove: preview is only created for JPG/PNG/WebP. `clearSelectedFile()` clears the file input, status row, preview URL, preview image, and remove button state.
- Backend image use: none. The submit button sets the ready placeholder message only; no selected file, pasted file, or image preview state is sent to any backend.

### 즉답

- UI entry points: the instant-answer composer renders an image upload menu item and a camera menu item, backed by hidden `accept="image/*"` upload and `accept="image/*" capture="environment"` camera inputs.
- Status/remove: file changes call `setSelectedFileStatus()`, which records the active input and shows the selected file name. The remove button clears the active input and hides the status.
- Missing image handling: there is no paste handler and no image preview element in this shell.
- Backend image use: none. `requestInstantAnswer()` sends a text-only chat payload to `/api/chat`; selected upload/camera files are not included.

### 서치

- UI entry points: the web-search composer renders upload and camera menu items, hidden `accept="image/*"` upload/camera inputs, selected-file status, image preview, and remove button.
- Preview/remove: file changes call `setSelectedFileStatus()`, which creates an object URL preview and status text. `clearSelectedFileStatus()` clears the active input, revokes the preview URL, removes preview `src`, hides preview/status, and clears selected-file state.
- Missing image handling: there is no paste handler in this shell.
- Backend image use: none. `requestWebSearch()` posts only `{ q: query }` to `/api/webSearch`; selected upload/camera files are not included.

### 럽미

- Backend foundation: `api/loveme.js` now implements `/api/loveme` with text concern validation, optional Serper search context, Gemini answer generation, and JSON response handling.
- Frontend endpoint: the active LoveMe frontend still calls `/api/chat`. It does **not** call `/api/loveme`.
- UI image inputs: the LoveMe composer has a plus menu, but both file/photo menu items are disabled and labeled as not ready. There are no active file inputs, camera inputs, preview elements, remove controls, or image paste handlers.
- Backend image use: none through the current frontend. The `/api/loveme` backend foundation also sanitizes text content and does not define image upload or image-analysis handling.
- Product guidance: the LoveMe prompt explicitly forbids photo analysis or photo upload requests.

## Overall conclusion

- **Only 쇼핑 currently has end-to-end image input behavior that reaches backend AI logic.**
- **해석, 즉답, 서치, and 럽미 expose either placeholder or UI-only image affordances, but their current submit/search paths do not send image data to backend processing.**
- **LoveMe’s `/api/loveme` backend foundation exists after the Serper merge, but the LoveMe frontend is still wired to `/api/chat` and remains text-only.**
