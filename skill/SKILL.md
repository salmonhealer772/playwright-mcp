---
name: playwright-browser-control
description: Drive a real headless Chromium browser through the Playwright MCP. Use when you need to open a web page, read its rendered content, click elements, fill and submit forms, take screenshots, or extract data from a live site. Always snapshot first, then act, then re-read.
---

# Playwright browser control (via Playwright MCP)

This skill covers driving a real browser through the Playwright MCP server
registered as `playwright` (streamable HTTP at `http://sudo-playwright-mcp:8931/mcp`).
The browser is headless Chromium running inside the fleet cluster.

## When to use

- You need to fetch or inspect a page that a plain HTTP fetch cannot render
  (JavaScript-heavy sites, login walls that still render DOM, single-page apps).
- You need to click, type, submit forms, or navigate a multi-step flow.
- You need a screenshot or the accessibility tree of a live page.
- You need the browser's console messages or network requests.

## The core loop

Always follow this order. It is the single most important habit:

1. `browser_snapshot` (or `browser_navigate` first, then `browser_snapshot`)
   — get the current accessibility snapshot of the page and use it to find the
   exact `ref` / selector of the element you want.
2. Act — `browser_click`, `browser_type`, `browser_select_option`,
   `browser_fill_form`, etc., targeting the `ref` you read from the snapshot.
3. Re-read — `browser_snapshot` again (or read the tool's return value) to
   confirm the effect actually happened before the next step.

Do NOT guess selectors. The accessibility snapshot gives you real `ref`s; use
them.

## Tool reference (the real tool names the Playwright MCP exposes)

Navigation and page lifecycle:

- `browser_navigate` — navigate to a URL. Returns the page title and (depending
  on the server) a snapshot. Do this first for a new page.
- `browser_navigate_back` — go back in history.
- `browser_close` — close the current page/tab.
- `browser_resize` — resize the viewport.
- `browser_tabs` — list, create, close, or select browser tabs.

Reading the page:

- `browser_snapshot` — accessibility snapshot of the current page (the primary
  way to "see" the page). Use this BEFORE and AFTER every action.
- `browser_find` — find an element on the page (returns a ref you can act on).
- `browser_take_screenshot` — capture a PNG screenshot of the current page.
- `browser_console_messages` — read console messages emitted by the page.
- `browser_network_requests` — list network requests the page has made.
- `browser_network_request` — inspect a single network request/response.

Interacting with the page:

- `browser_click` — click an element (pass the `ref` from the snapshot).
- `browser_hover` — hover over an element.
- `browser_drag` — drag an element onto another element.
- `browser_drop` — perform a drag-and-drop between two elements.
- `browser_type` — type text into an editable element.
- `browser_press_key` — press a keyboard key or shortcut.
- `browser_select_option` — select an option in a `<select>` element.
- `browser_fill_form` — fill multiple fields in one call from a snapshot.
- `browser_file_upload` — upload files to an input.
- `browser_handle_dialog` — accept/dismiss a JavaScript dialog.
- `browser_emulate_media` — emulate media features (color scheme, reduced motion).
- `browser_wait_for` — wait for text to appear/disappear on the page.

Running code and evaluating:

- `browser_evaluate` — evaluate a JavaScript expression in the page.
- `browser_run_code_unsafe` — run an arbitrary Playwright code snippet in the
  page (powerful; use only when the other tools cannot express the step).

## Worked recipe: read a page and click a button

1. `browser_navigate` with `url: "https://example.com"`.
2. `browser_snapshot` — find the button you want and note its `ref`.
3. `browser_click` with `element` (the ref) and/or `ref`.
4. `browser_snapshot` — confirm the result.

## Worked recipe: fill and submit a form

1. `browser_navigate` to the form URL.
2. `browser_snapshot` to get field `ref`s.
3. `browser_fill_form` (or `browser_type` each field) with the values.
4. `browser_click` the submit button.
5. `browser_snapshot` to confirm the next page state.

## Tips and pitfalls

- Use `ref` values verbatim from the latest snapshot; they go stale after any
  page mutation, so re-snapshot after every action.
- The browser is a single shared instance (single-user): only one MCP session
  can drive it at a time. Keep one session per task; a second concurrent
  session will fail with "Browser is already in use".
- For pages behind login, navigate to the login page and fill the form as a
  normal browser would; never guess credentials — ask the operator if none are
  provided.
- If a selector you guessed fails, fall back to `browser_snapshot` and use the
  `ref` it reports instead of fighting the selector.
