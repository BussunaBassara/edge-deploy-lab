# edge-deploy-lab 

A production-grade DevOps project built around a Supabase Edge Function.
This project demonstrates the full lifecycle of deploying, monitoring, and
maintaining a serverless function — from CI/CD to incident response.

---

## 🏗️ What This Project Does

Receives webhooks (incoming HTTP requests), validates them, logs every
delivery to a database, tracks errors in real-time, and provides a live
dashboard to monitor failures — all with automated deployments and a
separate staging environment.

---

## 🗂️ Project Structure

edge-deploy-lab/
├── .github/workflows/ci.yml          # Automated CI/CD pipeline
├── supabase/functions/
│   └── webhook-receiver/index.ts     # The live Edge Function
├── scripts/deploy.sh                 # Standardized deployment script
├── dashboard/index.html              # Real-time webhook health dashboard
└── docs/
├── module-1-cicd.md              # Module 1: GitHub Actions CI/CD
├── module-2-edge-functions.md    # Module 2: Edge Functions + Secrets
├── module-3-sentry.md            # Module 3: Error Tracking
├── module-4-dashboard.md         # Module 4: Webhook Health Dashboard
├── module-5-runbooks.md          # Module 5: Runbooks
├── module-6-staging.md           # Module 6: Staging Environment
├── deployment-runbook.md         # How to deploy safely
└── incident-response-runbook.md  # How to handle incidents

---

## 📦 Modules

| Module | What Was Built | File |
|--------|---------------|------|
| 1 | GitHub Actions CI/CD Pipeline | [View →](docs/module-1-cicd.md) |
| 2 | Supabase Edge Function + Secrets | [View →](docs/module-2-edge-functions.md) |
| 3 | Error Tracking with Sentry | [View →](docs/module-3-sentry.md) |
| 4 | Webhook Health Dashboard | [View →](docs/module-4-dashboard.md) |
| 5 | Deployment & Incident Runbooks | [View →](docs/module-5-runbooks.md) |
| 6 | Staging Environment | [View →](docs/module-6-staging.md) |

---

## 🛠️ Tech Stack

| Tool | Purpose |
|------|---------|
| GitHub Actions | Automated CI/CD pipeline |
| Supabase Edge Functions | Serverless webhook receiver |
| Supabase Database | Logging webhook deliveries |
| Sentry | Error tracking and alerts |
| Deno | Runtime for Edge Functions |

---

## ⚡ Quick Start

1. Clone the repo
2. Set up required secrets in GitHub (see [Module 2](docs/module-2-edge-functions.md))
3. Push to `staging` branch to deploy to staging
4. Merge to `main` to deploy to production

---

## 📖 Runbooks

- [Deployment Runbook](docs/deployment-runbook.md) — how to deploy safely
- [Incident Response Runbook](docs/incident-response-runbook.md) — what to do when things break
