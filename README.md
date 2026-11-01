# wanderers-core

A small shared library for a family of Foundry VTT modules (v13 minimum, verified v14 build 369; any game system). It holds the
patterns every module repeats: a feature registry, a settings table, a one-writer election with schema-checked socket requests,
read-only health checks, cleanup plans, debug logging, settings files, update notes, version compare, capped record lists and
schema-version normalizers.

**Core is not a Foundry module.** Nobody installs it. Each module copies a pinned version into `vendor/wanderers-core/` and ships it
inside its own zip, so every module stays standalone. CI in each module fails when the copy differs from its pin.

- [Using core in a module](#using-core-in-a-module)
- [Public API](#public-api)
- [Vendor tool](#vendor-tool)
- [Namespacing](#namespacing)
- [What is deliberately not in core](#what-is-deliberately-not-in-core)
- [Development](#development)
- Policies: [CONVENTIONS.md](CONVENTIONS.md) (house practices), [STABILITY.md](STABILITY.md) (semver, deprecation),
  [docs/module-ci.md](docs/module-ci.md), [docs/branch-protection.md](docs/branch-protection.md)

## Using core in a module

1. **Vendor a release** (from the module's root folder; needs Node 22):

   ```sh
   node path/to/wanderers-core/tools/vendor.mjs install 0.1.0   # a core checkout's copy of the tool
   ```

   This writes `vendor/wanderers-core/` and `wanderers-core.lock.json` (version, content hash, source). Commit both. From then on the
   vendored copy updates itself: `node vendor/wanderers-core/vendor.mjs update 0.2.0`.

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
   `vendor/wanderers-core/config/foundry-globals.d.ts`. Dev tools: `npm i -D eslint@10.1.0 typescript@6.0.2`; scripts
   `"lint": "eslint ."`, `"types": "tsc -p tsconfig.json"`.

4. **CI**: call the reusable workflow (see [docs/module-ci.md](docs/module-ci.md)):

   ```yaml
   jobs:
     checks:
       uses: cocoomg11/wanderers-core/.github/workflows/module-checks.yml@v0.1.0
   ```

5. **Release zip**: add `vendor` to the module's zip step.

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
| One writer | `pickActiveGM`, `leaderOf`, `isLeader`, `aliveCutoff`, `prune`, `readSessionMessage`, `applySessionMessage`, `seenCache`, `requestId`, `makeRequestId`, `newId`, `compareSessions`, constants `HEARTBEAT_MS` `GRACE_MS` `SETTLE_MS` `SEEN_MAX` `ID_RE` | experimental |
| Socket requests | `defineRequests(schemas)`, `readRequest(schemas, msg)`, `makeRequest(schemas, kind, rid, data)`, `jsonBytes`, `MAX_BYTES`, `MAX_DEPTH` | experimental |
| Health | `healthCollector({ timeoutMs })` → `add`, `section`, `check`, `checkAsync`, `report`; `worst`, `counts`, `level`, `LEVELS` | experimental |
| Cleanup | `CONFIRM_WORD`, `confirmed`, `hasFlags`, `dryRun(categories, plan)`, `picked`, `changedSettings`, `summary` | experimental |
| Settings file | `SETTINGS_FORMAT`, `buildExport(id, values, opts)`, `readImport(id, input, defs, current, opts)`, `checkValue`, `preview`, `fileName` | experimental |
| Update notes | `decide({ stored, current, knownWorld })`, `entriesBetween`, `buildNotice({ notes, always, from, to, on, ctx })`, `lintNotes` | experimental |

| Area | Exports (Foundry, `foundry/index.mjs`) | Status |
|---|---|---|
| One writer | `createLeader({ id, requests, hooks, leaderHook, log })` → `start`, `stop`, `settled`, `isLeader`, `onLeader`, `onBye`, `handle`, `request`, `broadcastHook`, `activeGM`, `info` | experimental |
| Module | `createFeatures(id, list, { title })` → `FEATURES`, `on`, `allOn`, `need`, `register`, `list`; `createSettings(id, rows, opts)` → `ROWS`, `register`, `get`, `set`; `createLogger(id)` → `log`, `warn`, `debugOn`; `getSetting`, `settingValues`, `settingDefs` | experimental |
| Cleanup | `worldDocuments()`, `flaggedDocuments(ns, filter)`, `unsetFlags(ns, uuids)`, `resetSettings(ns, keys)` | experimental |

Formats (versioned, see STABILITY.md): settings file `format` 1; socket envelopes `request` / `leader` / `hook`; release bundle
`format` 1; lock file `lockVersion` 1.

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
`createLeader` also refuses requests from unknown users and `from: "gm"` kinds from players, and skips repeated request ids. The
handler receives Foundry's sender user; check that user's rights there.

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
{ "name": "wanderers-core", "lockVersion": 1, "version": "0.1.0", "hash": "sha256-…", "source": "release",
  "dir": "vendor/wanderers-core", "files": 21, "asset": "https://github.com/cocoomg11/wanderers-core/releases/download/v0.1.0/wanderers-core-0.1.0.json" }
```

The hash is sha256 over the sorted list of `<path>\n<sha256 of file>\n`, so it covers names, content and the file set.

## Namespacing

Two modules may bundle different core versions in one world. Core is safe for that because it never shares anything:

- **No globals.** Nothing is written to `globalThis`, `window`, `CONFIG` or `game`. Each module imports its own copy by a path inside
  its own folder, so the browser loads them as separate modules.
- **No shared settings or flags.** Every setting is registered under the host module's id; cleanup helpers take the namespace.
- **No shared socket channel.** `createLeader` uses `module.<host id>`; each module elects its own leader, with its own request kinds.
- **No shared hooks.** Broadcast hooks must start with `<host id>.`; a hook name from another module is refused.
- **No shared browser storage.** Core doesn't use localStorage or sessionStorage.

## What is deliberately not in core

| Left out | Why |
|---|---|
| Control panel and other windows (ApplicationV2 HTML) | Each module's look and tabs differ; UI changes often and can't be tested in Node. |
| Cleanup window, update-notes chat card, settings import preview | Wording and categories are per module; core gives the pure parts (plan, dry run, confirm word, notice, file format). |
| Hub registry and update check over the network | Only the hub module needs them; the CORS workaround is specific to it. |
| Permission checks, scene checks, game rules | Module-specific; rules text stays SRD-only in the modules that need it. |
| Dialog and folder helpers (`ui.mjs`) | Thin Foundry calls that vary per module; not worth a shared contract yet. |
| A runtime dependency or a core Foundry module | Decided: each module stays standalone. |
| Translation (`lang/`) | All modules use plain English strings in code. |

## Development

```sh
npm ci            # eslint 10.1.0, typescript 6.0.2, @types/node (dev only)
npm run check     # syntax
npm run lint      # ESLint (config/eslint.base.mjs)
npm run types     # JSDoc type check (tsc --noEmit with checkJs)
npm test          # node --test
npm run bundle    # dist/wanderers-core-X.Y.Z.json
```

Releases: bump `version` in `package.json` and `CORE_VERSION` in `src/version.mjs`, add a CHANGELOG section, push. The user publishes
a GitHub release tagged `vX.Y.Z`; the Release workflow checks, builds and uploads the bundle.

## License

MIT. See [LICENSE](LICENSE).
