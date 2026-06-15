export type AcrexPlan = "free" | "pro" | "business";

export type PlanCapability =
  | "basic_measurements"
  | "advanced_drawing"
  | "saved_projects"
  | "unlimited_projects"
  | "quote_builder"
  | "clients"
  | "pdf_exports"
  | "team_workspace"
  | "company_branding"
  | "lead_marketplace";

type PlanRule = {
  label: string;
  projectLimit: number | null;
  searchLimit: number | null;
  capabilities: PlanCapability[];
};

export const planRules: Record<AcrexPlan, PlanRule> = {
  free: {
    label: "Free",
    projectLimit: 3,
    searchLimit: 10,
    capabilities: ["basic_measurements", "saved_projects"]
  },
  pro: {
    label: "AcreX Pro",
    projectLimit: null,
    searchLimit: null,
    capabilities: ["basic_measurements", "advanced_drawing", "saved_projects", "unlimited_projects", "quote_builder", "clients", "pdf_exports"]
  },
  business: {
    label: "AcreX Business",
    projectLimit: null,
    searchLimit: null,
    capabilities: [
      "basic_measurements",
      "advanced_drawing",
      "saved_projects",
      "unlimited_projects",
      "quote_builder",
      "clients",
      "pdf_exports",
      "team_workspace",
      "company_branding",
      "lead_marketplace"
    ]
  }
};

export function normalizePlan(plan: string | null | undefined): AcrexPlan {
  if (plan === "pro" || plan === "business") return plan;
  return "free";
}

export function hasPlanCapability(plan: string | null | undefined, capability: PlanCapability) {
  return planRules[normalizePlan(plan)].capabilities.includes(capability);
}
