# Incident Response Runbook — edge-deploy-lab

## Overview
This runbook defines how to detect, respond to, and resolve incidents
affecting the `webhook-receiver` Edge Function.

**Severity Levels:**

| Level | Description | Response Time |
|-------|-------------|---------------|
| P1 — Critical | Function completely down, all webhooks failing | 15 minutes |
| P2 — High | Error rate above 20%, some webhooks failing | 1 hour |
| P3 — Medium | Intermittent errors, most webhooks succeeding | 4 hours |
| P4 — Low | Minor issues, no user impact | Next business day |

---

## How Incidents Are Detected

1. **Sentry alert** — email notification when a new error type occurs
2. **Webhook dashboard** — high failure rate visible on the dashboard
3. **User report** — someone reports webhooks not being processed
4. **Supabase logs** — ERROR entries in Edge Function logs

---

## Incident Response Steps

### 1. Detect & Acknowledge (0-5 mins)
- [ ] Confirm the incident is real (check Sentry + dashboard)
- [ ] Assess severity using the table above
- [ ] Post in team chat: `"Investigating webhook-receiver issues — [time]"`

### 2. Investigate (5-15 mins)
Check these in order:

**Check function logs:**
1. Go to Supabase → Edge Functions → webhook-receiver → Logs
2. Look for ERROR entries — what is the error message?

**Check recent deployments:**
1. Go to GitHub → Actions tab
2. Was there a deployment in the last hour? That may be the cause.

**Check Sentry:**
1. Go to sentry.io → Issues
2. When did the first error occur? What line of code?

**Check database:**
1. Go to Supabase → Table Editor → webhook_logs
2. Are failure rows appearing? What error messages?

### 3. Resolve (15-60 mins)

**If caused by a bad deployment:**
→ Follow the Rollback Procedure in the deployment runbook

**If caused by a missing/expired secret:**
→ Follow the Secrets Rotation section in the deployment runbook

**If caused by Supabase being down:**
→ Check status.supabase.com
→ No action needed — wait for Supabase to recover
→ Notify affected users if downtime exceeds 30 minutes

**If cause is unknown:**
1. Revert the last deployment as a precaution
2. Check Supabase status page
3. Check GitHub status page (githubstatus.com)
4. Escalate if unresolved after 30 minutes

### 4. Resolve & Communicate (after fix)
- [ ] Confirm error rate is back to 0% on dashboard
- [ ] Confirm Sentry shows no new errors
- [ ] Post in team chat: `"Incident resolved — [time]. Root cause: [X]"`

### 5. Post-Incident Review (within 24 hours)
Write a brief summary covering:
- What happened
- How it was detected
- How it was resolved
- What we'll do to prevent it happening again

---

## Escalation Path
On-call engineer (you)
↓ if unresolved after 30 mins
Senior engineer / tech lead
↓ if unresolved after 1 hour
Engineering manager
↓ if P1 and unresolved after 2 hours
Supabase support (support.supabase.com)
---

## Useful Links

| Resource | URL |
|----------|-----|
| Supabase Dashboard | supabase.com/dashboard |
| Sentry Issues | sentry.io |
| GitHub Actions | github.com/[you]/edge-deploy-lab/actions |
| Supabase Status | status.supabase.com |
| GitHub Status | githubstatus.com |
