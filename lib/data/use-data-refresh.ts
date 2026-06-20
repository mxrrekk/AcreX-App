"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeToDataChanges, type AcrexDataChange } from "@/lib/data/sync";

export function useAcrexDataRefresh(
  onChange?: (change: AcrexDataChange) => void,
  options?: { refreshSameTab?: boolean }
) {
  const router = useRouter();
  const refreshSameTab = options?.refreshSameTab ?? false;

  useEffect(
    () =>
      subscribeToDataChanges((change, delivery) => {
        onChange?.(change);
        if (delivery === "cross-tab" || refreshSameTab) {
          router.refresh();
        }
      }),
    [onChange, refreshSameTab, router]
  );
}
