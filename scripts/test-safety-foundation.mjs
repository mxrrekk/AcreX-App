import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const cache = new Map();

function resolveLocal(specifier) {
  if (!specifier.startsWith("@/")) return null;
  const base = path.resolve(specifier.replace("@/", ""));
  for (const candidate of [`${base}.ts`, `${base}.tsx`]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Unable to resolve ${specifier}`);
}

function load(filePath) {
  const absolute = path.resolve(filePath);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const source = fs.readFileSync(absolute, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (specifier) => {
    const local = resolveLocal(specifier);
    return local ? load(local) : nativeRequire(specifier);
  };
  vm.runInNewContext(`(function(require,module,exports){${output}\n})(require,module,module.exports)`, {
    require: localRequire,
    module,
    console
  });
  return module.exports;
}

const { auditProjectIntegrity } = load("lib/data/integrity.ts");
const { validateProjectBackup, ACREX_BACKUP_FORMAT, ACREX_BACKUP_VERSION } = load("lib/data/backup.ts");
const { saveStatusLabel } = load("lib/data/save-status.ts");

const project = { id: "p1" };
const issues = auditProjectIntegrity({
  project,
  drawings: [{ id: "d1", project_id: "wrong", name: "Brush" }],
  quotes: [{ id: "q1" }],
  quoteLines: [{ id: "l1", service: "Mowing", drawing_id: "deleted-drawing" }],
  invoices: [{ id: "i1", quote_id: "deleted-quote", invoice_number: "INV-1" }],
  pricingDefaults: {}
});

assert.deepEqual(
  Array.from(issues, (issue) => issue.code).sort(),
  ["invoice_deleted_quote", "missing_pricing_defaults", "orphaned_drawing", "quote_deleted_drawing"].sort()
);

const backup = {
  format: ACREX_BACKUP_FORMAT,
  version: ACREX_BACKUP_VERSION,
  project: { id: "p1" },
  drawings: [],
  quotes: [],
  invoices: [],
  files: []
};
assert.equal(validateProjectBackup(backup), true);
assert.equal(validateProjectBackup({ ...backup, version: 99 }), false);
assert.equal(saveStatusLabel.saving, "Saving…");
assert.equal(saveStatusLabel.saved, "Saved");
assert.equal(saveStatusLabel.error, "Save failed");

const schema = fs.readFileSync("supabase/schema.sql", "utf8");
assert.match(schema, /create table if not exists public\.project_activity/);
assert.match(schema, /Users can manage their own project activity/);

console.log("Backup format, activity schema, save states, and integrity checks passed.");
