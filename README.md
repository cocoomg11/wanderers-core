# wanderers-core

The shared code behind a family of Foundry VTT modules (v13 minimum, verified v14 build 369; any game system). Each module vendors a
pinned copy, so core is a library, not something you install. It has two parts:

- **Shared code** every module repeats: a feature registry, a settings table, a one-writer election with schema-checked socket
  requests, read-only health checks, cleanup plans, debug logging, settings files, update notes, version compare, capped record
  lists, schema-version normalizers, request rate limits, one shared Scene Configuration tab, remembered window placement and
  keybindings that open a module's windows.
- **An opt-in shared UI look**: a stylesheet that matches Foundry's own theme (light and dark) plus small markup helpers, so every
  module's windows look alike. Nothing changes in a module until it adds the stylesheet ([docs/ui.md](docs/ui.md)).

**Core is not a Foundry module.** Nobody installs it. Each module copies a pinned version into `vendor/wanderers-core/` and ships it
inside its own zip, so every module stays standalone. CI in each module fails when the copy differs from its pin.

- [Using core in a module](#using-core-in-a-module)
- [Public API](#public-api)
- [Shared Scene Configuration tab](#shared-scene-configuration-tab)
- [Shared UI look](#shared-ui-look)
- [Windows: placement and keybindings](#windows-placement-and-keybindings)
- [Vendor tool](#vendor-tool)
- [Namespacing](#namespacing)
- [What is deliberately not in core](#what-is-deliberately-not-in-core)
- [Development](#development)
- Policies: [CONVENTIONS.md](CONVENTIONS.md) (house practices), [STABILITY.md](STABILITY.md) (semver, deprecation),
  [docs/module-ci.md](docs/module-ci.md), [docs/branch-protection.md](docs/branch-protection.md), [docs/ui.md](docs/ui.md),
  [docs/windows.md](docs/windows.md)

## Using core in a module

1. **Vendor a release** (from the module's root folder; needs Node 22):

   ```sh
   node path/to/wanderers-core/tools/vendor.mjs install 0.4.0   # a core checkout's copy of the tool
   ```

   This writes `vendor/wanderers-core/` and `wanderers-core.lock.json` (version, content hash, source). Commit both. From then on the
   vendored copy updates itself: `node vendor/wanderers-core/vendor.mjs update X.Y.Z`.

   Before core's first release, pin a local checkout instead: `node ../wanderers-core/tools/vendor.mjs install --from ../wanderers-core`
   (source `local`; CI warns until it's replaced by a released pin).

2. **Import it** with relative paths (Foundry serves the module's files as they are):

   ```js
   // scripts/const.mjs
   export const ID = "my-module";
   // scripts/core.mjs: one place that binds core to this module
   import { createFeatures, createSettings, createLogger, createLeader } from "../vendor/wanderers-core/foundry/index.mjs";
   import { defineRequests } from "../vendor/wanderers-core/index.mjs";
   import { ID } from "./const.mjs";

   export const F = createFeatures(ID, [
     { id: "sessionLog", label: "Session log", hint: "…" },
     { id: "board", label: "Board", hint: "…", needs: ["sessionLog"] }
   ], { title: "My Module" });
   export const S = createSettings(ID, [
     { key: "folder", type: "text", default: "Logs", label: "Folder", hint: "…", tab: "session", feature: "sessionLog" },
     { key: "debugLog", type: "bool", default: false, label: "Debug logging", hint: "…", tab: "data", advanced: true }
   ], { reserved: F.FEATURES.map(f => f.key) });
   export const { log } = createLogger(ID);
   export const leader = createLeader({
     id: ID, log,
     requests: defineRequests({ note: { fields: { text: { type: "string", max: 2000 } } } }),
     hooks: [`${ID}.eventLogged`]
   });
   ```

   ```js
   // scripts/main.mjs
   Hooks.once("init", () => { F.register(); S.register(); });
   Hooks.once("ready", () => {
     leader.start();
     if (F.on("sessionLog")) leader.handle("note", (data, user) => { /* check user's rights here */ });
   });
   ```

   `module.json` needs `"socket": true` for `createLeader`.

3. **Lint and type config** (optional but recommended): an `eslint.config.mjs` with
   `import { wanderersConfig } from "./vendor/wanderers-core/config/eslint.base.mjs"; export default wanderersConfig({ ignores: [] });`, and a
   `tsconfig.json` extending `./vendor/wanderers-core/config/tsconfig.base.json` with `include` set to your scripts plus
   `vendor/wanderers-core/config/foundry-globals.d.ts`. Dev tools: `npm i -D eslint@10.13.0 typescript@7.0.2`; scripts
   `"lint": "eslint ."`, `"types": "tsc -p tsconfig.json"`.

4. **CI**: call the reusable workflow (see [docs/module-ci.md](docs/module-ci.md)):

   ```yaml
   jobs:
     checks:
       uses: cocoomg11/wanderers-core/.github/workflows/module-checks.yml@v0.4.0
   ```

5. **Release zip**: add `vendor` to the module's zip step, but leave out `vendor/wanderers-core/config/` (shared lint and type configs) and
   `vendor/wanderers-core/vendor.mjs` (the vendor tool): only dev tools and CI use them, and Foundry never loads them
   (`zip -r module.zip ... vendor ... -x 'vendor/wanderers-core/config/*' 'vendor/wanderers-core/vendor.mjs'`). Keep the vendored folder in the
   repo complete: the pin check hashes every file.

6. **Shared look** (optional): list `vendor/wanderers-core/styles/wanderers-ui.css` in `module.json` `styles` and add `UI_CLASSES`
   to a window's `classes`. See [Shared UI look](#shared-ui-look).

7. **Windows** (optional): `RememberedWindow(Base, { moduleId, key })` makes a window open where the user left it;
   `registerOpenKeybinding({ moduleId, action, name, onDown })` in `init` lists "Open …" in Configure Controls (no key by default).
   See [Windows](#windows-placement-and-keybindings).

## Public API

Imports: `vendor/wanderers-core/index.mjs` (pure: no Foundry calls at import or call time; tested in Node) and
`vendor/wanderers-core/foundry/index.mjs` (Foundry halves: touch `game` only when called; untested in Node). **While core is 0.x,
everything is experimental** (may change in a minor release, with a changelog note). Nothing is marked stable yet; see
[STABILITY.md](STABILITY.md) for what stable will mean.

| Area | Exports (pure, `index.mjs`) | Status |
|---|---|---|
| Text | `esc`, `plain`, `plural`, `slug`, `isoDay` | experimental (candidate for stable at 1.0) |
| Versions | `CORE_VERSION`, `parseVersion`, `compareVersions`, `RELEASE_TAG`, `isReleaseTag`, `tagVersion` | experimental (candidate for stable at 1.0) |
| Records | `addCapped(list, entry, { max, key })`, `capList(list, max, { keep })`, `versioned({ version, empty, upgrades, clean, field, keepNewer })` | experimental |
| Features | `defineFeatures(list)`, `isOn(features, id, get)`, `allOn(features, "a:b", get)`, `splitNeeds` | experimental |
| Settings | `defineSettings(rows, { reserved })`, `tabRows`, `convert`, `records`, `scopeOf`, `registration` | experimental |
| One writer | `pickActiveGM`, `leaderOf`, `isLeader`, `aliveCutoff`, `prune`, `readSessionMessage`, `applySessionMessage`, `seenCache`, `requestId`, `makeRequestId`, `parseRequestId`, `readHookMessage`, `acceptHook`, `newId`, `compareSessions`, constants `HEARTBEAT_MS` `GRACE_MS` `SETTLE_MS` `SEEN_MAX` `ID_RE` `PASSIVE_MAX_AGE_MS` | experimental |
| Rate limits | `rateLimiter({ burst, perSecond, maxKeys })` → `take(key, now)`, `left`, `clear`, `size`; `RATE_BURST`, `RATE_PER_SECOND` | experimental |
| Socket requests | `defineRequests(schemas)`, `readRequest(schemas, msg)`, `makeRequest(schemas, kind, rid, data)`, `jsonBytes`, `MAX_BYTES`, `MAX_DEPTH` | experimental |
| Health | `healthCollector({ timeoutMs })` → `add`, `section`, `check`, `checkAsync`, `report`; `worst`, `counts`, `level`, `LEVELS` | experimental |
| Cleanup | `CONFIRM_WORD`, `confirmed`, `hasFlags`, `dryRun(categories, plan)`, `picked`, `changedSettings`, `summary` | experimental |
| Settings file | `SETTINGS_FORMAT`, `buildExport(id, values, opts)`, `readImport(id, input, defs, current, { skip, requireModule, label, validators })`, `checkValue`, `preview`, `fileName` | experimental |
| Update notes | `decide({ stored, current, knownWorld })`, `entriesBetween`, `buildNotice({ notes, always, from, to, on, ctx })`, `lintNotes` | experimental |
| UI look | `UI_REVISION`, `UI_CLASSES`, `UI_STYLESHEET`, `TONES`, `tone`, `icon`, `badge`, `dot`, `statusLine`, `statusLines`, `navItem`; stylesheet `styles/wanderers-ui.css` (classes and tokens in [docs/ui.md](docs/ui.md)) | experimental |
| Item quality | `QUALITIES`, `QUALITY_KEYS`, `quality(rarity)`, `qualityLabel`, `itemSlot({ img, quality, rarity, name, count, size })`; stylesheet tokens `--wc-q-*`, classes `wc-item-slot`, `wc-q-*`, `wc-q-text` | experimental |
| Coins | `formatCoins(amount, { style, zero, ratio })`, `toCopper`, `fromCopper`, `coins(amount, { zero, ratio })`, `COIN_RATIO` (100 copper to the silver, 100 silver to the gold); stylesheet `wc-coins` | experimental |
| Window placement (pure) | `readPlacement`, `readPlacements`, `getPlacement`, `setPlacement`, `removePlacement`, `samePlacement`, `clampPlacement(placement, viewport, { scale, minWidth, minHeight, size })`, `placementOf`, `debouncer(fn, ms)`, `isWindowKey`, constants `PLACEMENT_SETTING` `PLACEMENT_VERSION` `PLACEMENT_MAX` `PLACEMENT_SAVE_MS` `PLACEMENT_MIN_SIZE` `WINDOW_KEY_RE` | experimental |
| Keybindings (pure) | `defineOpenKeybinding(spec)`, `keybindingConfig(def, { isGM, onError })`, `KEY_MODIFIERS`, `ACTION_RE`, `KEY_CODE_RE` | experimental |
| Scene tab (pure) | `defineSection`, `orderSections`, `upsertSection`, `ownField`, `createRegistry`, `usableRegistry`, `claimRegistry`, constants `SCENE_TAB_GLOBAL` `SCENE_TAB_VERSION` `SCENE_TAB_ID` `SCENE_TAB_LABEL` `SCENE_TAB_ICON` | experimental |
| Module data folder (pure) | `pickDataFolder(folders)`, `dataFolderData()`, `dataFolderPlan({ folders, entry })`, `folderEmptyAfter(contentIds, removedIds)`, `dataFolderShown(answers)`, `dataFolderIds(folders, entries)`, constants `DATA_FOLDER_NAME` `DATA_FOLDER_TYPE` `DATA_FOLDER_SORT` `SHOW_SETTING` ([docs/data-folder.md](docs/data-folder.md)) | experimental |

| Area | Exports (Foundry, `foundry/index.mjs`) | Status |
|---|---|---|
| One writer | `createLeader({ id, requests, hooks, leaderHook, log, rateLimit })` → `start`, `stop`, `settled`, `isLeader`, `onLeader`, `onBye`, `handle`, `request`, `broadcastHook`, `activeGM`, `info` | experimental |
| Module | `createFeatures(id, list, { title })` → `FEATURES`, `on`, `allOn`, `need`, `register`, `list`; `createSettings(id, rows, opts)` → `ROWS`, `register`, `get`, `set`; `createLogger(id)` → `log`, `warn`, `debugOn`; `getSetting`, `settingValues`, `settingDefs` | experimental |
| Cleanup | `worldDocuments()`, `flaggedDocuments(ns, filter)`, `unsetFlags(ns, uuids)`, `resetSettings(ns, keys)` | experimental |
| Windows | `RememberedWindow(Base, { moduleId, key, size, minimized, saveMs })` → subclass with `placementKey`, `clampToViewport`, `resetPlacement`; `registerWindowPlacement(moduleId)`, `resetPlacement(moduleId, key?)`, `savedPlacement(moduleId, key)` | experimental |
| Keybindings | `registerOpenKeybinding({ moduleId, action, name, hint, onDown, gmOnly, editable, precedence })` | experimental |
| Module data folder | `ensureDataFolder(moduleId, { log })`, `fileInDataFolder(moduleId, entry, { log })`, `removeDataFolderIfEmpty(moduleId, removedIds, { log })`, `hideDataFolder(moduleId, { shown })`: one collapsed, sidebar-hidden "Module data" journal folder for modules' GM-only stores; tidiness only, not secrecy ([docs/data-folder.md](docs/data-folder.md)) | experimental |
| Scene tab | `sceneTab.addSection(id, { title, order, render, onSubmit })`, `sceneTab.removeSection(id)`, `sceneTab.sections()` | experimental |

Formats (versioned, see STABILITY.md): settings file `format` 1; socket envelopes `request` / `leader` / `hook`; release bundle
`format` 1; lock file `lockVersion` 1; scene tab registry `version` 1; window placement setting `v` 1; shared stylesheet revision `UI_REVISION` 3 (`wc-r3`).

Core fires **no hooks of its own**. `createLeader` fires only the hook names the module passes (`leaderHook`, `hooks`), all in the
module's namespace.

### Socket request schemas

```js
const REQUESTS = defineRequests({
  mapPin: {
    fields: {
      op: { type: "string", oneOf: ["create", "move", "delete"] },
      sceneId: { type: "id" },
      x: { type: "number", min: 0, optional: true },
      label: { type: "string", max: 80, optional: true },
      quest: { type: "uuid", optional: true },
      tags: { type: "array", of: { type: "string", max: 20 }, max: 5, optional: true }
    },
    maxBytes: 4096
  },
  gmTool: { fields: {}, from: "gm" }
});
```

`readRequest` refuses: anything that isn't `{ action: "request" }`, unknown kinds (including inherited names like `toString`), a
missing or malformed `rid`, payloads over `maxBytes` (default 16 KiB) or nested deeper than 6, unknown fields (unless
`extra: "drop"`), wrong types, out-of-range numbers, non-finite numbers, too-long strings or lists, and objects that aren't plain.
`createLeader` also refuses requests from unknown users (before reading anything else), more than its per-user rate limit (token
bucket, default 20 at once and 5 a second; `rateLimit: { burst, perSecond }` or `false`), request ids that aren't in
`makeRequestId`'s shape, and `from: "gm"` kinds from players, and skips repeated request ids. The handler receives Foundry's sender
user; check that user's rights there. The sender is never read from the payload, and there is no fallback to a payload `userId`.

Broadcast hooks (`broadcastHook`) carry the sending session's id. Other clients fire one only when Foundry's sender is a known GM
user and the session is the one they count as the leader; a client that isn't the leader fires the hook locally only (the call
returns `false`). Players follow the GM sessions' pings to know the leader, and ask once on load (`op: "hello"`).

### Settings file validators

`readImport(..., { validators: { key: (value, def) => … } })` adds a check for settings whose shape the type check can't see (Object
and Array settings). Return `true` to accept, a string (the reason) or `false` to refuse, or `{ ok: true, value }` to import a
cleaned copy. A validator that throws refuses the value; refused values are listed under `invalid`.

## Shared Scene Configuration tab

All modules that vendor core share **one** extra tab in the Scene Configuration window: **Table Tools** (tab id `wanderers`). Each
module adds its own titled section (a fieldset) to it. It works with one module installed or several, whichever loads first.

```js
import { sceneTab } from "../vendor/wanderers-core/foundry/index.mjs";
import { esc } from "../vendor/wanderers-core/index.mjs";

Hooks.once("init", () => {
  if (!F.on("sceneChecks")) return;              // a disabled feature adds nothing
  sceneTab.addSection(ID, {
    title: "My Module",
    order: 0,                                    // lower first; ties sort by title
    render: (app, scene) => {
      const v = scene.getFlag(ID, "note") ?? "";
      return `<div class="form-group"><label>Note</label>
        <input type="text" name="flags.${ID}.note" value="${esc(v)}"></div>`;
    }
    // onSubmit: (app, scene, el) => { … }       // optional: save the section yourself
  });
});
```

- **Saving**: name fields `flags.<module-id>.…`; they sit inside the window's form and save with its normal submit. Fields named
  anything else are disabled (they would write outside the module's namespace). Or pass `onSubmit` and save yourself.
- **Escaping**: `render` may return an element or an HTML string; escape every value in a string with `esc`. The section title is
  set as text.
- **Re-renders**: the tab and every section are rebuilt on each render from the scene's current data, so a section must not keep
  its own DOM state.
- **How it is added** (the choice and why): through Foundry's documented `renderSceneConfig` hook, which fires for SceneConfig (an
  ApplicationV2 `DocumentSheetV2` with a `sheet` tab group) before its HTML is shown. Extending `SceneConfig.TABS` / `PARTS` at init
  was not used: a new part needs a Handlebars template served from one particular module's folder and a change to Foundry's shared
  class, which separately bundled copies of core would all have to agree on. The hook adds one nav entry and one tab panel in the
  window's own tab group (`data-action="tab"`), so Foundry's own tab switching and `tabGroups` handle it.
- **One tab, many copies**: the first copy of core that adds a section creates a small registry on
  `globalThis.__wanderersSceneTab` (`{ version: 1, tabId, add, remove, list }`, not writable, not enumerable) and registers the
  render hook; every other copy (any version that keeps the version-1 calls) only adds its section there. This is core's one
  deliberate global (see [Namespacing](#namespacing)).
- `sceneTab.sections()` lists the registered sections (for health checks); `sceneTab.removeSection(id)` drops one.

## Shared UI look

`styles/wanderers-ui.css` (vendored at `vendor/wanderers-core/styles/wanderers-ui.css`) gives every module's windows one look that
matches Foundry v14: built only on Foundry's own variables (`--color-level-*`, `--color-text-*`, `--font-*`), light and dark themes,
status tokens `--wc-ok/-warn/-bad/-info/-off` (+ `-bg`), and components: badge, dot (with pending and live pulses), status line,
stat tile, panel, banner, alert, chips, section label, timeline rows, table, sidebar nav, page head, item quality colours, item slot, coins, focus styles and a narrow layout.
The helpers in `index.mjs` (`badge`, `icon`, `dot`, `statusLine`, `statusLines`, `navItem`) write the same markup, escaped.

```json
"styles": ["vendor/wanderers-core/styles/wanderers-ui.css", "styles/my-module.css"]
```

```js
import { UI_CLASSES, badge } from "../vendor/wanderers-core/index.mjs";
static DEFAULT_OPTIONS = { classes: ["my-window", ...UI_CLASSES] };   // "wc-ui wc-r3"
```

**Opt-in and version-safe**: every rule is scoped under `.wc-ui.wc-r<revision>`, tokens live on that root, there are no `:root`,
`html` or bare element rules, and keyframe and container names carry the revision. A module on an older core keeps its windows'
revision class, so another module's newer stylesheet never restyles them. Any change to the file bumps `UI_REVISION` (a test
compares the file with a hash per revision). Class list, tokens, markup and adoption steps: [docs/ui.md](docs/ui.md).

## Windows: placement and keybindings

Opt-in per window ([docs/windows.md](docs/windows.md)):

```js
export class Hub extends RememberedWindow(HandlebarsApplicationMixin(ApplicationV2), { moduleId: ID, key: "hub" }) { /* … */ }
Hooks.once("init", () => {
  registerOpenKeybinding({ moduleId: ID, action: "openHub", name: "Open the control panel", gmOnly: true, onDown: () => { new Hub().render({ force: true }); } });
});
```

- Placements live in one hidden client setting per module, `<moduleId>.windowPlacement` (`{ v: 1, windows: { <key>: { left, top,
  width, height, minimized } } }`), so each user keeps their own and modules never share it. Restored clamped to the page, re-clamped
  (without saving) when the page or UI scale shrinks, saved debounced after moves and resizes. A window opened with its own
  `position.left`/`top` keeps that position. `resetPlacement(ID, key?)` forgets one or all.
- Keybindings register with **no key** unless the module passes `editable`; `gmOnly` maps to Foundry's `restricted`. Call in `init`.

## Vendor tool

`tools/vendor.mjs` (copied into each module as `vendor/wanderers-core/vendor.mjs`); Node 22, no packages.

| Command | What it does |
|---|---|
| `install <X.Y.Z>` / `update <X.Y.Z>` | Downloads release asset `wanderers-core-X.Y.Z.json`, checks its paths and hash, replaces `vendor/wanderers-core/`, writes the lock, lists added/removed/changed files. Refuses to overwrite a hand-edited copy without `--force`. |
| `install --from <core checkout>` | Same from a local checkout (lock `source: "local"` with the commit). For trying unreleased core. |
| `verify` | The vendored files' content hash equals the lock's (CRLF read as LF). Fails on any edit, extra or missing file. |
| `verify --remote` | Also checks the lock's hash is the published release's hash. |
| `bundle --out dist` | Core only: builds the release asset and its `.sha256`. |

Options: `--dir`, `--lock`, `--repo`, `--force`. Lock file (`wanderers-core.lock.json`):

```json
{ "name": "wanderers-core", "lockVersion": 1, "version": "0.2.0", "hash": "sha256-…", "source": "release",
  "dir": "vendor/wanderers-core", "files": 24, "asset": "https://github.com/cocoomg11/wanderers-core/releases/download/v0.2.0/wanderers-core-0.2.0.json" }
```

The hash is sha256 over the sorted list of `<path>\n<sha256 of file>\n`, so it covers names, content and the file set.

## Namespacing

Two modules may bundle different core versions in one world. Core is safe for that because it never shares anything:

- **No globals**, with one exception. Nothing is written to `window`, `CONFIG` or `game`. Each module imports its own copy by a path
  inside its own folder, so the browser loads them as separate modules. The exception is the shared Scene Configuration tab's
  registry, `globalThis.__wanderersSceneTab`: sharing one tab is the point, so the copies meet there. It is versioned and holds only
  sections keyed by module id.
- **No shared settings or flags.** Every setting is registered under the host module's id; cleanup helpers take the namespace.
- **No shared socket channel.** `createLeader` uses `module.<host id>`; each module elects its own leader, with its own request kinds.
- **No shared hooks.** Broadcast hooks must start with `<host id>.`; a hook name from another module is refused.
- **No shared browser storage.** Core doesn't use localStorage or sessionStorage.
- **No shared page styles.** The shared stylesheet styles only elements inside a `.wc-ui.wc-r<N>` root the module put there itself,
  and each revision has its own class.

## What is deliberately not in core

| Left out | Why |
|---|---|
| Control panel and other windows (ApplicationV2 classes, pages, wording) | Each module's pages and tabs differ; windows can't be tested in Node. Core shares only the look (stylesheet, tokens, small markup helpers) and the Scene Configuration tab, which only works if it is shared. |
| Cleanup window, update-notes chat card, settings import preview | Wording and categories are per module; core gives the pure parts (plan, dry run, confirm word, notice, file format). |
| Hub registry and update check over the network | Only the hub module needs them; the CORS workaround is specific to it. |
| Permission checks, scene checks, game rules | Module-specific; rules text stays SRD-only in the modules that need it. |
| Dialog and folder helpers (`ui.mjs`) | Thin Foundry calls that vary per module; not worth a shared contract yet. |
| A runtime dependency or a core Foundry module | Decided: each module stays standalone. |
| Translation (`lang/`) | All modules use plain English strings in code. |

## Development

```sh
npm ci            # eslint 10.13.0, typescript 7.0.2, @types/node (dev only)
npm run check     # syntax
npm run lint      # ESLint (config/eslint.base.mjs)
npm run types     # JSDoc type check (tsc --noEmit with checkJs)
npm test          # node --test
npm run bundle    # dist/wanderers-core-X.Y.Z.json
```

Releases: bump `version` in `package.json` (and `package-lock.json`) and `CORE_VERSION` in `src/version.mjs`, add a CHANGELOG
section, push. The user publishes a GitHub release tagged `vX.Y.Z`; the Release workflow checks and builds the bundle in a read-only
job, uploads `wanderers-core-X.Y.Z.json` and `.sha256` in a separate job, then downloads and verifies them.

## License

MIT. See [LICENSE](LICENSE).
