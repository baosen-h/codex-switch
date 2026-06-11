import type { ApiProvider, ProviderBalance } from "../../../types";
import { RefreshIcon as SemiRefreshIcon } from "../../../components/ui";
import type { ProviderBalanceState } from "../balanceStorage";

interface ProviderBalancePanelProps {
  provider: ApiProvider;
  balance?: ProviderBalanceState;
  loadingBalanceId: string | null;
  onRefreshBalance: (provider: ApiProvider) => void;
}

function balanceText(balance?: ProviderBalanceState) {
  if (!balance) return "--";
  if ("error" in balance) return "—";
  if (typeof balance.creditsBalance === "number") {
    return `${balance.creditsBalance.toFixed(2)} USD`;
  }
  if (balance.remaining !== undefined) {
    return `${balance.remaining.toFixed(balance.unit === "%" ? 0 : 2)} ${balance.unit}`;
  }
  return balance.strategy;
}

function balanceTitle(balance?: ProviderBalanceState) {
  if (!balance) return "Refresh balance";
  if ("error" in balance) return balance.error;
  return `${balance.label} · ${balance.strategy}`;
}

function quotaTone(value?: number) {
  if (value === undefined) return "";
  if (value >= 50) return "green";
  if (value >= 20) return "orange";
  return "red";
}

function QuotaCard({
  label,
  value,
  reset,
  variant = "five-hour",
}: {
  label: string;
  value?: number;
  reset?: string;
  variant?: "five-hour" | "weekly";
}) {
  const tone = quotaTone(value);
  const height = Math.max(8, Math.min(100, value ?? 0));
  return (
    <div className={`quota-mini-card quota-mini-card-${variant}`}>
      <div className={`quota-mini-bg ${tone}`} style={{ height: `${height}%` }} />
      <div className="quota-mini-content">
        <span className="quota-label">{label}</span>
        <span className="quota-time">{reset || "--"}</span>
        <strong className={`quota-percent ${tone}`}>{value ?? "--"}%</strong>
      </div>
    </div>
  );
}

function isQuotaBalance(balance?: ProviderBalanceState): balance is ProviderBalance {
  return Boolean(
    balance &&
      !("error" in balance) &&
      (balance.fiveHourLeft !== undefined || balance.weeklyLeft !== undefined),
  );
}

export function ProviderBalancePanel({
  provider,
  balance,
  loadingBalanceId,
  onRefreshBalance,
}: ProviderBalancePanelProps) {
  const quotaBalance = isQuotaBalance(balance) ? balance : null;
  const openAiQuota = provider.providerType === "openai_oauth";
  const title = balanceTitle(balance);

  return (
    <div className={`provider-balance-panel ${openAiQuota ? "provider-balance-panel-quota" : ""}`} title={title}>
      {openAiQuota ? (
        <>
          <button
            className="icon-button balance-refresh-button"
            disabled={loadingBalanceId === provider.id}
            onClick={() => onRefreshBalance(provider)}
            type="button"
            title={title}
          >
            <SemiRefreshIcon />
          </button>
          {quotaBalance ? (
            <div className="provider-quota-grid">
              <QuotaCard label="5H quota" value={quotaBalance.fiveHourLeft} reset={quotaBalance.fiveHourReset} variant="five-hour" />
              <QuotaCard label="Weekly" value={quotaBalance.weeklyLeft} reset={quotaBalance.weeklyReset} variant="weekly" />
            </div>
          ) : null}
        </>
      ) : (
        <div className="provider-balance-row">
          <strong className={`provider-balance-value ${balance && "error" in balance ? "provider-balance-error" : ""}`}>
            {loadingBalanceId === provider.id ? "..." : balanceText(balance)}
          </strong>
          <button
            className="icon-button balance-refresh-button"
            disabled={loadingBalanceId === provider.id}
            onClick={() => onRefreshBalance(provider)}
            type="button"
            title={title}
          >
            <SemiRefreshIcon />
          </button>
        </div>
      )}
    </div>
  );
}
