# Changelog

All notable changes to wanderers-core. Versions follow [STABILITY.md](STABILITY.md). Modules pick up a release only when they update
their pin.

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
