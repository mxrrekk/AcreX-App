export type AcrexPlan = "free" | "pro" | "business";

export type SubscriptionStatus = "active" | "inactive" | "trial" | "expired" | "canceled";

export type SubscriptionSource = "apple" | "manual" | "none" | "stripe";

export type UsageMetric = "projects" | "quotes" | "aiEstimates" | "exports" | "invoices";

export type UsageCounts = Record<UsageMetric, number>;

export type UsageLimits = Record<UsageMetric, number | null>;

export type BillingPlan = {
  id: AcrexPlan;
  name: string;
  label: string;
  priceLabel: string;
  monthlyPriceCents: number;
  appleProductId?: string;
  limits: UsageLimits;
  features: string[];
};

// App Store Connect setup required before production IAP testing:
// Subscription group: AcreX Subscriptions
// Pro Monthly productId: com.getacrex.pro.monthly
// Business Monthly productId: com.getacrex.business.monthly
export const appleProductIds = {
  proMonthly: "com.getacrex.pro.monthly",
  businessMonthly: "com.getacrex.business.monthly"
} as const;

export const freeUsageLimits: UsageLimits = {
  projects: 3,
  quotes: 5,
  aiEstimates: 3,
  exports: 3,
  invoices: null
};

const unlimitedUsageLimits: UsageLimits = {
  projects: null,
  quotes: null,
  aiEstimates: null,
  exports: null,
  invoices: null
};

export const billingPlans: Record<AcrexPlan, BillingPlan> = {
  free: {
    id: "free",
    name: "Free",
    label: "Limited starter access",
    priceLabel: "$0/month",
    monthlyPriceCents: 0,
    limits: freeUsageLimits,
    features: [
      "Create an account",
      "Try the core app",
      "3 saved projects",
      "5 quotes",
      "3 AI estimates",
      "3 exports",
      "Basic invoices",
      "View existing saved work anytime"
    ]
  },
  pro: {
    id: "pro",
    name: "Pro",
    label: "For active solo contractors",
    priceLabel: "$15/month",
    monthlyPriceCents: 1500,
    appleProductId: appleProductIds.proMonthly,
    limits: unlimitedUsageLimits,
    features: [
      "Unlimited projects",
      "Unlimited quotes",
      "AI estimator",
      "Exports",
      "Invoices",
      "Saved projects, quotes, and invoices"
    ]
  },
  business: {
    id: "business",
    name: "Business",
    label: "For higher-volume crews",
    priceLabel: "$35/month",
    monthlyPriceCents: 3500,
    appleProductId: appleProductIds.businessMonthly,
    limits: unlimitedUsageLimits,
    features: [
      "Everything in Pro",
      "Unlimited projects",
      "Unlimited quotes",
      "Unlimited AI estimates",
      "Unlimited exports",
      "Invoices"
    ]
  }
};

export function normalizePlan(plan: string | null | undefined): AcrexPlan {
  return plan === "pro" || plan === "business" ? plan : "free";
}

export function normalizeSubscriptionStatus(status: string | null | undefined): SubscriptionStatus {
  if (status === "active" || status === "trial" || status === "expired" || status === "canceled") return status;
  return "inactive";
}

export function isPaidPlan(plan: string | null | undefined) {
  return normalizePlan(plan) !== "free";
}

export function usageRemaining(plan: AcrexPlan, usage: UsageCounts, metric: UsageMetric) {
  const limit = billingPlans[plan].limits[metric];
  if (limit === null) return null;
  return Math.max(0, limit - usage[metric]);
}

export function isUsageLimitReached(plan: AcrexPlan, usage: UsageCounts, metric: UsageMetric) {
  const limit = billingPlans[plan].limits[metric];
  return limit !== null && usage[metric] >= limit;
}

export function usageLimitMessage(metric: UsageMetric) {
  const labels: Record<UsageMetric, string> = {
    projects: "project",
    quotes: "quote",
    aiEstimates: "AI estimate",
    exports: "export",
    invoices: "invoice"
  };
  return `You've reached your free ${labels[metric]} limit. Upgrade to keep creating ${labels[metric]}${metric === "aiEstimates" ? "s" : ""}.`;
}

export function canCreateProject(plan: AcrexPlan, usage: UsageCounts) {
  return !isUsageLimitReached(plan, usage, "projects");
}

export function canCreateQuote(plan: AcrexPlan, usage: UsageCounts) {
  return !isUsageLimitReached(plan, usage, "quotes");
}

export function canUseAI(plan: AcrexPlan, usage: UsageCounts) {
  return !isUsageLimitReached(plan, usage, "aiEstimates");
}

export function canExport(plan: AcrexPlan, usage: UsageCounts) {
  return !isUsageLimitReached(plan, usage, "exports");
}

export function canCreateInvoice(plan: AcrexPlan, usage: UsageCounts) {
  return !isUsageLimitReached(plan, usage, "invoices");
}
