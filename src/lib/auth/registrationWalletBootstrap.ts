import type { ConnectedWallet } from "../web3/walletService";
import { isPhraseWalletProvider } from "../web3/walletService";
import { normalizeWalletAddress } from "../web3/connectedWalletUtils";
import { fetchExistingGarudaWalletAddress } from "../web3/garudaNativeProvision";
import {
  markRegistrationWalletLinked,
  readRegistrationWallet,
} from "./accountSetup";

export type RegistrationWalletMode = "otp" | "external";

export type RegistrationWalletBootstrap = {
  address: string;
  mode: RegistrationWalletMode;
  isGarudaPrime: boolean;
};

const isEthAddress = (value?: string | null): value is string =>
  Boolean(value?.trim().startsWith("0x") && /^0x[a-fA-F0-9]{40}$/.test(value.trim()));

function inferRegistrationWalletMode(provider?: string | null): RegistrationWalletMode {
  const p = provider?.trim().toLowerCase() ?? "";
  if (!p) return "otp";
  if (p.includes("embedded") || p.includes("garuda")) return "otp";
  if (isPhraseWalletProvider(provider)) return "external";
  return "external";
}

function isGarudaPrimeProvider(provider?: string | null): boolean {
  const p = provider?.trim().toLowerCase() ?? "";
  return p.includes("embedded") || p.includes("garuda");
}

function normalizeEthAddress(value: string): string | null {
  try {
    return normalizeWalletAddress(value.trim());
  } catch {
    return isEthAddress(value) ? value.trim() : null;
  }
}

/** True when the account already has a Garuda Prime built-in (native) wallet on server. */
export async function probeGarudaPrimeWallet(uid: string | undefined): Promise<boolean> {
  if (!uid) return false;
  try {
    const addr = await fetchExistingGarudaWalletAddress(uid);
    return isEthAddress(addr);
  } catch {
    return false;
  }
}

/**
 * Resolve an already-linked wallet during registration setup.
 * Garuda Prime built-in wallet always takes priority over external wallets.
 */
export async function bootstrapRegistrationWallet(
  uid: string | undefined,
  profile: { walletAddress?: string | null } | null,
  connectedWallet: ConnectedWallet | null,
): Promise<RegistrationWalletBootstrap | null> {
  if (uid) {
    try {
      const garudaAddr = await fetchExistingGarudaWalletAddress(uid);
      if (isEthAddress(garudaAddr)) {
        const address = normalizeEthAddress(garudaAddr) ?? garudaAddr;
        markRegistrationWalletLinked(address);
        return { address, mode: "otp", isGarudaPrime: true };
      }
    } catch {
      /* fall through */
    }
  }

  const explicit = readRegistrationWallet()?.trim();
  if (isEthAddress(explicit)) {
    const address = normalizeEthAddress(explicit) ?? explicit;
    const garuda = isGarudaPrimeProvider(connectedWallet?.provider);
    return {
      address,
      mode: garuda ? "otp" : inferRegistrationWalletMode(connectedWallet?.provider),
      isGarudaPrime: garuda,
    };
  }

  const profileAddr = profile?.walletAddress?.trim();
  if (isEthAddress(profileAddr)) {
    const address = normalizeEthAddress(profileAddr) ?? profileAddr;
    const garuda = isGarudaPrimeProvider(connectedWallet?.provider);
    if (garuda) {
      markRegistrationWalletLinked(address);
      return { address, mode: "otp", isGarudaPrime: true };
    }
  }

  const sessionAddr = connectedWallet?.address?.trim();
  if (isEthAddress(sessionAddr)) {
    const address = normalizeEthAddress(sessionAddr) ?? sessionAddr;
    if (isGarudaPrimeProvider(connectedWallet?.provider)) {
      markRegistrationWalletLinked(address);
      return { address, mode: "otp", isGarudaPrime: true };
    }
  }

  if (isEthAddress(profileAddr)) {
    const address = normalizeEthAddress(profileAddr) ?? profileAddr;
    markRegistrationWalletLinked(address);
    return {
      address,
      mode: inferRegistrationWalletMode(connectedWallet?.provider),
      isGarudaPrime: false,
    };
  }

  if (isEthAddress(sessionAddr)) {
    const address = normalizeEthAddress(sessionAddr) ?? sessionAddr;
    markRegistrationWalletLinked(address);
    return {
      address,
      mode: inferRegistrationWalletMode(connectedWallet?.provider),
      isGarudaPrime: false,
    };
  }

  return null;
}
