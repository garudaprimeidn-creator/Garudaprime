import { INVESTMENT_FUNDS, type InvestmentFund } from "../../app/investData";

export type InvestmentFundsResponse = {
  funds: InvestmentFund[];
  round?: string | null;
  source?: string;
  updatedAt?: string | null;
};

function apiBase(): string | null {
  const base = import.meta.env.VITE_PAY_HUB_API_URL?.replace(/\/$/, "");
  return base || null;
}

function catalogFallback(): InvestmentFund[] {
  return INVESTMENT_FUNDS.map((f) => ({ ...f }));
}

export async function fetchInvestmentFunds(): Promise<InvestmentFund[]> {
  const base = apiBase();
  if (!base) return catalogFallback();

  try {
    const res = await fetch(`${base}/investment/funds`, { method: "GET" });
    if (!res.ok) return catalogFallback();
    const data = (await res.json()) as InvestmentFundsResponse;
    if (Array.isArray(data.funds) && data.funds.length > 0) return data.funds;
    return catalogFallback();
  } catch {
    return catalogFallback();
  }
}

/** Catat investasi ke slot fund (Firestore), dipanggil setelah investasi sukses */
export async function recordFundDeposit(
  fundId: number,
  amountUsd: number,
  idToken: string | null,
  refId: string,
  txHash?: string,
  amountGat?: number,
): Promise<void> {
  const base = apiBase();
  if (!base || !idToken || amountUsd <= 0 || !refId) return;

  try {
    const res = await fetch(`${base}/investment/record-deposit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        fundId,
        amountUsd,
        refId,
        ...(txHash ? { txHash, amountGat: amountGat ?? amountUsd } : {}),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn("[recordFundDeposit]", data.error ?? res.status);
    }
  } catch (err) {
    console.warn("[recordFundDeposit]", err);
  }
}
