import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const moduleCache = new Map();

function resolveLocalModule(specifier) {
  if (!specifier.startsWith("@/")) return null;
  const base = path.resolve(specifier.replace("@/", ""));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Unable to resolve ${specifier}`);
}

function loadTypeScriptModule(filePath, globals = {}) {
  const absolutePath = path.resolve(filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (specifier) => {
    const localPath = resolveLocalModule(specifier);
    return localPath ? loadTypeScriptModule(localPath, globals) : nativeRequire(specifier);
  };
  vm.runInNewContext(`(function(require,module,exports){${output}\n})(require,module,module.exports)`, {
    require: localRequire,
    module,
    console,
    ...globals
  });
  return module.exports;
}

const { reconcileSourceLinkedLines, sourceSnapshot } = loadTypeScriptModule("lib/quotes/source-sync.ts");
const { syncProjectQuotesToSources } = loadTypeScriptModule("lib/quotes/project-source-sync.ts");
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
const receivedDeliveries = [];
const unsubscribe = subscribeToDataChanges((change, delivery) => {
  receivedChanges.push(change);
  receivedDeliveries.push(delivery);
});
publishDataChange({ type: "project-metadata-saved", projectId: "p" });
assert.equal(receivedChanges.length, 1);
assert.equal(receivedChanges[0].projectId, "p");
assert.equal(receivedDeliveries[0], "same-tab");
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
assert.equal(receivedDeliveries[1], "cross-tab");
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
  rate: 150,
  defaultNotes: "Brush default notes"
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
assert.equal(reconciled.lines[0].notes, "Brush default notes");
assert.equal(reconciled.lines[0].sourceChangeAvailable, false);

reconciled = reconcileSourceLinkedLines(
  [{ ...baseLine, quantity: "2.5", sourceManuallyEdited: true }],
  [{ ...brush, quantity: 3 }]
);
assert.equal(reconciled.lines[0].quantity, "2.5");
assert.equal(reconciled.lines[0].sourceChangeAvailable, true);

reconciled = reconcileSourceLinkedLines(
  [{ ...baseLine, rate: "160", sourceManuallyEdited: true }],
  [{ ...brush, quantity: 3, rate: 175 }]
);
assert.equal(reconciled.lines[0].rate, "160");
assert.equal(reconciled.lines[0].quantity, "2");
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

function createStatefulSupabaseMock(initialTables, failure = null) {
  const tables = Object.fromEntries(
    Object.entries(initialTables).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))])
  );
  let failed = false;
  return {
    tables,
    from(table) {
      const query = { table, action: "select", filters: [], payload: null };
      const builder = {
        select() {
          query.action = "select";
          return builder;
        },
        update(payload) {
          query.action = "update";
          query.payload = payload;
          return builder;
        },
        delete() {
          query.action = "delete";
          return builder;
        },
        insert(payload) {
          query.action = "insert";
          query.payload = Array.isArray(payload) ? payload : [payload];
          return builder;
        },
        eq(key, value) {
          query.filters.push([key, value]);
          return builder;
        },
        then(resolve) {
          if (
            failure &&
            !failed &&
            failure.table === query.table &&
            failure.action === query.action
          ) {
            failed = true;
            resolve({ data: null, error: { message: failure.message ?? "Injected failure" } });
            return;
          }
          const rows = tables[query.table] ?? [];
          const matches = (row) => query.filters.every(([key, value]) => row[key] === value);
          if (query.action === "select") {
            resolve({ data: rows.filter(matches).map((row) => ({ ...row })), error: null });
            return;
          }
          if (query.action === "update") {
            rows.forEach((row) => {
              if (matches(row)) Object.assign(row, query.payload);
            });
            resolve({ data: null, error: null });
            return;
          }
          if (query.action === "delete") {
            tables[query.table] = rows.filter((row) => !matches(row));
            resolve({ data: null, error: null });
            return;
          }
          if (query.action === "insert") {
            tables[query.table] = [...rows, ...query.payload.map((row) => ({ ...row }))];
            resolve({ data: query.payload, error: null });
          }
        }
      };
      return builder;
    }
  };
}

function linkedQuoteTables() {
  return {
    quotes: [{
      id: "q-sync",
      user_id: "u",
      project_id: "p",
      status: "Draft",
      subtotal: 250,
      total: 250,
      notes: JSON.stringify({
        lineItems: [baseLine],
        materials: [],
        costLines: [],
        discount: 0,
        taxPercent: 0,
        totals: { services: 250, grandTotal: 250 }
      })
    }],
    quote_items: [{
      quote_id: "q-sync",
      user_id: "u",
      service: "Brush Clearing",
      description: "Brush",
      quantity: 2,
      unit: "acres",
      unit_price: 125,
      total: 250,
      zone_name: "Brush",
      zone_type: "Brush",
      notes: "",
      sort_order: 0
    }],
    invoices: [{
      id: "i-sync",
      user_id: "u",
      project_id: "p",
      quote_id: "q-sync",
      status: "Draft",
      total: 250
    }]
  };
}

let syncDatabase = createStatefulSupabaseMock(linkedQuoteTables());
let sourceSync = await syncProjectQuotesToSources({
  supabase: syncDatabase,
  userId: "u",
  projectId: "p",
  sources: [{ ...brush, quantity: 3, rate: 175 }]
});
assert.equal(sourceSync.ok, true);
assert.equal(syncDatabase.tables.quotes[0].subtotal, 525);
assert.equal(syncDatabase.tables.quotes[0].total, 525);
assert.equal(JSON.parse(syncDatabase.tables.quotes[0].notes).lineItems[0].quantity, "3");
assert.equal(JSON.parse(syncDatabase.tables.quotes[0].notes).lineItems[0].notes, "Brush default notes");
assert.equal(syncDatabase.tables.quote_items[0].total, 525);
assert.equal(syncDatabase.tables.invoices[0].total, 525);

syncDatabase = createStatefulSupabaseMock(linkedQuoteTables(), {
  table: "invoices",
  action: "update",
  message: "Invoice update failed"
});
sourceSync = await syncProjectQuotesToSources({
  supabase: syncDatabase,
  userId: "u",
  projectId: "p",
  sources: [{ ...brush, quantity: 3, rate: 175 }]
});
assert.equal(sourceSync.ok, false);
assert.equal(syncDatabase.tables.quotes[0].subtotal, 250);
assert.equal(syncDatabase.tables.quotes[0].total, 250);
assert.equal(JSON.parse(syncDatabase.tables.quotes[0].notes).lineItems[0].quantity, "2");
assert.equal(syncDatabase.tables.quote_items[0].total, 250);
assert.equal(syncDatabase.tables.invoices[0].total, 250);

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
