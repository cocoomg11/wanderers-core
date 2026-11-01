# Module CI with wanderers-core

A module that vendors core runs one reusable workflow. It fails when the vendored copy differs from the pin, then runs the module's
syntax check, lint, type check and tests.

## `.github/workflows/test.yml` in the module

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  checks:
    uses: cocoomg11/wanderers-core/.github/workflows/module-checks.yml@v0.1.0
    # with:
    #   lint: false      # while the module still has lint errors to fix
    #   types: false     # while the module isn't JSDoc-clean yet
    #   remote: false    # skip checking the lock against the published release
```

Pin the reusable workflow to a core release tag (`@v0.1.0`), not `@main`, so a core change can't alter a module's CI without a
commit in the module. Dependabot (`github-actions` ecosystem) proposes the bump.

The check name for branch protection is `checks / Core pin, lint, types and tests`.

## What the pin check does

1. Reads `wanderers-core.lock.json` (version, content hash, source).
2. For a released pin, checks out core at tag `v<version>` and runs *that* copy of `vendor.mjs` (not the module's vendored one, so an
   edited vendored tool can't approve itself).
3. `verify`: the vendored folder's content hash equals the lock's hash, and the file count matches. Any hand edit, extra file or
   missing file fails, and the log names the files.
4. `verify --remote`: also downloads the release asset `wanderers-core-<version>.json` and checks the lock's hash is that release's
   hash, so a lock can't point at a version it doesn't contain.
5. A `local` pin (from `install --from <checkout>`, for trying unreleased core) passes with a warning. Pin a release before
   releasing the module.

## Without the reusable workflow

If a module prefers its own steps, the one line that matters is:

```yaml
      - name: Vendored wanderers-core matches its pin
        run: node vendor/wanderers-core/vendor.mjs verify --remote
```

## The module's Release workflow

Add `vendor` to the zip step (core is imported at run time from `vendor/wanderers-core/`), and run the pin check there too:

```yaml
      - name: Vendored wanderers-core matches its pin
        run: node vendor/wanderers-core/vendor.mjs verify --remote
      - name: Build module.zip
        run: zip -r module.zip module.json scripts styles lang vendor README.md CHANGELOG.md LICENSE
```

To keep the zip small, a module may zip only `vendor/wanderers-core/*.mjs vendor/wanderers-core/foundry vendor/wanderers-core/LICENSE`
(the `config/` folder and `vendor.mjs` aren't needed in Foundry). Keep `LICENSE`.
