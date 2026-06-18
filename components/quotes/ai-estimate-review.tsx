"use client";

export type AiSuggestedLineItem = {
  serviceName: string;
  description?: string;
  quantity: number;
  unit: string;
  suggestedRateRange?: string;
  recommendedRate?: number;
  total?: number;
  explanation?: string;
  notes?: string;
  sourceMeasurementId?: string | null;
  sourceMeasurement?: string;
  zoneType?: string;
};

export type AiSuggestedMaterial = {
  name: string;
  quantity?: number;
  unit?: string;
  notes?: string;
};

export type AiSuggestedCost = {
  category?: string;
  name: string;
  amount?: number;
  explanation?: string;
  notes?: string;
};

export type AiEstimateSuggestion = {
  projectVision?: string;
  suggestedLineItems: AiSuggestedLineItem[];
  suggestedMaterials: AiSuggestedMaterial[];
  suggestedLaborEquipment: AiSuggestedCost[];
  suggestedScopeOfWork?: string;
  suggestedExclusions?: string | string[];
  suggestedTerms?: string;
  pricingAssumptions: string[];
  missingQuestions: string[];
  warnings: string[];
  confidenceScore?: number;
};

type AiEstimateReviewProps = {
  suggestion: AiEstimateSuggestion | null;
  onChange: (suggestion: AiEstimateSuggestion) => void;
  onApplyLineItem: (item: AiSuggestedLineItem, key: string) => void;
  onApplyMaterial: (item: AiSuggestedMaterial, key: string) => void;
  onApplyCost: (item: AiSuggestedCost, key: string) => void;
  onApplyText: (field: "scope" | "exclusions" | "terms", value: string, key: string) => void;
  onClear: () => void;
};

function formatMoney(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function exclusionsToText(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean).join("\n");
  return value ?? "";
}

export function AiEstimateReview({
  suggestion,
  onChange,
  onApplyLineItem,
  onApplyMaterial,
  onApplyCost,
  onApplyText,
  onClear
}: AiEstimateReviewProps) {
  if (!suggestion) {
    return (
      <div className="quote-ai-review-empty">
        <span>Recommendation review</span>
        <p>Suggested services, materials, costs, scope, and terms will appear here for approval—never automatically.</p>
      </div>
    );
  }

  const exclusions = exclusionsToText(suggestion.suggestedExclusions);

  return (
    <div className="quote-ai-review" aria-live="polite">
      <div className="quote-ai-review-heading">
        <div>
          <span>Recommendation Review</span>
          <strong>Review every suggestion before it changes the quote</strong>
        </div>
        <button type="button" onClick={onClear}>Clear results</button>
      </div>

      {suggestion.projectVision ? (
        <details className="quote-ai-review-section" open>
          <summary className="quote-ai-review-section-heading">
            <strong>Project Vision</strong>
            {typeof suggestion.confidenceScore === "number" ? <span>{suggestion.confidenceScore}% confidence</span> : null}
          </summary>
          <textarea
            aria-label="AI project vision"
            value={suggestion.projectVision}
            onChange={(event) => onChange({ ...suggestion, projectVision: event.target.value })}
          />
        </details>
      ) : null}

      {suggestion.suggestedLineItems.length > 0 ? (
        <details className="quote-ai-review-section" open>
          <summary className="quote-ai-review-section-heading">
            <strong>Suggested Line Items</strong>
            <span>{suggestion.suggestedLineItems.length}</span>
          </summary>
          <div className="quote-ai-suggestion-list">
            {suggestion.suggestedLineItems.map((item, index) => {
              const key = `line-${index}`;
              return (
                <article className="quote-ai-suggestion-card" key={key}>
                  <div className="quote-ai-suggestion-fields line">
                    <label>
                      Service
                      <input
                        value={item.serviceName}
                        onChange={(event) => {
                          const items = [...suggestion.suggestedLineItems];
                          items[index] = { ...item, serviceName: event.target.value };
                          onChange({ ...suggestion, suggestedLineItems: items });
                        }}
                      />
                    </label>
                    <label>
                      Quantity
                      <input
                        inputMode="decimal"
                        value={item.quantity}
                        onChange={(event) => {
                          const items = [...suggestion.suggestedLineItems];
                          items[index] = { ...item, quantity: Number(event.target.value) || 0 };
                          onChange({ ...suggestion, suggestedLineItems: items });
                        }}
                      />
                    </label>
                    <label>
                      Unit
                      <input
                        value={item.unit}
                        onChange={(event) => {
                          const items = [...suggestion.suggestedLineItems];
                          items[index] = { ...item, unit: event.target.value };
                          onChange({ ...suggestion, suggestedLineItems: items });
                        }}
                      />
                    </label>
                    <label>
                      Suggested range
                      <input
                        value={item.suggestedRateRange ?? ""}
                        onChange={(event) => {
                          const items = [...suggestion.suggestedLineItems];
                          items[index] = { ...item, suggestedRateRange: event.target.value };
                          onChange({ ...suggestion, suggestedLineItems: items });
                        }}
                      />
                    </label>
                    <label>
                      Recommended rate
                      <input
                        inputMode="decimal"
                        value={item.recommendedRate ?? ""}
                        onChange={(event) => {
                          const items = [...suggestion.suggestedLineItems];
                          items[index] = {
                            ...item,
                            recommendedRate: event.target.value === "" ? undefined : Number(event.target.value) || 0
                          };
                          onChange({ ...suggestion, suggestedLineItems: items });
                        }}
                      />
                    </label>
                    <div className="quote-ai-suggestion-total">
                      <span>Total</span>
                      <strong>{formatMoney(item.total ?? item.quantity * (item.recommendedRate ?? 0))}</strong>
                    </div>
                  </div>
                  <label className="quote-ai-wide-field">
                    Explanation
                    <textarea
                      value={item.explanation ?? item.notes ?? ""}
                      onChange={(event) => {
                        const items = [...suggestion.suggestedLineItems];
                        items[index] = { ...item, explanation: event.target.value };
                        onChange({ ...suggestion, suggestedLineItems: items });
                      }}
                    />
                  </label>
                  <div className="quote-ai-suggestion-actions">
                    <button type="button" onClick={() => onApplyLineItem(item, key)}>
                      Apply Line Item
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        onChange({
                          ...suggestion,
                          suggestedLineItems: suggestion.suggestedLineItems.filter((_, itemIndex) => itemIndex !== index)
                        })
                      }
                    >
                      Dismiss
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      ) : null}

      {suggestion.suggestedMaterials.length > 0 ? (
        <details className="quote-ai-review-section" open>
          <summary className="quote-ai-review-section-heading">
            <strong>Suggested Materials</strong>
            <span>{suggestion.suggestedMaterials.length}</span>
          </summary>
          <div className="quote-ai-suggestion-list">
            {suggestion.suggestedMaterials.map((item, index) => {
              const key = `material-${index}`;
              return (
                <article className="quote-ai-suggestion-card" key={key}>
                  <div className="quote-ai-suggestion-fields material">
                    <label>
                      Material
                      <input
                        value={item.name}
                        onChange={(event) => {
                          const items = [...suggestion.suggestedMaterials];
                          items[index] = { ...item, name: event.target.value };
                          onChange({ ...suggestion, suggestedMaterials: items });
                        }}
                      />
                    </label>
                    <label>
                      Quantity
                      <input
                        inputMode="decimal"
                        value={item.quantity ?? ""}
                        onChange={(event) => {
                          const items = [...suggestion.suggestedMaterials];
                          items[index] = {
                            ...item,
                            quantity: event.target.value === "" ? undefined : Number(event.target.value) || 0
                          };
                          onChange({ ...suggestion, suggestedMaterials: items });
                        }}
                      />
                    </label>
                    <label>
                      Unit
                      <input
                        value={item.unit ?? ""}
                        onChange={(event) => {
                          const items = [...suggestion.suggestedMaterials];
                          items[index] = { ...item, unit: event.target.value };
                          onChange({ ...suggestion, suggestedMaterials: items });
                        }}
                      />
                    </label>
                  </div>
                  <label className="quote-ai-wide-field">
                    Notes
                    <textarea
                      value={item.notes ?? ""}
                      onChange={(event) => {
                        const items = [...suggestion.suggestedMaterials];
                        items[index] = { ...item, notes: event.target.value };
                        onChange({ ...suggestion, suggestedMaterials: items });
                      }}
                    />
                  </label>
                  <div className="quote-ai-suggestion-actions">
                    <button type="button" onClick={() => onApplyMaterial(item, key)}>
                      Apply Material
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        onChange({
                          ...suggestion,
                          suggestedMaterials: suggestion.suggestedMaterials.filter((_, itemIndex) => itemIndex !== index)
                        })
                      }
                    >
                      Dismiss
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      ) : null}

      {suggestion.suggestedLaborEquipment.length > 0 ? (
        <details className="quote-ai-review-section" open>
          <summary className="quote-ai-review-section-heading">
            <strong>Labor / Equipment / Mobilization</strong>
            <span>{suggestion.suggestedLaborEquipment.length}</span>
          </summary>
          <div className="quote-ai-suggestion-list">
            {suggestion.suggestedLaborEquipment.map((item, index) => {
              const key = `cost-${index}`;
              return (
                <article className="quote-ai-suggestion-card" key={key}>
                  <div className="quote-ai-suggestion-fields cost">
                    <label>
                      Category
                      <input
                        value={item.category ?? ""}
                        onChange={(event) => {
                          const items = [...suggestion.suggestedLaborEquipment];
                          items[index] = { ...item, category: event.target.value };
                          onChange({ ...suggestion, suggestedLaborEquipment: items });
                        }}
                      />
                    </label>
                    <label>
                      Name
                      <input
                        value={item.name}
                        onChange={(event) => {
                          const items = [...suggestion.suggestedLaborEquipment];
                          items[index] = { ...item, name: event.target.value };
                          onChange({ ...suggestion, suggestedLaborEquipment: items });
                        }}
                      />
                    </label>
                    <label>
                      Amount
                      <input
                        inputMode="decimal"
                        value={item.amount ?? ""}
                        onChange={(event) => {
                          const items = [...suggestion.suggestedLaborEquipment];
                          items[index] = { ...item, amount: event.target.value === "" ? undefined : Number(event.target.value) || 0 };
                          onChange({ ...suggestion, suggestedLaborEquipment: items });
                        }}
                      />
                    </label>
                  </div>
                  <label className="quote-ai-wide-field">
                    Explanation
                    <textarea
                      value={item.explanation ?? item.notes ?? ""}
                      onChange={(event) => {
                        const items = [...suggestion.suggestedLaborEquipment];
                        items[index] = { ...item, explanation: event.target.value };
                        onChange({ ...suggestion, suggestedLaborEquipment: items });
                      }}
                    />
                  </label>
                  <div className="quote-ai-suggestion-actions">
                    <button type="button" onClick={() => onApplyCost(item, key)}>
                      Apply Cost
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        onChange({
                          ...suggestion,
                          suggestedLaborEquipment: suggestion.suggestedLaborEquipment.filter((_, itemIndex) => itemIndex !== index)
                        })
                      }
                    >
                      Dismiss
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      ) : null}

      {suggestion.suggestedScopeOfWork || exclusions || suggestion.suggestedTerms ? (
        <details className="quote-ai-review-section" open>
          <summary className="quote-ai-review-section-heading">
            <strong>Scope / Exclusions / Terms</strong>
          </summary>
          <div className="quote-ai-text-suggestions">
            {suggestion.suggestedScopeOfWork ? (
              <label>
                Scope of work
                <textarea
                  value={suggestion.suggestedScopeOfWork}
                  onChange={(event) => onChange({ ...suggestion, suggestedScopeOfWork: event.target.value })}
                />
                <button
                  type="button"
                  onClick={() => onApplyText("scope", suggestion.suggestedScopeOfWork ?? "", "text-scope")}
                >
                  Apply Scope
                </button>
              </label>
            ) : null}
            {exclusions ? (
              <label>
                Exclusions
                <textarea
                  value={exclusions}
                  onChange={(event) => onChange({ ...suggestion, suggestedExclusions: event.target.value })}
                />
                <button
                  type="button"
                  onClick={() => onApplyText("exclusions", exclusions, "text-exclusions")}
                >
                  Apply Exclusions
                </button>
              </label>
            ) : null}
            {suggestion.suggestedTerms ? (
              <label>
                Payment terms
                <textarea
                  value={suggestion.suggestedTerms}
                  onChange={(event) => onChange({ ...suggestion, suggestedTerms: event.target.value })}
                />
                <button
                  type="button"
                  onClick={() => onApplyText("terms", suggestion.suggestedTerms ?? "", "text-terms")}
                >
                  Apply Terms
                </button>
              </label>
            ) : null}
          </div>
        </details>
      ) : null}

      {suggestion.pricingAssumptions.length > 0 || suggestion.warnings.length > 0 ? (
        <details className="quote-ai-review-section" open>
          <summary className="quote-ai-review-section-heading">
            <strong>Assumptions / Warnings</strong>
            <span>{suggestion.pricingAssumptions.length + suggestion.warnings.length}</span>
          </summary>
          <div className="quote-ai-advisories">
            {suggestion.pricingAssumptions.length > 0 ? (
              <div>
                <strong>Pricing Assumptions</strong>
                <ul>{suggestion.pricingAssumptions.map((item, index) => <li key={`assumption-${index}`}>{item}</li>)}</ul>
              </div>
            ) : null}
            {suggestion.warnings.length > 0 ? (
              <div>
                <strong>Warnings</strong>
                <ul>{suggestion.warnings.map((item, index) => <li key={`warning-${index}`}>{item}</li>)}</ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {suggestion.missingQuestions.length > 0 ? (
        <details className="quote-ai-review-section quote-ai-questions" open>
          <summary className="quote-ai-review-section-heading">
            <strong>Missing Questions</strong>
            <span>{suggestion.missingQuestions.length}</span>
          </summary>
          <ul>{suggestion.missingQuestions.map((question, index) => <li key={`question-${index}`}>{question}</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}
