import type { Tx } from "../../app/appTypes";
import { getGatMarketPriceUsd, tokenToUsd } from "../../app/tokenEconomy";
import { parseTxTokenAmount } from "./inboundTransferResolver";
import { extractReceiptCode } from "./transactionDedup";

/** Pay Hub merchant settlement, GAT-native, no USD estimate. */
export function isMerchantPayHubReceive(
  tx: Pick<Tx, "type" | "receiptCode" | "addr">,
): boolean {
  return (tx.type ?? "").trim().toLowerCase() === "receive"
    && Boolean(extractReceiptCode(tx));
}

/** Pay Hub QR payment (merchant pay or receive). */
export function isMerchantPayHubTx(
  tx: Pick<Tx, "type" | "receiptCode" | "addr">,
): boolean {
  const kind = (tx.type ?? "").trim().toLowerCase();
  return (kind === "pay" || kind === "receive") && Boolean(extractReceiptCode(tx));
}

/** Human-readable tx time (handles ISO strings from Firestore). */
export function formatTxDisplayTime(raw: string, locale = "id"): string {
  const text = raw?.trim() ?? "";
  if (!text) return ", ";
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  const diffMs = Date.now() - date.getTime();
  if (diffMs >= 0 && diffMs < 60_000) {
    return locale === "id" ? "Baru saja" : "Just now";
  }
  return date.toLocaleString(locale === "id" ? "id-ID" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** USD label for tx rows, uses stored value when GAT is not listed on market. */
export function formatTxUsdDisplay(
  tx: Pick<Tx, "amount" | "usd" | "type" | "receiptCode" | "addr">,
): string {
  if (isMerchantPayHubReceive(tx)) return "";

  const amountText = tx.amount?.trim() ?? "";
  const parsed = parseTxTokenAmount(amountText);
  if (!parsed) {
    const stored = tx.usd?.trim() ?? "";
    if (!stored || stored === "+$0.00" || stored === "-$0.00" || stored === "$0.00") return "";
    return stored;
  }
  if (parsed.symbol === "GAT" && getGatMarketPriceUsd() === 0) {
    const stored = tx.usd?.trim() ?? "";
    if (!stored || stored === "+$0.00" || stored === "-$0.00" || stored === "$0.00") return "";
    return stored;
  }
  const usd = tokenToUsd(Math.abs(parsed.value), parsed.symbol);
  if (!Number.isFinite(usd) || usd <= 0) return "";
  const negative = parsed.value < 0 || amountText.startsWith("-");
  const prefix = negative ? "-$" : "+$";
  return `${prefix}${usd.toFixed(2)}`;
}
