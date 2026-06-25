# Apple In-App Purchase Foundation

AcreX iOS subscriptions are intentionally separated from web billing.

## Runtime behavior

- Native iOS app: Account → Upgrade uses Apple In-App Purchase / App Store subscriptions.
- Web browser: Account shows that subscriptions are available in the iOS app and does not show a working web checkout.
- Stripe remains disabled/placeheld for this path.

## Product IDs

Create these auto-renewable subscriptions in App Store Connect before production IAP testing:

- Pro Monthly
  - `productId`: `com.getacrex.pro.monthly`
  - Price: `$15/month`
- Business Monthly
  - `productId`: `com.getacrex.business.monthly`
  - Price: `$35/month`

Subscription group:

- `AcreX Subscriptions`

The product IDs are centralized in [`lib/billing/plans.ts`](../lib/billing/plans.ts).

## Capacitor plugin

The iOS foundation uses `cordova-plugin-purchase`, a Capacitor-compatible StoreKit bridge.

After dependency changes, run:

```bash
npm run ios:sync:production
```

Then open Xcode and confirm the plugin is included in the native project.

## Supabase profile fields

The profile table stores subscription state:

- `plan`
- `subscription_status`
- `subscription_source`
- `apple_original_transaction_id`
- `apple_product_id`
- `apple_expires_at`
- `last_entitlement_check_at`

Apply the current `supabase/schema.sql` updates before relying on production subscription sync.

## Entitlements and limits

Plan prices, features, and free usage limits are configured in [`lib/billing/plans.ts`](../lib/billing/plans.ts):

- 3 projects
- 5 quotes
- 3 AI estimates
- 3 exports
- basic invoices

The central usage gate lives in [`lib/billing/usage-gates.ts`](../lib/billing/usage-gates.ts).

Current enforced gates:

- Project creation
- Quote creation
- AI estimate generation
- Project backup exports

Canceled or expired subscriptions fall back to free limits. Existing saved projects, quotes, and invoices remain viewable.

## Remaining production steps

- Create the products in App Store Connect.
- Sign the iOS app with the Apple Developer account.
- Test purchases with a sandbox tester.
- Verify `Restore Purchases` updates Supabase profile fields.
- Verify App Review metadata describes App Store subscriptions, not Apple Pay.
