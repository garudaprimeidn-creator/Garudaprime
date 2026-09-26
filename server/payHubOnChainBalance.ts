/**
 * On-chain balance checks for Pay Hub write cutover (Fase 3).
 */
import { getOnChainGatBalance } from "./chainBalanceService.js";
import {
  derivedGarudaWalletAddress,
  isUserConnectedWalletAddress,
  isUserGarudaLinkedAddress,
  isUserPhraseWalletAddress,
  listUserWalletAddresses,
  resolveGarudaWalletRecord,
} from "./garudaWalletCore.js";
import { resolveUidFromWalletAddress } from "./walletIdentityCore.js";
import { getAddress } from "viem";
import { getPayHubGatAllowance } from "./payHubApprovalCore.js";
import { ensureGarudaPaymentContractApproval } from "./garudaPayHubDirectDebit.js";
import { isPayHubOnChainConfigured } from "./payHubLedgerMode.js";

const ALLOWANCE_CACHE_MS = 45_000;
const allowanceCache = new Map<string, { sufficient: boolean; at: number }>();

function cachedAllowanceSufficient(walletAddress: string): boolean | null {
  const hit = allowanceCache.get(walletAddress.toLowerCase());
  if (!hit) return null;
  if (Date.now() - hit.at > ALLOWANCE_CACHE_MS) {
    allowanceCache.delete(walletAddress.toLowerCase());
    return null;
  }
  return hit.sufficient;
}

function rememberAllowance(walletAddress: string, sufficient: boolean) {
  allowanceCache.set(walletAddress.toLowerCase(), { sufficient, at: Date.now() });
}

async function assertAllowanceForWallet(
  uid: string,
  walletAddress: string,
  options?: { deferApproval?: boolean },
): Promise<void> {
  const cached = cachedAllowanceSufficient(walletAddress);
  if (cached === true || options?.deferApproval) return;

  let allowance = await getPayHubGatAllowance(walletAddress).catch(() => null);
  if (isPayHubOnChainConfigured()) {
    if (!allowance?.sufficient) {
      const autoApprove = await ensureGarudaPaymentContractApproval(uid).catch(() => ({ approved: false }));
      if (autoApprove.approved) {
        allowance = await getPayHubGatAllowance(walletAddress).catch(() => null);
      }
    }
    if (!allowance?.sufficient) {
      throw new Error("GAT approval required, open Dompet to approve Pay Hub");
    }
    rememberAllowance(walletAddress, true);
  }
}

async function balanceAt(address: string): Promise<number> {
  return getOnChainGatBalance(address).catch((err) => {
    throw new Error(`Sidra RPC error, coba lagi: ${err instanceof Error ? err.message : String(err)}`);
  });
}

function addressVariants(raw?: string): string[] {
  const trimmed = raw?.trim();
  if (!trimmed?.startsWith("0x")) return [];
  const out = new Set<string>([trimmed.toLowerCase()]);
  try {
    out.add(getAddress(trimmed).toLowerCase());
  } catch {
    /* keep lowercase */
  }
  return [...out];
}

async function isOwnedSpendAddress(uid: string, address: string): Promise<boolean> {
  if (await isUserConnectedWalletAddress(uid, address)) return true;
  const owner = await resolveUidFromWalletAddress(address).catch(() => null);
  return owner === uid;
}

/** Cari alamat dompet uid yang punya cukup GAT on-chain, prioritaskan hint klien. */
async function resolveSpendablePayerWallet(
  uid: string,
  grossAmountGat: number,
  payerAddressHint?: string,
): Promise<{ walletAddress: string; gatBalance: number } | null> {
  const candidates: string[] = [];

  for (const variant of addressVariants(payerAddressHint)) {
    if (!candidates.includes(variant)) candidates.push(variant);
  }

  for (const addr of await listUserWalletAddresses(uid)) {
    if (!candidates.includes(addr)) candidates.push(addr);
  }

  for (const addr of candidates) {
    if (!addr.startsWith("0x")) continue;
    const owned = await isOwnedSpendAddress(uid, addr);
    if (!owned) continue;
    const bal = await balanceAt(addr);
    if (bal + 1e-9 >= grossAmountGat) {
      return { walletAddress: addr, gatBalance: bal };
    }
  }

  return null;
}

export async function assertOnChainPayHubSpendable(
  uid: string,
  grossAmountGat: number,
  payerAddressHint?: string,
  options?: { deferApproval?: boolean },
): Promise<{ walletAddress: string; gatBalance: number }> {
  if (!Number.isFinite(grossAmountGat) || grossAmountGat <= 0) {
    throw new Error("Invalid amount");
  }

  const spendable = await resolveSpendablePayerWallet(uid, grossAmountGat, payerAddressHint);
  if (spendable) {
    await assertAllowanceForWallet(uid, spendable.walletAddress, options);
    return spendable;
  }

  const hinted = payerAddressHint?.trim().toLowerCase();
  if (hinted?.startsWith("0x") && await isUserPhraseWalletAddress(uid, hinted)) {
    throw new Error("Insufficient GAT balance");
  }

  const garudaRecord = await resolveGarudaWalletRecord(uid, hinted);
  const walletAddress = garudaRecord?.walletAddress ?? derivedGarudaWalletAddress(uid);
  if (!walletAddress) {
    throw new Error("Garuda Wallet not linked, connect wallet in Dompet");
  }

  const gatBalance = await balanceAt(walletAddress);
  if (gatBalance + 1e-9 < grossAmountGat) {
    if (hinted && hinted !== walletAddress.toLowerCase()) {
      const hintBal = await getOnChainGatBalance(hinted).catch(() => 0);
      if (hintBal + 1e-9 >= grossAmountGat && await isUserGarudaLinkedAddress(uid, hinted)) {
        if (!isPayHubOnChainConfigured()) {
          return { walletAddress: hinted, gatBalance: hintBal };
        }
        throw new Error(
          "Saldo GAT ada di dompet lama, buka Dompet, tunggu sinkronisasi Garuda Prime, lalu coba lagi",
        );
      }
    }
    throw new Error("Insufficient GAT balance");
  }

  await assertAllowanceForWallet(uid, walletAddress, options);
  return { walletAddress, gatBalance };
}
