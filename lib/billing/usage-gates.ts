import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canCreateInvoice,
  canCreateProject,
  canCreateQuote,
  canExport,
  canUseAI,
  normalizePlan,
  usageLimitMessage,
  type UsageCounts,
  type UsageMetric
} from "@/lib/billing/plans";

export type UsageGateResult = {
  allowed: boolean;
  plan: ReturnType<typeof normalizePlan>;
  usage: UsageCounts;
  metric: UsageMetric;
  message?: string;
};

async function safeCount(supabase: SupabaseClient, table: string, userId: string) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return 0;
  return count ?? 0;
}

export async function getUsageCounts(supabase: SupabaseClient, userId: string): Promise<UsageCounts> {
  const [projects, quotes, aiEstimates, exports, invoices] = await Promise.all([
    safeCount(supabase, "projects", userId),
    safeCount(supabase, "quotes", userId),
    safeCount(supabase, "ai_estimate_snapshots", userId),
    safeCount(supabase, "exports", userId),
    safeCount(supabase, "invoices", userId)
  ]);
  return { projects, quotes, aiEstimates, exports, invoices };
}

export function canUseMetric(plan: ReturnType<typeof normalizePlan>, usage: UsageCounts, metric: UsageMetric) {
  if (metric === "projects") return canCreateProject(plan, usage);
  if (metric === "quotes") return canCreateQuote(plan, usage);
  if (metric === "aiEstimates") return canUseAI(plan, usage);
  if (metric === "exports") return canExport(plan, usage);
  return canCreateInvoice(plan, usage);
}

export async function checkUsageGate(
  supabase: SupabaseClient,
  userId: string,
  metric: UsageMetric
): Promise<UsageGateResult> {
  const [{ data: profile }, usage] = await Promise.all([
    supabase.from("users").select("plan, subscription_status").eq("id", userId).maybeSingle(),
    getUsageCounts(supabase, userId)
  ]);
  const plan = normalizePlan((profile as { plan?: string | null } | null)?.plan);
  const status = (profile as { subscription_status?: string | null } | null)?.subscription_status;
  const activePaidPlan = plan !== "free" && (status === "active" || status === "trial");
  const effectivePlan = activePaidPlan ? plan : "free";
  if (canUseMetric(effectivePlan, usage, metric)) {
    return { allowed: true, plan: effectivePlan, usage, metric };
  }
  return {
    allowed: false,
    plan: effectivePlan,
    usage,
    metric,
    message: usageLimitMessage(metric)
  };
}
