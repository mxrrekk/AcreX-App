import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve("supabase/migrations/20260625160000_acrex_storage_foundation.sql");
const dbUrl = process.env.SUPABASE_DB_URL;

if (!fs.existsSync(migrationPath)) {
  console.error(`Missing migration file: ${migrationPath}`);
  process.exit(1);
}

if (!dbUrl) {
  console.error(
    [
      "SUPABASE_DB_URL is required to apply the AcreX storage migration.",
      "Use the production Supabase database connection string from Project Settings > Database.",
      "Do not commit the URL. Put it in .env.local or pass it only for this command.",
      "",
      "Example:",
      "SUPABASE_DB_URL='postgresql://postgres...sslmode=require' npm run storage:migrate"
    ].join("\n")
  );
  process.exit(1);
}

const psqlCheck = spawnSync("psql", ["--version"], { encoding: "utf8" });
if (psqlCheck.error || psqlCheck.status !== 0) {
  console.error(
    [
      "psql is required to apply the migration from this script.",
      "Install PostgreSQL client tools or apply the migration manually in Supabase SQL Editor:",
      migrationPath
    ].join("\n")
  );
  process.exit(1);
}

console.log(`Applying AcreX storage migration: ${path.relative(process.cwd(), migrationPath)}`);
const result = spawnSync("psql", [dbUrl, "--set", "ON_ERROR_STOP=1", "--file", migrationPath], {
  encoding: "utf8",
  stdio: ["ignore", "inherit", "pipe"]
});

if (result.status !== 0) {
  const redactedError = (result.stderr ?? "").replaceAll(dbUrl, "[SUPABASE_DB_URL]");
  console.error(redactedError.trim() || "Storage migration failed.");
  process.exit(result.status ?? 1);
}

console.log("AcreX storage migration applied. Run npm run test:storage:remote next.");
