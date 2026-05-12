# Module 3 — Error Tracking with Sentry

## What Is Error Tracking?

Error tracking is the practice of automatically capturing, recording,
and alerting on errors that occur in your application at runtime.

Without error tracking you find out about bugs when:
- A user complains
- You manually check logs
- Something catastrophically breaks

With error tracking you find out:
- The moment an error occurs
- Exactly which line of code caused it
- How many times it has happened
- How many users were affected

---

## Why We Chose Sentry

Sentry is the industry standard for error tracking. It:
- Works with Deno/TypeScript Edge Functions
- Sends instant email alerts for new error types
- Groups similar errors together so you're not flooded with alerts
- Shows the full stack trace — exactly where in the code it broke
- Tracks error frequency — is this happening once or thousands of times?

---

## How It Works in Our Project

```
Webhook request comes in
        ↓
Edge Function processes it
        ↓
Something goes wrong (missing field, database error, etc.)
        ↓
catch block calls reportToSentry()
        ↓
Sentry receives the error report
        ↓
Sentry sends email alert
        ↓
You know about it before any user complains
```

---

## File: `supabase/functions/webhook-receiver/index.ts`
## The Sentry Reporter Function

### Why No Official SDK?
Supabase Edge Functions run on Deno in a restricted environment.
The official Sentry SDK is built for Node.js and browsers — it doesn't
work cleanly in Deno Edge Functions. Instead we built a lightweight
reporter that talks directly to Sentry's HTTP API.

This is a real DevOps skill — knowing when to use an SDK vs when to
call an API directly.

### The `reportToSentry()` Function With Line-by-Line Explanation

```typescript
// reportToSentry() sends error details directly to Sentry's API.
// Parameters:
//   error   — the actual JavaScript Error object that was caught
//   context — extra information about what was happening (URL, timestamp etc.)
async function reportToSentry(error: Error, context: Record<string, unknown>) {

  // If SENTRY_DSN is not configured, skip silently.
  // This allows the function to work even without Sentry set up.
  if (!SENTRY_DSN) return;

  // Parse the DSN URL to extract the components we need.
  // A DSN looks like: https://KEY@HOST/PROJECT_ID
  const sentryUrl = new URL(SENTRY_DSN);

  // Extract the project ID from the URL path.
  // pathname is "/4511292233941072" so we remove the leading slash.
  const projectId = sentryUrl.pathname.replace("/", "");

  // Extract the public key from the username part of the URL.
  const sentryKey = sentryUrl.username;

  // Build the API endpoint URL where we'll send the error.
  const endpoint = `https://${sentryUrl.host}/api/${projectId}/store/`;

  // Build the error payload in the format Sentry expects.
  const payload = {
    event_id: crypto.randomUUID().replace(/-/g, ""), // unique ID for this error event
    timestamp: new Date().toISOString(),              // when the error occurred
    platform: "javascript",                           // tells Sentry how to display the stack trace
    level: "error",                                   // severity level
    logger: "webhook-receiver",                       // which part of the app logged this
    exception: {
      values: [{
        type: error.name,     // e.g. "Error", "TypeError"
        value: error.message, // e.g. "Missing required field: event"
        stacktrace: {
          // Convert the stack trace string into an array of frame objects
          frames: error.stack?.split("\n").map(line => ({
            filename: line.trim()
          })) || []
        }
      }]
    },
    extra: context  // attach our custom context (URL, timestamp, IP etc.)
  };

  try {
    // Send the error to Sentry via HTTP POST.
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Sentry authentication header format — required by their API.
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${sentryKey}, sentry_client=custom/1.0`
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    // If Sentry itself is down or unreachable, log it but don't crash.
    // Error reporting should never cause additional errors.
    console.error("Failed to report to Sentry:", e);
  }
}
```

---

## Where `reportToSentry()` Is Called

We call it in two places — both are deliberate:

### 1. Unauthorized Request
```typescript
if (authHeader !== WEBHOOK_SECRET) {
  await reportToSentry(new Error("Unauthorized webhook attempt"), {
    ip: req.headers.get("x-forwarded-for")  // log where it came from
  });
}
```
Why: Multiple unauthorized attempts could mean someone is trying to
attack your endpoint. Sentry will alert you immediately so you can
investigate and block the source if needed.

### 2. Unhandled Errors
```typescript
} catch (error) {
  await reportToSentry(error as Error, {
    url: req.url,
    timestamp: new Date().toISOString()
  });
}
```
Why: Any unexpected error in your function gets reported automatically.
You don't have to manually add error reporting everywhere — the catch
block at the bottom catches everything.

---

## The Sentry DSN Explained

DSN stands for Data Source Name. It's a URL that tells your code
where to send errors. It contains:

```
https://PUBLIC_KEY@HOST/PROJECT_ID
        ↑            ↑    ↑
        |            |    └── which Sentry project to send to
        |            └─────── Sentry's server address
        └──────────────────── your authentication key
```

The DSN is stored as a secret because it identifies your Sentry
project. If someone gets your DSN they could flood your Sentry
project with fake errors.

---

## Meaningful Alerts — What This Means

The job description says *"configure Sentry with meaningful alerts."*
This means alerts that are:

**Actionable** — every alert should require a response. If you're
getting alerts you ignore, they're not meaningful.

**Not noisy** — alerting on every single error creates alert fatigue.
We alert on new error types, not every occurrence.

**Contextual** — our alerts include the URL, timestamp, and IP address
so you have enough information to act without digging through logs.

Our alert rule: *"Send an email when a new issue is created"* — this
means you only get alerted the first time a new type of error occurs,
not every time it repeats.

---

## Key Concepts to Know by Heart

**Why catch Sentry errors silently?**
If Sentry is down and we let `reportToSentry()` throw an error, it
would crash our webhook function — meaning a monitoring outage causes
a production outage. Error reporting must never cause additional errors.

**What is a stack trace?**
A stack trace is the sequence of function calls that led to the error.
It tells you exactly which line of code failed and how the program
got there. It's the most valuable part of an error report.

**What is alert fatigue?**
When you receive too many alerts, you start ignoring them. Then when
a critical alert comes in, you miss it. Good monitoring means alerting
only on things that need human attention.

---

## Common Interview Questions on This Topic

**Q: Why set up error tracking instead of just checking logs?**
Logs are passive — you have to go looking for problems. Error tracking
is active — it finds problems and tells you immediately. By the time
you check logs, a problem may have been affecting users for hours.

**Q: What information should a good error report include?**
The error type and message, the stack trace showing where it occurred,
when it happened, how many times it has occurred, and contextual
information like the request URL, user ID, or any relevant state
at the time of the error.

**Q: What is the difference between an error and an exception?**
An exception is a specific type of error that disrupts normal program
flow and can be caught with try/catch. All exceptions are errors but
not all errors are exceptions — some errors are just unexpected states
that don't crash the program but indicate something is wrong.

**Q: Why do we report unauthorized attempts to Sentry?**
A single unauthorized attempt might be a misconfigured client. But
multiple unauthorized attempts from the same IP could indicate a
brute force attack or someone probing your endpoint. Sentry groups
these and shows you the frequency — giving you early warning of
potential security threats.
