# AcreX Feature Audit

This audit captures the current working product before the production-readiness phases. Existing features should be moved into clearer panels when needed, not removed.

## Public App

- Landing page with hero, product mockup, industries, features, workflow, pricing, FAQ, and CTA.
- Signup page with Supabase email/password auth.
- Login page with Supabase email/password auth.
- Protected dashboard route.
- Projects, Clients, Quotes, and Invoices pages.

## Dashboard Feature Assignment

| Area | Existing Features |
| --- | --- |
| Search | Mapbox address search, recent searches, global search, address details, parcel lookup status |
| Layers | Satellite/street toggle, parcel lines, zone visibility by type |
| Draw | Select, draw polygon, circle mode, edit, delete, measure, undo, redo, zone type picker, lock, duplicate |
| Measurements | Parcel total, zone totals, selected zone details, square feet, acres, perimeter, net billable totals |
| Quote | Generated quote navigation, estimator revenue, service template suggested line items, pricing inputs |
| Project | Save project, new project, project status, client link, tags, checklist, notes, activity, snapshots |
| Settings | Job cost library, pricing inputs, coming soon items |
| Floating Map Controls | Search mount, map style toggle, reset view, zoom controls, parcel note |
| Mobile Bottom Sheet | Needs dedicated map-first mobile treatment with tabs for Draw, Layers, Measurements, Quote, and Project |

## Current Technical Notes

- Mapbox token is read from `NEXT_PUBLIC_MAPBOX_TOKEN`; missing token shows a dashboard warning instead of crashing.
- Supabase public URL and anon key are required for auth and data operations.
- Project, client, quote, quote item, and invoice tables already use `user_id` and RLS.
- Existing AI assistant code is disabled/coming soon and should not require an OpenAI key.
- Stripe is not currently integrated.
- Legal pages do not currently exist.

## Preservation Rules

- Keep map loading, auth, saved projects, drawing tools, measurements, quote builder, clients, invoices, and exports/share placeholders working.
- Additive schema changes only.
- No secrets committed.
