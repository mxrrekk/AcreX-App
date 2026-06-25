"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { MobileAppNav } from "@/components/ui/mobile-app-nav";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { publishDataChange } from "@/lib/data/sync";
import { saveUserSettings as saveUserSettingsToDatabase } from "@/lib/data/storage";
import { type SaveStatus } from "@/lib/data/save-status";
import { useAcrexDataRefresh } from "@/lib/data/use-data-refresh";
import { serviceCatalog } from "@/lib/services/catalog";
import { billingPlans, normalizePlan, usageRemaining, type AcrexPlan, type UsageCounts } from "@/lib/billing/plans";
import { getBillingProvider, type BillingEntitlement } from "@/lib/billing/provider";
import {
  defaultUserSettings,
  loadUserSettings,
  normalizeUserSettings,
  saveUserSettings,
  type AcrexUserSettings
} from "@/lib/settings/user-settings";

type SettingsPageProps = {
  storedSettings: Partial<AcrexUserSettings> | null;
  account: {
    id: string;
    name: string;
    email: string;
    plan: string;
    subscriptionStatus: string;
    subscriptionSource: string;
    appleOriginalTransactionId: string | null;
    appleProductId: string | null;
    appleExpiresAt: string | null;
    lastEntitlementCheckAt: string | null;
    createdAt: string | null;
  };
  usage: UsageCounts;
};

function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const servicePricingFields = serviceCatalog
  .filter((service) => service.settingsRateField)
  .map((service) => [
    service.settingsRateField as keyof AcrexUserSettings["pricing"],
    `${service.quoteCategory} · ${
      service.displayUnit === "acres"
        ? "per acre"
        : service.displayUnit === "linear feet"
          ? "per linear foot"
          : `per ${service.displayUnit}`
    }`
  ] as const);

export function SettingsPage({ account, storedSettings, usage }: SettingsPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const billingProvider = getBillingProvider();
  const [settings, setSettings] = useState<AcrexUserSettings>(defaultUserSettings);
  const [saveState, setSaveState] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [billingMessage, setBillingMessage] = useState("");
  const [billingState, setBillingState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [currentPlan, setCurrentPlan] = useState<AcrexPlan>(normalizePlan(account.plan));
  const [subscriptionStatus, setSubscriptionStatus] = useState(account.subscriptionStatus);
  const [subscriptionSource, setSubscriptionSource] = useState(account.subscriptionSource);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeTab, setActiveTab] = useState<"account" | "company" | "pricing" | "quote" | "drawing" | "map">("company");
  const handleExternalSettingsChange = useCallback(
    (change: { type: string }) => {
      if (change.type === "settings-saved") {
        setSettings(loadUserSettings(account.id));
      }
    },
    [account.id]
  );
  useAcrexDataRefresh(handleExternalSettingsChange);

  useEffect(() => {
    const localSettings = loadUserSettings(account.id);
    setSettings(normalizeUserSettings(storedSettings ?? localSettings));
  }, [account.id, storedSettings]);

  useEffect(() => {
    if (searchParams.get("tab") === "account") setActiveTab("account");
  }, [searchParams]);

  useEffect(() => {
    setCurrentPlan(normalizePlan(account.plan));
    setSubscriptionStatus(account.subscriptionStatus);
    setSubscriptionSource(account.subscriptionSource);
  }, [account.plan, account.subscriptionStatus, account.subscriptionSource]);

  type EditableSettingsSection = "company" | "quoteDefaults" | "pricing" | "drawing" | "map";

  function updateSection<K extends EditableSettingsSection>(
    section: K,
    field: keyof AcrexUserSettings[K],
    value: string | number | boolean
  ) {
    setSettings((current) => ({
      ...current,
      [section]: {
        ...(current[section] as object),
        [field]: value
      }
    }));
    setSaveState("idle");
    setSaveMessage("");
  }

  async function handleSave() {
    setSaveState("saving");
    setSaveMessage("Saving…");
    try {
      await Promise.resolve();
      const next = normalizeUserSettings({
        ...settings,
        updatedAt: new Date().toISOString()
      });
      const supabase = createSupabaseBrowserClient();
      if (!supabase) throw new Error("Settings storage is not configured.");
      const databaseResult = await saveUserSettingsToDatabase(supabase, account.id, {
        company_profile: next.company,
        quote_defaults: next.quoteDefaults,
        pricing_defaults: next.pricing,
        drawing_defaults: next.drawing,
        map_defaults: next.map
      });
      if (
        databaseResult.error &&
        !databaseResult.error.includes("user_settings") &&
        !databaseResult.error.includes("schema cache")
      ) {
        throw new Error(databaseResult.error);
      }
      saveUserSettings(account.id, next);
      setSettings(next);
      setSaveState("saved");
      setSaveMessage("Saved");
      publishDataChange({ type: "settings-saved" });
    } catch {
      setSaveState("error");
      setSaveMessage("Save failed");
    }
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setSaveState("error");
      setSaveMessage("Sign out is unavailable because authentication is not configured.");
      return;
    }
    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setIsSigningOut(false);
    if (error) {
      setSaveState("error");
      setSaveMessage(error.message);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  const persistEntitlement = useCallback(async (entitlement: BillingEntitlement) => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) throw new Error("Subscription storage is not configured.");
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
      .eq("id", account.id);
    if (error) throw new Error(error.message);
    setCurrentPlan(entitlement.plan);
    setSubscriptionStatus(entitlement.subscriptionStatus);
    setSubscriptionSource(entitlement.subscriptionSource);
    publishDataChange({ type: "settings-saved" });
    router.refresh();
  }, [account.id, router]);

  async function handleUpgrade(plan: Exclude<AcrexPlan, "free">) {
    const provider = getBillingProvider();
    setBillingState("loading");
    setBillingMessage(`Opening ${billingPlans[plan].name} App Store subscription…`);
    const result = await provider.startCheckout(plan);
    if (result.ok && result.entitlement) {
      try {
        await persistEntitlement(result.entitlement);
        setBillingState("success");
        setBillingMessage(result.message);
      } catch (error) {
        setBillingState("error");
        setBillingMessage(error instanceof Error ? error.message : "Purchase completed, but subscription status could not be saved.");
      }
      return;
    }
    setBillingState("error");
    setBillingMessage(result.message);
  }

  async function handleRestorePurchases() {
    const provider = getBillingProvider();
    setBillingState("loading");
    setBillingMessage("Checking App Store purchases…");
    const result = await provider.restorePurchases();
    if (result.ok && result.entitlement) {
      try {
        await persistEntitlement(result.entitlement);
        setBillingState("success");
        setBillingMessage(result.message);
      } catch (error) {
        setBillingState("error");
        setBillingMessage(error instanceof Error ? error.message : "Purchases restored, but subscription status could not be saved.");
      }
      return;
    }
    setBillingState("error");
    setBillingMessage(result.message);
  }

  useEffect(() => {
    if (activeTab !== "account") return;
    const provider = getBillingProvider();
    if (!provider.isAvailable) return;
    let canceled = false;
    void provider.syncSubscriptionStatus().then(async (result) => {
      if (canceled || !result.entitlement) return;
      if (result.entitlement.plan !== currentPlan || result.entitlement.subscriptionStatus !== subscriptionStatus) {
        await persistEntitlement(result.entitlement).catch(() => undefined);
      }
    });
    return () => {
      canceled = true;
    };
  }, [activeTab, currentPlan, persistEntitlement, subscriptionStatus]);

  return (
    <main className="settings-page">
      <aside className="projects-sidebar">
        <AppSidebar active="settings" ariaLabel="Settings navigation" />
      </aside>

      <section className="settings-workspace">
        <header className="projects-header settings-header">
          <div>
            <span>Workspace Preferences</span>
            <h1>Settings</h1>
            <p>Manage account details, company information, quoting defaults, pricing, drawings, and Map preferences.</p>
          </div>
          <div className="projects-user-chip">
            <strong>{(account.name || account.email || "A").slice(0, 1).toUpperCase()}</strong>
            <span>{account.email}</span>
          </div>
        </header>

        <nav className="premium-tabs settings-tabs" aria-label="Settings sections">
          {[
            ["account", "Account"],
            ["company", "Company"],
            ["pricing", "Pricing"],
            ["quote", "Quote Defaults"],
            ["drawing", "Drawing Colors"],
            ["map", "Map"]
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={activeTab === id ? "active" : ""}
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => setActiveTab(id as typeof activeTab)}
            >
              {label}
            </button>
          ))}
        </nav>

        <footer className="settings-save-bar">
          <div>
            <strong>{saveMessage || "Settings sync to this account across devices."}</strong>
            <span>{settings.updatedAt ? `Last saved ${formatDate(settings.updatedAt)}` : "Not saved yet"}</span>
          </div>
          <button className={saveState === "saving" ? "is-processing" : ""} type="button" onClick={handleSave} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Saving…" : "Save Settings"}
          </button>
        </footer>

        <div className="settings-tab-panel" role="tabpanel">
        {activeTab === "account" ? (
        <section className="settings-card account-settings-card" aria-labelledby="account-heading">
          <div className="settings-section-heading">
            <div>
              <span>Account</span>
              <h2 id="account-heading">Account and subscription</h2>
            </div>
            <button type="button" className="settings-sign-out" onClick={handleSignOut} disabled={isSigningOut}>
              {isSigningOut ? "Signing out…" : "Sign Out"}
            </button>
          </div>
          <div className="account-detail-grid">
            <div><span>Name</span><strong>{account.name || "Not provided"}</strong></div>
            <div><span>Email</span><strong>{account.email}</strong></div>
            <div><span>Account ID</span><strong className="account-id">{account.id}</strong></div>
            <div><span>Current plan</span><strong>{billingPlans[currentPlan].name}</strong></div>
            <div><span>Subscription status</span><strong>{subscriptionStatus}</strong></div>
            <div><span>Subscription source</span><strong>{subscriptionSource}</strong></div>
            <div><span>Apple product</span><strong>{account.appleProductId ?? "Not active"}</strong></div>
            <div><span>Renews / expires</span><strong>{formatDate(account.appleExpiresAt)}</strong></div>
            <div><span>Last entitlement check</span><strong>{formatDate(account.lastEntitlementCheckAt)}</strong></div>
            <div><span>Account created</span><strong>{formatDate(account.createdAt)}</strong></div>
          </div>
          <section className="upgrade-panel" aria-label="Upgrade AcreX">
            <div className="settings-section-heading">
              <div>
                <span>iOS App Subscription</span>
                <h3>Upgrade through Apple In-App Purchase</h3>
              </div>
              <button
                type="button"
                onClick={() => void handleRestorePurchases()}
                disabled={billingState === "loading" || !billingProvider.isAvailable}
                title={!billingProvider.isAvailable ? "Subscriptions are available in the iOS app." : undefined}
              >
                {billingState === "loading" ? "Checking…" : "Restore Purchases"}
              </button>
            </div>

            <div className="usage-limit-grid">
              {([
                ["projects", "Projects"],
                ["quotes", "Quotes"],
                ["aiEstimates", "AI estimates"],
                ["exports", "Exports"],
                ["invoices", "Invoices"]
              ] as const).map(([metric, label]) => {
                const remaining = usageRemaining(currentPlan, usage, metric);
                return (
                  <div key={metric}>
                    <span>{label}</span>
                    <strong>{remaining === null ? "Unlimited" : `${remaining} left`}</strong>
                    <small>{usage[metric]} used</small>
                  </div>
                );
              })}
            </div>

            <div className="upgrade-plan-grid">
              {(["pro", "business"] as const).map((plan) => {
                const unavailable = !billingProvider.isAvailable;
                return (
                  <article className="upgrade-plan-card" key={plan}>
                    <div>
                      <span>{billingPlans[plan].label}</span>
                      <h4>{billingPlans[plan].name}</h4>
                      <strong className="upgrade-plan-price">{billingPlans[plan].priceLabel}</strong>
                      <small>{billingPlans[plan].appleProductId}</small>
                    </div>
                    <ul>
                      {billingPlans[plan].features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => void handleUpgrade(plan)}
                      disabled={billingState === "loading" || unavailable}
                      title={unavailable ? "Subscriptions are available in the iOS app." : undefined}
                    >
                      {currentPlan === plan ? "Current Plan" : `Upgrade to ${billingPlans[plan].name}`}
                    </button>
                  </article>
                );
              })}
            </div>

            <div className={`billing-status-message is-${billingState}`} role="status">
              {billingMessage || (billingProvider.isAvailable
                ? "Purchases are handled by App Store subscriptions. Manage or cancel from your Apple account."
                : "Subscriptions are available in the iOS app. Web billing is not enabled yet.")}
            </div>
          </section>
          <div className="settings-availability" role="status">
            <div>
              <strong>Manage subscription</strong>
              <small>Use Apple account subscription settings after purchase.</small>
            </div>
            <div>
              <strong>Web billing</strong>
              <small>Disabled for now. iOS app subscriptions use Apple In-App Purchase.</small>
            </div>
            <div>
              <strong>Account support</strong>
              <small>
                <a href="mailto:support@getacrex.com?subject=AcreX%20account%20support">Contact support</a>
                {" "}for account deletion, billing, or subscription help.
              </small>
            </div>
          </div>
        </section>
        ) : null}

        {activeTab === "company" ? (
        <section className="settings-card" aria-labelledby="company-heading">
          <div className="settings-section-heading">
            <div><span>Company Profile</span><h2 id="company-heading">Business information</h2></div>
          </div>
          <div className="settings-field-grid">
            <label>Company name<input value={settings.company.name} onChange={(event) => updateSection("company", "name", event.target.value)} /></label>
            <label>Phone<input type="tel" value={settings.company.phone} onChange={(event) => updateSection("company", "phone", event.target.value)} /></label>
            <label>Email<input type="email" value={settings.company.email} onChange={(event) => updateSection("company", "email", event.target.value)} /></label>
            <label>Website<input type="url" value={settings.company.website} onChange={(event) => updateSection("company", "website", event.target.value)} placeholder="https://" /></label>
            <div className="settings-logo-placeholder">
              <span>Company logo</span>
              <strong>No logo uploaded</strong>
              <small>Logo upload will be enabled when file storage is configured.</small>
            </div>
          </div>
        </section>
        ) : null}

        {activeTab === "quote" ? (
        <section className="settings-card" aria-labelledby="quote-defaults-heading">
          <div className="settings-section-heading">
            <div><span>Quote Defaults</span><h2 id="quote-defaults-heading">Customer-facing defaults</h2></div>
          </div>
          <div className="settings-field-grid">
            <label className="settings-wide-field">Default quote terms<textarea value={settings.quoteDefaults.terms} onChange={(event) => updateSection("quoteDefaults", "terms", event.target.value)} /></label>
            <label className="settings-wide-field">Default notes<textarea value={settings.quoteDefaults.notes} onChange={(event) => updateSection("quoteDefaults", "notes", event.target.value)} /></label>
            <label>Expiration days<input type="number" min="0" value={settings.quoteDefaults.expirationDays} onChange={(event) => updateSection("quoteDefaults", "expirationDays", numberValue(event.target.value))} /></label>
            <label>Default deposit %<input type="number" min="0" value={settings.quoteDefaults.depositPercent} onChange={(event) => updateSection("quoteDefaults", "depositPercent", numberValue(event.target.value))} /></label>
            <label>Tax %<input type="number" min="0" value={settings.quoteDefaults.taxPercent} onChange={(event) => updateSection("quoteDefaults", "taxPercent", numberValue(event.target.value))} /></label>
          </div>
        </section>
        ) : null}

        {activeTab === "pricing" ? (
        <section className="settings-card" aria-labelledby="pricing-heading">
          <div className="settings-section-heading">
            <div><span>Pricing Defaults</span><h2 id="pricing-heading">Starting prices and costs</h2></div>
          </div>
          <div className="settings-field-grid">
            {[
              ...servicePricingFields,
              ["mowingMinimumCharge", "Mowing minimum visit charge"],
              ["mobilizationFee", "Mobilization fee"],
              ["minimumJobCharge", "Minimum job charge"],
              ["laborRate", "Labor rate"],
              ["crewSize", "Default crew size"],
              ["equipmentRate", "Equipment rate"],
              ["fuelSurchargePercent", "Fuel surcharge %"],
              ["overheadPercent", "Overhead %"],
              ["targetProfitPercent", "Target profit %"]
            ].map(([field, label]) => (
              <label key={field}>
                {label}
                <input
                  type="number"
                  min={field === "crewSize" ? "1" : "0"}
                  step={field === "crewSize" ? "1" : "0.01"}
                  value={settings.pricing[field as keyof AcrexUserSettings["pricing"]]}
                  onChange={(event) => updateSection("pricing", field as keyof AcrexUserSettings["pricing"], numberValue(event.target.value))}
                />
              </label>
            ))}
          </div>
        </section>
        ) : null}

        {activeTab === "drawing" ? (
        <section className="settings-card" aria-labelledby="drawing-heading">
          <div className="settings-section-heading">
            <div><span>Drawing Defaults</span><h2 id="drawing-heading">Service colors</h2></div>
          </div>
          <div className="settings-color-grid">
            {[
              ["grassColor", "Grass"],
              ["brushColor", "Brush"],
              ["woodsColor", "Woods"],
              ["fenceColor", "Fence"],
              ["drivewayColor", "Driveway"],
              ["housePadColor", "House pad"],
              ["exclusionColor", "Exclusion"]
            ].map(([field, label]) => (
              <label key={field}>
                <span>{label}</span>
                <input
                  type="color"
                  value={settings.drawing[field as keyof AcrexUserSettings["drawing"]]}
                  onChange={(event) => updateSection("drawing", field as keyof AcrexUserSettings["drawing"], event.target.value)}
                />
                <code>{settings.drawing[field as keyof AcrexUserSettings["drawing"]]}</code>
              </label>
            ))}
          </div>
        </section>
        ) : null}

        {activeTab === "map" ? (
        <section className="settings-card" aria-labelledby="map-heading">
          <div className="settings-section-heading">
            <div><span>Map Defaults</span><h2 id="map-heading">Map preferences</h2></div>
          </div>
          <div className="settings-field-grid">
            <label>
              Preferred map style
              <select value={settings.map.preferredStyle} onChange={(event) => updateSection("map", "preferredStyle", event.target.value)}>
                <option value="satellite">Satellite</option>
                <option value="satellite-streets">Satellite Streets</option>
                <option value="outdoors">Outdoors</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              Preferred units
              <select value={settings.map.preferredUnits} onChange={(event) => updateSection("map", "preferredUnits", event.target.value)}>
                <option value="imperial">Imperial</option>
                <option value="metric">Metric</option>
              </select>
            </label>
            <label className="settings-toggle"><input type="checkbox" checked={settings.map.showLabels} onChange={(event) => updateSection("map", "showLabels", event.target.checked)} /><span>Show labels by default</span></label>
            <label className="settings-toggle"><input type="checkbox" checked={settings.map.showParcelBoundary} onChange={(event) => updateSection("map", "showParcelBoundary", event.target.checked)} /><span>Show parcel boundary by default</span></label>
          </div>
        </section>
        ) : null}
        </div>

      </section>
      <MobileAppNav active={activeTab === "account" ? "account" : "settings"} />
    </main>
  );
}
