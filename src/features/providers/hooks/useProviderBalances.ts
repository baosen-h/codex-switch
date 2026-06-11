import { useEffect, useState } from "react";
import { appApi } from "../../../api/tauri";
import type { ApiProvider } from "../../../types";
import { loadBalanceMap, saveBalanceMap, type ProviderBalanceState } from "../balanceStorage";

export function useProviderBalances() {
  const [balanceMap, setBalanceMap] = useState<Record<string, ProviderBalanceState>>(loadBalanceMap);
  const [loadingBalanceId, setLoadingBalanceId] = useState<string | null>(null);

  useEffect(() => {
    try {
      saveBalanceMap(balanceMap);
    } catch {
      // Balance cache is best-effort UI state.
    }
  }, [balanceMap]);

  const refreshBalance = async (provider: ApiProvider) => {
    setLoadingBalanceId(provider.id);
    try {
      const balance = await appApi.getProviderBalance(provider);
      setBalanceMap((current) => ({ ...current, [provider.id]: balance }));
    } catch (error) {
      setBalanceMap((current) => ({
        ...current,
        [provider.id]: { error: error instanceof Error ? error.message : String(error) },
      }));
    } finally {
      setLoadingBalanceId((current) => (current === provider.id ? null : current));
    }
  };

  return {
    balanceMap,
    loadingBalanceId,
    refreshBalance,
  };
}
