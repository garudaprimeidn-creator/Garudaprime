import gatLogo from "../assets/tokens/gat.png";
import sidraLogo from "../assets/tokens/sidra.png";
import ethLogo from "../assets/tokens/eth.png";
import usdtLogo from "../assets/tokens/usdt.png";
import usdxLogo from "../assets/tokens/usdx.svg";

/** GAT Garuda emblem merah putih, PNG transparan, mengikuti background halaman */
export const getGatLogo = (_isDark?: boolean): string => gatLogo;

export const TOKEN_LOGOS: Record<string, string> = {
  GAT: gatLogo,
  SDA: sidraLogo,
  ETH: ethLogo,
  USDT: usdtLogo,
  USDX: usdxLogo,
};

const rawGat = import.meta.env.VITE_GAT_TOKEN_ADDRESS?.trim()?.toLowerCase();
const rawUsdx = import.meta.env.VITE_USDX_TOKEN_ADDRESS?.trim()?.toLowerCase();

/** Bundled logos keyed by contract address (lowercase) */
export const ADDRESS_LOGOS: Record<string, string> = {
  ...(rawGat ? { [rawGat]: gatLogo } : {}),
  ...(rawUsdx ? { [rawUsdx]: usdxLogo } : {}),
};

const STALE_VITE_ASSET = /^\/assets\//;
const TRUST_WALLET_HOST = "assets-cdn.trustwalletapp.com";

export const getBundledLogoForAddress = (address: string) =>
  ADDRESS_LOGOS[address.toLowerCase()];

export const getBundledLogoForSymbol = (symbol: string, isDark = true) => {
  const key = symbol.toUpperCase();
  if (key === "GAT") return getGatLogo(isDark);
  return TOKEN_LOGOS[key];
};

export const getBundledLogo = (symbol: string, address?: string, isDark = true) =>
  (address ? getBundledLogoForAddress(address) : undefined)
  ?? getBundledLogoForSymbol(symbol, isDark);

/** External URLs safe to persist (verified https, not stale vite paths) */
export const isPersistableLogoUrl = (url?: string | null): url is string => {
  if (!url || typeof url !== "string") return false;
  if (STALE_VITE_ASSET.test(url)) return false;
  if (url.startsWith("data:image/")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.hostname.includes(TRUST_WALLET_HOST);
  } catch {
    return false;
  }
};

/** Runtime logo for UI, bundled always wins over stored URLs */
export const resolveDisplayLogo = (
  symbol: string,
  address?: string,
  storedUrl?: string | null,
  isDark = true,
): string | undefined => {
  const bundled = getBundledLogo(symbol, address, isDark);
  if (bundled) return bundled;
  if (isPersistableLogoUrl(storedUrl)) return storedUrl;
  if (storedUrl?.startsWith("https://")) return storedUrl;
  return undefined;
};

/** Logo candidates for img fallback (bundled → stored https → trust wallet probe) */
export const getLogoCandidates = (
  symbol: string,
  address?: string,
  storedUrl?: string | null,
  isDark = true,
): string[] => {
  const seen = new Set<string>();
  const add = (url?: string | null) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };
  const out: string[] = [];
  add(getBundledLogo(symbol, address, isDark));
  if (isPersistableLogoUrl(storedUrl)) add(storedUrl);
  else if (storedUrl && !STALE_VITE_ASSET.test(storedUrl)) add(storedUrl);
  if (address) {
    add(`https://assets-cdn.trustwalletapp.com/blockchains/sidrachain/assets/${address}/logo.png`);
    add(`https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/sidrachain/assets/${address}/logo.png`);
  }
  return out;
};

export const getTokenLogo = (symbol: string, address?: string, logoUrl?: string) =>
  resolveDisplayLogo(symbol, address, logoUrl);

export const sanitizeStoredLogoUrl = (
  symbol: string,
  address: string,
  storedUrl?: string | null,
): string | null => {
  if (getBundledLogo(symbol, address)) return null;
  if (isPersistableLogoUrl(storedUrl)) return storedUrl;
  return null;
};
