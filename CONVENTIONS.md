# Conventions

House practices shared by every module that uses wanderers-core. A module's own CLAUDE.md adds what is specific to it; when they
disagree, the module's file wins for that module, and this file should be updated if the difference is meant to spread.

## Releases

- **Release tags are `vMAJOR.MINOR.PATCH` only** (`v1.24.0`; never `1.24`, `v1.24` or `v1.24.0-beta`). Every Release workflow fails
  early on anything else and sets version and URLs from the tag.
- **Agents never tag or publish.** They bump `version` in `module.json` (and the `download` URL), write the changelog, commit and push
  to main. The user fills in and publishes the GitHub release.
- `module.json`: `manifest` stays `.../releases/latest/download/module.json`; `download` is `.../releases/download/vX.Y.Z/module.zip`.
- **Every release ends with a live checklist**: a CHANGELOG.md section *Untested in Foundry* listing what was not run in a live
  world (hooks, windows, sockets, chat cards, other modules' integrations) and needs checking there.
- The zip step of a module's Release workflow lists every top-level folder `module.json` refers to. A new folder (for example
  `vendor/`) must be added there.

## Compatibility honesty

- `module.json` `compatibility`: `minimum` 13, `verified` = the newest Foundry build actually checked in a live world (14.369 now),
  no `maximum` unless something is known to break.
- System relationships (dnd5e `minimum` / `verified`) say what was checked live, nothing more.
- Optional integrations go in `relationships.recommends`, never `requires`.
- Verify Foundry APIs at https://foundryvtt.com/api and the dnd5e system at github.com/foundryvtt/dnd5e; don't guess.

## Features and settings

- **Every feature is toggleable**: one world setting per tool (`feature-<id>`, requires reload). A disabled feature registers
  nothing: no hooks, buttons, key bindings, socket handlers or wrappers; its API getter returns `undefined`.
- **Setting keys are stable**: never rename one (a rename silently resets every world's choice). Settings live only under the
  module's own namespace.
- Settings appear on the module's control panel (Basic first, the rest under Advanced), not as loose submenus.
- Strings are plain English in code (`lang/en.json` stays empty unless a module adopts translation deliberately).
- **No automatic hotbar macros.**

## Data we write

- **Flags only under our own namespace** (`flags.<module-id>.*`). We never write another module's flags except through that module's
  API.
- **Record settings are capped** (histories, snapshots, caches) in their pure model, with a test of the cap. A new list-like stored
  value gets a cap the same way.
- **Schema versions**: a stored shape that has changed before, or is likely to, carries a version and is read through one normalizer
  (`versioned()` in core). Bump the version and add an upgrade step when the shape changes. No migrations without something to
  migrate.
- **Cleanup covers everything we write**: every flag, setting, document, folder, status effect or browser-storage key is found by
  the module's cleanup `plan()` and removed by `remove()`, with a dry run first and the GM typing REMOVE.
- Health checks are read-only: each check is wrapped, never throws and never changes anything.

## Multi-client safety

- Anything that writes documents automatically runs only on the leader (`createLeader().isLeader()`): one client even when one GM
  user has several tabs open. Ready-time GM work and socket handlers wait for `settled()` first.
- Players send choices over the module's own socket channel with a request id; the leader drops repeats.
- Every socket request is read through a schema (`defineRequests` / `readRequest`): unknown kinds, wrong types, oversized payloads
  and missing request ids are refused. The sender is Foundry's sender id, never a field in the payload.

## Performance

- **Hot hooks bail early** (`updateActor`, `updateToken`, `updateItem`, `renderChatMessageHTML`, canvas and refresh hooks, …): the
  first lines check whether the change is relevant (`foundry.utils.hasProperty(changes, …)`, our flag, `isLeader()` for writers,
  whether the UI is showing) before any loop over scenes or tokens.
- Windows have no backdrop blur (it costs a lot of FPS in v14).

## Code

- Pure logic lives in files with no Foundry calls at import time, so it runs and is tested in Node (`npm test` = `node --test`).
  Foundry-dependent code is thin and listed as untested in the changelog.
- `npm run check` syntax-checks every script; `npm run lint` (ESLint, core's shared config) and `npm run types` (JSDoc checked by
  `tsc`) run in CI.
- The vendored core (`vendor/wanderers-core/`) is never edited by hand; CI fails when it differs from its pin. Change core in the
  core repo, release it, then update the pin.

## Docs

- README has a **Public API and hooks** section listing every `api.*` entry and every hook the module fires, each marked stable or
  experimental. Update it with any API or hook change.

## Commits and the public repos

- Commit author `cocoomg11 <cocoomg11@users.noreply.github.com>`; end commit messages with the attribution trailers the session
  gives.
- Another agent may be committing to main: `git fetch origin main` and rebase before pushing.
- **Public repos stay clean**: no campaign names, no game-publisher wording in user-facing text (say "classic MMO"), no private
  details (IPs, domains, local paths), no official non-SRD rules text (SRD 5.2 only; never unofficial rules sites).
- MIT licence.
