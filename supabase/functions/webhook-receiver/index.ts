import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

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
    console.error("Unauthorized webhook attempt");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Parse the incoming payload
  const payload = await req.json();
  console.log("Webhook received:", JSON.stringify(payload));

  // Process the event (we'll expand this later)
  const { event, data } = payload;

  return new Response(
    JSON.stringify({
      received: true,
      event: event,
      message: `Processed ${event} successfully`
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
