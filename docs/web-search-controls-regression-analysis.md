# Web Search controls regression analysis

## Scope

This report analyzes why Web Search (`서치`) controls can still appear unresponsive after #305 and #306. It intentionally does **not** change runtime behavior, UI, backend logic, image UX, shopping, or other modes.

## Current observed symptom

Reported production/browser behavior in Web Search mode:

- Not responding:
  - `+` image menu button
  - `?` help button
  - `검색` submit button
  - Enter-to-search
- Still responding:
  - Mic button
  - Image paste

This split is important because it matches a failure that occurs **after** mic attachment and image paste attachment, but **before** help, submit, and Enter handlers are bound.

## Confirmed code state on the current branch

### #305 fix is present in the current source

The current `js/web_search_shell.js` includes the #305 declarations:

```js
const helpButton = root.querySelector('#webSearchHelpButton');
const helpPanel = root.querySelector('#webSearchHelpPanel');
```

These appear before mic attachment, mode tab binding, image helper attachment, help button binding, and submit/Enter binding.

### Required Web Search DOM IDs are generated

`renderWebSearchShell()` currently renders the expected controls:

- `#webSearchInput`
- `#webSearchImagePlusButton` through `ThisOneComposerImageInput.renderControls({ id: 'webSearchImage' })`
- `#webSearchHelpButton`
- `#webSearchMicButton`
- `#webSearchSubmit`
- `#webSearchHelpPanel`

The generated plus button ID comes from `composer_image_input.js`: `${id}PlusButton`, so `id: 'webSearchImage'` produces `webSearchImagePlusButton`.

## Script cache-busting state

`index.html` still loads these versions:

```html
<script src="js/composer_image_input.js?v=1.0.0" defer></script>
<script src="js/web_search_shell.js?v=1.0.2" defer></script>
```

Those query strings did **not** change across the relevant commits checked locally:

- #303 / `e77c82d`: `composer_image_input.js?v=1.0.0`, `web_search_shell.js?v=1.0.2`
- #304 / `4d256d0`: `composer_image_input.js?v=1.0.0`, `web_search_shell.js?v=1.0.2`
- #305 / `406260d`: `composer_image_input.js?v=1.0.0`, `web_search_shell.js?v=1.0.2`
- #306 / `49fa64f`: `composer_image_input.js?v=1.0.0`, `web_search_shell.js?v=1.0.2`

This is suspicious because #305 changed `js/web_search_shell.js`, but the URL remained `js/web_search_shell.js?v=1.0.2`. Browsers, CDNs, or Safari can therefore continue serving a cached pre-#305 file even after the source fix exists in the repository.

## Web Search initialization order

Current `openWebSearch()` runs:

1. `enterWebSearchMode()`
   - Stops AI-tool voice input.
   - Adds `ai-tool-mode` and `web-search-mode` to `<body>`.
   - Removes other AI-tool mode classes.
2. `renderWebSearchShell()`
   - Replaces `#msgContainer` contents with the Web Search panel.
   - Queries the rendered controls: input, submit, status, mic, voice status, help button, help panel.
   - Attaches mic via `ThisOneAIToolVoice.attach()`.
   - Binds mode tabs via `ThisOneModeTabs.bind(root)`.
   - Attaches the shared image helper via `ThisOneComposerImageInput.attach()`.
   - Registers cleanup for Web Search mode.
   - Binds the help button click handler.
   - Binds Escape on the panel.
   - Defines `runSearch()`.
   - Binds submit click.
   - Binds input Enter keydown.
   - Autofocuses the input on desktop.

The stale pre-#305 file fails exactly between image helper attachment and help/submit/Enter binding.

## Runtime error found

### Error reproduced with the pre-#305 Web Search shell

A lightweight DOM/VM smoke test was run against the pre-#305 `e77c82d` version of `js/web_search_shell.js`. It reproduced the known failure:

```text
ReferenceError: helpButton is not defined
    at renderWebSearchShell
```

In that stale file, `helpButton` and `helpPanel` are referenced but never declared. The execution reaches this code only after mic attachment and image helper attachment have already run.

That explains the production symptom pattern:

- Mic works because `ThisOneAIToolVoice.attach()` runs before the exception.
- Image paste works because `ThisOneComposerImageInput.attach()` registers the global paste listener before the exception.
- `+` appears unresponsive because its click handler calls `beforeOpen`, which calls `setHelpPanelOpen(false)`, which references the undeclared `helpButton`/`helpPanel` in the stale file.
- `?`, `검색`, and Enter do not work because the exception aborts `renderWebSearchShell()` before their listeners are attached.

### Current source smoke test

The same lightweight DOM/VM smoke test against the current source passed:

```text
DOM smoke passed: ids exist and +, ?, submit, Enter handlers execute without synchronous errors
```

This indicates the current checked-in runtime source does not reproduce the unresponsive-control failure in the tested handler-binding path.

## Composer image helper event-handling review

`ThisOneComposerImageInput.attach()` currently:

- Finds `#webSearchImagePlusButton`, `#webSearchImageMenu`, upload controls, preview controls, and remove controls by the configured `id`.
- Adds a `click` listener to the plus button.
- Calls `event.stopPropagation()` on plus clicks.
- Calls `options.beforeOpen()` before toggling the plus menu.
- Toggles `plusMenu.hidden` and `aria-expanded`.
- Adds a document-level paste listener that is gated by `options.isActive()`.
- Adds a document-level click listener that only closes an already-open menu when the click target is outside `.composer-plus-wrap`.

No current-source evidence shows the image helper swallowing help, submit, Enter, or mic events. The only image-helper-related path that explains the reported `+` failure is the stale pre-#305 `beforeOpen -> setHelpPanelOpen(false) -> ReferenceError` path.

## CSS / pointer-events / z-index review

Relevant Web Search composer CSS was inspected for blocking overlays or click suppression:

- `.web-search-form` is a normal flex column.
- `.web-search-composer-top`, `.web-search-composer-bottom`, `.web-search-composer-left-actions`, and `.web-search-composer-actions` are normal flex rows.
- `.web-search-plus-wrap` is `position: relative`, but no full-row overlay is created.
- `.web-search-plus-button`, `.web-search-help-button`, `.ai-tool-mic-button`, and `.web-search-submit` have normal button sizing and `cursor: pointer`.
- `.web-search-help-panel[hidden]` uses `display: none`.
- No `pointer-events: none`, blocking pseudo-element, or high-z-index overlay was found in the inspected Web Search composer selectors.

CSS is therefore not the most likely root cause for the described exact split where mic and paste work but `+`, `?`, submit, and Enter fail together.

## Mode cleanup / re-render review

`ThisOneModeTabs.open()` calls registered cleanup handlers for modes other than the next mode, then opens the requested mode. Web Search registers cleanup after image helper attachment. The current cleanup only calls `imageInput.cleanup()`.

No current-source cleanup path was found that removes the freshly bound Web Search help, submit, or Enter handlers immediately after `renderWebSearchShell()` completes. The stale pre-#305 exception remains a better match because those handlers are never reached in the first place.

## Most likely root cause

The most likely root cause is **stale cached `js/web_search_shell.js?v=1.0.2` still being served in the browser/CDN/Safari after #305**.

Why this is the strongest explanation:

1. Current source contains the #305 `helpButton` and `helpPanel` declarations.
2. A DOM/VM smoke test against current source confirms the expected IDs exist and `+`, `?`, submit, and Enter handlers execute without synchronous errors.
3. The pre-#305 shell reproduces `ReferenceError: helpButton is not defined` in exactly the initialization slot implied by the symptom.
4. The unchanged script query string (`v=1.0.2`) makes a stale browser/CDN copy plausible.
5. The stale pre-#305 failure explains why mic and image paste work while `+`, `?`, submit, and Enter fail.

## Recommended next PR scope

Do this in the next runtime-fix PR, not in this analysis-only PR:

1. Bump the `index.html` cache-busting query string for `js/web_search_shell.js` so clients cannot keep using the pre-#305 script URL.
2. Consider bumping `js/composer_image_input.js` as well because #306 changed that file while its URL remained `v=1.0.0`.
3. Add a small regression test or browser smoke check that opens Web Search and verifies:
   - all required IDs exist,
   - no console error occurs during `ThisOneWebSearch.open()`;
   - `+` toggles the image menu,
   - `?` toggles the help panel,
   - submit click calls the Web Search request path,
   - Enter calls the Web Search request path.
4. Optionally add defensive guards around Web Search binding so a single optional control cannot abort submit/Enter binding in future merges.
5. After deploying, verify the loaded browser URL and response content for `js/web_search_shell.js` show the bumped query string and include the `helpButton` / `helpPanel` declarations.

## Commands run

```bash
git fetch origin main
```

This failed because the local repository has no `origin` remote configured. The current branch history already has #306 at `HEAD` (`49fa64f`). A fresh analysis branch was created from that state.

```bash
git checkout -b docs/web-search-controls-regression-analysis
rg -n "web_search_shell|composer_image_input|webSearchHelpButton|webSearchHelpPanel|webSearchImagePlusButton|webSearchSubmit|webSearchInput|webSearchMicButton|enterWebSearchMode|renderWebSearchShell|ThisOneComposerImageInput|AI_TOOL|mode" index.html js/web_search_shell.js js/composer_image_input.js js/ai_tool_voice_input.js styles/main.css
nl -ba js/web_search_shell.js | sed -n '100,240p'
nl -ba js/composer_image_input.js | sed -n '1,220p'
nl -ba js/ai_tool_voice_input.js | sed -n '1,220p'
nl -ba styles/main.css | sed -n '2990,3465p'
for rev in e77c82d 4d256d0 406260d 49fa64f; do git show "$rev":index.html | rg -n "composer_image_input|web_search_shell"; done
node /tmp/web_search_dom_smoke.js
node /tmp/web_search_dom_smoke_old.js
```

## AGENTS.md update confirmation

`AGENTS.md` was read and followed for this analysis-only task. It was **not** modified.
