import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("supabase/schema.sql", "utf8");
const storageHelpers = fs.readFileSync("lib/data/storage.ts", "utf8");
const quoteLineHelpers = fs.readFileSync("lib/data/quote-lines.ts", "utf8");

const requiredTables = [
  "projects",
  "drawings",
  "measurements",
  "quotes",
  "quote_line_items",
  "invoices",
  "invoice_line_items",
  "clients",
  "exports",
  "attachments",
  "user_settings",
  "ai_estimate_snapshots",
  "project_activity"
];

for (const table of requiredTables) {
  assert.match(
    schema,
    new RegExp(`create table if not exists public\\.${table}\\b`),
    `Missing ${table} table`
  );
}

const rlsTables = [
  "projects",
  "drawings",
  "measurements",
  "quotes",
  "quote_line_items",
  "invoices",
  "invoice_line_items",
  "clients",
  "exports",
  "attachments",
  "user_settings",
  "ai_estimate_snapshots",
  "project_activity"
];
for (const table of rlsTables) {
  assert.match(
    schema,
    new RegExp(`alter table public\\.${table} enable row level security`),
    `RLS is not enabled for ${table}`
  );
}

assert.match(schema, /values \('acrex-files', 'acrex-files', false,/);
assert.match(schema, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g);
assert.match(schema, /attachments_parent_check/);
assert.match(schema, /quotes_status_check/);
assert.match(schema, /invoices_status_check/);

for (const helper of [
  "getProjects",
  "getProjectDrawings",
  "getProjectQuotes",
  "getProjectInvoices",
  "getUserSettings",
  "saveProject",
  "saveDrawing",
  "saveQuote",
  "saveInvoice",
  "uploadProjectFile",
  "uploadQuotePdf",
  "uploadInvoicePdf",
  "getProjectFiles",
  "deleteProjectFile"
]) {
  assert.match(storageHelpers, new RegExp(`export async function ${helper}\\b`), `Missing ${helper} helper`);
}

assert.match(storageHelpers, /from\("drawings"\)/);
assert.match(storageHelpers, /from\("measurements"\)/);
assert.match(storageHelpers, /from\("attachments"\)/);
assert.match(storageHelpers, /from\("exports"\)/);
assert.match(storageHelpers, /from\("user_settings"\)/);
assert.match(storageHelpers, /from\("ai_estimate_snapshots"\)/);
assert.match(storageHelpers, /`\$\{input\.userId\}\/\$\{parent\}\//);

assert.match(quoteLineHelpers, /QUOTE_LINE_ITEMS_TABLE = "quote_line_items"/);
assert.match(quoteLineHelpers, /LEGACY_QUOTE_ITEMS_TABLE = "quote_items"/);
assert.match(quoteLineHelpers, /\.eq\("user_id", userId\)/);

console.log("Storage schema, ownership, compatibility, and helper contract tests passed.");
