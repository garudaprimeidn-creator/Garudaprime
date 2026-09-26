import { useEffect, useState } from "react";
import type { Tx } from "../app/AppContext";
import { useLanguage } from "../app/LanguageContext";
import {
  extractCounterpartyWallet,
  formatCounterpartyLabel,
  peekWalletDisplayName,
} from "../lib/user/walletIdentityService";
import { isGenericInboundLabel } from "../lib/user/inboundTransferResolver";
import { formatAddress, isWalletDisplayName } from "../lib/web3/walletService";
import {
  extractPartyLabelFromAddr,
  resolveTxCounterpartyFallback,
} from "../lib/user/txCounterpartyDisplay";

function isHumanCounterpartyAddr(addr?: string): boolean {
  const text = addr?.trim() ?? "";
  return Boolean(text)
    && !isWalletDisplayName(text)
    && !isGenericInboundLabel(text);
}

export function useTxCounterpartyLabel(tx: Tx): string {
  const { t } = useLanguage();
  const inboundLabel = t.modals.txInboundTransfer ?? "Transfer masuk";
  const merchantLabel = t.modals.txMerchantPayment ?? "Pembayaran merchant";
  const wallet = extractCounterpartyWallet(tx);
  const addr = tx.addr?.trim() ?? "";
  const cached = wallet ? peekWalletDisplayName(wallet) : null;
  const walletFallback = wallet ? formatAddress(wallet) : null;
  const addrFallback = resolveTxCounterpartyFallback(addr, {
    inboundLabel,
    merchantPaymentLabel: merchantLabel,
  });
  const initial = cached
    ?? extractPartyLabelFromAddr(addr)
    ?? (isHumanCounterpartyAddr(addr) ? addr : null)
    ?? walletFallback
    ?? addrFallback;
  const [label, setLabel] = useState(initial);

  useEffect(() => {
    if (isHumanCounterpartyAddr(addr) && !wallet) {
      setLabel(addr);
      return;
    }

    const nextCached = wallet ? peekWalletDisplayName(wallet) : null;
    if (nextCached) {
      setLabel(nextCached);
      return;
    }

    let cancelled = false;
    void formatCounterpartyLabel(addr, tx.counterpartyWallet).then((resolved) => {
      if (cancelled) return;
      if (resolved) {
        setLabel(resolved);
        return;
      }
      if (wallet) {
        setLabel(formatAddress(wallet));
        return;
      }
      setLabel(
        extractPartyLabelFromAddr(addr)
          ?? resolveTxCounterpartyFallback(addr, {
            inboundLabel,
            merchantPaymentLabel: merchantLabel,
          }),
      );
    });
    return () => { cancelled = true; };
  }, [tx.id, addr, tx.counterpartyWallet, wallet, inboundLabel, merchantLabel]);

  return label;
}
