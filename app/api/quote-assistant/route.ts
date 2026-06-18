import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;
const geminiModels = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3.5-flash"] as const;

function logDevelopmentError(message: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.error(`[AI quote route] ${message}`, details ?? {});
}

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
  const questionGroups = Array.isArray(siteConditions.questionGroups)
    ? siteConditions.questionGroups.slice(0, 10).map((item) => {
        const group = isRecord(item) ? item : {};
        return {
          service: cleanText(group.service, 100),
          answers: Array.isArray(group.answers)
            ? group.answers.slice(0, 20).map((answerItem) => {
                const answer = isRecord(answerItem) ? answerItem : {};
                return {
                  id: cleanText(answer.id, 80),
                  question: cleanText(answer.question, 300),
                  answer: cleanText(answer.answer, 300)
                };
              })
            : []
        };
      })
    : [];
  const unansweredQuestions = Array.isArray(siteConditions.unansweredQuestions)
    ? siteConditions.unansweredQuestions.slice(0, 40).map((item) => {
        const question = isRecord(item) ? item : {};
        return {
          service: cleanText(question.service, 100),
          id: cleanText(question.id, 80),
          question: cleanText(question.question, 300),
          options: cleanStringList(question.options, 12, 100)
        };
      })
    : [];

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
          billable: measurement.billable === true,
          selected: measurement.selected === true
        };
      })
    : [];
  const selectedMeasurements = Array.isArray(measurements.selected)
    ? measurements.selected.slice(0, 75).map((item) => {
        const measurement = isRecord(item) ? item : {};
        return {
          sourceId: cleanText(measurement.sourceId, 160),
          label: cleanText(measurement.label, 180),
          serviceType: cleanText(measurement.serviceType, 140),
          quantity: Math.max(0, cleanNumber(measurement.quantity)),
          unit: cleanText(measurement.unit, 40)
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
      selected: selectedMeasurements,
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
      adjustments: isRecord(quote.adjustments)
        ? {
            discount: Math.max(0, cleanNumber(quote.adjustments.discount)),
            taxPercent: Math.max(0, cleanNumber(quote.adjustments.taxPercent)),
            depositPercent: Math.max(0, cleanNumber(quote.adjustments.depositPercent))
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
      notes: cleanText(siteConditions.notes, 2000),
      questionGroups,
      unansweredQuestions
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
- Identify the project type from the primary service, drawings, measurements, and user notes before suggesting work.
- Prioritize selected measurements and current quote lines over unrelated available project drawings when identifying project type.
- Treat measurements with selected=true, measurements.selected, selectedSourceIds, and current quote lines as the active quote scope.
- Available measurements that are not selected are reference-only. Do not generate service lines, materials, costs, scope, or questions for them unless the user's notes explicitly include them.
- Do not suggest a service line when the same sourceMeasurementId already exists in current quote lines. Suggest supporting job costs or assumptions instead.
- Make the estimate specific to that project type. A mowing estimate should focus on acreage, frequency, access, trimming, and production. A fence estimate should consider material, height, gates, posts, concrete, and linear footage. Brush clearing should consider density, haul-off, stumps, terrain, and access. Driveways should consider gravel type, depth, base preparation, delivery, grading, drainage, and culverts.
- The client has already detected the active service types and supplied service-specific questionGroups and unansweredQuestions.
- Ask only questions listed in siteConditions.unansweredQuestions. Never invent a cross-service or generic questionnaire.
- Never ask a mowing project about brush density, tree haul-off, stump grinding, gravel depth, or fence material.
- Never ask brush clearing about mowing frequency, mowing height, or edging.
- Never ask fence installation about brush density or mowing frequency.
- For multi-service jobs, keep missing questions grouped mentally by their service and ask only the unanswered questions for each active service.
- If siteConditions.unansweredQuestions is empty, return no missingQuestions and build the draft estimate immediately from the known context.
- Use known measurement quantities and units. Do not invent geometry.
- Suggest pricing ranges and a recommended starting rate only when context supports it.
- Contractor pricing defaults outrank generic market assumptions.
- If no pricing default exists, state the assumption and warn the user to verify local pricing.
- Explain any saved markup or profit target in pricingAssumptions. Do not silently add markup as a separate customer charge or present it as guaranteed profit.
- Respect current tax, discount, and deposit adjustments and mention them only when relevant.
- Return a useful cost breakdown across service lines, materials, labor, equipment, fuel, mobilization, haul-off, disposal, scope, exclusions, assumptions, warnings, and terms, but include only categories relevant to this project type.
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

function restrictMissingQuestions(
  suggestion: QuoteAssistantSuggestion,
  context: ReturnType<typeof sanitizeContext>
) {
  const allowed = context.siteConditions.unansweredQuestions;
  if (!allowed.length) {
    suggestion.missingQuestions = [];
    suggestion.confidenceScore = Math.max(suggestion.confidenceScore, 85);
    return suggestion;
  }

  suggestion.missingQuestions = allowed.map((item) => `${item.service}: ${item.question}`);

  const totalQuestions = context.siteConditions.questionGroups.reduce(
    (total, group) => total + group.answers.length,
    0
  );
  const answeredQuestions = context.siteConditions.questionGroups.reduce(
    (total, group) => total + group.answers.filter((answer) => Boolean(answer.answer)).length,
    0
  );
  const contextQuestionScore = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 25) : 25;
  suggestion.confidenceScore = Math.min(100, Math.max(0, 60 + contextQuestionScore));
  return suggestion;
}

function normalizeMatchText(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function removeDuplicateOrOutOfScopeLines(
  suggestion: QuoteAssistantSuggestion,
  context: ReturnType<typeof sanitizeContext>
) {
  const currentLines = context.quote.lineItems;
  const activeSourceIds = new Set([
    ...context.measurements.selectedSourceIds,
    ...currentLines.map((line) => line.sourceMeasurementId).filter(Boolean)
  ]);
  const unselectedLabels = new Set(
    context.measurements.available
      .filter((measurement) => !measurement.selected && !activeSourceIds.has(measurement.sourceId))
      .map((measurement) => normalizeMatchText(measurement.label))
      .filter(Boolean)
  );

  return {
    ...suggestion,
    suggestedLineItems: suggestion.suggestedLineItems.filter((item) => {
      if (item.sourceMeasurementId && activeSourceIds.size > 0 && !activeSourceIds.has(item.sourceMeasurementId)) {
        return false;
      }
      if (!item.sourceMeasurementId && item.sourceMeasurement && unselectedLabels.has(normalizeMatchText(item.sourceMeasurement))) {
        return false;
      }

      return !currentLines.some((line) => {
        if (item.sourceMeasurementId && line.sourceMeasurementId === item.sourceMeasurementId) return true;
        if (
          item.sourceMeasurement &&
          line.sourceMeasurement &&
          normalizeMatchText(item.sourceMeasurement) === normalizeMatchText(line.sourceMeasurement)
        ) {
          return true;
        }
        const sameService = normalizeMatchText(item.serviceName) === normalizeMatchText(line.serviceName);
        const sameUnit = normalizeMatchText(item.unit) === normalizeMatchText(line.unit);
        const quantityTolerance = Math.max(0.01, Math.abs(line.quantity) * 0.001);
        return sameService && sameUnit && Math.abs(item.quantity - line.quantity) <= quantityTolerance;
      });
    })
  };
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    logDevelopmentError("Supabase server client is not configured.");
    return NextResponse.json(
      { error: "AI service unavailable", code: "service_unavailable" },
      { status: 503 }
    );
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    logDevelopmentError("AI quote request was not authenticated.");
    return NextResponse.json({ error: "Log in again to use the AI Estimator." }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logDevelopmentError("GEMINI_API_KEY is missing.");
    return NextResponse.json(
      { error: "Missing API key", code: "missing_api_key" },
      { status: 503 }
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch (error) {
    logDevelopmentError("Request body could not be parsed as JSON.", {
      reason: error instanceof Error ? error.message : "Unknown JSON parsing error"
    });
    return NextResponse.json(
      { error: "Invalid request body", code: "invalid_request" },
      { status: 400 }
    );
  }

  const context = sanitizeContext(rawPayload);
  if (!context.project.id) {
    logDevelopmentError("Request body is missing a project ID.");
    return NextResponse.json({ error: "Select a project before building an estimate." }, { status: 400 });
  }

  const hasMeasuredWork = context.measurements.available.some((measurement) => measurement.billable && measurement.quantity > 0);
  const hasManualWork = context.quote.lineItems.some((line) => line.quantity > 0);
  if (!hasMeasuredWork && !hasManualWork) {
    logDevelopmentError("Request body has no usable measurements or manual quote lines.", {
      projectId: context.project.id
    });
    return NextResponse.json(
      { error: "Add a valid measurement or manual service line before building an estimate." },
      { status: 400 }
    );
  }

  let response: Response | null = null;
  let selectedModel: (typeof geminiModels)[number] = geminiModels[0];
  for (const model of geminiModels) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    selectedModel = model;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
      logDevelopmentError("Gemini request failed before a response was received.", {
        model,
        reason: error instanceof Error ? error.message : "Unknown connection failure"
      });
      response = null;
    } finally {
      clearTimeout(timeout);
    }

    if (response?.ok) break;

    let providerMessage = "";
    if (response) {
      try {
        const providerError = (await response.json()) as unknown;
        if (isRecord(providerError) && isRecord(providerError.error)) {
          providerMessage = cleanText(providerError.error.message, 500);
        }
      } catch {
        providerMessage = "Gemini returned a non-JSON error response.";
      }
    }
    logDevelopmentError("Gemini returned an unsuccessful response.", {
      model,
      status: response?.status ?? 0,
      providerMessage
    });
    response = null;
  }

  if (!response?.ok) {
    return NextResponse.json(
      { error: "AI service unavailable", code: "service_unavailable" },
      { status: 502 }
    );
  }

  let providerPayload: unknown;
  try {
    providerPayload = await response.json();
  } catch (error) {
    logDevelopmentError("Gemini success response was not valid JSON.", {
      model: selectedModel,
      reason: error instanceof Error ? error.message : "Unknown response parsing error"
    });
    return NextResponse.json(
      { error: "Invalid AI response", code: "invalid_ai_response" },
      { status: 502 }
    );
  }

  const parsedSuggestion = parseSuggestion(extractGeminiText(providerPayload));
  if (!parsedSuggestion) {
    logDevelopmentError("Gemini response did not match the expected quote schema.", {
      model: selectedModel
    });
    return NextResponse.json(
      { error: "Invalid AI response", code: "invalid_ai_response" },
      { status: 502 }
    );
  }

  const suggestion = restrictMissingQuestions(
    removeDuplicateOrOutOfScopeLines(parsedSuggestion, context),
    context
  );
  return NextResponse.json({ suggestion });
}
