import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("supabase/schema.sql", "utf8");
const storageMigration = fs.readFileSync("supabase/migrations/20260625160000_acrex_storage_foundation.sql", "utf8");
const storageHelpers = fs.readFileSync("lib/data/storage.ts", "utf8");
const quoteLineHelpers = fs.readFileSync("lib/data/quote-lines.ts", "utf8");
const quotePage = fs.readFileSync("components/quotes/quotes-page.tsx", "utf8");
const migrationRunner = fs.readFileSync("scripts/apply-storage-migration.mjs", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");
const envExample = fs.readFileSync(".env.example", "utf8");

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
const migrationTables = [
  "drawings",
  "measurements",
  "quote_line_items",
  "invoice_line_items",
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
for (const table of migrationTables) {
  assert.match(
    storageMigration,
    new RegExp(`create table if not exists public\\.${table}\\b`),
    `Storage migration is missing ${table} table`
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
assert.match(storageMigration, /values \('acrex-files', 'acrex-files', false,/);
assert.match(schema, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g);
assert.match(storageMigration, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g);
assert.match(schema, /attachments_parent_check/);
assert.match(storageMigration, /attachments_parent_check/);
assert.doesNotMatch(schema, /and exists \(\s*and exists \(/);
assert.doesNotMatch(storageMigration, /and exists \(\s*and exists \(/);
assert.match(schema, /create table if not exists public\.exports[\s\S]*is_public boolean not null default false/);
assert.match(storageMigration, /create table if not exists public\.exports[\s\S]*is_public boolean not null default false/);
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
  "createExportRecord",
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
assert.match(storageHelpers, /restorePreviousInvoice/);
assert.match(storageHelpers, /restorePreviousInvoiceLines/);
assert.doesNotMatch(storageHelpers, /area_acres:[^\n]*\n\s*area_acres:/);
assert.doesNotMatch(storageHelpers, /entityId: savedInvoice\.id,[^\n]*\n\s*entityId: savedInvoice\.id,/);

assert.match(quoteLineHelpers, /QUOTE_LINE_ITEMS_TABLE = "quote_line_items"/);
assert.match(quoteLineHelpers, /LEGACY_QUOTE_ITEMS_TABLE = "quote_items"/);
assert.match(quoteLineHelpers, /\.eq\("user_id", userId\)/);
assert.match(migrationRunner, /SUPABASE_DB_URL/);
assert.match(migrationRunner, /ON_ERROR_STOP=1/);
assert.match(migrationRunner, /20260625160000_acrex_storage_foundation\.sql/);
assert.match(packageJson, /"storage:migrate": "node --env-file=\.env\.local scripts\/apply-storage-migration\.mjs"/);
assert.match(envExample, /SUPABASE_DB_URL=/);
assert.match(envExample, /ACREX_TEST_USER_A_EMAIL=/);
assert.match(envExample, /ACREX_TEST_USER_B_EMAIL=/);
assert.match(quotePage, /saveQuote as persistQuote/);
assert.doesNotMatch(quotePage, /from\("quotes"\)\.(?:insert|update)\(quotePayload\)/);

console.log("Storage schema, ownership, compatibility, and helper contract tests passed.");
