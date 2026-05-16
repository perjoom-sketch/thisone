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
- remove selected file
- paste handling for pasted images and pasted text
- drag/drop handling
- common unsupported-file notice hooks
- `getFile()` / `getAttachment()` state access
- `isProcessable()` / `getUnsupportedMessage()` mode-policy helpers

Component-level accepted inputs are intentionally broader than a single mode's backend capability:

```text
image/jpeg, image/png, image/webp, application/pdf, text/plain, pasted text, pasted image, drag/drop file
```

The component accepts only the common safe file set above. It does not send attachments to any backend by itself.

## Mode policy object

Mode-specific processing capability is centralized in `MODE_ATTACHMENT_POLICIES` inside `js/composer_attachment_input.js` and exported as `window.ThisOneComposerAttachmentInput.MODE_ATTACHMENT_POLICIES`.

Current policy shape:

```js
{
  canUseText: true,
  canUseImage: true,
  canUsePdf: false,
  canUsePlainTextFile: false,
  unsupportedPdfMessage: '...',
  unsupportedPlainTextFileMessage: '...'
}
```

Current modes:

| Mode | Text | Image | PDF | text/plain file | Unsupported behavior |
|---|---:|---:|---:|---:|---|
| shopping | Yes | Yes | No | No | Shows shopping-specific guidance and keeps backend search unchanged. |
| documentAi | Yes | Yes | Yes | Yes | Sends the existing Document AI payload unchanged. |
| instantAnswer | Yes | No | No | No | Foundation policy only; no backend migration. |
| webSearch | Yes | Yes | No | No | Foundation policy only. |
| loveme | Yes | Yes | No | No | Shows a friendly redirect to the 해석 tab for documents. |
| homeMeal | Yes | Yes | No | No | Explains document-like inputs should go to 해석. |

## This PR migration scope

This PR is frontend input foundation only.

Changed runtime behavior is intentionally narrow:

1. **해석 mode** uses `ThisOneComposerAttachmentInput` for PDF/image/text-file selection, paste, drag/drop, preview/chip, and removal while preserving the existing `/api/documentAi` payload shape.
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
- Unsupported attachments are not silently dropped; mode policy returns the exact message shown to the user.
- `ThisOneComposerImageInput` remains in place for legacy/image-only callers during incremental migration.
- Future PRs should migrate remaining shells one mode at a time and keep backend changes separate.
