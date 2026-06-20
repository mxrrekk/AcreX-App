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

function loadTypeScriptModule(filePath) {
  const absolutePath = path.resolve(filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);
  const localRequire = (specifier) => {
    const localPath = resolveLocalModule(specifier);
    return localPath ? loadTypeScriptModule(localPath) : nativeRequire(specifier);
  };
  vm.runInNewContext(`(function(require,module,exports){${output}\n})(require,module,module.exports)`, {
    require: localRequire,
    module,
    console
  });
  return module.exports;
}

const {
  getCatalogServiceByZoneType,
  serviceMatchesCatalog
} = loadTypeScriptModule("lib/services/catalog.ts");
const {
  calculateQuoteLine,
  defaultServiceTemplates,
  getTemplateForZone
} = loadTypeScriptModule("lib/projects/pricing.ts");
const {
  detectEstimateServices,
  estimateQuestionCatalog
} = loadTypeScriptModule("lib/ai/estimate-questions.ts");
const {
  enforceServiceScope,
  getActiveCatalogServices
} = loadTypeScriptModule("lib/ai/service-scope.ts");

function baseSuggestion(lines) {
  return {
    serviceType: "",
    projectVision: "",
    suggestedLineItems: lines,
    suggestedMaterials: [
      { name: "Mower blades", notes: "Mowing support" },
      { name: "Forestry mulcher teeth", notes: "Brush clearing support" }
    ],
    suggestedLaborEquipment: [
      { category: "equipment", name: "Mower", explanation: "", notes: "Mowing" },
      { category: "equipment", name: "Forestry mulcher", explanation: "", notes: "Brush" }
    ],
    suggestedScopeOfWork: "",
    suggestedExclusions: [],
    suggestedTerms: "",
    pricingAssumptions: [],
    missingQuestions: [],
    warnings: [],
    confidenceScore: 80
  };
}

function measurement(sourceId, zoneType, quantity, unit, selected = true) {
  const service = getCatalogServiceByZoneType(zoneType);
  return {
    sourceId,
    label: `${service.shortLabel} 1`,
    zoneType,
    serviceType: service.label,
    quoteCategory: service.quoteCategory,
    quantity,
    unit,
    billable: service.billable,
    selected
  };
}

function context(measurements, templates = defaultServiceTemplates, lineItems = []) {
  return {
    project: { primaryServiceType: "" },
    measurements: {
      available: measurements,
      selectedSourceIds: measurements.filter((item) => item.selected).map((item) => item.sourceId)
    },
    quote: { lineItems, laborEquipment: [] },
    pricingDefaults: {
      serviceTemplates: templates,
      global: { travelCharge: 50, fuelSurchargePercent: 5 }
    }
  };
}

const mowingQuestions = detectEstimateServices(["Grass", "Mowing"]);
assert.equal(JSON.stringify(mowingQuestions), JSON.stringify(["Mowing"]));
assert.equal(estimateQuestionCatalog.Mowing.some((question) => question.id === "density"), false);
assert.equal(estimateQuestionCatalog.Mowing.some((question) => question.id === "fenceMaterial"), false);
assert.equal(
  JSON.stringify(detectEstimateServices(["Brush", "Forestry Mulching / Brush Clearing"])),
  JSON.stringify(["Brush Clearing / Forestry Mulching"])
);
assert.equal(
  JSON.stringify(detectEstimateServices(["Fence", "Fence Installation"])),
  JSON.stringify(["Fence Installation"])
);

const mowingMeasurement = measurement("grass-1", "Grass", 2.14, "acres");
let active = getActiveCatalogServices(context([mowingMeasurement]));
assert.equal(JSON.stringify(active.map((service) => service.key)), JSON.stringify(["mowing"]));

let scoped = enforceServiceScope(
  baseSuggestion([
    {
      serviceName: "Forestry Mulching",
      description: "Wrong service",
      quantity: 2.14,
      unit: "acres",
      suggestedRateRange: "$1,000–$2,000",
      recommendedRate: 1500,
      total: 3210,
      explanation: "",
      notes: "",
      sourceMeasurementId: "grass-1",
      sourceMeasurement: "Grass 1",
      zoneType: "Brush"
    },
    {
      serviceName: "Mowing",
      description: "Correct service",
      quantity: 2.14,
      unit: "acres",
      suggestedRateRange: "$100–$150",
      recommendedRate: 130,
      total: 278.2,
      explanation: "",
      notes: "",
      sourceMeasurementId: "grass-1",
      sourceMeasurement: "Grass 1",
      zoneType: "Grass"
    }
  ]),
  context([mowingMeasurement])
);
assert.equal(scoped.serviceType, "mowing");
assert.equal(scoped.suggestedLineItems.length, 1);
assert.equal(scoped.suggestedLineItems[0].serviceName, "Mowing");
assert.equal(scoped.suggestedLineItems[0].quantity, 2.14);
assert.equal(scoped.suggestedLineItems[0].unit, "acres");
assert.equal(scoped.suggestedLineItems[0].recommendedRate, 120);
assert.equal(scoped.suggestedLineItems[0].total, 256.8);
assert.equal(scoped.suggestedMaterials.some((item) => item.name.includes("Forestry")), false);
assert.equal(scoped.suggestedLaborEquipment.some((item) => item.name.includes("Forestry")), false);
assert.equal(scoped.suggestedLaborEquipment.some((item) => item.name === "Mobilization"), true);

const brushMeasurement = measurement("brush-1", "Brush", 3, "acres");
scoped = enforceServiceScope(
  baseSuggestion([
    {
      serviceName: "Mowing",
      description: "Wrong service",
      quantity: 3,
      unit: "acres",
      suggestedRateRange: "",
      explanation: "",
      notes: "",
      zoneType: "Grass"
    },
    {
      serviceName: "Brush Clearing",
      description: "Correct service",
      quantity: 3,
      unit: "acres",
      suggestedRateRange: "$800–$1,200",
      explanation: "",
      notes: "",
      zoneType: "Brush"
    }
  ]),
  context([brushMeasurement])
);
assert.equal(scoped.serviceType, "forestry_mulching");
assert.equal(scoped.suggestedLineItems.length, 1);
assert.equal(scoped.suggestedLineItems[0].serviceName, "Forestry Mulching / Brush Clearing");
assert.equal(scoped.suggestedLineItems.some((item) => item.serviceName === "Mowing"), false);

const fenceMeasurement = measurement("fence-1", "Fence", 300, "linear feet");
scoped = enforceServiceScope(baseSuggestion([]), context([fenceMeasurement]));
assert.equal(scoped.serviceType, "fence_installation");
assert.equal(scoped.suggestedLineItems[0].serviceName, "Fence Installation");
assert.equal(scoped.suggestedLineItems[0].quantity, 300);
assert.equal(scoped.suggestedLineItems[0].unit, "linear feet");

scoped = enforceServiceScope(baseSuggestion([]), context([mowingMeasurement, fenceMeasurement]));
assert.equal(
  JSON.stringify(scoped.serviceType.split(",")),
  JSON.stringify(["mowing", "fence_installation"])
);
assert.equal(
  JSON.stringify(scoped.suggestedLineItems.map((item) => item.serviceName)),
  JSON.stringify(["Mowing", "Fence Installation"])
);

const unselectedBrushMeasurement = {
  ...brushMeasurement,
  selected: false
};
scoped = enforceServiceScope(
  baseSuggestion([
    {
      serviceName: "Brush Clearing",
      description: "Unselected reference drawing",
      quantity: 3,
      unit: "acres",
      suggestedRateRange: "$800–$1,200",
      recommendedRate: 950,
      explanation: "",
      notes: "",
      sourceMeasurementId: "brush-1",
      zoneType: "Brush"
    }
  ]),
  context([mowingMeasurement, unselectedBrushMeasurement])
);
assert.equal(scoped.serviceType, "mowing");
assert.equal(scoped.suggestedLineItems.length, 1);
assert.equal(scoped.suggestedLineItems[0].serviceName, "Mowing");

scoped = enforceServiceScope(
  baseSuggestion([
    {
      serviceName: "Mowing",
      description: "Condition-adjusted mowing",
      quantity: 2.14,
      unit: "acres",
      suggestedRateRange: "$110–$145",
      recommendedRate: 132,
      total: 282.48,
      explanation: "Includes edging and weed eating.",
      notes: "",
      sourceMeasurementId: "grass-1",
      zoneType: "Grass"
    }
  ]),
  context([mowingMeasurement], [])
);
assert.equal(scoped.suggestedLineItems[0].recommendedRate, 132);
assert.equal(scoped.suggestedLineItems[0].total, 282.48);
assert.equal(scoped.pricingAssumptions.some((item) => item.includes("No pricing default set")), true);

const noDefaults = calculateQuoteLine({
  serviceType: "mowing",
  quantity: 2.14,
  unit: "acres",
  templates: null
});
assert.equal(noDefaults.rate, null);
assert.equal(noDefaults.subtotal, null);
assert.equal(noDefaults.missingInputs.includes("No pricing default set."), true);

const savedDefaults = calculateQuoteLine({
  serviceType: "mowing",
  quantity: 2.14,
  unit: "acres",
  templates: defaultServiceTemplates
});
assert.equal(savedDefaults.rate, 120);
assert.equal(savedDefaults.subtotal, 256.8);

const shuffledTemplates = [
  defaultServiceTemplates.find((template) => template.id === "forestry-mulching"),
  defaultServiceTemplates.find((template) => template.id === "mowing")
].filter(Boolean);
assert.equal(getTemplateForZone("Grass", shuffledTemplates).id, "mowing");
assert.equal(serviceMatchesCatalog(getCatalogServiceByZoneType("Grass"), "Forestry Mulching"), false);
assert.equal(serviceMatchesCatalog(getCatalogServiceByZoneType("Grass"), "Forestry Mulching", "Grass"), false);
assert.equal(serviceMatchesCatalog(getCatalogServiceByZoneType("Grass"), "Mowing", "Grass"), true);

console.log("Quote service catalog and AI scope regression tests passed.");
