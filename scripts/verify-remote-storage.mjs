const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
  process.exit(1);
}

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

const missing = [];
for (const table of requiredTables) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`
    }
  });
  if (response.status === 404) missing.push(table);
}

const bucketResponse = await fetch(`${url}/storage/v1/object/list/acrex-files`, {
  method: "POST",
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ prefix: "", limit: 1 })
});

if (missing.length || !bucketResponse.ok) {
  console.error(
    [
      missing.length ? `Missing tables: ${missing.join(", ")}` : "",
      !bucketResponse.ok ? "Missing or inaccessible storage bucket: acrex-files" : "",
      "Apply supabase/schema.sql with an authorized Supabase session, then rerun this command."
    ].filter(Boolean).join("\n")
  );
  process.exit(1);
}

console.log("Remote AcreX storage tables and acrex-files bucket are available.");
