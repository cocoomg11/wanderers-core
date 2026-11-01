# CLAUDE.md: wanderers-core

Shared core library for the user's Foundry VTT modules (v13 minimum, verified v14 build 369; any system). **Not a Foundry module**:
each module vendors a pinned copy into `vendor/wanderers-core/` and ships it in its own zip (no runtime dependency, nothing
installed in Foundry). Public repo, MIT. Read CONVENTIONS.md (house practices) and STABILITY.md (semver) before changing exports.

## File map
- `src/index.mjs` pure exports; `src/foundry/index.mjs` Foundry exports. Only these two are public API.
- Pure (no Foundry calls at import or call time, tested in Node): `text.mjs` (esc/plain/plural/slug/isoDay), `version.mjs`
  (`CORE_VERSION`, semver compare, release tags), `records.mjs` (`addCapped`, `capList`, `versioned`), `features-model.mjs`,
  `settings-model.mjs`, `leader-model.mjs` (election rules, `seenCache`, request ids), `socket-model.mjs` (`defineRequests`,
  `readRequest`, `makeRequest`), `health-model.mjs` (`healthCollector`), `cleanup-model.mjs`, `settings-io-model.mjs`,
  `notes-model.mjs`, `rate-model.mjs` (`rateLimiter`), `scene-tab-model.mjs` (shared scene tab registry and ordering), `ui-model.mjs`
  (`UI_REVISION`, `UI_CLASSES`, `badge`/`icon`/`dot`/`statusLine`/`navItem` markup helpers), `quality-model.mjs` (`QUALITIES`, `quality(rarity)`, `itemSlot`), `coins-model.mjs` (`formatCoins`/`toCopper`/`fromCopper`/`coins`;
  whole copper, `ratio` default 100 = the toolkit's three-coin economy), `window-model.mjs` (placement store,
  `readPlacements`, `clampPlacement`, `debouncer`), `keybinding-model.mjs` (`defineOpenKeybinding`, `keybindingConfig`), `data-folder-model.mjs` (`pickDataFolder`, `dataFolderPlan`, `folderEmptyAfter`, `dataFolderShown`, `dataFolderIds`).
- `styles/wanderers-ui.css` the opt-in shared look (ships as `vendor/wanderers-core/styles/`; docs/ui.md). Scoped under
  `.wc-ui.wc-r<UI_REVISION>`; any edit bumps `UI_REVISION` and the hash in `tests/ui.test.mjs`; only Foundry variables (checked live
  on 14.369), hex only as var() fallbacks.
- Foundry halves (thin, untested in Node): `foundry/leader.mjs` (`createLeader`), `foundry/module.mjs` (`createFeatures`,
  `createSettings`, `createLogger`, setting readers), `foundry/cleanup.mjs` (flag walk, unset, reset), `foundry/scene-tab.mjs`
  (`sceneTab`, the shared "Table Tools" tab via the `renderSceneConfig` hook), `foundry/window.mjs` (`RememberedWindow` mixin over
  documented ApplicationV2 methods `_initializeApplicationOptions`/`_onFirstRender`/`_onPosition`/`minimize`/`maximize`/`_onClose`;
  state set during the constructor lives in a WeakMap, not private fields), `foundry/keybinding.mjs` (`registerOpenKeybinding`), `foundry/data-folder.mjs` (`ensureDataFolder`, `fileInDataFolder`, `removeDataFolderIfEmpty`, `hideDataFolder`: shared "Module data" journal folder, matched by name+type+root, no flag; tidiness only, not secrecy).
- `tools/vendor.mjs` install/update/verify/bundle (Node only, no packages; also shipped as `vendor/wanderers-core/vendor.mjs`).
- `config/` shared `eslint.base.mjs`, `tsconfig.base.json`, `foundry-globals.d.ts` (shipped to modules).
- `tests/*.test.mjs`; `foundry-fake.test.mjs` runs the Foundry halves against a fake `game` (wiring only, not Foundry).
- `.github/workflows/`: `test.yml`, `release.yml`, `module-checks.yml` (reusable, called by modules). `.github/dependabot.yml`.
- Docs: README (Public API, quick start), CONVENTIONS.md, STABILITY.md, CHANGELOG.md, `docs/module-ci.md`, `docs/branch-protection.md`,
  `docs/ui.md` (shared look: classes, tokens, markup, adoption), `docs/windows.md` (remembered placement, open keybindings), `docs/data-folder.md` (Module data folder).

## Key patterns
- **Namespacing is a hard rule**: no globals (one exception: the scene tab registry `globalThis.__wanderersSceneTab`, versioned), no localStorage, no shared settings/flags/socket channels/hooks. Every Foundry-facing
  function takes the host module id; `createLeader` uses `module.<id>` and only broadcasts hooks starting `<id>.`. Tests check it.
- **Fail early on programming mistakes, never at play time**: `defineFeatures` / `defineSettings` / `defineRequests` throw on bad
  definitions (so module tests catch them); readers (`readRequest`, `readImport`, `versioned()` normalizers, health checks) never throw.
- **Sender rights**: handlers get Foundry's sender user; payload fields like `userId` are refused by the schema, never trusted, and
  there is no fallback to them. Unknown senders are refused; hooks are accepted only from the leader's session of a GM user.
- **Shared look is version-safe**: no `:root`/`html`/bare element rules, tokens on the root, revisioned keyframes/containers;
  a stylesheet change is a new revision (never edit a shipped revision's rules in place). Tests in `tests/ui.test.mjs`.
- **Keep core small.** Add only what at least two modules repeat and what has a stable shape. UI, wording and module rules stay in
  the modules (see README, What is deliberately not in core).
- Every new export gets JSDoc types (checked by `tsc`), a test, a README Public API row (experimental first) and a CHANGELOG line.
- Window placement lives in one hidden client setting per module, `<moduleId>.windowPlacement` (`PLACEMENT_SETTING`, `v` 1);
  keybindings register with no key unless the module passes `editable`.
- Changing a format (settings file, socket envelopes, bundle, lock, window placement) needs a version bump in that format and a reader for the old one.

## Tests and checks
- `npm ci` once (dev tools pinned in package-lock.json), then `npm run check`, `npm run lint`, `npm run types`, `npm test`
  (`npm run ci` runs all four). CI runs them on every push.
- Tests are not type-checked (they feed wrong types on purpose) but are linted.
- Not testable in Node: real sockets, settings registration, hooks, document flag writes, window drag/resize, key presses. List
  them in the CHANGELOG's *Untested in Foundry* checklist. `tests/window.test.mjs` checks the mixin against a fake ApplicationV2 only.
- Locally without `npm ci`: `tsc -p tsconfig.json --typeRoots <a folder holding @types/node>`.

## Release process
1. Bump `version` in `package.json` **and** `CORE_VERSION` in `src/version.mjs` (a test checks they match).
2. Add `## X.Y.Z (date)` to CHANGELOG.md with an *Untested in Foundry* checklist (the Release workflow fails without the section).
3. Commit and push to main. **Agents never tag or publish.** The user publishes a GitHub release tagged `vX.Y.Z`; the workflow
   checks tag = package.json = CORE_VERSION, runs every check, uploads `wanderers-core-X.Y.Z.json` and `.sha256`, then downloads
   and verifies it.
4. Modules move to it with `node vendor/wanderers-core/vendor.mjs update X.Y.Z`, then test and commit in the module (separate job).

## Rules
- Public repo: no campaign names, no game-publisher wording, no private details (IPs, domains, local paths), no official non-SRD
  rules text. Strings plain English.
- Verify Foundry APIs at https://foundryvtt.com/api (v14) and github.com/foundryvtt/dnd5e; don't guess.
- Don't edit the modules from this repo; migration is a separate job per module.
- Commit author `cocoomg11 <cocoomg11@users.noreply.github.com>`; end commit messages with the attribution trailers given by the
  session. `git fetch origin main` and rebase before pushing. Use `gh api` REST only.
