"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getBillingProvider } from "@/lib/billing/provider";

export function NativeEntitlementSync() {
  useEffect(() => {
    const provider = getBillingProvider();
    if (!provider.isAvailable) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    let canceled = false;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (canceled || !data.user) return;
      const result = await provider.syncSubscriptionStatus();
      if (canceled || !result.entitlement) return;
      await supabase
        .from("users")
        .update({
          plan: result.entitlement.plan,
          subscription_status: result.entitlement.subscriptionStatus,
          subscription_source: result.entitlement.subscriptionSource,
          apple_original_transaction_id: result.entitlement.appleOriginalTransactionId ?? null,
          apple_product_id: result.entitlement.appleProductId ?? null,
          apple_expires_at: result.entitlement.appleExpiresAt ?? null,
          last_entitlement_check_at: new Date().toISOString()
        })
        .eq("id", data.user.id);
    });

    return () => {
      canceled = true;
    };
  }, []);

  return null;
}
