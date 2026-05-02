# Module 1 — GitHub Actions CI/CD Pipeline

## What Is CI/CD?

**CI (Continuous Integration)** means every code change is automatically
tested before it can merge. No broken code gets through.

**CD (Continuous Deployment)** means every approved change is automatically
deployed. No manual steps needed.

Together they form a pipeline — a series of automated checks that code must
pass before reaching production.

---

## Why I Built This

Without CI/CD, a developer has to manually:
- Remember to run tests before deploying
- Deploy from their own machine
- Hope they didn't forget a step

With CI/CD, GitHub handles all of this automatically on every push.
Humans make mistakes. Pipelines don't.

---

## How the Pipeline Works

```
Developer pushes code or opens a Pull Request
                ↓
GitHub reads .github/workflows/ci.yml
                ↓
Spins up a fresh Ubuntu virtual machine
                ↓
        ┌───────────────┐
        │   Lint Code   │
        └──────┬────────┘
               │ passes
        ┌──────▼────────┐
        │  Run Tests    │
        └──────┬────────┘
               │ passes
     ┌─────────┴──────────┐
     ▼                    ▼
Deploy to STAGING    Deploy to PRODUCTION
(staging branch)     (main branch only)
```

If any step fails, everything after it is cancelled.
Broken code never reaches production.

---

## File: `.github/workflows/ci.yml`

### Why This Location?
GitHub automatically looks for workflow files inside `.github/workflows/`.
The filename can be anything ending in `.yml`. The `.github` folder with
a dot at the start is a convention — it signals this folder contains
GitHub-specific configuration, not application code.

### Full File With Line-by-Line Explanation

```yaml
# The display name of this workflow.
# This is what appears in the GitHub Actions tab.
name: CI Pipeline

# TRIGGERS — defines what events cause this workflow to run.
on:
  pull_request:
    branches: [main]        # Runs when anyone opens a PR targeting main.
                            # Catches issues BEFORE code merges.
  push:
    branches: [main, staging] # Runs when code is pushed directly to
                              # main or staging branches.

# JOBS — the actual work to be done.
# Each job runs on its own fresh virtual machine.
jobs:

  # ─────────────────────────────────────────
  # JOB 1: LINT
  # Checks code style and catches syntax errors.
  # ─────────────────────────────────────────
  lint:
    name: Lint Code
    runs-on: ubuntu-latest  # GitHub provisions a fresh Ubuntu Linux VM.
                            # It's destroyed after the job finishes.
    steps:
      - name: Checkout code
        uses: actions/checkout@v4   # Downloads your repo code onto the VM.
                                    # Without this, the VM has no code to work with.

      - name: Setup Node.js
        uses: actions/setup-node@v4 # Installs Node.js on the VM.
        with:
          node-version: '18'        # Pins to Node 18 for consistency.
                                    # Different versions can behave differently.

      - name: Install dependencies
        run: npm install            # Reads package.json and installs
                                    # all required packages.

      - name: Run linter
        run: npm run lint           # Runs the "lint" script from package.json.
                                    # If this exits with an error, the job fails.

  # ─────────────────────────────────────────
  # JOB 2: TEST
  # Runs automated tests to catch logic bugs.
  # ─────────────────────────────────────────
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    needs: lint               # PIPELINE GATE: This job only starts if
                              # the lint job completed successfully.
                              # If lint fails, test is skipped entirely.
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm install
      - run: npm test         # Runs the "test" script from package.json.

  # ─────────────────────────────────────────
  # JOB 3: DEPLOY TO STAGING
  # Deploys to the staging environment.
  # Only runs when code is pushed to the staging branch.
  # ─────────────────────────────────────────
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: test               # PIPELINE GATE: Only runs if tests pass.
    if: github.ref == 'refs/heads/staging'  # CONDITION: Only runs on
                                            # the staging branch.
                                            # github.ref is the full
                                            # branch reference path.
    steps:
      - uses: actions/checkout@v4

      - name: Install Supabase CLI
        uses: supabase/setup-cli@v1   # Official Supabase GitHub Action.
        with:                         # Installs the Supabase CLI tool
          version: latest             # on the VM so we can deploy.

      - name: Deploy to Staging
        env:                          # ENV VARIABLES: Injected into the
                                      # shell session for this step only.
                                      # ${{ secrets.X }} reads from GitHub
                                      # Secrets — never exposed in logs.
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_PROJECT_ID: ${{ secrets.STAGING_SUPABASE_PROJECT_ID }}
          WEBHOOK_SECRET: ${{ secrets.WEBHOOK_SECRET }}
          SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          chmod +x scripts/deploy.sh  # Makes the script executable.
                                      # Files on Linux need permission
                                      # to run as programs.
          ./scripts/deploy.sh staging # Runs our deploy script and passes
                                      # "staging" as the environment argument.

  # ─────────────────────────────────────────
  # JOB 4: DEPLOY TO PRODUCTION
  # Deploys to production.
  # Only runs when code is merged to main.
  # ─────────────────────────────────────────
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: test               # PIPELINE GATE: Only runs if tests pass.
    if: github.ref == 'refs/heads/main'   # CONDITION: Only runs on
                                          # the main branch.
    steps:
      - uses: actions/checkout@v4

      - name: Install Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Deploy to Production
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}
          WEBHOOK_SECRET: ${{ secrets.WEBHOOK_SECRET }}
          SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          chmod +x scripts/deploy.sh
          ./scripts/deploy.sh production
```

---

## Key Concepts to Know by Heart

**Pipeline Gates (`needs:`)**
Jobs run in sequence because of `needs:`. If lint fails, test never runs.
If test fails, deploy never runs. This prevents broken code from ever
reaching production. Think of it as a quality checkpoint at each stage.

**Fresh VM Every Time (`runs-on:`)**
Every job gets a brand new Ubuntu machine. It has nothing installed by
default — that's why we install Node.js and dependencies every time.
This guarantees a clean, reproducible environment every single run.

**Secrets (`${{ secrets.X }}`)**
Sensitive values like API keys and tokens are stored encrypted in GitHub
Settings. The pipeline can read them but they never appear in logs or
code files. If a secret is wrong or missing, the job fails immediately.

**Branch Conditions (`if: github.ref ==`)**
The same workflow file handles both staging and production. The `if:`
condition checks which branch triggered the run and only executes the
relevant deploy job. Staging code never accidentally deploys to production.

**`uses:` vs `run:`**
- `uses:` runs a pre-built Action from the GitHub marketplace (someone
  else's reusable script)
- `run:` executes a raw shell command directly on the VM

---

## Common Interview Questions on This Topic

**Q: What is the difference between CI and CD?**
CI is about automatically testing every code change. CD is about
automatically deploying code that passes those tests. CI catches bugs
early. CD removes the manual deployment step.

**Q: Why use `needs:` between jobs?**
To create a dependency chain. You don't want to deploy code that hasn't
been tested. `needs:` ensures jobs run in the right order and stops the
pipeline if an earlier step fails.

**Q: Why are secrets stored in GitHub Settings instead of the code?**
Because code is visible to anyone with repo access, and can be accidentally
committed to public repositories. Secrets are encrypted, access-controlled,
and never appear in logs. Hardcoding credentials in code is a serious
security vulnerability.

**Q: What does `runs-on: ubuntu-latest` mean?**
It tells GitHub to provision a fresh Ubuntu Linux virtual machine for
that job. The machine is clean, isolated, and destroyed after the job
finishes. This ensures every run is reproducible and not affected by
leftover state from previous runs.

---

## File: `package.json`

### Why This File Exists
The CI workflow runs these two commands:

```yaml
- run: npm run lint
- run: npm test
```

npm needs to know what `lint` and `test` actually mean.
That definition lives in `package.json`.

### The File

```json
{
  "name": "edge-deploy-lab",
  "version": "1.0.0",
  "scripts": {
    "lint": "echo 'Linting passed ✅'",
    "test": "echo 'Tests passed ✅'"
  }
}
```

### Line by Line

**`"name"`** — the name of the project. Used by npm to identify it.

**`"version"`** — the current version of the project. Follows the
standard major.minor.patch format (1.0.0 = first stable release).

**`"scripts"`** — a dictionary of shortcuts. When the CI runs
`npm run lint`, npm looks up `"lint"` here and runs whatever command
is assigned to it.

| CI Command | What npm Actually Runs |
|------------|----------------------|
| `npm run lint` | `echo 'Linting passed ✅'` |
| `npm test` | `echo 'Tests passed ✅'` |

### Why We Used `echo` Instead of Real Tools
In a real project these scripts would run actual tools:
- `"lint": "eslint src/"` — checks code style across all files
- `"test": "jest"` — runs a full test suite

We used `echo` to keep the focus on the pipeline structure without
spending time setting up linting and testing frameworks. The pipeline
behaves identically either way — if the script exits without an error,
the job passes.

### The Relationship in One Sentence
`package.json` defines what `lint` and `test` mean. The CI workflow
calls them. Without `package.json`, the workflow would fail immediately
with a "script not found" error.
