# Module 4 — Webhook Health Dashboard

## What Is a Webhook Health Dashboard?

A webhook health dashboard is a real-time visual interface that shows
the status of all incoming webhook deliveries — which succeeded, which
failed, when they happened, and what went wrong.

Without a dashboard:
- You have to query the database manually to check webhook status
- You find out about failures after they've been happening for hours
- There's no quick way to see the overall health of your system

With a dashboard:
- You see every webhook delivery in real-time
- Failures are immediately visible
- You can spot patterns — is one event type failing consistently?

---

## How It Works

```
Thunder Client / External Service sends webhook
                ↓
Edge Function receives and processes it
                ↓
Result saved to webhook_logs table in Supabase
                ↓
Dashboard reads webhook_logs every 10 seconds
                ↓
You see success/failure stats update in real-time
```

---

## The Database Table: `webhook_logs`

Before the dashboard could work, we needed a place to store webhook
delivery results. We created this table in Supabase:

```sql
CREATE TABLE webhook_logs (
  id            bigint generated always as identity primary key,
  created_at    timestamptz default now() not null,
  event_name    text,
  status        text not null,
  payload       jsonb,
  error_message text
);
```

### Line by Line Explanation

**`id bigint generated always as identity primary key`**
Every row gets a unique number automatically. `generated always as
identity` means Supabase assigns it — you never set it manually.
`primary key` means this column uniquely identifies each row.
No two rows can have the same id.

**`created_at timestamptz default now() not null`**
Records exactly when the webhook was received. `timestamptz` stores
the timestamp with timezone information. `default now()` means
Supabase automatically fills this in — you never set it manually.
`not null` means this field must always have a value.

**`event_name text`**
The type of webhook event received e.g. `payment.completed`.
No `not null` constraint because unauthorized requests don't have
a valid event name — we still want to log those.

**`status text not null`**
Either `"success"` or `"failure"`. Always required — every log
entry must have a status so we know what happened.

**`payload jsonb`**
The full request body sent by the caller. `jsonb` is a PostgreSQL
data type that stores JSON in a binary format — faster to query
than plain text JSON. Nullable because failed requests may not
have a valid payload.

**`error_message text`**
What went wrong, if anything. Only populated for failures.
Nullable because successful requests have no error message.

---

## PostgreSQL Queries You Should Know

Since our dashboard reads from this table, you should understand
the queries behind it.

### Get the last 20 webhook deliveries
```sql
SELECT * FROM webhook_logs
ORDER BY created_at DESC
LIMIT 20;
```
`ORDER BY created_at DESC` — newest first.
`LIMIT 20` — only return 20 rows.

### Count successes and failures
```sql
SELECT 
  status,
  COUNT(*) as total
FROM webhook_logs
GROUP BY status;
```
Returns something like:
```
status  | total
--------|------
success | 45
failure | 12
```

### Find all failures in the last hour
```sql
SELECT * FROM webhook_logs
WHERE status = 'failure'
AND created_at > now() - interval '1 hour'
ORDER BY created_at DESC;
```
`now() - interval '1 hour'` — one hour ago from right now.
This is how you'd investigate a recent spike in failures.

### Find failures with a specific error
```sql
SELECT * FROM webhook_logs
WHERE status = 'failure'
AND error_message = 'Missing required field: event'
ORDER BY created_at DESC
LIMIT 10;
```
This is exactly what you'd run during an incident like the
500-alerts scenario from Module 3.

---

## File: `dashboard/index.html`

### Why a Simple HTML File?
The dashboard is a single HTML file with no framework, no build
process, and no dependencies. It talks directly to the Supabase
REST API. Anyone can open it in a browser — no setup needed.

### Full File With Section-by-Section Explanation

#### Section 1 — The Stats Cards
```html
<div class="stats">
  <div class="stat-card">
    <div class="stat-label">Total Webhooks</div>
    <div class="stat-value blue" id="total">—</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Successful</div>
    <div class="stat-value green" id="success">—</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Failed</div>
    <div class="stat-value red" id="failed">—</div>
  </div>
</div>
```
Three cards showing total, successful, and failed webhook counts.
The `id` attributes (`total`, `success`, `failed`) are how
JavaScript finds and updates these values after fetching data.
The `—` is the placeholder shown before data loads.

#### Section 2 — The Logs Table
```html
<table>
  <thead>
    <tr>
      <th>Time</th>
      <th>Event</th>
      <th>Status</th>
      <th>Error</th>
    </tr>
  </thead>
  <tbody id="logs-body">
    <!-- JavaScript fills this in dynamically -->
  </tbody>
</table>
```
The table headers are static HTML. The `tbody` with id `logs-body`
is empty on purpose — JavaScript fills it with rows after fetching
data from Supabase.

#### Section 3 — Fetching Data from Supabase
```javascript
// The Supabase project URL and anon key for authentication
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

async function fetchLogs() {
  // Call the Supabase REST API directly
  // ?order=created_at.desc → newest first
  // &limit=20 → only last 20 rows
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/webhook_logs?order=created_at.desc&limit=20`,
    {
      headers: {
        // apikey authenticates the request
        "apikey": SUPABASE_ANON_KEY,
        // Authorization header required by Supabase
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );
  // Parse the JSON response and return it
  return await res.json();
}
```
This calls the Supabase REST API — the same API that Thunder Client
was calling when we tested our function. Supabase automatically
generates a REST API for every table you create.

#### Section 4 — Rendering the Dashboard
```javascript
async function render() {
  // Fetch the latest logs from Supabase
  const logs = await fetchLogs();

  // Calculate stats from the returned data
  const total = logs.length;
  const success = logs.filter(l => l.status === "success").length;
  const failed = logs.filter(l => l.status === "failure").length;

  // Update the stat cards with real numbers
  document.getElementById("total").textContent = total;
  document.getElementById("success").textContent = success;
  document.getElementById("failed").textContent = failed;

  // Update the last refreshed timestamp
  document.getElementById("last-refresh").textContent =
    `Last refreshed: ${new Date().toLocaleTimeString()}`;

  // Build a table row for each log entry
  const tbody = document.getElementById("logs-body");
  tbody.innerHTML = logs.map(log => `
    <tr>
      <td>${formatTime(log.created_at)}</td>
      <td>${log.event_name || "<em>none</em>"}</td>
      <td><span class="badge badge-${log.status}">${log.status}</span></td>
      <td>${log.error_message || "—"}</td>
    </tr>
  `).join("");
}

// Run render immediately when the page loads
render();

// Then run it every 10 seconds automatically
// This is what makes it "real-time"
setInterval(render, 10000);
```
`logs.filter()` — filters the array to only matching items.
`document.getElementById()` — finds an HTML element by its id.
`textContent` — sets the text inside an element.
`innerHTML` — sets the HTML inside an element.
`setInterval(render, 10000)` — calls render every 10,000
milliseconds (10 seconds) automatically.

---

## Key Concepts to Know by Heart

**Why use the anon key for the dashboard?**
The dashboard runs in a browser — anyone who opens it can see
the JavaScript code including the key. The anon key is safe to
expose because it only has read access to public tables. The
service role key must never go in browser-side code.

**What is a REST API?**
REST (Representational State Transfer) is a standard way for
systems to communicate over HTTP. Supabase generates a REST API
for every table automatically. Our dashboard uses it to read
data without needing a backend server.

**Why `jsonb` instead of `text` for the payload column?**
`jsonb` stores JSON in binary format which makes it faster to
query and allows you to query inside the JSON. For example you
could query `payload->>'amount'` to find all webhooks where the
amount was over 5000. Plain `text` would just store it as a string
you can't query inside.

**What is `setInterval` and why 10 seconds?**
`setInterval` runs a function repeatedly at a set interval.
10 seconds is a balance between feeling real-time and not
hammering the database with too many requests. For a true
real-time experience you'd use Supabase's realtime subscriptions
instead of polling.

---

## Common Interview Questions on This Topic

**Q: Why build a custom dashboard instead of using Supabase's
built-in table editor?**
The table editor is for developers and requires Supabase access.
A custom dashboard can be shared with non-technical stakeholders,
customized to show exactly the metrics that matter, and accessed
without giving everyone database credentials.

**Q: What is the difference between polling and real-time
subscriptions?**
Polling means checking for new data on a fixed interval — our
dashboard does this every 10 seconds. Real-time subscriptions
mean the server pushes new data to you the moment it changes.
Subscriptions are more efficient but more complex to implement.
Polling is simpler and sufficient for most monitoring dashboards.

**Q: How would you improve this dashboard for a production
environment?**
Add authentication so not everyone can see it. Add date range
filtering. Add a failure rate percentage. Add charts showing
failure trends over time. Add Supabase realtime subscriptions
for true real-time updates. Add the ability to retry failed
webhooks directly from the dashboard.

**Q: Why is the `id` column important in the webhook_logs table?**
Every row needs a unique identifier so you can reference specific
records. Without a primary key you can't reliably update or delete
specific rows. The `generated always as identity` means the
database handles this automatically — you never risk duplicate IDs.
