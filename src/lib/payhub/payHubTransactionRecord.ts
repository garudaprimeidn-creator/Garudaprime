import { tokenToUsd } from "../../app/tokenEconomy";

export type PayHubActivityDraft = {
  type: string;
  amount: string;
  addr: string;
  time: string;
  usd: string;
  status: string;
  txHash?: string;
};

export const buildPayHubDepositActivity = (
  creditedGat: number,
  txHash: string,
  time: string,
  status: string,
): PayHubActivityDraft => ({
  type: "deposit",
  amount: `+${creditedGat} GAT`,
  addr: `Pay Hub · ${txHash.slice(0, 8)}…${txHash.slice(-6)}`,
  time,
  usd: `$${tokenToUsd(creditedGat, "GAT").toFixed(2)}`,
  status,
  txHash,
});

export const buildPayHubP2pSendActivity = (
  amountGat: number,
  recipientAddress: string,
  time: string,
  status: string,
  transferId?: string,
): PayHubActivityDraft => ({
  type: "send",
  amount: `-${amountGat} GAT`,
  addr: `P2P · ${recipientAddress.slice(0, 8)}…${recipientAddress.slice(-4)}`,
  time,
  usd: `-$${tokenToUsd(amountGat, "GAT").toFixed(2)}`,
  status,
  txHash: transferId,
});

export const buildPayHubWithdrawActivity = (
  amountGat: number,
  walletAddress: string,
  time: string,
  status: string,
  txHash?: string,
): PayHubActivityDraft => ({
  type: "withdraw",
  amount: `-${amountGat} GAT`,
  addr: `Dompet · ${walletAddress.slice(0, 8)}…${walletAddress.slice(-4)}`,
  time,
  usd: `-$${tokenToUsd(amountGat, "GAT").toFixed(2)}`,
  status,
  txHash,
});
