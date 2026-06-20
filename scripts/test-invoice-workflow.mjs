import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
function load(filePath) {
  const source = fs.readFileSync(path.resolve(filePath), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${output}\n})(require,module,module.exports)`, {
    require: nativeRequire,
    module,
    console
  });
  return module.exports;
}

const { createInvoicePayloadFromQuote, parseSavedInvoicePayload, serializeInvoicePayload } =
  load("lib/invoices/payload.ts");

const quote = {
  id: "q1",
  client_id: "c1",
  client_name: "Smith",
  project_name: "Smith Residence",
  address: "123 Main St",
  total: 535,
  notes: JSON.stringify({
    lineItems: [
      { serviceName: "Mowing", sourceMeasurement: "Grass 1", sourceDeleted: false },
      { serviceName: "Brush Clearing", sourceMeasurement: "Deleted Brush", sourceDeleted: true }
    ],
    scopeOfWork: "Mow and finish the measured lawn. AI confidence 82%.",
    customerNotes: "Thank you. Internal warning: access unconfirmed.",
    paymentTerms: "Due within 14 days.",
    discount: 15,
    depositRequired: 100,
    totals: { tax: 50, grandTotal: 535 }
  })
};
const quoteLines = [
  { id: "l1", quote_id: "q1", service: "Mowing", description: "Mow lawn", quantity: 4, unit: "acres", unit_price: 125, total: 500, zone_name: "Grass 1" },
  { id: "l2", quote_id: "q1", service: "Brush Clearing", description: "Deleted source", quantity: 1, unit: "acres", unit_price: 900, total: 900, zone_name: "Deleted Brush" }
];
const settings = {
  company: { name: "Acre Works", phone: "555-0100", email: "office@example.com", website: "example.com", logoUrl: "" },
  quoteDefaults: { terms: "Default terms", notes: "", expirationDays: 30, depositPercent: 0, taxPercent: 0 }
};
const client = { id: "c1", name: "Sam Smith", email: "sam@example.com", phone: "555-0111", address: "123 Main St" };

const payload = createInvoicePayloadFromQuote({ quote, quoteLines, client, settings });
assert.equal(payload.lineItems.length, 1);
assert.equal(payload.lineItems[0].name, "Mowing");
assert.equal(payload.lineItems[0].unitPrice, 125);
assert.equal(payload.total, 535);
assert.equal(payload.tax, 50);
assert.equal(payload.discount, 15);
assert.equal(payload.depositRequired, 100);
assert.doesNotMatch(payload.scopeSummary, /confidence/i);
assert.doesNotMatch(payload.customerNotes, /internal warning/i);

const saved = { ...quote, notes: serializeInvoicePayload({ ...payload, customerNotes: "Saved customer note" }) };
const restored = parseSavedInvoicePayload(saved, payload);
assert.equal(restored.customerNotes, "Saved customer note");
assert.equal(restored.lineItems[0].unitPrice, 125);

console.log("Customer-safe quote conversion, deleted-source filtering, totals, and saved invoice restoration passed.");
