import type { Tx } from "../../app/appTypes";
import { tokenToUsd } from "../../app/tokenEconomy";
import { formatAddress } from "../web3/walletService";
import { fetchNewChainInboundEvents } from "./inboundChainSync";
import { peekInboundTransfers } from "./inboundTransferDetector";
import { enrichInboundTransfers } from "./inboundTransferResolver";
import { hasMatchingTransaction } from "./transactionDedup";
import { resolveWalletDisplayName } from "./walletIdentityService";

export type InboundReceiveDraft = Omit<Tx, "id">;

const buildReceiveDraft = async (
  symbol: "GAT" | "SDA",
  amount: number,
  fromAddress?: string,
  txHash?: string,
): Promise<InboundReceiveDraft> => {
  let addr = "Transfer masuk";
  if (fromAddress) {
    const name = await resolveWalletDisplayName(fromAddress);
    addr = name ?? formatAddress(fromAddress);
  }

  return {
    type: "receive",
    amount: `+${amount.toFixed(symbol === "GAT" ? 4 : 6)} ${symbol}`,
    addr,
    counterpartyWallet: fromAddress,
    time: new Date().toISOString(),
    usd: `+$${tokenToUsd(amount, symbol).toFixed(2)}`,
    status: "Terkonfirmasi",
    txHash,
  };
};

/** Discover inbound GAT/SDA from on-chain logs (primary, has txHash). */
export async function discoverChainInboundReceives(
  walletAddress: string,
  existing: Tx[],
): Promise<InboundReceiveDraft[]> {
  const events = await fetchNewChainInboundEvents(walletAddress, existing);
  const drafts: InboundReceiveDraft[] = [];

  for (const event of events) {
    const draft = await buildReceiveDraft(
      event.symbol,
      event.amount,
      event.fromAddress,
      event.txHash,
    );
    if (hasMatchingTransaction(existing, draft)) continue;
    if (drafts.some((row) => hasMatchingTransaction([{ id: 0, ...row }], draft))) continue;
    drafts.push(draft);
  }

  return drafts;
}

/** Fallback when balance increased but log scan missed (e.g. RPC lag). */
export async function discoverBalanceInboundReceives(
  walletAddress: string,
  gat: number,
  sda: number,
  existing: Tx[],
): Promise<InboundReceiveDraft[]> {
  const deltas = peekInboundTransfers(walletAddress, gat, sda);
  if (!deltas.length) return [];

  const enriched = await enrichInboundTransfers(walletAddress, deltas);
  const drafts: InboundReceiveDraft[] = [];

  for (const inbound of enriched) {
    const draft = await buildReceiveDraft(
      inbound.symbol,
      inbound.amount,
      inbound.fromAddress,
      inbound.txHash,
    );
    if (hasMatchingTransaction(existing, draft)) continue;
    if (drafts.some((row) => hasMatchingTransaction([{ id: 0, ...row }], draft))) continue;
    drafts.push(draft);
  }

  return drafts;
}

export async function discoverInboundReceiveDrafts(
  walletAddress: string,
  existing: Tx[],
  balances?: { gat: number; sda: number },
): Promise<InboundReceiveDraft[]> {
  const chainDrafts = await discoverChainInboundReceives(walletAddress, existing);
  const merged = [...chainDrafts];

  if (balances) {
    const balanceDrafts = await discoverBalanceInboundReceives(
      walletAddress,
      balances.gat,
      balances.sda,
      [...existing, ...merged.map((row) => ({ id: 0, ...row }))],
    );
    for (const draft of balanceDrafts) {
      if (merged.some((row) => hasMatchingTransaction([{ id: 0, ...row }], draft))) continue;
      merged.push(draft);
    }
  }

  return merged;
}
