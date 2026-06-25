"use client";

import { Capacitor } from "@capacitor/core";
import {
  appleProductIds,
  billingPlans,
  normalizePlan,
  type AcrexPlan,
  type SubscriptionStatus,
  type SubscriptionSource
} from "@/lib/billing/plans";

type CheckoutResult = {
  ok: boolean;
  message: string;
  entitlement?: BillingEntitlement;
};

export type BillingEntitlement = {
  plan: AcrexPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionSource: SubscriptionSource;
  appleOriginalTransactionId?: string | null;
  appleProductId?: string | null;
  appleExpiresAt?: string | null;
};

export type BillingProvider = {
  kind: "apple_iap" | "unavailable";
  isAvailable: boolean;
  startCheckout(plan: Exclude<AcrexPlan, "free">): Promise<CheckoutResult>;
  restorePurchases(): Promise<CheckoutResult>;
  getCurrentEntitlement(): Promise<BillingEntitlement>;
  syncSubscriptionStatus(): Promise<CheckoutResult>;
};

type CdvPurchaseStore = {
  register?: (products: unknown[]) => void;
  initialize?: (platforms: unknown[]) => Promise<void> | void;
  update?: () => Promise<void> | void;
  get?: (productId: string, platform?: unknown) => {
    id?: string;
    owned?: boolean;
    canPurchase?: boolean;
    getOffer?: () => { order?: () => Promise<unknown> | unknown } | undefined;
  } | undefined;
  restorePurchases?: () => Promise<void> | void;
  localTransactions?: Array<{
    productId?: string;
    transactionId?: string;
    originalTransactionId?: string;
    expirationDate?: string | number | Date;
    isExpired?: boolean;
  }>;
};

type CdvPurchaseGlobal = {
  store?: CdvPurchaseStore;
  Platform?: { APPLE_APPSTORE?: unknown };
  ProductType?: { PAID_SUBSCRIPTION?: unknown };
};

function isNativeIosApp() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

function getCdvPurchase() {
  return typeof window === "undefined"
    ? null
    : ((window as typeof window & { CdvPurchase?: CdvPurchaseGlobal }).CdvPurchase ?? null);
}

function entitlementFromProductId(productId?: string | null): BillingEntitlement {
  const plan = productId === appleProductIds.businessMonthly
    ? "business"
    : productId === appleProductIds.proMonthly
      ? "pro"
      : "free";
  return {
    plan,
    subscriptionStatus: plan === "free" ? "inactive" : "active",
    subscriptionSource: plan === "free" ? "none" : "apple",
    appleProductId: productId ?? null
  };
}

function unavailableProvider(message: string): BillingProvider {
  const entitlement = entitlementFromProductId(null);
  return {
    kind: "unavailable",
    isAvailable: false,
    async startCheckout() {
      return { ok: false, message };
    },
    async restorePurchases() {
      return { ok: false, message };
    },
    async getCurrentEntitlement() {
      return entitlement;
    },
    async syncSubscriptionStatus() {
      return { ok: false, message, entitlement };
    }
  };
}

async function initializeAppleStore(store: CdvPurchaseStore, cdv: CdvPurchaseGlobal) {
  const platform = cdv.Platform?.APPLE_APPSTORE ?? "ios-appstore";
  const productType = cdv.ProductType?.PAID_SUBSCRIPTION ?? "paid subscription";
  store.register?.([
    { id: appleProductIds.proMonthly, type: productType, platform },
    { id: appleProductIds.businessMonthly, type: productType, platform }
  ]);
  await store.initialize?.([platform]);
  await store.update?.();
  return platform;
}

function entitlementFromStore(store: CdvPurchaseStore): BillingEntitlement {
  const activeTransaction = store.localTransactions?.find((transaction) =>
    (transaction.productId === appleProductIds.proMonthly || transaction.productId === appleProductIds.businessMonthly) &&
    transaction.isExpired !== true
  );
  const productId = activeTransaction?.productId ?? null;
  const entitlement = entitlementFromProductId(productId);
  return {
    ...entitlement,
    appleOriginalTransactionId: activeTransaction?.originalTransactionId ?? activeTransaction?.transactionId ?? null,
    appleExpiresAt: activeTransaction?.expirationDate
      ? new Date(activeTransaction.expirationDate).toISOString()
      : null
  };
}

function appleProvider(): BillingProvider {
  return {
    kind: "apple_iap",
    isAvailable: true,
    async startCheckout(plan) {
      const cdv = getCdvPurchase();
      const store = cdv?.store;
      const productId = billingPlans[normalizePlan(plan)].appleProductId;
      if (!cdv || !store || !productId) {
        return { ok: false, message: "Apple In-App Purchase is not available in this build." };
      }
      try {
        const platform = await initializeAppleStore(store, cdv);
        const product = store.get?.(productId, platform);
        const offer = product?.getOffer?.();
        if (!offer?.order) {
          return { ok: false, message: "This App Store subscription is not available yet." };
        }
        await offer.order();
        await store.update?.();
        return {
          ok: true,
          message: "Purchase completed. Subscription status synced.",
          entitlement: entitlementFromStore(store)
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Apple In-App Purchase failed."
        };
      }
    },
    async restorePurchases() {
      const cdv = getCdvPurchase();
      const store = cdv?.store;
      if (!cdv || !store) {
        return { ok: false, message: "Apple In-App Purchase is not available in this build." };
      }
      try {
        await initializeAppleStore(store, cdv);
        await store.restorePurchases?.();
        await store.update?.();
        return {
          ok: true,
          message: "Purchases restored.",
          entitlement: entitlementFromStore(store)
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Restore purchases failed."
        };
      }
    },
    async getCurrentEntitlement() {
      const cdv = getCdvPurchase();
      const store = cdv?.store;
      if (!cdv || !store) return entitlementFromProductId(null);
      await initializeAppleStore(store, cdv);
      return entitlementFromStore(store);
    },
    async syncSubscriptionStatus() {
      const entitlement = await this.getCurrentEntitlement();
      return {
        ok: entitlement.plan !== "free",
        message: entitlement.plan === "free" ? "No active App Store subscription found." : "Subscription status synced.",
        entitlement
      };
    }
  };
}

export function getBillingProvider(): BillingProvider {
  if (!isNativeIosApp()) {
    return unavailableProvider("Subscriptions are available in the iOS app.");
  }
  return appleProvider();
}
