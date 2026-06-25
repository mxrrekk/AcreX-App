import { billingPlans, normalizePlan, type AcrexPlan } from "@/lib/billing/plans";

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
    label: billingPlans.free.name,
    projectLimit: billingPlans.free.limits.projects,
    searchLimit: 10,
    capabilities: ["basic_measurements", "saved_projects"]
  },
  pro: {
    label: `AcreX ${billingPlans.pro.name}`,
    projectLimit: billingPlans.pro.limits.projects,
    searchLimit: null,
    capabilities: ["basic_measurements", "advanced_drawing", "saved_projects", "unlimited_projects", "quote_builder", "clients", "pdf_exports"]
  },
  business: {
    label: `AcreX ${billingPlans.business.name}`,
    projectLimit: billingPlans.business.limits.projects,
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

export function hasPlanCapability(plan: string | null | undefined, capability: PlanCapability) {
  return planRules[normalizePlan(plan)].capabilities.includes(capability);
}

export type { AcrexPlan };
