# Changelog

All notable changes to wanderers-core. Versions follow [STABILITY.md](STABILITY.md). Modules pick up a release only when they update
their pin.

## Unreleased

### Security

- Dev dependencies only (nothing ships to Foundry): `package.json` overrides `minimatch` to 11.0.3, which clears Dependabot's
  moderate alert (GHSA-g3hv-75wg-m249) that came through `eslint` and `@eslint/config-array`. Lockfile regenerated; `npm audit` is
  clean and `npm run ci` passes. No change to the library or the bundle.

## 0.5.0 (2026-11-01)

The release every module moves to in one step (from 0.3.x straight to 0.5.0; it contains 0.4.0): health lines keep a `fix`, a shared
GM-only store journal, and the test fakes core's own tests use. Everything stays experimental. Move with
`node vendor/wanderers-core/vendor.mjs update 0.5.0` and `module-checks.yml@v0.5.0`; step by step in
[docs/upgrading-0.5.md](docs/upgrading-0.5.md) (zip exclusion for `testing/`, `wc-r3`, store adoption per module, data folder,
windows, keybindings, quality and coins). The stylesheet is unchanged from 0.4.0 (`UI_REVISION` 3).

### Added

- **Health fix pass-through** (`health-model.mjs`): `healthCollector`'s `add(level, text, fix?)` (also inside `check` / `checkAsync`)
  keeps an optional fix on the line, read by `readFix`: a function, an action id (`FIX_ACTION_RE`, 1 to 64 of `A-Za-z0-9_.:-`) or
  `{ label, run | action, confirm? }` (labels and confirm texts plain, cut to 60 / 500 characters; unusable fixes are dropped). Same
  rules as the Wanderer's Satchel's reader, so lines reach the hub unchanged. Lines without a fix keep the old shape. `healthLine(level,
  text, fix?)` builds one line for hand-made reports and plain-text conversions; `storableReport(report)` is the copy to store or send
  (fix functions removed, action ids kept). `report()` now returns copies of the lines.
- **GM-only store** ([docs/store.md](docs/store.md)): `createStore(moduleId, { name, flagKey, entryFlag, normalize | version + empty +
  upgrades + clean, keysAt, keys, maxBytes, deleteDepth, about, dataFolder, log, isWriter })` (Foundry) → `entry`, `read`, `get`,
  `update` (chained, may be async), `set`, `setKey`, `ensure`, `file`, `remove`, `status`. One None-ownership journal per module, found
  by a marker flag (`entryFlag`, default `storeEntry`) or by the data flag (`entryFlag: null`), so the toolkit's vault, Red Book's and
  the Satchel's existing stores are found as they are. Created on the first GM write inside "Module data"; `file()` (writer only) moves
  an existing root-level entry there once and marks it `flags.<id>.dataFolderFiled`, so a GM's later move is kept. Writes are
  normalized, size-checked (`STORE_MAX_BYTES` 8 MiB by default) and delete removed keys (v14 `_del` when present, else `-=`; depth
  `STORE_DELETE_DEPTH` 3). Players never read it (`get` returns the fallback) or write it. `remove()` deletes every copy and the
  folder when empty. Documented plainly: **ownership None is not secrecy** (sent to every client; honour system).
- Pure store helpers (`store-model.mjs`): `defineStore` (throws on bad definitions), `isStoreEntry`, `storeEntries`, `storeRawData`,
  `storeCreateData`, `needsFiling`, `storeKeys`, `storeGet`, `storeWith`, `storeWithKey`, `storeDeletions`, `deletionKeys`, `storeSize`,
  constants `STORE_MAX_BYTES`, `STORE_DELETE_DEPTH`, `STORE_FILED_FLAG`.
- **Test fakes** ([docs/testing.md](docs/testing.md)): `testing/index.mjs` (vendored as `vendor/wanderers-core/testing/`): `fakeWorld`,
  `installFakes`, `actAs`, `fakeSettings`, `fakeHooks`, `fakeCollection`, `FakeApplicationV2`, `applyUpdate`, `fakeId`, `OWNERSHIP`,
  `FAKE_DEL`. Dev only: not exported from either index, never imported at run time; module zips exclude it
  (`-x 'vendor/wanderers-core/testing/*'`, docs/module-ci.md). Not part of the public API.
- Docs: [docs/store.md](docs/store.md), [docs/testing.md](docs/testing.md), [docs/upgrading-0.5.md](docs/upgrading-0.5.md); module-ci.md
  pins `@v0.5.0` and adds the zip exclusion.
- Tests: `tests/v050.test.mjs` (fix reading and pass-through, storable copies, store model, `createStore` on the shared fakes:
  creation in the folder, existing stores found and filed once, the GM's folder kept, failed moves retried, chained concurrent writes,
  failures don't break the chain, both deletion syntaxes, size limit, players refused, remove and folder cleanup; the fakes themselves,
  and `RememberedWindow` on `FakeApplicationV2`).

### Security

- Dev dependencies only (nothing ships to Foundry): Dependabot's moderate alert for `minimatch` (via `eslint` and
  `@eslint/config-array`; GHSA-g3hv-75wg-m249, fixed in minimatch 11.0.1) is not resolved in this release. eslint 10.14.0 still asks for
  `minimatch ^10.2.6`, so the fix needs an npm `overrides` entry, and the lockfile could not be regenerated where this release was made
  (no npm registry access). Steps in the README *Development* section (`npm pkg set overrides.minimatch=11.0.3`, `npm install --package-lock-only --ignore-scripts`, `npm ci && npm run ci`).

### Untested in Foundry

- [ ] `createStore` on v13 and v14 with a module's real store: the existing entry is found (toolkit `vaultEntry`, Red Book data flag,
  Satchel `storeEntry`), nothing renamed; `file()` on the writer moves a root-level entry into "Module data" once; moving it back to
  the root by hand stays put after a reload.
- [ ] First write in a fresh world creates one entry inside "Module data" with default ownership None and the About page; two GM tabs
  writing at once leave one entry (or `status().count` 2, and both are removed by `remove()`).
- [ ] A removed key is really gone after `setKey(..., null)` on v14 (`_del` operator) and on v13 (`-=` key), after a reload.
- [ ] `_stats.modifiedTime` changes on every journal update in v13 and v14 (the read cache relies on it with in-place merges).
- [ ] A player client: `Store.get` gives the fallback, `Store.set` rejects, no journal appears in their sidebar; the data is still
  readable from their console (expected; documented).
- [ ] `remove()` deletes the entry and the "Module data" folder only when no other module's entry is in it.
- [ ] A health line with `{ fix: { label, action } }` from `healthCollector` shows a Fix button in the Wanderer's Satchel and runs the
  registration's fix; a chat card built from `storableReport` has no functions in its flags.
- [ ] A module zip built with the `testing/*` exclusion loads without errors (nothing imports it).

## 0.4.0 (2026-11-01)

Two opt-in window helpers; everything stays experimental. Nothing changes for a module until it uses them: move with
`node vendor/wanderers-core/vendor.mjs update 0.4.0` (and `module-checks.yml@v0.4.0`). Also item quality colours and coin helpers, which change the stylesheet (`UI_REVISION` 3, `wc-r3`; modules pick it up with the vendor
update, and windows built with `UI_CLASSES` move from `wc-r2` to `wc-r3` automatically; a module that hard-codes `wc-r2` must change it).
Guides: [docs/windows.md](docs/windows.md), [docs/ui.md](docs/ui.md).

### Added

- **Remembered window placement** (`foundry/index.mjs`): `RememberedWindow(Base, { moduleId, key, size, minimized, saveMs })`, a
  mixin for ApplicationV2 classes. Restores left/top/width/height and the minimized state, clamped to the page; re-clamps (without
  saving) on page resize and core client setting changes (UI scale); debounced saves from `_onPosition` and minimize/maximize; a
  pending save is written on close. A window opened with its own `position.left`/`top` keeps it. Also `registerWindowPlacement(moduleId)`,
  `resetPlacement(moduleId, key?)`, `savedPlacement(moduleId, key)`.
- Storage: one hidden client setting per module, `<moduleId>.windowPlacement`, value `{ v: 1, windows: { <key>: { left, top, width?,
  height?, minimized? } } }`, capped at 50 windows (least recently saved dropped). New versioned format, `v` 1.
- Pure helpers (`index.mjs`, `window-model.mjs`): `readPlacement`, `readPlacements` (never throws), `getPlacement`, `setPlacement`,
  `removePlacement`, `samePlacement`, `clampPlacement`, `placementOf`, `debouncer`, `isWindowKey`, constants `PLACEMENT_SETTING`
  `PLACEMENT_VERSION` `PLACEMENT_MAX` `PLACEMENT_SAVE_MS` `PLACEMENT_MIN_SIZE` `WINDOW_KEY_RE`.
- **Open keybindings**: `registerOpenKeybinding({ moduleId, action, name, hint, onDown, gmOnly, editable, precedence })` (Foundry
  half) over `game.keybindings.register`; no key by default; `gmOnly` → `restricted` and a GM check in `onDown`; errors in `onDown`
  are logged, never thrown. Pure `defineOpenKeybinding` (throws on bad definitions), `keybindingConfig`, `KEY_MODIFIERS`, `ACTION_RE`,
  `KEY_CODE_RE`.
- **Item quality** (`quality-model.mjs`): `QUALITIES`, `QUALITY_KEYS`, `quality(rarity)` (dnd5e rarity → poor / common / uncommon / rare /
  epic / legendary / artifact; `""` and `mundane` → poor, `veryRare` → epic, unknown → common), `qualityLabel`, `itemSlot({ img, quality,
  rarity, name, count, size, cls })`. Stylesheet: tokens `--wc-q-poor` … `--wc-q-artifact` (darkened in the light theme, base colour
  overridable with `--wc-qs-<quality>`), `data-quality` / `wc-q-<quality>`, `wc-q-text`, `wc-item-slot` (`wc-sm`, `wc-lg`, `wc-empty`,
  `wc-slot-count`; quality border and soft glow).
- **Coins** (`coins-model.mjs`): `formatCoins(amount, { style: "short" | "long", zero, ratio })` ("12g 46s 8c"), `toCopper`, `fromCopper`,
  `coins(amount, { zero, ratio, cls })` (markup with CSS-drawn coin dots, no image files), `COIN_RATIO` 100. Amounts are whole copper; the
  `ratio` (copper per silver and silver per gold) defaults to the three-coin economy of the Wayfarer's Toolkit (1 gold = 10000 copper),
  so a module switching from its own formatter keeps its amounts. Stylesheet: `wc-coins`, `wc-coin`, `wc-coin-icon`.
- **Module data folder** ([docs/data-folder.md](docs/data-folder.md)): `ensureDataFolder`, `fileInDataFolder`, `removeDataFolderIfEmpty`, `hideDataFolder(moduleId, { shown })` (Foundry) and pure `pickDataFolder`, `dataFolderData`, `dataFolderPlan`, `folderEmptyAfter`, `dataFolderShown`, `dataFolderIds`, `DATA_FOLDER_NAME` etc. One "Module data" journal folder (matched by name, type, root; no flag) holds modules' GM-only store journals and is hidden from the Journal sidebar unless a module's "Show module data" switch (`<moduleId>.showModuleData`) is on. Tidiness only, not secrecy. Tests: `tests/data-folder.test.mjs`.
- `UI_REVISION` 3, `UI_CLASSES` `["wc-ui", "wc-r3"]`; revision 3's hash recorded in `tests/ui.test.mjs` (revisions 1 and 2 kept).
- Tests: `tests/quality-coins.test.mjs`; `tests/window.test.mjs` (models, plus the mixin and keybinding wiring against a fake ApplicationV2 and `game`).

### Untested in Foundry

- [ ] A window using `RememberedWindow`: drag and resize it, close and reopen: same place and size. Reload the world: still there.
- [ ] Move it near the right edge, shrink the browser window: it moves back inside the page; enlarge again and reopen: original place.
- [ ] Change the UI scale (Configure Settings › Core): an open window is re-clamped; reopened windows fit the page.
- [ ] Minimize, close, reopen: opens minimized; maximize: full size from before minimizing (not the header's height).
- [ ] A window opened with `new App({ position: { left, top } })` opens there, not at the saved placement.
- [ ] `_onPosition` fires for header drags and the resize handle in v13 and v14 (saves happen while dragging stops).
- [ ] The setting is per user/browser (`scope: "client"`), not shown in Configure Settings; `resetPlacement(ID)` clears it.
- [ ] A HandlebarsApplicationMixin window and a DocumentSheetV2 subclass with a key function both work.
- [ ] A window with `UI_CLASSES` (`wc-r3`) in the dark and the light theme: the seven `--wc-q-*` colours are readable as `wc-q-text` names
  (common is near-white in dark, mid grey in light) and as `wc-item-slot` borders with a soft glow; an empty slot is dashed.
- [ ] A `wc-r2` window (module on 0.3.1) and a `wc-r3` window open together: each keeps its own look.
- [ ] `coins(...)`: the gold, silver and copper dots show in both themes at the window's font size and line up with the number.
- [ ] `quality(item.system.rarity)` on real dnd5e items (mundane, veryRare, artifact): the keys match the colours.
- [ ] `registerOpenKeybinding` in `init`: the action shows under the module in Configure Controls with no key; assigning a key opens
  the window; a `gmOnly` action is hidden from and refused for players; an error in `onDown` only logs.
- [ ] `fileInDataFolder`: a root-level store journal moves into a new "Module data" folder at the bottom of the Journal tab (manual sort, high `sort`); one already in the GM's own folder stays; a second module reuses the folder.
- [ ] `hideDataFolder` on v13 and v14: `renderJournalDirectory` fires with the directory element (`[data-folder-id]`, `[data-entry-id]` selectors match), the folder and its entries are gone from the sidebar for a GM, and sidebar search does not list them; with a module's `showModuleData` on (and the directory re-rendered) they show.
- [ ] `removeDataFolderIfEmpty` keeps the folder while another module's entry is inside, deletes it when empty. Players get no folder changes.

## 0.3.1 (2026-11-01)

Shared stylesheet revision 2 (`wc-r2`). Modules pick it up with `node vendor/wanderers-core/vendor.mjs update 0.3.1`; windows built
with `UI_CLASSES` move to `wc-r2` automatically. Windows still carrying `wc-r1` (another module on 0.3.0) keep revision 1's look.

### Fixed

- **Sidebar shell, short or narrow windows**: `.wc-main` is a scrolling column flexbox, so its children could shrink below their
  content height; a `wc-table-box` or `wc-panel` (both `overflow` set, so their automatic minimum height is 0) shrank to a few pixels
  instead of the page scrolling (seen at 640×720 and 1000×450 in a module's hub). From revision 2, `.wc-main`'s direct children
  have `flex-shrink: 0`. A module on 0.3.0 can add the same rule for its own window until it moves to 0.3.1.

### Changed

- `UI_REVISION` 2, `UI_CLASSES` `["wc-ui", "wc-r2"]`; revision 2's hash recorded in `tests/ui.test.mjs` (revision 1's kept).

### Untested in Foundry

- [ ] A sidebar-shell window at 640×720 and 1000×450: tables and panels keep their full height and the page scrolls.
- [ ] A `wc-r1` window (module on 0.3.0) and a `wc-r2` window (module on 0.3.1) open together: each keeps its own look.

## 0.3.0 (2026-11-01)

Everything stays experimental. Nothing changes for a module until it opts in: modules move with
`node vendor/wanderers-core/vendor.mjs update 0.3.0` and their reusable workflow reference `module-checks.yml@v0.3.0`, then adopt the look
per window (docs/ui.md).

### Added

- **Shared UI look**: `styles/wanderers-ui.css` (vendored at `vendor/wanderers-core/styles/wanderers-ui.css`; a module lists it in
  `module.json` `styles`). Built only on Foundry's own variables (hex only as var() fallbacks), light and dark themes, status tokens
  `--wc-ok/-warn/-bad/-info/-off` (+ `-bg`), accent, text, line and surface tokens. Components: badge, dot (pending ring and live pulse,
  no motion with `prefers-reduced-motion`), status line, stat tiles, panel, banner (incl. live), alert, tag/filter and value chips,
  section label, timeline rows, table, sidebar nav (groups, active link with accent background and 2 px bar, dot/badge slots,
  footer), page head, buttons, focus styles, narrow-window container query. Revision 1 (`wc-r1`).
- **Version-safe by design**: every rule under the opt-in root `.wc-ui.wc-r<N>`, tokens on that root, no `:root`/`html`/bare element
  rules, revisioned keyframe and container names; any stylesheet change bumps `UI_REVISION`. Rules in STABILITY.md and docs/ui.md.
- Markup helpers in `index.mjs` (`ui-model.mjs`): `UI_REVISION`, `UI_CLASSES`, `UI_STYLESHEET`, `TONES`, `tone`, `icon` (screen-reader
  word, no status characters), `badge`, `dot`, `statusLine`, `statusLines`, `navItem`; every value escaped with `esc`.
- Tests: scoping of every rule, no hard-coded colours, revision names, a stylesheet hash per revision, the bundle and an install
  shipping the stylesheet, and every helper's markup and escaping.
- docs/ui.md (classes, tokens, markup, adoption steps); README *Shared UI look*; CONVENTIONS *Look*.

### Untested in Foundry

Run in a live v14 world (and v13 where noted) once a module has adopted 0.3.0:

- [ ] `module.json` `styles` entry `vendor/wanderers-core/styles/wanderers-ui.css` loads from the module zip (no 404 in the console).
- [ ] A window with `UI_CLASSES` in its `classes`: tokens resolve (badges, dots, banners coloured) in the dark and the light theme,
      and with the window's own `.theme-dark` / `.theme-light` override; error red readable in dark, status colours readable on light.
- [ ] Nothing changes on Foundry's own windows or on a module window without the root classes.
- [ ] Two modules on different core versions (one with `wc-r1`, a later one with `wc-r2`): each window keeps its own look.
- [ ] Sidebar shell: no content padding, active link has the accent background and 2 px bar; at 720 px wide or less the sidebar becomes
      a wrapping strip (container query on `.window-content`); `wc-cols` stacks.
- [ ] Pending and live dots pulse, and stop with the OS "reduce motion" setting.
- [ ] Focus outline on buttons, chips and nav links with the keyboard only; Foundry's own `button` styling under `wc-btn` still looks
      native; `button.wc-chip` doesn't take Foundry's full button size.
- [ ] Chat card wrapped in a `div` with `UI_CLASSES` picks up badges and status lines.
- [ ] v13: the variables used exist (or the fallbacks look acceptable).

## 0.2.0 (2026-11-01)

Everything stays experimental. Modules move to it with `node vendor/wanderers-core/vendor.mjs update 0.2.0` and their reusable
workflow reference `module-checks.yml@v0.2.0`.

### Added

- **Shared Scene Configuration tab** (`sceneTab` in `foundry/index.mjs`): one "Table Tools" tab (id `wanderers`) for every module that
  vendors core, each module adding its own titled section with `sceneTab.addSection(id, { title, order, render, onSubmit })`. The
  first copy of core to add a section creates a versioned registry on `globalThis.__wanderersSceneTab` and the `renderSceneConfig`
  hook; other copies only add their section. Fields named `flags.<id>.…` save with the window's own submit; other names are
  disabled. Pure half `scene-tab-model.mjs` (`defineSection`, `orderSections`, `upsertSection`, `ownField`, `createRegistry`,
  `usableRegistry`, `claimRegistry`, constants) tested in Node.
- `rateLimiter({ burst, perSecond, maxKeys })` (token bucket), `RATE_BURST`, `RATE_PER_SECOND`.
- `parseRequestId`, `readHookMessage`, `acceptHook`, `PASSIVE_MAX_AGE_MS`.
- `readImport(..., { validators })`: optional per-key checks for Object and Array settings.
- `createLeader({ rateLimit })`: per-user request limit, on by default (20 at once, 5 a second); `false` turns it off.

### Changed

- The hook envelope is now `{ action: "hook", name, sid, payload }` (the sending session's id). A 0.1.0 copy's hooks (no `sid`) are
  not accepted by 0.2.0 clients; modules on the same core version are unaffected.
- `broadcastHook` returns whether it sent the hook to other clients, and sends only from the leader (elsewhere it fires locally).
- New session op `{ action: "leader", op: "hello" }`: a player client asks who leads when it loads; the leader answers `here`.
- Request ids must be in `makeRequestId`'s shape (`<prefix>-<n>-<time>`); ids that only matched `ID_RE` are refused.
- Dev tool versions in the README match package.json (eslint 10.13.0, typescript 7.0.2).

### Security

- **Hook relay**: a broadcast hook from another client fires only when Foundry's sender is a known GM user and the hook comes from
  the session this client counts as the leader. Before, any client (a player included) could fire any of the module's registered
  broadcast hooks on every client.
- **Sender identity**: unknown senders are refused before anything else is read; there is no fallback to a `userId` in the payload
  anywhere in core (now a rule in CONVENTIONS.md for modules too).
- **Requests**: per-user rate limit; unparseable request ids refused.
- **CI**: `module-checks.yml` passes the lock file's values through `env` (never into a script) and checks `source` against
  `^(release|local)$` and `version` against `X.Y.Z`. Every action is pinned by commit SHA. The Release workflow builds in a read-only
  job with `npm ci` and the committed lockfile, and uploads in a separate `contents: write` job.

### Untested in Foundry

Run in a live v14 world (and v13 where noted) once a module has adopted 0.2.0:

- [ ] Scene tab: Scene Configuration shows one "Table Tools" tab with the toolbox icon after the built-in tabs, with two or three
      modules installed and with only one; sections appear in order, each with its own title.
- [ ] Scene tab: clicking it switches tabs like the built-in ones (Foundry's `data-action="tab"` handling); it stays active and keeps
      one copy after a re-render (change a field, change the grid, re-open the window); no duplicate nav entry or panel.
- [ ] Scene tab: a `flags.<id>.…` field saves on Update Scene and shows the saved value when the window re-opens; a field with
      another name is disabled; `onSubmit` runs once per submit.
- [ ] Scene tab: works in v13's SceneConfig too (nav `data-group`, panel placement), or note that it doesn't.
- [ ] Two modules on different core versions (0.2.0 and a later one) share the one tab.
- [ ] Socket sender id: a request or hook sent by a player with a forged `userId` or a copied leader `sid` is refused; a request from
      a user unknown to the leader is refused; Foundry passes the real sender id as the listener's second argument.
- [ ] Broadcast hooks: fired by the leader reach the other GM tabs and players; one fired from a non-leader GM tab stays local; a
      player who joins after the GM learns the leader (the `hello` answer) and accepts the next hook.
- [ ] Rate limit: a player sending more than 20 requests at once sees the extra ones refused (debug log), normal play never hits it.

## 0.1.0 (2026-11-01)

First version, drawn from the copies in Wayfarer's Toolkit, Red Book and Wanderer's Satchel. Everything is experimental.

### Added

- Pure (tested in Node): `esc` / `plain` / `plural` / `slug` / `isoDay`; semver `parseVersion` / `compareVersions` (pre-release
  ordering per semver) and release-tag checks; `addCapped` / `capList`; `versioned()` schema normalizer with step upgrades; feature
  registry with `needs`; settings table with Basic/Advanced tabs and converters; one-writer election rules and request-id
  de-dup; schema-checked socket requests (`defineRequests` / `readRequest` / `makeRequest`); health collector with wrapped and
  time-limited checks; cleanup plan helpers and the REMOVE confirmation; the settings file format (export, validated import);
  update-notes decisions and notice building.
- Foundry halves bound to the host module id: `createLeader` (election, request routing with schema checks and sender-id rights,
  hook broadcast), `createFeatures`, `createSettings`, `createLogger`, cleanup helpers (`flaggedDocuments`, `unsetFlags`,
  `resetSettings`).
- `tools/vendor.mjs`: install, update, verify (content hash), verify against the published release, bundle. Module release zips ship the vendored runtime only (no `config/`, no `vendor.mjs`).
- Shared ESLint flat config, tsconfig base and Foundry global declarations in `config/`.
- CI: tests, release (tag check, bundle upload, download check), reusable `module-checks.yml`, Dependabot.
- CONVENTIONS.md, STABILITY.md, docs/module-ci.md, docs/branch-protection.md.

### Differences from the modules' own copies (for the migration)

- `esc` also escapes `'` (as `&#39;`).
- `compareVersions` returns `null` for unreadable versions (the toolkit's sorted them first) and orders pre-releases by semver.
- Session socket messages use `action: "leader"` (the toolkit used `"gmSession"`); requests use `{ action: "request", kind, rid,
  data }` and must match a schema. Toolkit-style top-level actions (`{ action: "mapPin", … }`) need porting to kinds.
- `decide()` takes `knownWorld` instead of the toolkit's `wizardDone` / `setupReminded`.

### Untested in Foundry

Run in a live v13 and v14 world once a module has adopted core:

- [ ] `createLeader`: two tabs of one GM user elect one leader; closing it hands over at once; a crashed tab hands over within two
      pings; a background tab isn't dropped; a second GM user joining changes the leader to the active GM's session.
- [ ] Player requests reach the leader through `module.<id>` with the right sender; a `from: "gm"` kind sent by a player is refused;
      a repeat is skipped.
- [ ] Two modules with different core versions in one world: each elects and routes on its own channel; neither logs the other's
      messages.
- [ ] `broadcastHook` fires on every client; the emitter isn't called twice.
- [ ] `createFeatures().register()` / `createSettings().register()`: settings appear with the right scope, range, choices and
      reload prompt; `config: false` keeps them out of Configure Settings.
- [ ] `flaggedDocuments` finds flags on world documents and their embedded documents (tokens, items, pages, notes) in v14;
      `unsetFlags` removes only our flags; `resetSettings` resets world settings.
- [ ] Relative imports from `vendor/wanderers-core/` load in Foundry (module zip contains `vendor/`).
