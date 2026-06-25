"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { billingPlans, type AcrexPlan, type UsageMetric } from "@/lib/billing/plans";
import { getBillingProvider, type BillingEntitlement } from "@/lib/billing/provider";

type UpgradePlanPromptProps = {
  open: boolean;
  metric: UsageMetric;
  message: string;
  onClose: () => void;
  onPlanUpdated?: (plan: AcrexPlan) => void;
};

async function persistEntitlement(entitlement: BillingEntitlement) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Subscription storage is not configured.");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Log in again to update your subscription.");
  const { error } = await supabase
    .from("users")
    .update({
      plan: entitlement.plan,
      subscription_status: entitlement.subscriptionStatus,
      subscription_source: entitlement.subscriptionSource,
      apple_original_transaction_id: entitlement.appleOriginalTransactionId ?? null,
      apple_product_id: entitlement.appleProductId ?? null,
      apple_expires_at: entitlement.appleExpiresAt ?? null,
      last_entitlement_check_at: new Date().toISOString()
    })
    .eq("id", user.id);
  if (error) throw new Error(error.message);
}

export function UpgradePlanPrompt({ open, metric, message, onClose, onPlanUpdated }: UpgradePlanPromptProps) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  if (!open) return null;

  const provider = getBillingProvider();

  async function completePurchase(action: "restore" | Exclude<AcrexPlan, "free">) {
    setState("loading");
    setStatusMessage(action === "restore" ? "Checking App Store purchases…" : `Opening ${billingPlans[action].name} subscription…`);
    const result = action === "restore"
      ? await provider.restorePurchases()
      : await provider.startCheckout(action);
    if (!result.ok || !result.entitlement) {
      setState("error");
      setStatusMessage(result.message);
      return;
    }
    try {
      await persistEntitlement(result.entitlement);
      setState("success");
      setStatusMessage(result.message);
      onPlanUpdated?.(result.entitlement.plan);
    } catch (error) {
      setState("error");
      setStatusMessage(error instanceof Error ? error.message : "Subscription status could not be saved.");
    }
  }

  return (
    <div className="upgrade-modal-backdrop" role="presentation">
      <section className="upgrade-modal" role="dialog" aria-modal="true" aria-label="Upgrade AcreX plan">
        <header>
          <div>
            <span>Upgrade Plan</span>
            <h2>{message}</h2>
            <p>Saved data remains viewable. Upgrade when you are ready to keep creating new {metric === "aiEstimates" ? "AI estimates" : metric}.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close upgrade prompt">×</button>
        </header>
        <div className="upgrade-modal-grid">
          {(["pro", "business"] as const).map((plan) => (
            <article key={plan}>
              <span>{billingPlans[plan].label}</span>
              <h3>{billingPlans[plan].name}</h3>
              <strong>{billingPlans[plan].priceLabel}</strong>
              <ul>
                {billingPlans[plan].features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <button type="button" onClick={() => void completePurchase(plan)} disabled={state === "loading" || !provider.isAvailable}>
                Upgrade to {billingPlans[plan].name}
              </button>
            </article>
          ))}
        </div>
        <footer>
          <button type="button" onClick={() => void completePurchase("restore")} disabled={state === "loading" || !provider.isAvailable}>
            Restore Purchases
          </button>
          <button type="button" className="secondary" onClick={onClose}>Not Now</button>
        </footer>
        <p className={`billing-status-message is-${state}`} role="status">
          {statusMessage || (provider.isAvailable ? "Purchases use Apple In-App Purchase." : "Subscriptions are available in the iOS app.")}
        </p>
      </section>
    </div>
  );
}
