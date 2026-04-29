# Deployment Runbook — edge-deploy-lab

## Overview
This runbook covers deploying the `webhook-receiver` Supabase Edge Function
to staging and production environments.

**Function URL (Production):**
`https://ljpkygjdsheyjfolhiru.supabase.co/functions/v1/webhook-receiver`

**Last Updated:** April 2026  
**Owner:** [Your Name]

---

## Pre-Deployment Checklist
Before every deployment, confirm:

- [ ] All tests passing in GitHub Actions (`lint` and `test` jobs green)
- [ ] Changes reviewed and approved via Pull Request
- [ ] Secrets are up to date in GitHub repository settings
- [ ] Staging environment tested successfully (see staging runbook)

---

## Deployment Steps

### Automatic Deployment (Normal Process)
Deployment happens automatically when code is merged to `main`.

1. Open a Pull Request with your changes
2. Wait for CI pipeline to pass (lint ✅ test ✅)
3. Get a code review approval
4. Merge the Pull Request
5. Monitor the `Deploy to Supabase` job in the Actions tab
6. Verify deployment in Supabase Dashboard → Edge Functions

**Expected deploy time:** 45-90 seconds

### Manual Deployment (Emergency Only)
Only use this if the automatic pipeline is broken.

1. Ensure you have the Supabase CLI installed:
```bash
supabase --version
```
2. Set your environment variables locally:
```bash
export SUPABASE_ACCESS_TOKEN=your_token
export SUPABASE_PROJECT_ID=your_project_id
export WEBHOOK_SECRET=your_secret
export SENTRY_DSN=your_sentry_dsn
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```
3. Run the deployment script:
```bash
./scripts/deploy.sh production
```
4. Verify the function is responding:
```bash
curl -X POST https://ljpkygjdsheyjfolhiru.supabase.co/functions/v1/webhook-receiver \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "x-webhook-secret: YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event": "health.check", "data": {}}'
```
Expected response: `{"received": true, "event": "health.check"}`

---

## Post-Deployment Verification

After every deployment confirm these:

1. **Function is live** — check Supabase → Edge Functions → webhook-receiver shows updated timestamp
2. **Health check passes** — run the curl command above and get a 200 response
3. **Logs are clean** — check Supabase → Edge Functions → Logs, no ERROR entries
4. **Sentry is quiet** — no new issues appearing in Sentry dashboard
5. **Database is writing** — send a test webhook and confirm a row appears in `webhook_logs` table

---

## Rollback Procedure

If something goes wrong after deployment:

### Step 1 — Identify the bad commit
1. Go to GitHub → Actions tab
2. Find the last successful deployment
3. Note the commit SHA (7-character code next to the run)

### Step 2 — Revert the commit
1. Go to GitHub → commits history
2. Find the bad commit → click the `...` menu → click **"Revert"**
3. This creates a new PR that undoes the change
4. Merge it immediately — this triggers a new deployment with the old code

### Step 3 — Verify rollback succeeded
Run the health check curl command again and confirm 200 response.

**Target rollback time:** Under 10 minutes

---

## Secrets Rotation

If a secret is compromised, rotate it immediately:

1. Generate a new secret value
2. Update it in GitHub → Settings → Secrets and variables → Actions
3. Trigger a manual deployment to push the new secret to Supabase
4. Verify the function still responds correctly
5. Invalidate the old secret at the source (e.g. Supabase dashboard)
