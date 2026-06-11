import type { ProviderBalance } from "../../types";

export type ProviderBalanceState = ProviderBalance | { error: string };

const BALANCE_STORAGE_KEY = "codex-switch-provider-balance-v1";

export function loadBalanceMap(): Record<string, ProviderBalanceState> {
  try {
    const parsed = JSON.parse(localStorage.getItem(BALANCE_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveBalanceMap(balanceMap: Record<string, ProviderBalanceState>): void {
  localStorage.setItem(BALANCE_STORAGE_KEY, JSON.stringify(balanceMap));
}
