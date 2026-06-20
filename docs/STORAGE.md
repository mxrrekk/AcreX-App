# AcreX Data and File Storage

Supabase is the durable source of truth for AcreX user data. Browser storage remains a compatibility cache for preferences and temporary UI state only.

## Apply the schema

Run the complete [`supabase/schema.sql`](../supabase/schema.sql) file in the Supabase SQL Editor for the AcreX project.

The schema is additive and keeps the legacy `quote_items` table available while AcreX moves to `quote_line_items`. Existing quote items are copied into the normalized table when the schema is applied.

## Durable records

- `projects` is the parent job record.
- `drawings` stores each saved map feature and its location metadata.
- `measurements` stores the calculated quantity and units for each drawing.
- `quotes` and `quote_line_items` store quote headers and editable services.
- `invoices` and `invoice_line_items` store invoice headers and the copied financial lines.
- `clients` stores customer records.
- `exports` records generated deliverables.
- `attachments` records project, quote, invoice, and export files.
- `user_settings` stores company, quote, pricing, drawing, and map defaults.
- `ai_estimate_snapshots` stores the structured context and result used for an AI estimate.

## File bucket

The schema creates a private Supabase Storage bucket named `acrex-files`.

Every object path starts with the authenticated user ID:

```text
<user-id>/projects/<project-id>/<unique-id>-<file-name>
```

RLS policies permit access only when the first folder matches `auth.uid()`. File metadata also carries `user_id` and validates related project, quote, and invoice ownership.

## Central helpers

Use [`lib/data/storage.ts`](../lib/data/storage.ts) instead of adding new Supabase writes inside UI components.

Available operations include:

- `saveProject()`
- `saveDrawing()`
- `saveQuote()`
- `saveInvoice()`
- `uploadProjectFile()`
- `uploadQuotePdf()`
- `uploadInvoicePdf()`
- `getProjectFiles()`
- `deleteProjectFile()`
- `saveUserSettings()`
- `saveAiEstimateSnapshot()`

Quote line access is centralized in [`lib/data/quote-lines.ts`](../lib/data/quote-lines.ts). It uses `quote_line_items` when the new schema is available and safely falls back to legacy `quote_items` before migration.

## Deletion rules

Project deletion remains blocked when a linked quote or invoice is no longer a draft. Draft quotes and invoices are removed first. Project drawings, measurements, attachments, exports, and AI snapshots are removed by foreign-key cascades. Storage objects are removed on a best-effort basis after the protected-record checks pass.

## Validation

Run:

```bash
npm run test:storage
npm run test:data-sync
npm run build
```

The public anon key cannot apply database migrations. Applying `supabase/schema.sql` requires Supabase SQL Editor access, a database connection, or an authenticated Supabase CLI session.
