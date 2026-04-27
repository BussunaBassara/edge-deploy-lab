import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Sentry integration for Deno
const SENTRY_DSN = Deno.env.get("SENTRY_DSN");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

// Simple Sentry error reporter (lightweight, no SDK needed for Edge Functions)
async function reportToSentry(error: Error, context: Record<string, unknown>) {
  if (!SENTRY_DSN) return;

  const sentryUrl = new URL(SENTRY_DSN);
  const projectId = sentryUrl.pathname.replace("/", "");
  const sentryKey = sentryUrl.username;
  const endpoint = `https://${sentryUrl.host}/api/${projectId}/store/`;

  const payload = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level: "error",
    logger: "webhook-receiver",
    exception: {
      values: [{
        type: error.name,
        value: error.message,
        stacktrace: {
          frames: error.stack?.split("\n").map(line => ({ filename: line.trim() })) || []
        }
      }]
    },
    extra: context  // Extra info about what was happening when the error occurred
  };

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${sentryKey}, sentry_client=custom/1.0`
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error("Failed to report to Sentry:", e);
  }
}

serve(async (req: Request) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate the webhook secret
  const authHeader = req.headers.get("x-webhook-secret");
  if (authHeader !== WEBHOOK_SECRET) {
    const error = new Error("Unauthorized webhook attempt detected");
    await reportToSentry(error, {
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent")
    });
    console.error("Unauthorized webhook attempt");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Parse the incoming payload
    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload));

    const { event, data } = payload;

    // Simulate an error for unsupported events so we can test Sentry
    if (!event) {
      throw new Error("Missing required field: event");
    }

    return new Response(
      JSON.stringify({
        received: true,
        event: event,
        message: `Processed ${event} successfully`
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    // Report the error to Sentry with context
    await reportToSentry(error as Error, {
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    console.error("Webhook processing failed:", error);

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
