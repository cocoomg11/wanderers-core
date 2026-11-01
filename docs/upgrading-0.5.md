# Moving a module from 0.3.x straight to 0.5.0

Every module can skip 0.4.0: 0.5.0 contains it. Do the steps in order, run the checks after each, commit once at the end (or per
step). Nothing in a module changes until it uses a helper; steps 1 to 3 are required, the rest are opt-in.

## 1. Vendor 0.5.0 and pin CI

```sh
node vendor/wanderers-core/vendor.mjs update 0.5.0
# behind the agent proxy: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node vendor/wanderers-core/vendor.mjs update 0.5.0
```

- `.github/workflows/test.yml`: `uses: cocoomg11/wanderers-core/.github/workflows/module-checks.yml@v0.5.0`.
- Commit `vendor/wanderers-core/` and `wanderers-core.lock.json` together (new files: `store-model.mjs`, `foundry/store.mjs`,
  `testing/index.mjs`, plus 0.4.0's `window-model.mjs`, `keybinding-model.mjs`, `quality-model.mjs`, `coins-model.mjs`,
  `data-folder-model.mjs` and their Foundry halves).

## 2. Release zip: leave out the dev-only folders

Add `vendor/wanderers-core/testing/*` to the zip exclusions in `.github/workflows/release.yml` (next to `config/*` and `vendor.mjs`):

```sh
zip -r module.zip module.json scripts styles lang vendor README.md CHANGELOG.md LICENSE \
  -x 'vendor/wanderers-core/config/*' 'vendor/wanderers-core/vendor.mjs' 'vendor/wanderers-core/testing/*'
```

A zip that still includes it works (nothing imports it at run time); it is only dead weight.

## 3. Stylesheet revision `wc-r3`

0.4.0 moved the shared stylesheet to revision 3. Windows built with `...UI_CLASSES` move from `wc-r2` to `wc-r3` by themselves. Search
the module for a literal `wc-r2` (CSS, templates, tests that check the class) and replace it with `UI_CLASSES`; module CSS must not
name a revision. Check the windows in the dark and the light theme (changelog live checklist). New in r3: item quality tokens
`--wc-q-*`, `wc-item-slot`, `wc-q-text`, `wc-coins`.

## 4. Health lines with a fix (any module with a health check)

`healthCollector`'s `add(level, text, fix)` now keeps an optional fix (a function, an action id, or `{ label, run | action, confirm }`;
the Wanderer's Satchel's contract). Lines without one keep the old shape. When a report is stored or sent anywhere (a chat card flag,
a setting, a socket payload), pass it through `storableReport(report)` first: it drops fix functions and keeps action ids. A module
that builds lines by hand (or converts HTML to plain text, the toolkit's `toPlain`) uses `healthLine(level, text, fix)` so the fix
survives. Register the action ids in the Satchel registration's `fixes`.

## 5. GM-only store: `createStore` ([store.md](store.md))

| Module | Change |
|---|---|
| Wanderer's Toolkit | `vault.mjs` becomes a wrapper over `createStore(ID, { name: VAULT_NAME, flagKey: "vault", entryFlag: "vaultEntry", normalize: normalizeVault, keysAt: "buckets", keys: BUCKETS, about, log, isWriter: isActiveGM })`. Keep `get`, `set`, `setKey`, `update`, `migrated`, `markMigrated`, `status` as exports (the rest of the module doesn't change). `vault-model.mjs` keeps `normalizeVault`, buckets and caps; its `deletions()` is replaced by core's (the same two levels under `buckets`, now for every bucket, not only the capped ones). |
| Red Book | `store.mjs` over `createStore(ID, { name: STORE_NAME, flagKey: "store", entryFlag: null, normalize: normalizeStore, about, log, isWriter: L.isLeader })` (no marker flag today, so the data flag finds the entry). `write(data)` → `Store.update(() => data)`; `read()` → `Store.read()`. |
| Wanderer's Satchel | `store.mjs` over `createStore(ID, { name: NAME, flagKey: "store", entryFlag: "storeEntry", normalize: normalizeStore, about, log })` (core's default writer is the active GM, as today). Keep `isWriter()` for its other automatic work. |
| Ringmaker, Loot Ledger | No store today; nothing to do. Use `createStore` when GM-only data appears. |

For each: call `Store.file()` once from the writer's ready work (after `settled()` in leader modules) so the existing root-level entry
moves into "Module data"; add the `dataFolderFiled` flag to the cleanup plan; let cleanup call `Store.remove()`. The existing entry,
its name, flags and data are found and kept exactly as they are.

## 6. Module data folder (0.4.0, [data-folder.md](data-folder.md))

- Register a Boolean setting `showModuleData` (client or world, default false, `config: true`, name "Show module data", `onChange:
  () => ui.journal?.render()`), listed in the module's control panel (Advanced) and in its settings rows.
- In `init` (or `ready`), every client: `hideDataFolder(ID, { shown: () => game.settings.get(ID, "showModuleData") })`.
- `createStore` files and removes the folder itself; modules without a store need nothing else.
- Cleanup: the setting is reset with the module's others.

## 7. Windows (0.4.0, [windows.md](windows.md))

- `RememberedWindow(Base, { moduleId: ID, key: "hub" })` on windows that should reopen where the user left them. Storage: one hidden
  client setting `<ID>.windowPlacement`; add it to the cleanup plan's client settings and to the Satchel's `skipSettings` / the
  module's record-settings list. A window that already saves its own position (the toolkit's quest tracker, Red Book's Who's online
  panel) keeps its own code.
- `registerOpenKeybinding({ moduleId: ID, action, name, onDown, gmOnly })` in `init` replaces a hand-written `game.keybindings.register`
  for "Open …" bindings (no default key). Red Book's `openRedBook` is the first candidate (its CLAUDE.md asks for this).

## 8. Item quality and coins (0.4.0)

- `quality(rarity)`, `qualityLabel`, `itemSlot(...)` for item colours (Loot Ledger's tooltip, the toolkit's loot rolls, character
  pane and boss loot).
- `formatCoins(copper, { style, ratio })` / `coins(...)` instead of a module's own g/s/c formatter. The default `ratio` 100 is the
  toolkit's three-coin economy, so amounts in copper stay the same.

## 9. Tests with core's fakes ([testing.md](testing.md))

Optional: import `fakeWorld`, `installFakes`, `actAs`, `FakeApplicationV2` from `../vendor/wanderers-core/testing/index.mjs` in Node
tests instead of a module's own stubs. Never from `scripts/`.

## 10. Release

Bump the module's version, list the core move in its CHANGELOG with the *Untested in Foundry* items (the store moving into "Module
data" once, the folder hidden, `wc-r3` windows in both themes, any Fix buttons in the Satchel), commit and push. The user tags.
