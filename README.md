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
PARCEL_PROVIDER=regrid
REGRID_API_KEY=your_server_only_regrid_key_here
REPORTALL_API_KEY=your_server_only_reportall_key_here
```

Required for core app functionality:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_MAPBOX_TOKEN`

Optional server-only parcel provider variables:

- `PARCEL_PROVIDER`
- `REGRID_API_KEY`
- `REPORTALL_API_KEY`

Do not commit `.env.local`. Use `.env.example` as the deployment reference.

## Supabase

Apply the schema in:

```text
supabase/schema.sql
```

Then configure Supabase email/password authentication for signup and login.
