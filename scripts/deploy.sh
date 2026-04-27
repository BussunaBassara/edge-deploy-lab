#!/bin/bash

# ===========================================
# Supabase Edge Function Deployment Script
# ===========================================
# Usage: ./scripts/deploy.sh [environment]
# Example: ./scripts/deploy.sh staging
#          ./scripts/deploy.sh production

set -e  # Stop script immediately if any command fails

ENVIRONMENT=${1:-production}  # Default to production if no argument given
FUNCTION_NAME="webhook-receiver"

echo "🚀 Deploying $FUNCTION_NAME to $ENVIRONMENT..."

# Check required environment variables exist
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "❌ Error: SUPABASE_ACCESS_TOKEN is not set"
  exit 1
fi

if [ -z "$SUPABASE_PROJECT_ID" ]; then
  echo "❌ Error: SUPABASE_PROJECT_ID is not set"
  exit 1
fi

# Set the secret on Supabase before deploying
echo "🔑 Setting secrets..."
supabase secrets set \
  WEBHOOK_SECRET="$WEBHOOK_SECRET" \
  SENTRY_DSN="$SENTRY_DSN" \
  --project-ref "$SUPABASE_PROJECT_ID"

# Deploy the function
echo "📦 Deploying function..."
supabase functions deploy $FUNCTION_NAME \
  --project-ref "$SUPABASE_PROJECT_ID"

echo "✅ Deployment complete!"
echo "📍 Function URL: https://$SUPABASE_PROJECT_ID.supabase.co/functions/v1/$FUNCTION_NAME"
