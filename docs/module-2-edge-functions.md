# Module 2 — Supabase Edge Functions + Secrets Management

## What Is a Supabase Edge Function?

A Supabase Edge Function is a small piece of server-side code that runs
on Supabase's infrastructure. You write the function, Supabase runs it.
You don't manage any servers.

```
Traditional Server:           Edge Function:
────────────────────          ──────────────────────────
You rent a server        vs   Supabase runs your function
Pay 24/7                      Only runs when called
You manage updates            Zero maintenance
Slow to scale                 Instant global scale
```

Edge Functions run on **Deno** — a modern, secure runtime similar to
Node.js but with better security defaults and native TypeScript support.

---

## What We Built

A **webhook receiver** — a live function that:
1. Accepts incoming HTTP POST requests
2. Validates the caller using a secret key
3. Parses the request payload
4. Returns a structured response

A webhook is how services talk to each other automatically. For example,
when a payment is completed on Stripe, Stripe sends a POST request to
your webhook URL to notify you. Your function receives it and acts on it.

---

## Why Secrets Management Matters

Your function needs sensitive values to operate — a secret key to
validate callers, database credentials, error tracking keys. These
must never be written directly in code because:

- Code can be seen by anyone with repo access
- Code gets committed to GitHub history permanently
- Even deleted secrets can be recovered from git history

The solution is environment variables — values injected into the
function at runtime, stored separately from the code.

---

## File: `supabase/functions/webhook-receiver/index.ts`

### Why This Location?
Supabase CLI expects Edge Functions to live at:
`supabase/functions/[function-name]/index.ts`

The folder name becomes the function name in the URL:
`https://[project-id].supabase.co/functions/v1/webhook-receiver`

### Full File With Line-by-Line Explanation

```typescript
// Import the serve function from Deno's standard library.
// serve() starts an HTTP server and calls our function
// every time a request comes in.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Import the Supabase client to interact with our database.
// esm.sh is a CDN that serves npm packages for Deno.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Read secrets from environment variables.
// Deno.env.get() reads values injected at runtime by Supabase.
// These are NEVER hardcoded — they come from Supabase Secrets.
const SENTRY_DSN = Deno.env.get("SENTRY_DSN");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Initialize the Supabase client using the project URL and service key.
// The ! after each variable tells TypeScript "trust me, this is not null."
// The service role key has full database access — more powerful than
// the anon key, which is why it's kept secret.
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

// logWebhook() saves every webhook attempt to the database.
// This runs for both successful and failed requests.
// Parameters:
//   eventName — the type of event received (e.g. "payment.completed")
//   status    — "success" or "failure"
//   payload   — the full request body
//   errorMessage — what went wrong (only for failures)
async function logWebhook(
  eventName: string | null,  // null if we couldn't parse the event
  status: "success" | "failure",
  payload: unknown,
  errorMessage?: string      // optional — only passed on failures
) {
  const { error } = await supabase.from("webhook_logs").insert({
    event_name: eventName,
    status,
    payload,
    error_message: errorMessage || null,  // store null if no error
  });

  // If the database write fails, log it but don't crash the function.
  // We still want to return a response to the caller.
  if (error) console.error("Failed to log webhook:", error.message);
}

// serve() wraps our function in an HTTP server.
// Every incoming request is passed to this async function as `req`.
serve(async (req: Request) => {

  // Only accept POST requests.
  // Webhooks are always POST — reject anything else immediately.
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate the webhook secret.
  // The caller must send the correct secret in the x-webhook-secret header.
  // This proves the request is coming from a trusted source.
  const authHeader = req.headers.get("x-webhook-secret");
  if (authHeader !== WEBHOOK_SECRET) {
    // Log the unauthorized attempt to the database
    await logWebhook(null, "failure", null, "Unauthorized - invalid secret");
    // Report to Sentry for alerting
    await reportToSentry(new Error("Unauthorized webhook attempt"), {
      ip: req.headers.get("x-forwarded-for")
    });
    console.error("Unauthorized webhook attempt");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Parse the JSON body of the request.
    // req.json() reads the raw body and converts it to a JavaScript object.
    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload));

    // Destructure the payload to get the event name and data.
    const { event, data } = payload;

    // Validate that the required "event" field exists.
    // If not, throw an error which is caught below.
    if (!event) {
      throw new Error("Missing required field: event");
    }

    // Log the successful webhook to the database.
    await logWebhook(event, "success", payload);

    // Return a success response to the caller.
    return new Response(
      JSON.stringify({
        received: true,
        event,
        message: `Processed ${event} successfully`
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    // Any unhandled error lands here.
    // Log the failure and report to Sentry before responding.
    await logWebhook(null, "failure", null, (error as Error).message);
    await reportToSentry(error as Error, {
      url: req.url,
      timestamp: new Date().toISOString()
    });

    console.error("Webhook processing failed:", error);

    // Return a 500 error response.
    // We don't expose the actual error message to the caller
    // for security reasons.
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

---

## File: `scripts/deploy.sh`

### Why This File Exists
Instead of running deployment commands manually every time, we have one
standardized script that deploys the same way every time — whether run
locally or by GitHub Actions. This eliminates human error in deployments.

### Full File With Line-by-Line Explanation

```bash
#!/bin/bash
# The shebang line — tells the OS to run this file using bash.
# Without this, the OS doesn't know how to execute the file.

# ═══════════════════════════════════════════
# Supabase Edge Function Deployment Script
# ═══════════════════════════════════════════
# Usage: ./scripts/deploy.sh [environment]
# Example: ./scripts/deploy.sh staging
#          ./scripts/deploy.sh production

set -e
# Stop the script immediately if any command fails.
# Without this, the script would keep running even after an error,
# potentially deploying broken code.

ENVIRONMENT=${1:-production}
# Read the first argument passed to the script ($1).
# If no argument is given, default to "production".
# Example: ./scripts/deploy.sh staging → ENVIRONMENT="staging"
#          ./scripts/deploy.sh         → ENVIRONMENT="production"

FUNCTION_NAME="webhook-receiver"
# The name of the Edge Function to deploy.
# Stored as a variable so it's easy to change in one place.

echo "🚀 Deploying $FUNCTION_NAME to $ENVIRONMENT..."

# Validate that required environment variables exist.
# -z checks if a variable is empty.
# If any required variable is missing, exit immediately with an error.
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "❌ Error: SUPABASE_ACCESS_TOKEN is not set"
  exit 1  # Exit with code 1 = failure
fi

if [ -z "$SUPABASE_PROJECT_ID" ]; then
  echo "❌ Error: SUPABASE_PROJECT_ID is not set"
  exit 1
fi

# Push all secrets to Supabase so the function can read them at runtime.
# These values come from GitHub Secrets via the CI workflow env: block.
echo "🔑 Setting secrets..."
supabase secrets set \
  WEBHOOK_SECRET="$WEBHOOK_SECRET" \
  SENTRY_DSN="$SENTRY_DSN" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  --project-ref "$SUPABASE_PROJECT_ID"
# --project-ref tells Supabase which project to deploy to.
# This is how staging and production stay separate —
# different SUPABASE_PROJECT_ID values point to different projects.

# Deploy the function to Supabase.
echo "📦 Deploying function..."
supabase functions deploy $FUNCTION_NAME \
  --project-ref "$SUPABASE_PROJECT_ID"

echo "✅ Deployment complete!"
echo "📍 Function URL: https://$SUPABASE_PROJECT_ID.supabase.co/functions/v1/$FUNCTION_NAME"
```

---

## Key Concepts to Know by Heart

**Environment Variables (`Deno.env.get()`)**
Secrets are injected into the function at runtime by Supabase. The code
reads them using `Deno.env.get()`. If the variable doesn't exist it
returns `undefined` — which is why the deploy script validates all
required variables exist before deploying.

**Service Role Key vs Anon Key**
Supabase has two main API keys:
- `anon` key — safe to expose to browsers, limited access
- `service_role` key — full database access, must be kept secret

Our function uses the service role key because it needs to write to the
database. It's stored as a secret and never exposed.

**HTTP Status Codes**
| Code | Meaning | When We Use It |
|------|---------|---------------|
| 200 | OK | Webhook processed successfully |
| 401 | Unauthorized | Wrong or missing webhook secret |
| 405 | Method Not Allowed | Non-POST request received |
| 500 | Internal Server Error | Unexpected error in our code |

**Why `set -e` in bash scripts**
Without `set -e`, if `supabase secrets set` fails, the script continues
and tries to deploy anyway — potentially with wrong secrets. `set -e`
makes the script fail fast and loud, which is always safer.

---

## Common Interview Questions on This Topic

**Q: What is an Edge Function and why use it over a traditional server?**
An Edge Function is serverless code that runs on demand. You don't
manage servers, pay for idle time, or worry about scaling. It's ideal
for small, focused tasks like receiving webhooks.

**Q: How do you manage secrets in a serverless function?**
Secrets are stored in the deployment platform (Supabase Secrets) and
injected as environment variables at runtime. The code reads them using
`Deno.env.get()`. They never appear in the codebase or logs.

**Q: Why validate the webhook secret on every request?**
Without validation, anyone who discovers your function URL can send
fake webhooks. The secret acts as a shared password between you and
the trusted caller — only they know it, so only they can trigger
your function.

**Q: What happens if a secret is missing at runtime?**
`Deno.env.get()` returns `undefined`. Our code would then compare
`undefined` to the expected secret, which always fails — returning
a 401 Unauthorized to every request until the secret is fixed.
