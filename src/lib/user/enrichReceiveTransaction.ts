import type { Tx } from "../../app/appTypes";
import { formatAddress } from "../web3/walletService";
import { isGenericInboundLabel, parseTxTokenAmount, resolveInboundTransferSource } from "./inboundTransferResolver";
import { resolveWalletDisplayName } from "./walletIdentityService";

export function receiveNeedsEnrichment(tx: Tx): boolean {
  if ((tx.type ?? "send").toLowerCase() !== "receive") return false;
  const parsed = parseTxTokenAmount(tx.amount);
  if (!parsed) return false;
  if (!tx.txHash?.trim()) return true;
  if (!tx.counterpartyWallet?.trim()) return true;
  if (isGenericInboundLabel(tx.addr)) return true;
  return false;
}

export async function enrichReceiveTransaction(
  walletAddress: string,
  tx: Tx,
): Promise<Partial<Tx> | null> {
  const parsed = parseTxTokenAmount(tx.amount);
  if (!parsed) return null;

  const source = await resolveInboundTransferSource(walletAddress, {
    symbol: parsed.symbol,
    amount: parsed.value,
    usd: tx.usd,
  });

  if (!source.fromAddress && !source.txHash) return null;

  const patch: Partial<Tx> = {};
  if (source.txHash && !tx.txHash?.trim()) patch.txHash = source.txHash;
  if (source.fromAddress && !tx.counterpartyWallet?.trim()) {
    patch.counterpartyWallet = source.fromAddress;
  }

  if (source.fromAddress && (isGenericInboundLabel(tx.addr) || !tx.addr?.trim())) {
    const name = await resolveWalletDisplayName(source.fromAddress);
    patch.addr = name ?? formatAddress(source.fromAddress);
  }

  return Object.keys(patch).length ? patch : null;
}
