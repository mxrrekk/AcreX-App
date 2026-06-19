# Acrex MVP

Acrex is a property measurement, estimating, quoting, and invoicing workspace for land contractors.

## Local Development

```bash
npm install
npm run dev
```

The local dev server runs on:

```text
http://localhost:3001
```

## Build Check

```bash
npm run lint
npm run build
```

## Vercel Deployment

Create a Vercel project from this repository and set these environment variables:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_server_only_supabase_service_role_key_here
PARCEL_PROVIDER=regrid
REGRID_API_KEY=your_server_only_regrid_key_here
REPORTALL_API_KEY=your_server_only_reportall_key_here
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key_here
STRIPE_SECRET_KEY=your_server_only_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=your_server_only_stripe_webhook_secret_here
STRIPE_PRO_PRICE_ID=your_stripe_pro_monthly_price_id_here
STRIPE_BUSINESS_PRICE_ID=your_stripe_business_monthly_price_id_here
GEMINI_API_KEY=your_server_only_gemini_api_key_here
```

Required for core app functionality:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_MAPBOX_TOKEN`

Required only when Stripe subscriptions are enabled:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_BUSINESS_PRICE_ID`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional server-only parcel provider variables:

- `PARCEL_PROVIDER`
- `REGRID_API_KEY`
- `REPORTALL_API_KEY`

Required for the AI Estimator:

- `GEMINI_API_KEY`

Add `GEMINI_API_KEY` to your deployment provider's environment variables or
secrets. Keep it server-only; do not prefix it with `NEXT_PUBLIC_`.

Do not commit `.env.local`. Use `.env.example` as the deployment reference.

## Supabase

Apply the schema in:

```text
supabase/schema.sql
```

Then configure Supabase email/password authentication for signup and login.

The schema includes RLS policies for users, projects, clients, quotes, quote items, invoices, share links, future lead requests, and future lead matches. Do not disable RLS.

## Stripe Foundation

Stripe checkout, customer portal, and webhook routes are present but fail closed when keys or price IDs are missing. This lets the app run without Stripe while keeping the integration ready for production setup.

Routes:

- `/api/stripe/checkout`
- `/api/stripe/portal`
- `/api/stripe/webhook`

## Production Upload

Upload the project source files to GitHub. Do not upload:

- `.env.local`
- `.next`
- `node_modules`
- local backup folders

The required assets are in `public/assets`.
