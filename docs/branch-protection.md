# Branch protection for `main`

Agents can't change repository settings, so these are steps for you to click once per repository (core first, then each module).
They suit one person working with agents that push straight to `main`: checks must pass, history can't be rewritten or deleted,
but no pull request is required (a required PR would block every agent push).

Why no required pull request: agents commit and push to `main` directly by design, and you're the only reviewer. Requiring a PR would
mean every change waits for you to open and merge it. The status check still guards `main`: a push whose tests fail is shown red,
and with "Require status checks" a merge through a PR is blocked until it passes. (GitHub can't run checks *before* accepting a
direct push; that is only possible with required PRs. If you later want that, tick **Require a pull request before merging** with
0 required approvals, and agents will open PRs instead.)

## Steps (GitHub website, about 3 minutes)

1. Open the repository on GitHub (for example `github.com/cocoomg11/wanderers-core`) and click **Settings** (top bar, gear icon).
2. In the left sidebar, under *Code and automation*, click **Rules** › **Rulesets**.
3. Click **New ruleset** › **New branch ruleset**.
4. **Ruleset name**: `main`. **Enforcement status**: **Active**.
5. **Bypass list**: leave empty (you can still change the ruleset itself at any time).
6. **Target branches**: click **Add target** › **Include default branch**.
7. Under **Branch rules**, tick:
   - **Restrict deletions** (on by default; keep it).
   - **Block force pushes** (on by default; keep it).
   - **Require status checks to pass**. Then click **Add checks**, type `Lint, types and tests` and pick it (for a module that
     calls the reusable workflow, the check is named `checks / Core pin, lint, types and tests`, or whatever its own test job is
     called). Leave **Require branches to be up to date before merging** unticked.
     The check only appears in the list after it has run once on the repository; if it isn't offered, wait for the first Tests run
     on the Actions tab, then come back.
   - Leave **Require a pull request before merging** unticked (see above).
   - Leave **Require signed commits** unticked (agent commits aren't signed).
   - Optional: **Require linear history** (keeps `main` free of merge commits; agents already rebase).
8. Click **Create**.

## Also worth switching on (Settings › Advanced Security, or "Code security" on older layouts)

- **Dependabot alerts**: **Enable**. Tells you when a dev tool has a known vulnerability.
- **Dependabot security updates**: **Enable**. Opens a PR with the fix.
- Dependabot *version updates* are already configured by `.github/dependabot.yml` (GitHub Actions weekly, dev tools monthly); there
  is nothing to click for them. Their PRs need you to merge them (agents don't merge PRs).
- **Secret scanning** and **Push protection**: **Enable** (free on public repos). Push protection refuses a push that contains a
  token or key.

## Settings › Actions › General

- **Workflow permissions**: keep **Read repository contents and packages permissions** (the Release workflow asks for write access
  itself, only when a release is published).
- Leave **Allow GitHub Actions to create and approve pull requests** unticked.
