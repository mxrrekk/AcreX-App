import { NativeEntitlementSync } from "@/components/billing/native-entitlement-sync";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-transition">
      <NativeEntitlementSync />
      {children}
    </div>
  );
}
