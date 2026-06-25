import assert from "node:assert/strict";
import fs from "node:fs";

const plans = fs.readFileSync("lib/billing/plans.ts", "utf8");
const provider = fs.readFileSync("lib/billing/provider.ts", "utf8");
const gates = fs.readFileSync("lib/billing/usage-gates.ts", "utf8");
const settings = fs.readFileSync("components/settings/settings-page.tsx", "utf8");
const upgradePrompt = fs.readFileSync("components/billing/upgrade-plan-prompt.tsx", "utf8");
const quoteRoute = fs.readFileSync("app/api/quote-assistant/route.ts", "utf8");
const exportRoute = fs.readFileSync("app/api/projects/[id]/export/route.ts", "utf8");
const schema = fs.readFileSync("supabase/schema.sql", "utf8");
const docs = fs.readFileSync("docs/APPLE_IAP.md", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");

assert.match(plans, /com\.getacrex\.pro\.monthly/);
assert.match(plans, /com\.getacrex\.business\.monthly/);
assert.match(plans, /priceLabel:\s*"\$15\/month"/);
assert.match(plans, /priceLabel:\s*"\$35\/month"/);
assert.match(plans, /projects:\s*3/);
assert.match(plans, /quotes:\s*5/);
assert.match(plans, /aiEstimates:\s*3/);
assert.match(plans, /exports:\s*3/);
assert.match(plans, /canCreateProject/);
assert.match(plans, /canCreateQuote/);
assert.match(plans, /canUseAI/);
assert.match(plans, /canExport/);
assert.match(plans, /canCreateInvoice/);
assert.doesNotMatch(plans, /Advanced exports|Advanced AI|Priority and advanced features later/);

for (const method of ["startCheckout", "restorePurchases", "getCurrentEntitlement", "syncSubscriptionStatus"]) {
  assert.match(provider, new RegExp(`${method}\\(`), `Missing billing provider method ${method}`);
}
assert.match(provider, /Capacitor\.isNativePlatform\(\)/);
assert.match(provider, /Capacitor\.getPlatform\(\) === "ios"/);
assert.match(provider, /Subscriptions are available in the iOS app/);
assert.match(packageJson, /"cordova-plugin-purchase"/);

assert.match(gates, /checkUsageGate/);
assert.match(gates, /canUseMetric/);
assert.match(gates, /activePaidPlan \? plan : "free"/);
assert.match(quoteRoute, /checkUsageGate\(supabase, user\.id, "aiEstimates"\)/);
assert.match(quoteRoute, /usage_limit_reached/);
assert.match(exportRoute, /checkUsageGate\(supabase, user\.id, "exports"\)/);

assert.match(settings, /Upgrade through Apple In-App Purchase/);
assert.match(settings, /Restore Purchases/);
assert.match(settings, /priceLabel/);
assert.match(settings, /disabled=\{billingState === "loading" \|\| !billingProvider\.isAvailable\}/);
assert.match(settings, /handleUpgrade/);
assert.match(settings, /handleRestorePurchases/);
assert.match(upgradePrompt, /Upgrade Plan/);
assert.match(upgradePrompt, /Not Now/);
assert.match(upgradePrompt, /Restore Purchases/);
assert.match(upgradePrompt, /priceLabel/);

for (const field of [
  "apple_original_transaction_id",
  "apple_product_id",
  "apple_expires_at",
  "last_entitlement_check_at"
]) {
  assert.match(schema, new RegExp(`add column if not exists ${field}\\b`), `Missing Supabase field ${field}`);
}

assert.match(docs, /AcreX Subscriptions/);
assert.match(docs, /App Store Connect/);
assert.match(docs, /cordova-plugin-purchase/);

console.log("Apple IAP billing foundation checks passed.");
