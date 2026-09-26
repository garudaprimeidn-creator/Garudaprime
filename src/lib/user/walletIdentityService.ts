import { getPayHubAuthToken } from "../payhub/payHubApi";
import { isGenericInboundLabel } from "./inboundTransferResolver";
import { extractPartyLabelFromAddr } from "./txCounterpartyDisplay";
import { isWalletDisplayName, formatAddress } from "../web3/walletService";

const CACHE_PREFIX = "garuda_wallet_identity";
const memoryCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(address: string): string {
  return address.trim().toLowerCase();
}

function readLocalCache(address: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(`${CACHE_PREFIX}_${cacheKey(address)}`);
  } catch {
    return null;
  }
}

function writeLocalCache(address: string, name: string): void {
  memoryCache.set(cacheKey(address), name);
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`${CACHE_PREFIX}_${cacheKey(address)}`, name);
  } catch { /* quota */ }
}

export function peekWalletDisplayName(address: string): string | null {
  const key = cacheKey(address);
  return memoryCache.get(key) ?? readLocalCache(address);
}

async function fetchWalletDisplayNames(addresses: string[]): Promise<Record<string, string>> {
  const idToken = await getPayHubAuthToken();
  if (!idToken) return {};

  const res = await fetch("/api/wallet/resolve", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ addresses }),
  });

  if (!res.ok) return {};
  const data = (await res.json()) as { names?: Record<string, string> };
  return data.names ?? {};
}

export async function resolveWalletDisplayName(address: string): Promise<string | null> {
  const trimmed = address.trim();
  if (!trimmed || !/^0x[a-fA-F0-9]{40}$/i.test(trimmed)) return null;

  const cached = peekWalletDisplayName(trimmed);
  if (cached) return cached;

  const key = cacheKey(trimmed);
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const names = await fetchWalletDisplayNames([trimmed]);
      const resolved = names[key] ?? null;
      if (resolved) writeLocalCache(trimmed, resolved);
      return resolved;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

export async function prefetchWalletDisplayNames(addresses: string[]): Promise<void> {
  const missing = [...new Set(
    addresses
      .map((addr) => addr.trim())
      .filter((addr) => /^0x[a-fA-F0-9]{40}$/i.test(addr))
      .filter((addr) => !peekWalletDisplayName(addr)),
  )];
  if (!missing.length) return;

  const names = await fetchWalletDisplayNames(missing);
  for (const [addr, name] of Object.entries(names)) {
    if (name) writeLocalCache(addr, name);
  }
}

export async function formatCounterpartyLabel(
  addr?: string,
  counterpartyWallet?: string,
): Promise<string | null> {
  const addrText = addr?.trim() ?? "";
  if (counterpartyWallet) {
    const resolved = await resolveWalletDisplayName(counterpartyWallet);
    if (resolved) return resolved;
    return formatAddress(counterpartyWallet);
  }

  const fromAddr = extractPartyLabelFromAddr(addrText);
  if (fromAddr) return fromAddr;

  if (isHumanCounterpartyAddr(addrText)) return addrText;

  if (/^0x[a-fA-F0-9]{40}$/i.test(addrText)) {
    const resolved = await resolveWalletDisplayName(addrText);
    if (resolved) return resolved;
    return formatAddress(addrText);
  }

  return null;
}

function isHumanCounterpartyAddr(addr?: string): boolean {
  const text = addr?.trim() ?? "";
  return Boolean(text)
    && !isWalletDisplayName(text)
    && !isGenericInboundLabel(text);
}

export function extractCounterpartyWallet(tx: {
  addr?: string;
  counterpartyWallet?: string;
}): string | null {
  if (tx.counterpartyWallet && /^0x[a-fA-F0-9]{40}$/i.test(tx.counterpartyWallet)) {
    return tx.counterpartyWallet;
  }
  const addr = tx.addr?.trim() ?? "";
  if (/^0x[a-fA-F0-9]{40}$/i.test(addr)) return addr;
  return null;
}
