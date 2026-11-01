# Versioning and API stability

wanderers-core follows [Semantic Versioning](https://semver.org/). Because every module vendors and pins its own copy, a new core
release never changes a module by itself: a module moves to it only when its pin is updated, tested and committed. The policy below
says what a version number promises to the person updating a pin.

## What is the public API

- Everything exported from `src/index.mjs` (pure) and `src/foundry/index.mjs` (Foundry halves), with the parameters and return
  shapes documented in their JSDoc.
- The file formats: the settings file (`module`, `format`, `version`, `exported`, `world`, `client`), the socket envelopes
  (`{ action: "request", kind, rid, data }`, `{ action: "leader", op, sid, since }` and `{ action: "leader", op: "hello" }`,
  `{ action: "hook", name, sid, payload }`), the release bundle (`format`), the lock file (`lockVersion`) and the shared scene tab
  registry (`globalThis.__wanderersSceneTab`, `version`; its tab id `wanderers`).
- The shared stylesheet's contract: its path (`styles/wanderers-ui.css`), the root classes (`UI_CLASSES`), and the class and token
  names listed in docs/ui.md for the current `UI_REVISION`.
- The vendor tool's commands and options, and `config/` (ESLint config function, tsconfig base).
- Not public: anything not exported from those two index files, internal helpers, test files, error message wording (but messages
  stay plain English).

Each export is marked **stable** or **experimental** in the README *Public API* table.

- **Stable**: changes only as described below.
- **Experimental**: may change in a minor release; the changelog says how. New exports start experimental.

While core is `0.x`, everything is experimental unless the README marks it stable, and a minor release (0.1 → 0.2) may break.
As of 0.3.0 nothing is marked stable: every export, including the scene tab, rate limit and the shared UI look, is experimental.
From 1.0.0 the rules below are strict.

## What counts as breaking (needs a major version)

- Removing or renaming a stable export, parameter or option, or changing its default.
- Changing a stable function's return shape (removing or retyping a field), or making it throw where it didn't.
- Making a validator accept less than before (for example `readRequest` refusing a payload it accepted), unless the old behaviour
  was a security hole; that ships as a minor or patch with a **Security** note.
- Changing a file or wire format so an older reader can't read the new output, or the new reader can't read old output.
- Changing the content hash algorithm, the bundle `format` or the lock `lockVersion` without reading the old ones.
- Raising the minimum Foundry version or Node version.

## Not breaking (minor or patch)

- New exports, new optional parameters or options with defaults that keep the old behaviour, new fields in returned objects.
- Accepting more input than before, clearer error messages, performance work, documentation.
- Bug fixes that make behaviour match the documentation (called out in the changelog when someone might rely on the bug).

## Deprecation

1. Mark the export `@deprecated` in JSDoc with what to use instead, and list it under **Deprecated** in the changelog and the README
   table. It keeps working.
2. If practical, log one `console.warn` per page load the first time it is used (never in a hot path).
3. Remove it no sooner than the next major version, and no sooner than one minor release after the deprecation shipped.

## Namespacing promise

No version of core uses shared setting keys, shared flags or shared socket channels. Everything is parameterised by the host module's
id. Two modules bundling different core versions therefore run side by side; this is part of the stable contract.

The one global is the shared Scene Configuration tab's registry, `globalThis.__wanderersSceneTab`, because one tab shared by every
module is the feature. Its rules: it carries a `version`; a newer core keeps the version-1 calls (`add`, `remove`, `list`) working
so an older copy can still add its section; sections are keyed by module id and one module never changes another's.

## Shared stylesheet

The stylesheet is loaded once per module that vendors it, so copies from different core versions meet in one page. Rules (checked by
`tests/ui.test.mjs`):

- Every selector starts at `.wc-ui.wc-r<N>` (optionally after `body` / `body.theme-dark` / `body.theme-light`); tokens are defined on
  that root; no `:root`, `html`, `body` or bare element rules; keyframe and container names carry the revision.
- **Any change to the file bumps `UI_REVISION`** (and every `wc-r<N>` in it), and the new file's hash is recorded for that revision. A
  shipped revision's file never changes, so two copies of one revision are identical and a window keeps the look it was built for.
- Breaking (a major version after 1.0, a minor with a changelog note in 0.x): removing or renaming a class, token, `UI_CLASSES` or
  `UI_STYLESHEET`, or changing a class's markup contract (what it expects inside or around it). Visual tweaks in a new revision and
  new classes are not breaking.
- Since modules opt in per window, a new core release never changes a window that doesn't carry its revision class.

## Changelog

Every release has a `CHANGELOG.md` section `## X.Y.Z (date)` with Added / Changed / Deprecated / Removed / Fixed / Security as
needed, and an **Untested in Foundry** checklist naming what was not run in a live world. The Release workflow fails without the
section.
