import { isGenericInboundLabel } from "./inboundTransferResolver";
import { isWalletDisplayName } from "../web3/walletService";

/** Pull a human label from addr when counterparty wallet is missing (e.g. "Nama · GP-…"). */
export function extractPartyLabelFromAddr(addr?: string): string | null {
  const text = addr?.trim() ?? "";
  if (!text || isGenericInboundLabel(text)) return null;

  if (text.includes("·")) {
    const head = text.split("·")[0]?.trim() ?? "";
    if (head && !/^garuda pay$/i.test(head) && !isGenericInboundLabel(head)) {
      return head;
    }
    const tail = text.split("·").slice(1).join("·").trim();
    if (/^GP-/i.test(tail)) return null;
  }

  if (/^0x[a-fA-F0-9]{40}$/i.test(text)) return null;
  if (/^0x[a-fA-F0-9]{4,8}…[a-fA-F0-9]{4}$/i.test(text)) return text;
  if (!/^garuda pay/i.test(text) && !isWalletDisplayName(text)) return text;

  return null;
}

export function isMeaningfulTxField(value?: string | null): boolean {
  const text = value?.trim() ?? "";
  return Boolean(text) && text !== "·" && text !== ", " && text !== "-";
}

export function resolveTxCounterpartyFallback(
  addr: string | undefined,
  options: {
    inboundLabel: string;
    merchantPaymentLabel?: string;
    externalTransferLabel?: string;
  },
): string {
  const fromAddr = extractPartyLabelFromAddr(addr);
  if (fromAddr) return fromAddr;

  const raw = addr?.trim() ?? "";
  if (isGenericInboundLabel(raw)) return options.inboundLabel;
  if (/^garuda pay/i.test(raw)) return options.externalTransferLabel ?? options.inboundLabel;
  if (/GP-/i.test(raw)) return options.merchantPaymentLabel ?? options.inboundLabel;

  return options.inboundLabel;
}
