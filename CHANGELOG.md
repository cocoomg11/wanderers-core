# Changelog

All notable changes to wanderers-core. Versions follow [STABILITY.md](STABILITY.md). Modules pick up a release only when they update
their pin.

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
