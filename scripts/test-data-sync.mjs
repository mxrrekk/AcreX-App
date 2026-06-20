import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTypeScriptModule(path, globals = {}) {
  const source = fs.readFileSync(path, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${output}\n})(require,module,module.exports)`, {
    require,
    module,
    console,
    ...globals
  });
  return module.exports;
}

const { reconcileSourceLinkedLines, sourceSnapshot } = loadTypeScriptModule("lib/quotes/source-sync.ts");
const { cascadeDeleteProject, cascadeDeleteQuote, deleteDraftInvoice } =
  loadTypeScriptModule("lib/data/cascades.ts");

function createWindowMock() {
  const listeners = new Map();
  const stored = new Map();
  return {
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener));
    },
    dispatchEvent(event) {
      (listeners.get(event.type) ?? []).forEach((listener) => listener(event));
      return true;
    },
    localStorage: {
      setItem(key, value) {
        stored.set(key, value);
      },
      getItem(key) {
        return stored.get(key) ?? null;
      }
    }
  };
}

class CustomEventMock {
  constructor(type, options) {
    this.type = type;
    this.detail = options?.detail;
  }
}

const windowMock = createWindowMock();
const { publishDataChange, subscribeToDataChanges } = loadTypeScriptModule("lib/data/sync.ts", {
  window: windowMock,
  CustomEvent: CustomEventMock
});
const receivedChanges = [];
const unsubscribe = subscribeToDataChanges((change) => receivedChanges.push(change));
publishDataChange({ type: "project-metadata-saved", projectId: "p" });
assert.equal(receivedChanges.length, 1);
assert.equal(receivedChanges[0].projectId, "p");
const crossTabChange = {
  type: "quote-saved",
  projectId: "p",
  quoteId: "q",
  occurredAt: new Date().toISOString()
};
windowMock.dispatchEvent({
  type: "storage",
  key: "acrex:data-change",
  newValue: JSON.stringify(crossTabChange)
});
assert.equal(receivedChanges.length, 2);
assert.equal(receivedChanges[1].quoteId, "q");
publishDataChange({ type: "client-saved", clientId: "c", clientName: "Updated Customer" });
assert.equal(receivedChanges[2].clientId, "c");
publishDataChange({ type: "settings-saved" });
assert.equal(receivedChanges[3].type, "settings-saved");
unsubscribe();
publishDataChange({ type: "project-saved", projectId: "p" });
assert.equal(receivedChanges.length, 4);

const brush = {
  sourceId: "brush-1",
  label: "Brush",
  serviceName: "Brush Clearing",
  zoneType: "Brush",
  quantity: 2,
  unit: "acres",
  rate: 150
};
const baseLine = {
  sourceId: brush.sourceId,
  sourceMeasurement: brush.label,
  serviceName: brush.serviceName,
  description: brush.label,
  zoneType: brush.zoneType,
  quantity: "2",
  unit: brush.unit,
  rate: "125",
  sourceSnapshot: sourceSnapshot(brush),
  sourceManuallyEdited: false
};

let reconciled = reconcileSourceLinkedLines([baseLine], [{ ...brush, quantity: 3, rate: 175 }]);
assert.equal(reconciled.changed, true);
assert.equal(reconciled.lines[0].quantity, "3");
assert.equal(reconciled.lines[0].rate, "175");
assert.equal(reconciled.lines[0].sourceChangeAvailable, false);

reconciled = reconcileSourceLinkedLines(
  [{ ...baseLine, quantity: "2.5", sourceManuallyEdited: true }],
  [{ ...brush, quantity: 3 }]
);
assert.equal(reconciled.lines[0].quantity, "2.5");
assert.equal(reconciled.lines[0].sourceChangeAvailable, true);

const legacyLine = { ...baseLine, quantity: "2.5" };
delete legacyLine.sourceSnapshot;
delete legacyLine.sourceManuallyEdited;
reconciled = reconcileSourceLinkedLines([legacyLine], [{ ...brush, quantity: 3 }]);
assert.equal(reconciled.lines[0].quantity, "2.5");
assert.equal(reconciled.lines[0].sourceManuallyEdited, true);
assert.equal(reconciled.lines[0].sourceChangeAvailable, true);

reconciled = reconcileSourceLinkedLines([baseLine], []);
assert.equal(reconciled.lines[0].sourceDeleted, true);
assert.equal(reconciled.lines[0].serviceName, "Brush Clearing");
reconciled = reconcileSourceLinkedLines(reconciled.lines, [brush]);
assert.equal(reconciled.lines[0].sourceDeleted, false);

function createSupabaseMock(records) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, action: null, filters: [], single: false };
      calls.push(call);
      const builder = {
        select() {
          call.action = "select";
          return builder;
        },
        delete() {
          call.action = "delete";
          return builder;
        },
        eq(key, value) {
          call.filters.push([key, value]);
          return builder;
        },
        single() {
          call.single = true;
          return builder;
        },
        then(resolve) {
          if (call.action === "delete") {
            resolve({ data: null, error: null });
            return;
          }
          const rows = records[table] ?? [];
          const filtered = rows.filter((row) =>
            call.filters.every(([key, value]) => row[key] === value)
          );
          resolve({ data: call.single ? filtered[0] ?? null : filtered, error: null });
        }
      };
      return builder;
    }
  };
}

let database = createSupabaseMock({
  quotes: [{ id: "q1", user_id: "u", project_id: "p", quote_number: "Q1", status: "Sent" }],
  invoices: []
});
let cascade = await cascadeDeleteProject({ supabase: database, userId: "u", projectId: "p" });
assert.equal(cascade.ok, false);
assert.equal(database.calls.some((call) => call.action === "delete"), false);

database = createSupabaseMock({
  quotes: [{ id: "q1", user_id: "u", project_id: "p", quote_number: "Q1", status: "Draft" }],
  invoices: [{ id: "i1", user_id: "u", project_id: "p", invoice_number: "I1", status: "Draft" }]
});
cascade = await cascadeDeleteProject({ supabase: database, userId: "u", projectId: "p" });
assert.equal(cascade.ok, true);
assert.deepEqual(
  database.calls.filter((call) => call.action === "delete").map((call) => call.table),
  ["invoices", "quotes", "projects"]
);

database = createSupabaseMock({
  quotes: [{ id: "q1", user_id: "u", status: "Draft" }],
  invoices: [{ id: "i1", user_id: "u", quote_id: "q1", invoice_number: "I1", status: "Paid" }]
});
cascade = await cascadeDeleteQuote({
  supabase: database,
  userId: "u",
  quote: { id: "q1", status: "Draft" }
});
assert.equal(cascade.ok, false);
assert.equal(database.calls.some((call) => call.action === "delete"), false);

database = createSupabaseMock({
  quotes: [{ id: "q1", user_id: "u", status: "Draft" }],
  invoices: [{ id: "i1", user_id: "u", quote_id: "q1", invoice_number: "I1", status: "Draft" }]
});
cascade = await cascadeDeleteQuote({
  supabase: database,
  userId: "u",
  quote: { id: "q1", status: "Draft" }
});
assert.equal(cascade.ok, true);
assert.deepEqual(
  database.calls.filter((call) => call.action === "delete").map((call) => call.table),
  ["invoices", "quotes"]
);

database = createSupabaseMock({
  invoices: [{ id: "i1", user_id: "u", status: "Paid" }]
});
cascade = await deleteDraftInvoice({
  supabase: database,
  userId: "u",
  invoice: { id: "i1", status: "Draft" }
});
assert.equal(cascade.ok, false);

database = createSupabaseMock({
  invoices: [{ id: "i1", user_id: "u", status: "Draft" }]
});
cascade = await deleteDraftInvoice({
  supabase: database,
  userId: "u",
  invoice: { id: "i1", status: "Draft" }
});
assert.equal(cascade.ok, true);
assert.equal(database.calls.filter((call) => call.action === "delete").length, 1);

console.log("Data sync and cascade regression tests passed.");
