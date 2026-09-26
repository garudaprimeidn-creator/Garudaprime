import { formatUnits, isAddress, type Address } from "viem";
import { ERC20_ABI } from "./contracts/erc20Abi";
import { getPublicClient } from "./publicClient";
import {
  getBundledLogo,
  isPersistableLogoUrl,
  sanitizeStoredLogoUrl,
} from "../../app/tokenAssets";

const EXPLORER_API =
  import.meta.env.VITE_SIDRA_EXPLORER_API?.replace(/\/$/, "")
  || "https://ledger.sidrachain.com/api/v2";

export type CustomTokenRecord = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  balance: number;
  color: string;
  logoUrl?: string | null;
};

const STORAGE_KEY = "garuda_prime_custom_tokens";

const CUSTOM_COLORS = ["#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4"];

export const colorForToken = (symbol: string) =>
  CUSTOM_COLORS[Math.abs(symbol.charCodeAt(0)) % CUSTOM_COLORS.length];

const normalizeRecord = (t: CustomTokenRecord): CustomTokenRecord => ({
  ...t,
  logoUrl: sanitizeStoredLogoUrl(t.symbol, t.address, t.logoUrl),
});

export const loadCustomTokens = (): CustomTokenRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomTokenRecord[];
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed.map(normalizeRecord);
    const dirty = normalized.some((t, i) => t.logoUrl !== parsed[i]?.logoUrl);
    if (dirty) saveCustomTokens(normalized);
    return normalized;
  } catch {
    return [];
  }
};

export const saveCustomTokens = (tokens: CustomTokenRecord[]) => {
  try {
    const clean = tokens.map(normalizeRecord);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    /* private mode */
  }
};

const fetchExplorerIcon = async (address: Address): Promise<string | null> => {
  try {
    const res = await fetch(`${EXPLORER_API}/tokens/${address}`);
    if (!res.ok) return null;
    const data = await res.json() as { icon_url?: string | null };
    const icon = data.icon_url?.trim();
    return icon && icon.startsWith("https://") ? icon : null;
  } catch {
    return null;
  }
};

/** Returns only persistable external logo, bundled logos resolved at display time */
export const resolveTokenLogo = async (address: Address, symbol: string): Promise<string | null> => {
  if (getBundledLogo(symbol, address)) return null;
  const explorer = await fetchExplorerIcon(address);
  if (explorer && isPersistableLogoUrl(explorer)) return explorer;
  return null;
};

export const removeCustomTokenByAddress = (address: string) => {
  const lower = address.toLowerCase();
  const next = loadCustomTokens().filter((t) => t.address.toLowerCase() !== lower);
  saveCustomTokens(next);
  return next;
};

export const fetchCustomTokenMeta = async (address: string) => {
  if (!isAddress(address)) throw new Error("Invalid address");
  const client = getPublicClient();
  const addr = address as Address;

  const [symbol, name, decimals] = await Promise.all([
    client.readContract({ address: addr, abi: ERC20_ABI, functionName: "symbol" }),
    client.readContract({ address: addr, abi: ERC20_ABI, functionName: "name" }),
    client.readContract({ address: addr, abi: ERC20_ABI, functionName: "decimals" }),
  ]);

  const sym = String(symbol).trim().toUpperCase().slice(0, 12);
  if (!sym) throw new Error("Invalid token");

  const logoUrl = await resolveTokenLogo(addr, sym);

  return {
    address: addr,
    symbol: sym,
    name: String(name).trim() || sym,
    decimals: Number(decimals),
    color: colorForToken(sym),
    logoUrl,
  };
};

export const fetchCustomTokenBalance = async (
  address: Address,
  walletAddress: string,
  decimals: number,
): Promise<number> => {
  if (!isAddress(walletAddress)) return 0;
  const client = getPublicClient();
  const raw = await client.readContract({
    address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [walletAddress as Address],
  });
  const n = parseFloat(formatUnits(raw, decimals));
  return Number.isFinite(n) ? n : 0;
};

const DISPLAY_BALANCE_DECIMALS = 6;
const BALANCE_EPSILON = 1 / 10 ** DISPLAY_BALANCE_DECIMALS;

const roundDisplayBalance = (value: number): number =>
  Math.round(value * 10 ** DISPLAY_BALANCE_DECIMALS) / 10 ** DISPLAY_BALANCE_DECIMALS;

const shouldCommitCustomBalance = (prev: number, next: number): boolean =>
  next < prev - BALANCE_EPSILON || Math.abs(next - prev) >= BALANCE_EPSILON;

export const refreshCustomTokenBalances = async (
  tokens: CustomTokenRecord[],
  walletAddress: string,
): Promise<CustomTokenRecord[]> => {
  if (!tokens.length || !isAddress(walletAddress)) return tokens;
  return Promise.all(
    tokens.map(async (t) => {
      try {
        const raw = await fetchCustomTokenBalance(t.address, walletAddress, t.decimals);
        const balance = roundDisplayBalance(raw);
        if (!shouldCommitCustomBalance(t.balance, balance)) return t;
        return { ...t, balance };
      } catch {
        return t;
      }
    }),
  );
};
