# Windows: remembered placement and open keybindings

Two opt-in helpers (core 0.4.0 and later) for a module's ApplicationV2 windows:

- **Remembered placement**: a window opens where the user last left it, at the same size, minimized if it was.
- **Open keybindings**: one line per window to list "Open …" in Configure Controls. No key is assigned unless the module passes one.

Both are experimental (see [STABILITY.md](../STABILITY.md)). The rules are pure and tested in Node (`window-model.mjs`,
`keybinding-model.mjs`); the Foundry halves (`foundry/window.mjs`, `foundry/keybinding.mjs`) are thin and untested in Node.

## Remembered placement

```js
import { RememberedWindow, registerWindowPlacement, resetPlacement } from "../vendor/wanderers-core/foundry/index.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class Hub extends RememberedWindow(HandlebarsApplicationMixin(ApplicationV2), { moduleId: ID, key: "hub" }) {
  static DEFAULT_OPTIONS = { id: `${ID}-hub`, position: { width: 820, height: 640 }, window: { resizable: true } };
}

Hooks.once("init", () => registerWindowPlacement(ID));   // optional: RememberedWindow also registers it on first use
```

`RememberedWindow(Base, { moduleId, key, size = true, minimized = true, saveMs = 400 })` returns a subclass of `Base`:

| Option | Meaning |
|---|---|
| `moduleId` | The host module id. Required. |
| `key` | The window key: 1 to 64 letters, digits, `_`, `-`, `.` (`WINDOW_KEY_RE`). Or a function of the constructor options, for windows opened once per document: `o => "sheet." + o.document.id`. A function that returns no valid key turns remembering off for that instance. |
| `size` | Also remember width and height (default true). Use `false` for windows that size themselves (`height: "auto"`). |
| `minimized` | Also remember the minimized state (default true). |
| `saveMs` | Saves wait this long after the last move or resize (default `PLACEMENT_SAVE_MS`, 400). |

The subclass adds `placementKey` (getter), `clampToViewport()` and `resetPlacement()` (forgets this window's placement).

### Where it is stored

One **hidden client setting per module**: `<moduleId>.windowPlacement` (`PLACEMENT_SETTING`; `scope: "client"`, `config: false`,
`type: Object`). Each user and browser has its own. The value is versioned:

```json
{ "v": 1, "windows": { "hub": { "left": 310, "top": 200, "width": 640, "height": 480 }, "log": { "left": 40, "top": 90, "minimized": true } } }
```

`left`/`top` are page pixels, `width`/`height` Foundry's unscaled pixels (ApplicationPosition). At most `PLACEMENT_MAX` (50) windows
are kept per module; the least recently saved is dropped first. Unreadable values read as empty, bad keys and entries are dropped
(`readPlacements` never throws).

Cleanup: the setting is the module's own, so a module's cleanup plan lists it (client scope) and `resetSettings(ID, ["windowPlacement"])`
or `resetPlacement(ID)` clears it.

### What happens, and when

It uses documented ApplicationV2 methods only (v13/v14 API):

- **Opening** (`_initializeApplicationOptions`): the saved placement, clamped to the page, becomes the window's default `position`.
  **A window that sets its own position keeps it**: if the code opening it passes `position.left` or `position.top` in the
  constructor options, the saved placement is ignored for that window. `render({ position })` still wins as usual.
- **First render** (`_onFirstRender`): minimizes again if it was minimized, starts listening for page resizes and for core client
  setting changes (UI scale), and starts saving.
- **Moving and resizing** (`_onPosition`, which runs after every `setPosition`): a debounced save. Nothing is written when the
  placement didn't change.
- **Minimize / maximize**: saves the flag. The size saved is the one from before minimizing, not the header's.
- **Page resize or UI scale change**: the window is moved (and shrunk if needed) back inside the page. This is not saved, so the
  remembered placement comes back on a larger page.
- **Closing** (`_onClose`): a pending save is written now; listeners are removed.

Clamping (`clampPlacement`): the size shrinks to the page (never below `PLACEMENT_MIN_SIZE`, 120 px, unless the page is smaller),
then the window moves so it is fully on screen; on-screen size is width × the window's `scale`.

### Resetting

```js
await resetPlacement(ID, "hub");   // one window
await resetPlacement(ID);          // every window of the module
```

Open windows stay where they are until closed and opened again. A module may offer this as a button on its control panel
("Reset window positions").

### Pure helpers (`index.mjs`)

`readPlacement`, `readPlacements`, `getPlacement`, `setPlacement`, `removePlacement`, `samePlacement`, `clampPlacement`,
`placementOf`, `debouncer`, `isWindowKey`, constants `PLACEMENT_SETTING` `PLACEMENT_VERSION` `PLACEMENT_MAX` `PLACEMENT_SAVE_MS`
`PLACEMENT_MIN_SIZE` `WINDOW_KEY_RE`. Use them in module tests (for example, to check a window key).

## Open keybindings

```js
import { registerOpenKeybinding } from "../vendor/wanderers-core/foundry/index.mjs";

Hooks.once("init", () => {
  registerOpenKeybinding({
    moduleId: ID, action: "openHub", name: "Open the control panel", hint: "Opens My Module's control panel.",
    gmOnly: true, onDown: () => { Hub.open(); }
  });
});
```

`registerOpenKeybinding({ moduleId, action, name, hint, onDown, gmOnly = false, editable = [], precedence })` is a thin wrapper over
`game.keybindings.register(moduleId, action, config)`. **Call it in the `init` hook.**

| Field | Meaning |
|---|---|
| `action` | Action id, unique in the module: starts with a letter, then letters, digits, `_`, `-` (up to 64). |
| `name`, `hint` | The label and hint in Configure Controls. Pass the final text (translated by the module if it translates). |
| `onDown(context)` | What the key does (open or focus the window). Errors and rejected promises are caught and logged, never thrown into Foundry's key handling. The key press is consumed when it ran. |
| `gmOnly` | Foundry's `restricted`: only GMs can edit and run it. The wrapper also refuses to run it for players. |
| `editable` | Default keys, `[{ key: "KeyH", modifiers: ["Control", "Shift"] }]` (`key` is a KeyboardEvent code, modifiers from `KEY_MODIFIERS`). **Default: none**, so users choose their own keys and nothing clashes with Foundry or other modules. |
| `precedence` | Foundry's `CONST.KEYBINDING_PRECEDENCE` value (optional). |

It throws on a bad definition (`defineOpenKeybinding` checks it), so module tests catch mistakes. Following the house rule that a
disabled feature registers nothing, register a window's keybinding only when its feature is on.
