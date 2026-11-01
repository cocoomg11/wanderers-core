# Shared UI look

One family look for every module's windows, matching Foundry v14's own theme: `styles/wanderers-ui.css` plus small optional markup
helpers in `index.mjs`. **Opt-in**: nothing changes in a module until it adds the stylesheet and puts the root classes on a window.
Experimental while core is 0.x (see [STABILITY.md](../STABILITY.md), *Shared stylesheet*).

- [Adopting it in a module](#adopting-it-in-a-module)
- [Version safety](#version-safety)
- [Tokens](#tokens)
- [Classes](#classes)
- [Markup examples](#markup-examples)
- [JS helpers](#js-helpers)

## Adopting it in a module

1. Update the pin to a core release with the stylesheet (0.3.0 or later): `node vendor/wanderers-core/vendor.mjs update 0.3.0`.
2. List the stylesheet in `module.json`, before the module's own stylesheet (so the module can override):

   ```json
   "styles": ["vendor/wanderers-core/styles/wanderers-ui.css", "styles/my-module.css"]
   ```

   The release zip already carries it (the zip step adds `vendor` minus `vendor/wanderers-core/config/` and `vendor.mjs`).
3. Put the root classes on each window that should use it. Use `UI_CLASSES`, never the literal revision, so a pin update moves the
   window to the new revision with the new stylesheet:

   ```js
   import { UI_CLASSES } from "../vendor/wanderers-core/index.mjs";
   class MyApp extends foundry.applications.api.ApplicationV2 {
     static DEFAULT_OPTIONS = { classes: ["my-window", ...UI_CLASSES], window: { title: "My Module" } };
   }
   ```

   For markup outside a window (a chat card), wrap it: `<div class="${UI_CLASSES.join(" ")}">…</div>`. A window that holds the
   sidebar shell (`.wc-shell` directly in `.window-content`) gets no content padding and becomes the narrow-layout container.
4. Build markup with the classes below, by hand or with the helpers (`badge`, `icon`, `dot`, `statusLine`, `navItem`).
5. Keep the module's own CSS for its layout; move its copies of badges, dots, panels and so on to the shared classes when convenient.
   Module CSS may read the tokens (`var(--wc-ok)`) inside its own windows.
6. Check it in a live world (light and dark theme, a narrow window) and list that in the module's *Untested in Foundry* checklist.

## Version safety

Several modules may vendor different core versions, and Foundry loads every copy of the stylesheet into the same page. The rules
that keep that safe (tests in `tests/ui.test.mjs` check each):

- **Every selector starts at the root** `.wc-ui.wc-r<N>` (optionally after `body`, `body.theme-dark` or `body.theme-light` for the
  theme). No `:root`, `html`, `body` or bare element rules; nothing styles Foundry's own windows or another module's.
- **Tokens are defined on the root**, not on `:root`, so they never leak into the page.
- **The revision class** `wc-r<N>` (`UI_REVISION`) changes whenever the stylesheet changes (a test compares the file to a recorded
  hash per revision). A window built against revision 1 carries `wc-r1` and is styled only by a copy that defines revision 1; a newer
  copy's `wc-r2` rules don't touch it. Two copies of the same revision are byte-identical, so loading both is harmless.
- **Keyframes and container queries are named per revision** (`wc-r2-pulse`, `@container wc-r2`), so copies can't redefine each
  other's.
- Class names are additive: a new revision may add classes; within one revision nothing changes.

What counts as breaking for the stylesheet: removing or renaming a class or token, changing what a class means (its markup
contract), or changing `UI_CLASSES` / `UI_STYLESHEET`. Visual changes (spacing, colour mixing) are not breaking but still need a new
revision. While core is 0.x all of it is experimental.

## Tokens

Defined on the root, from Foundry's variables (checked live on 14.369). Status tokens are darkened in the light theme and the error
red is lightened in the dark theme (body theme or `.theme-dark` / `.theme-light` on the window).

| Token | From |
|---|---|
| `--wc-ok` `--wc-warn` `--wc-bad` `--wc-info` | `--color-level-success` / `-warning` / `-error` / `-info` |
| `--wc-off` | `--color-text-subtle` |
| `--wc-ok-bg` … `--wc-info-bg`, `--wc-off-bg` | the tone mixed to 15-16 % (off: text at 7 %) |
| `--wc-accent`, `--wc-accent-bg` | `--color-text-accent` (warm orange), 15 % |
| `--wc-text` `--wc-text-2` `--wc-text-3` | `--color-text-primary` / `-secondary` / `-subtle` |
| `--wc-line` `--wc-line-strong` | text at 18 % / 30 % |
| `--wc-surface` `--wc-surface-2` `--wc-side-bg` | text at 4 % / 7 % / 6 % |
| `--wc-mono` | `--font-monospace` |
| `--wc-radius` `--wc-radius-sm` | 6 px / 4 px |
| `--wc-tone` | set by the tone classes; components read it |

## Classes

**Root:** `wc-ui` + `wc-r2` (use `UI_CLASSES`). `wc-flush` on the root removes the window content's padding.

**Tones** (on any component, or alone to colour text): `wc-ok`, `wc-warn`, `wc-bad`, `wc-info`, `wc-off`, `wc-pending`, `wc-live`,
`wc-accent`, `wc-none`.

| Component | Classes |
|---|---|
| Utilities | `wc-sr` (screen readers only), `wc-grow`, `wc-row`, `wc-end`, `wc-hint`, `wc-mono`, `wc-cols` (main + side column), `wc-container` (narrow-layout container for non-window use) |
| Icon | `wc-icon` + tone |
| Status line | `wc-status` + tone (a `li` in `ul.wc-lines`, or `p`) |
| Badge / pill | `wc-badge` + tone, `wc-badge-sm` |
| Dot | `wc-dot` + tone; `wc-off` / `wc-none` hollow, `wc-pending` pulsing ring, `wc-live` pulsing filled dot (no motion with `prefers-reduced-motion`) |
| Buttons | `wc-btn`, `wc-btn-sm`, `wc-btn-primary`, `wc-btn-danger`, `wc-btn-ghost`, `wc-btn-icon` (on Foundry's own `button`) |
| Section label | `wc-section-label` |
| Stat tiles | `wc-stats` (grid) › `wc-stat` › `wc-stat-k`, `wc-stat-v` (+ tone), `wc-hint` |
| Panel | `wc-panel` › `wc-panel-head` (h2-h4 inside), `wc-panel-body`, `wc-panel-list` (rows; `li.active`) |
| Banner | `wc-banner` + tone (`wc-live` for recording) › `i`, `wc-banner-text` |
| Alert | `wc-alert` + tone › `i`, `wc-alert-title`, `p` |
| Chips | `wc-chip` (tag or filter; `.active` / `aria-pressed="true"`), `wc-val` (value chip), `wc-val-new` |
| Timeline | `ul.wc-timeline` › `li` (`wc-tl-note`, `wc-tl-new`) › `wc-tl-time`, `wc-tl-icon` + tone, `wc-tl-text`, `wc-tl-aside` |
| Table | `wc-table-box` › `table.wc-table` |
| Shell | `wc-shell` › `nav.wc-side` (`wc-side-head` group labels, `wc-nav` links with `.active` or `aria-current="page"`, `wc-nav-label`, `wc-muted`, `wc-side-foot`), `wc-main` (the page scrolls as a whole; its direct children keep their height, from revision 2) |
| Page head | `wc-pagehead` › `wc-pagehead-title` (h1/h2), `wc-pagehead-meta`; buttons after the title |
| Focus | `wc-btn`, `wc-chip`, `wc-nav` show a 2 px accent outline on `:focus-visible` |
| Narrow | at 720 px wide or less (`@container wc-r2`): the sidebar becomes a wrapping strip, `wc-cols` one column, timeline rows fold |

## Markup examples

```html
<div class="window-content">
  <div class="wc-shell">
    <nav class="wc-side" aria-label="My Module sections">
      <button type="button" class="wc-nav active" data-action="nav" data-page="session" aria-current="page">
        <span class="wc-dot wc-live" aria-hidden="true"></span><span class="wc-nav-label">Session</span>
        <span class="wc-badge wc-bad wc-badge-sm">Live</span></button>
      <h2 class="wc-side-head">Settings</h2>
      <button type="button" class="wc-nav" data-action="nav" data-page="health">
        <i class="fa-solid fa-heart-pulse" aria-hidden="true"></i><span class="wc-nav-label">Health</span>
        <span class="wc-dot wc-ok" aria-hidden="true"></span></button>
      <span class="wc-side-foot">My Module <code>1.0.0</code></span>
    </nav>
    <main class="wc-main">
      <header class="wc-pagehead">
        <div class="wc-pagehead-title"><h2>Session 7</h2>
          <div class="wc-pagehead-meta"><span class="wc-badge wc-live"><span class="wc-dot wc-live" aria-hidden="true"></span>Recording</span></div></div>
        <button type="button" class="wc-btn wc-btn-danger" data-action="end">End session</button>
      </header>
      <div class="wc-stats">
        <div class="wc-stat"><span class="wc-stat-k">Events</span><span class="wc-stat-v">23</span><span class="wc-hint">2 combats</span></div>
        <div class="wc-stat"><span class="wc-stat-k">Open threads</span><span class="wc-stat-v wc-info">2</span></div>
      </div>
      <div class="wc-banner wc-warn" role="status"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        <span class="wc-banner-text">Update available</span></div>
      <section class="wc-panel">
        <header class="wc-panel-head"><h3>Timeline</h3><button type="button" class="wc-chip" aria-pressed="true">All</button></header>
        <ul class="wc-timeline">
          <li class="wc-tl-new"><span class="wc-tl-time"><b>20:14</b><span>21:40</span></span>
            <span class="wc-tl-icon wc-accent"><i class="fa-solid fa-pen" aria-hidden="true"></i></span>
            <span class="wc-tl-text">A note <span class="wc-badge wc-badge-sm wc-off">GM only</span></span>
            <span class="wc-tl-aside">just now</span></li>
        </ul>
      </section>
      <section class="wc-panel"><header class="wc-panel-head"><h3>Health</h3></header>
        <div class="wc-panel-body"><ul class="wc-lines">
          <li class="wc-status wc-ok"><i class="fa-solid fa-circle-check wc-icon wc-ok" aria-hidden="true"></i><span class="wc-sr">OK:</span><span class="wc-grow">Settings readable</span></li>
        </ul></div></section>
    </main>
  </div>
</div>
```

## JS helpers

From `vendor/wanderers-core/index.mjs`, pure and tested in Node. Every value is escaped; status is an icon plus a screen-reader word
(never ✓ ⚠ ✗ characters, never colour alone).

| Helper | Returns |
|---|---|
| `UI_REVISION`, `UI_CLASSES`, `UI_STYLESHEET` | `2`, `["wc-ui", "wc-r2"]`, `"styles/wanderers-ui.css"` |
| `TONES` | frozen `{ ok, warn, bad, info, off, pending, live, accent, none }` → `{ icon, word }` (Font Awesome classes, screen-reader word) |
| `tone(t)` | a tone name; health levels and aliases through `level` ("error" → "bad"); unknown → "info" |
| `icon(t, { word })` | `<i class="… wc-icon wc-<t>" aria-hidden="true"></i><span class="wc-sr">Word:</span>`; `word: false` drops the word |
| `badge(t, text, { title, icon, small, dot, cls })` | `<span class="wc-badge wc-<t>">…</span>` |
| `dot(t, { label, title })` | `<span class="wc-dot wc-<t>" aria-hidden="true"></span>` (+ `wc-sr` label) |
| `statusLine(t, text, { tag, html })` | `<li class="wc-status wc-<t>">` icon + text (`tag: "p"` / `"div"`; `html` is trusted markup only) |
| `statusLines(lines)` | `<ul class="wc-lines">` from health-report lines `{ level, text }` |
| `navItem({ label, action, page, icon, dot, badge, active, muted, aria, tabindex, data })` | a `button.wc-nav` for ApplicationV2 `actions` (`data-action`, default `nav`) |
