import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

type QuoteAssistantSuggestion = {
  projectVision: string;
  suggestedLineItems: Array<{
    serviceName: string;
    description: string;
    quantity: number;
    unit: string;
    suggestedRateRange: string;
    recommendedRate?: number;
    total?: number;
    explanation: string;
    notes: string;
    sourceMeasurementId?: string | null;
    sourceMeasurement?: string;
    zoneType?: string;
  }>;
  suggestedMaterials: Array<{
    name: string;
    quantity?: number;
    unit?: string;
    notes: string;
  }>;
  suggestedLaborEquipment: Array<{
    category: string;
    name: string;
    amount?: number;
    explanation: string;
    notes: string;
  }>;
  suggestedScopeOfWork: string;
  suggestedExclusions: string[];
  suggestedTerms: string;
  pricingAssumptions: string[];
  missingQuestions: string[];
  warnings: string[];
  confidenceScore: number;
};

const responseSchema = {
  type: "OBJECT",
  properties: {
    projectVision: { type: "STRING" },
    suggestedLineItems: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          serviceName: { type: "STRING" },
          description: { type: "STRING" },
          quantity: { type: "NUMBER" },
          unit: { type: "STRING" },
          suggestedRateRange: { type: "STRING" },
          recommendedRate: { type: "NUMBER" },
          total: { type: "NUMBER" },
          explanation: { type: "STRING" },
          notes: { type: "STRING" },
          sourceMeasurementId: { type: "STRING" },
          sourceMeasurement: { type: "STRING" },
          zoneType: { type: "STRING" }
        },
        required: ["serviceName", "description", "quantity", "unit", "suggestedRateRange", "explanation", "notes"]
      }
    },
    suggestedMaterials: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          quantity: { type: "NUMBER" },
          unit: { type: "STRING" },
          notes: { type: "STRING" }
        },
        required: ["name", "notes"]
      }
    },
    suggestedLaborEquipment: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING" },
          name: { type: "STRING" },
          amount: { type: "NUMBER" },
          explanation: { type: "STRING" },
          notes: { type: "STRING" }
        },
        required: ["category", "name", "explanation", "notes"]
      }
    },
    suggestedScopeOfWork: { type: "STRING" },
    suggestedExclusions: {
      type: "ARRAY",
      items: { type: "STRING" }
    },
    suggestedTerms: { type: "STRING" },
    pricingAssumptions: {
      type: "ARRAY",
      items: { type: "STRING" }
    },
    missingQuestions: {
      type: "ARRAY",
      items: { type: "STRING" }
    },
    warnings: {
      type: "ARRAY",
      items: { type: "STRING" }
    },
    confidenceScore: { type: "INTEGER", minimum: 0, maximum: 100 }
  },
  required: [
    "projectVision",
    "suggestedLineItems",
    "suggestedMaterials",
    "suggestedLaborEquipment",
    "suggestedScopeOfWork",
    "suggestedExclusions",
    "suggestedTerms",
    "pricingAssumptions",
    "missingQuestions",
    "warnings",
    "confidenceScore"
  ]
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength = 800) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function cleanOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cleanStringList(value: unknown, maxItems = 30, maxLength = 500) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function cleanSerializedValue(value: unknown, maxLength = 20_000) {
  try {
    return JSON.stringify(value).slice(0, maxLength);
  } catch {
    return "";
  }
}

function sanitizeContext(value: unknown) {
  const payload = isRecord(value) ? value : {};
  const project = isRecord(payload.project) ? payload.project : {};
  const customer = isRecord(payload.customer) ? payload.customer : null;
  const measurements = isRecord(payload.measurements) ? payload.measurements : {};
  const quote = isRecord(payload.quote) ? payload.quote : {};
  const siteConditions = isRecord(payload.siteConditions) ? payload.siteConditions : {};
  const pricingDefaults = isRecord(payload.pricingDefaults) ? payload.pricingDefaults : {};

  const availableMeasurements = Array.isArray(measurements.available)
    ? measurements.available.slice(0, 75).map((item) => {
        const measurement = isRecord(item) ? item : {};
        return {
          sourceId: cleanText(measurement.sourceId, 160),
          label: cleanText(measurement.label, 180),
          zoneType: cleanText(measurement.zoneType, 80),
          serviceType: cleanText(measurement.serviceType, 140),
          quoteCategory: cleanText(measurement.quoteCategory, 140),
          geometryType: cleanText(measurement.geometryType, 40),
          quantity: Math.max(0, cleanNumber(measurement.quantity)),
          unit: cleanText(measurement.unit, 40),
          billable: measurement.billable === true
        };
      })
    : [];

  const lineItems = Array.isArray(quote.lineItems)
    ? quote.lineItems.slice(0, 75).map((item) => {
        const line = isRecord(item) ? item : {};
        return {
          serviceName: cleanText(line.serviceName, 160),
          description: cleanText(line.description, 500),
          sourceMeasurementId: cleanText(line.sourceMeasurementId, 160),
          sourceMeasurement: cleanText(line.sourceMeasurement, 180),
          zoneType: cleanText(line.zoneType, 80),
          quantity: Math.max(0, cleanNumber(line.quantity)),
          unit: cleanText(line.unit, 40),
          rate: cleanOptionalNumber(line.rate),
          total: Math.max(0, cleanNumber(line.total)),
          notes: cleanText(line.notes, 600)
        };
      })
    : [];

  const materials = Array.isArray(quote.materials)
    ? quote.materials.slice(0, 75).map((item) => {
        const material = isRecord(item) ? item : {};
        return {
          name: cleanText(material.name, 160),
          quantity: cleanOptionalNumber(material.quantity),
          unit: cleanText(material.unit, 40),
          unitCost: cleanOptionalNumber(material.unitCost),
          total: Math.max(0, cleanNumber(material.total)),
          notes: cleanText(material.notes, 600)
        };
      })
    : [];

  const laborEquipment = Array.isArray(quote.laborEquipment)
    ? quote.laborEquipment.slice(0, 50).map((item) => {
        const cost = isRecord(item) ? item : {};
        return {
          category: cleanText(cost.category, 60),
          name: cleanText(cost.name, 160),
          amount: cleanOptionalNumber(cost.amount),
          notes: cleanText(cost.notes, 600)
        };
      })
    : [];

  const templates = Array.isArray(pricingDefaults.serviceTemplates)
    ? pricingDefaults.serviceTemplates.slice(0, 50).map((item) => {
        const template = isRecord(item) ? item : {};
        return {
          serviceName: cleanText(template.serviceName, 160),
          unitType: cleanText(template.unitType, 40),
          defaultUnitPrice: Math.max(0, cleanNumber(template.defaultUnitPrice)),
          minimumCharge: Math.max(0, cleanNumber(template.minimumCharge)),
          productionRatePerHour: Math.max(0, cleanNumber(template.productionRatePerHour)),
          equipmentCostPerHour: Math.max(0, cleanNumber(template.equipmentCostPerHour)),
          fuelCostPerHour: Math.max(0, cleanNumber(template.fuelCostPerHour)),
          materialCostPerUnit: Math.max(0, cleanNumber(template.materialCostPerUnit)),
          disposalCostPerUnit: Math.max(0, cleanNumber(template.disposalCostPerUnit)),
          notes: cleanText(template.notes, 500)
        };
      })
    : [];

  return {
    editCommand: cleanText(payload.editCommand, 500),
    currentSuggestion: cleanSerializedValue(payload.currentSuggestion),
    project: {
      id: cleanText(project.id, 160),
      name: cleanText(project.name, 220),
      address: cleanText(project.address, 260),
      primaryServiceType: cleanText(project.primaryServiceType, 140),
      status: cleanText(project.status, 60)
    },
    customer: customer
      ? {
          name: cleanText(customer.name, 180),
          company: cleanText(customer.company, 180),
          address: cleanText(customer.address, 260)
        }
      : null,
    measurements: {
      available: availableMeasurements,
      selectedSourceIds: cleanStringList(measurements.selectedSourceIds, 75, 160),
      totals: isRecord(measurements.totals)
        ? {
            drawingCount: Math.max(0, cleanNumber(measurements.totals.drawingCount)),
            validMeasurementCount: Math.max(0, cleanNumber(measurements.totals.validMeasurementCount)),
            billableAcres: Math.max(0, cleanNumber(measurements.totals.billableAcres)),
            excludedAcres: Math.max(0, cleanNumber(measurements.totals.excludedAcres)),
            squareFeet: Math.max(0, cleanNumber(measurements.totals.squareFeet)),
            linearFeet: Math.max(0, cleanNumber(measurements.totals.linearFeet))
          }
        : {}
    },
    quote: {
      quoteNumber: cleanText(quote.quoteNumber, 100),
      status: cleanText(quote.status, 40),
      lineItems,
      materials,
      laborEquipment,
      notes: isRecord(quote.notes)
        ? {
            scopeOfWork: cleanText(quote.notes.scopeOfWork, 4000),
            customerNotes: cleanText(quote.notes.customerNotes, 2000),
            exclusions: cleanText(quote.notes.exclusions, 3000),
            paymentTerms: cleanText(quote.notes.paymentTerms, 3000),
            estimatedTimeline: cleanText(quote.notes.estimatedTimeline, 1000)
          }
        : {},
      totals: isRecord(quote.totals)
        ? {
            services: Math.max(0, cleanNumber(quote.totals.services)),
            materials: Math.max(0, cleanNumber(quote.totals.materials)),
            laborEquipment: Math.max(0, cleanNumber(quote.totals.laborEquipment)),
            mobilization: Math.max(0, cleanNumber(quote.totals.mobilization)),
            grandTotal: Math.max(0, cleanNumber(quote.totals.grandTotal))
          }
        : {}
    },
    siteConditions: {
      access: cleanText(siteConditions.access, 30),
      terrain: cleanText(siteConditions.terrain, 30),
      density: cleanText(siteConditions.density, 30),
      haulOff: cleanText(siteConditions.haulOff, 30),
      timeline: cleanText(siteConditions.timeline, 30),
      fenceMaterial: cleanText(siteConditions.fenceMaterial, 40),
      notes: cleanText(siteConditions.notes, 2000)
    },
    pricingDefaults: {
      serviceTemplates: templates,
      global: isRecord(pricingDefaults.global) ? pricingDefaults.global : null
    }
  };
}

function getPrompt(context: ReturnType<typeof sanitizeContext>) {
  const editInstruction = context.editCommand
    ? `The user requested this change: "${context.editCommand}"

Revise or propose the affected suggestions while preserving useful unaffected context. Do not claim the change was applied.`
    : "Build a complete first-pass estimate suggestion set.";

  return `You are the AcreX AI estimator for outdoor contractors.

Analyze the complete structured quote context below. Return JSON matching the response schema exactly.

${editInstruction}

Rules:
- AI suggestions are optional and will never be applied automatically.
- Do not overwrite or duplicate existing quote lines without a clear reason.
- Use known measurement quantities and units. Do not invent geometry.
- Suggest pricing ranges and a recommended starting rate only when context supports it.
- Contractor pricing defaults outrank generic market assumptions.
- If no pricing default exists, state the assumption and warn the user to verify local pricing.
- Include labor, equipment, mobilization, haul-off, disposal, materials, scope, exclusions, and terms only when relevant.
- Ask simple missing-information questions when uncertainty materially affects the estimate.
- Confidence is context completeness, not a guarantee of price accuracy.
- Never claim measurements, prices, permits, utilities, taxes, dump fees, or local requirements are guaranteed.

Structured quote context:
${JSON.stringify(context)}`;
}

function extractGeminiText(data: unknown) {
  if (!isRecord(data) || !Array.isArray(data.candidates)) return "";
  const candidate = data.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) return "";
  return candidate.content.parts
    .map((part) => (isRecord(part) ? cleanText(part.text, 100_000) : ""))
    .join("")
    .trim();
}

function parseSuggestion(text: string): QuoteAssistantSuggestion | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) return null;

    return {
      projectVision: cleanText(parsed.projectVision, 2000),
      suggestedLineItems: Array.isArray(parsed.suggestedLineItems)
        ? parsed.suggestedLineItems.slice(0, 30).map((item) => {
            const line = isRecord(item) ? item : {};
            return {
              serviceName: cleanText(line.serviceName, 160),
              description: cleanText(line.description, 500),
              quantity: Math.max(0, cleanNumber(line.quantity)),
              unit: cleanText(line.unit, 40),
              suggestedRateRange: cleanText(line.suggestedRateRange, 120),
              recommendedRate: cleanOptionalNumber(line.recommendedRate),
              total: cleanOptionalNumber(line.total),
              explanation: cleanText(line.explanation, 800),
              notes: cleanText(line.notes, 600),
              sourceMeasurementId: cleanText(line.sourceMeasurementId, 160) || null,
              sourceMeasurement: cleanText(line.sourceMeasurement, 180),
              zoneType: cleanText(line.zoneType, 80)
            };
          })
        : [],
      suggestedMaterials: Array.isArray(parsed.suggestedMaterials)
        ? parsed.suggestedMaterials.slice(0, 30).map((item) => {
            const material = isRecord(item) ? item : {};
            return {
              name: cleanText(material.name, 160),
              quantity: cleanOptionalNumber(material.quantity),
              unit: cleanText(material.unit, 40),
              notes: cleanText(material.notes, 600)
            };
          })
        : [],
      suggestedLaborEquipment: Array.isArray(parsed.suggestedLaborEquipment)
        ? parsed.suggestedLaborEquipment.slice(0, 30).map((item) => {
            const cost = isRecord(item) ? item : {};
            return {
              category: cleanText(cost.category, 60),
              name: cleanText(cost.name, 160),
              amount: cleanOptionalNumber(cost.amount),
              explanation: cleanText(cost.explanation, 800),
              notes: cleanText(cost.notes, 600)
            };
          })
        : [],
      suggestedScopeOfWork: cleanText(parsed.suggestedScopeOfWork, 5000),
      suggestedExclusions: cleanStringList(parsed.suggestedExclusions, 30, 700),
      suggestedTerms: cleanText(parsed.suggestedTerms, 4000),
      pricingAssumptions: cleanStringList(parsed.pricingAssumptions, 30, 700),
      missingQuestions: cleanStringList(parsed.missingQuestions, 20, 500),
      warnings: cleanStringList(parsed.warnings, 30, 700),
      confidenceScore: Math.min(100, Math.max(0, Math.round(cleanNumber(parsed.confidenceScore))))
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Log in again to use the AI Estimator." }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI Estimator is not configured yet", code: "not_configured" },
      { status: 503 }
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "The estimate context could not be read." }, { status: 400 });
  }

  const context = sanitizeContext(rawPayload);
  if (!context.project.id) {
    return NextResponse.json({ error: "Select a project before building an estimate." }, { status: 400 });
  }

  const hasMeasuredWork = context.measurements.available.some((measurement) => measurement.billable && measurement.quantity > 0);
  const hasManualWork = context.quote.lineItems.some((line) => line.quantity > 0);
  if (!hasMeasuredWork && !hasManualWork) {
    return NextResponse.json(
      { error: "Add a valid measurement or manual service line before building an estimate." },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: getPrompt(context) }] }],
        generationConfig: {
          temperature: 0.25,
          responseMimeType: "application/json",
          responseSchema
        }
      }),
      cache: "no-store",
      signal: controller.signal
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "AI Estimator timed out. Your quote was not changed."
      : "AI Estimator could not connect. Your quote was not changed.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "AI Estimator could not generate suggestions. Your quote was not changed." },
      { status: 502 }
    );
  }

  const suggestion = parseSuggestion(extractGeminiText(await response.json()));
  if (!suggestion) {
    return NextResponse.json(
      { error: "AI Estimator returned an invalid response. Your quote was not changed." },
      { status: 502 }
    );
  }

  return NextResponse.json({ suggestion });
}
