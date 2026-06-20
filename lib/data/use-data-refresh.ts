"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeToDataChanges, type AcrexDataChange } from "@/lib/data/sync";

export function useAcrexDataRefresh(onChange?: (change: AcrexDataChange) => void) {
  const router = useRouter();

  useEffect(
    () =>
      subscribeToDataChanges((change) => {
        onChange?.(change);
        router.refresh();
      }),
    [onChange, router]
  );
}
