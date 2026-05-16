# Shared attachment input foundation

## Principle

ThisOne now separates the input method from the processing capability:

```text
Input method is universal.
Processing capability is mode-specific.
```

Users should feel that they can add text, image files, documents, pasted images/text, drag/drop files, and voice input from the same composer pattern. The active mode then decides whether that attachment can be used, and must explain unsupported inputs instead of silently ignoring them.

## Runtime component

The shared browser component is exposed as:

```js
window.ThisOneComposerAttachmentInput
```

It provides the same foundation for all mode composers:

- shared `render()` preview/chip markup
- shared `renderControls()` plus-button and hidden file input
- shared `attach()` state/event binding
- image preview
- document/text file chip
- render a multi-file attachment bundle with preserved selection order
- remove one selected file without clearing the rest of the bundle
- paste handling for multiple pasted images/files and pasted text
- drag/drop handling for multiple files
- common unsupported-file notice hooks
- `getFiles()` bundle state access, plus `getFile()` / `getAttachment()` first-file aliases for backward compatibility
- `setFiles(files)`, `addFiles(files)`, and `clear()` bundle mutation helpers
- `isProcessable()` / `getUnsupportedMessage()` mode-policy helpers

Component-level accepted inputs are intentionally broader than a single mode's backend capability:

```text
image/jpeg, image/png, image/webp, application/pdf, text/plain, pasted text, pasted image, drag/drop file
```

The file picker advertises the common safe file set above, but dropped or pasted unsupported files stay in composer state so the active mode can show its mode-specific unsupported message on submit. The component does not send attachments to any backend by itself.

## Mode policy object

Mode-specific processing capability is centralized in `MODE_ATTACHMENT_POLICIES` inside `js/composer_attachment_input.js` and exported as `window.ThisOneComposerAttachmentInput.MODE_ATTACHMENT_POLICIES`.

Current policy shape:

```js
{
  canUseText: true,
  canUseImage: true,
  canUsePdf: false,
  canUsePlainTextFile: false,
  maxFiles: 1,
  unsupportedPdfMessage: '...',
  unsupportedPlainTextFileMessage: '...'
}
```

Current modes:

| Mode | Text | Image | PDF | text/plain file | Max files | Unsupported behavior |
|---|---:|---:|---:|---:|---:|---|
| shopping | Yes | Yes | No | No | 1 | Shows shopping-specific guidance and keeps backend search unchanged. |
| documentAi | Yes | Yes | Yes | Yes | 10 | Allows multiple images/documents in one ordered input bundle; backend payload migration is intentionally separate. |
| instantAnswer | Yes | No | No | No | 1 | Foundation policy only; no backend migration. |
| webSearch | Yes | Yes | No | No | 1 | Foundation policy only. |
| loveme | Yes | Yes | No | No | 1 | Shows a friendly redirect to the 해석 tab for documents. |
| homeMeal | Yes | Yes | No | No | 1 | Explains document-like inputs should go to 해석. |

## This PR migration scope

This PR is frontend input foundation only.

Changed runtime behavior is intentionally narrow:

1. **해석 mode** uses `ThisOneComposerAttachmentInput` for ordered multi-file PDF/image/text-file selection, paste, drag/drop, preview/chip, one-at-a-time removal, and clearing while preserving the existing `/api/documentAi` payload shape.
2. **쇼핑 mode** can select a PDF/text file into the shared attachment state preview, then shows a clear unsupported message on search instead of failing silently. Image search behavior is preserved.
3. **럽미 / 집밥** use the shared attachment state and mode policy so PDF attachment is accepted into the composer UI but blocked with friendly guidance at submit time. Their text-only backend payloads are unchanged.

## Non-goals

This foundation does not:

- change backend behavior
- change analytics
- change shopping ranking
- change Document AI PDF backend
- add document sessions
- add supplemental search
- add storage
- add dependencies
- add image generation
- send unsupported attachments to mode APIs

## Implementation notes

- Mode shells own payload serialization.
- Unsupported attachments are not silently dropped; they remain in bundle state and mode policy returns the exact message shown to the user on submit.
- `ThisOneComposerImageInput` remains in place for legacy/image-only callers during incremental migration and mirrors the same `getFiles()` / `setFiles()` / `addFiles()` / `clear()` API shape.
- Future PRs should migrate remaining shells one mode at a time and keep backend changes separate.
