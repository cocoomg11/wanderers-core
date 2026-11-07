# Guest pages

Since 0.6.0 (experimental). A **host** module owns a window with pages (a character sheet with bookmarks, a control panel with
tabs) and lets other modules, the **guests**, add pages of their own. Core gives the host the registry and the safe calls; the
window, its markup and its wording stay in the host.

Everything here is pure (`index.mjs`, no Foundry calls), so a host tests its use in Node.

```js
import { createPageHost, renderGuest, activateGuest } from "../vendor/wanderers-core/index.mjs";
```

## There is no shared registry

Each host makes **its own** registry with `createPageHost` (one per window that takes guests) and hands guests a small object
through its own module API. Core keeps nothing on `globalThis`, so two hosts (or two copies of core) never see each other's pages,
and a guest can only reach a host it knows by name.

## Host contract

```js
const host = createPageHost({
  hostId: "my-host",                         // the host module's id (for warnings)
  builtIn: [{ id: "main", order: 10, label: "Main" }, { id: "extra", order: 90, visible: ctx => ctx.showExtra }],
  onChange: ({ type, id }) => redrawOpenWindows(), // after every register / unregister; a throw is logged
  max: 20,                                   // optional, default PAGE_GUESTS_MAX (20)
  warn: (...a) => console.warn("my-host |", ...a) // optional
});
```

- `builtIn` are the host's own pages: each needs a string `id` and a numeric `order`; any other fields (label, icon, …) are kept as
  given. An optional `visible(ctx)` hides one for a context. A mistake here **throws** (the host's tests catch it).
- `host.register(def)` → `off()`: adds a guest page, or replaces the page with the same id. It **never throws**: a bad definition is
  refused with a console warning, and `off.ok` is false with `off.reason` saying why (`off()` then does nothing). Past `max` guest
  pages a new id is refused; replacing an existing id always works. `off()` removes that registration only (not a later one that
  replaced it) and returns whether it removed something.
- `host.unregister(id)` → boolean (guests only; built-ins stay).
- `host.pages(ctx)`: the built-ins and guests visible for `ctx`, in display order. `host.guests(ctx)`: only the visible guests.
  Order: `order` ascending (no order = after every numbered page), built-ins before guests on a tie, then id. `orderPages(list)` is
  the same sort for a host that merges lists itself. `ctx` is whatever the host passes; it is handed to each `visible(ctx)` as is.
  A `visible` that throws hides that page (warned once per page).
- `host.get(id)` → the page (built-in with `guest: false`, or guest with `guest: true`) or null; `host.has(id)`; `host.size()`
  (guests registered).
- Draw a guest page with `renderGuest(page, ctx, { timeoutMs })` → `{ html }`, `{ element }` or `{ error }`. It never throws or
  rejects; it times out after `PAGE_RENDER_MS` (5 s) by default. On `{ error }` show **one line** in the page (escape it) instead of
  the body, and leave the rest of the window working.
- After the body is in the window, call `activateGuest(page, ctx)` → `{ ok: true }` or `{ error }` (log it).
- Insert `html` as is (it is the guest's markup: the host doesn't escape it again). Escape the guest's `label` and `hint` yourself
  wherever you write them into HTML. `icon` is either null, an SVG path's `d` (only drawing commands and numbers, so safe inside a
  `d="…"` attribute), and `fa` null or Font Awesome classes (safe in a `class` attribute). Pick a default icon when both are null.
- Unknown page ids (a guest that went away) are the host's to handle: fall back to a built-in page.
- Tell guests when they can register: from the host's API once it exists, plus a hook the host fires right after (so guests that
  load before the host can wait for it).

## Guest contract

A definition (other fields are ignored):

| Field | | |
|---|---|---|
| `id` | required | `<your-module-id>.<page>`, `PAGE_ID_RE` = `^[a-z0-9-]+\.[A-Za-z0-9_-]+$`, at most 80 characters |
| `label` | required | at most 40 characters (tooltip and title) |
| `hint` | optional | at most 80 characters (a short line next to the title) |
| `icon` | optional | one SVG path `d` on a 24 × 24 grid (drawing commands `MLHVCSQTAZ` and numbers only, at most 2000 characters), or Font Awesome classes matching `^fa-[a-z]+( fa-[a-z0-9-]+)+$` |
| `fa` | optional | Font Awesome classes (a path in `icon` wins when both are given) |
| `order` | optional | a number; the host documents its own pages' orders |
| `render(ctx)` | required | returns an HTML string or an element (may be async) |
| `visible(ctx)` | optional | return `false` to hide the page for that context |
| `activate(ctx)` | optional | wire listeners after each render; returns nothing |

- **Escape your own data.** The HTML string you return is inserted as is.
- `ctx` is a frozen shallow copy of what the host passes. The host documents its fields (a character sheet might pass
  `{ actor, mode, editable, root }`). Read documents yourself; **the host gives guests no way to write its data**, and a guest must
  never write the host's flags or settings (go through the host's API if it offers one).
- A render that throws, rejects, takes too long or returns something else shows one error line in the host's page; the host keeps
  working. Fix it and register again (same id) to replace it.
- `register` returns `off()`; call it when your feature is switched off or your module tears down.
- Style the page with core's `wc-*` classes and your own classes scoped under your page's root; no theme selectors unless the host
  says its window follows the theme.
