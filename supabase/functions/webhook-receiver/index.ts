import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SENTRY_DSN = Deno.env.get("SENTRY_DSN");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);

// Log webhook result to database
async function logWebhook(
  eventName: string | null,
  status: "success" | "failure",
  payload: unknown,
  errorMessage?: string
) {
  const { error } = await supabase.from("webhook_logs").insert({
    event_name: eventName,
    status,
    payload,
    error_message: errorMessage || null,
  });

  if (error) console.error("Failed to log webhook:", error.message);
}

// Sentry error reporter
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
      }]
    },
    extra: context
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
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate webhook secret
  const authHeader = req.headers.get("x-webhook-secret");
  if (authHeader !== WEBHOOK_SECRET) {
    await logWebhook(null, "failure", null, "Unauthorized - invalid secret");
    await reportToSentry(new Error("Unauthorized webhook attempt"), {
      ip: req.headers.get("x-forwarded-for")
    });
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const payload = await req.json();
    const { event, data } = payload;

    if (!event) {
      throw new Error("Missing required field: event");
    }

    // Log success to database
    await logWebhook(event, "success", payload);

    return new Response(
      JSON.stringify({
        received: true,
        event,
        message: `Processed ${event} successfully`
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    // Log failure to database
    await logWebhook(null, "failure", null, (error as Error).message);
    await reportToSentry(error as Error, {
      url: req.url,
      timestamp: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
