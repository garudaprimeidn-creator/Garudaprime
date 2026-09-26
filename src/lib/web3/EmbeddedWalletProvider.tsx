import React from "react";
import { GarudaWalletBridge } from "../../features/auth/GarudaWalletBridge";
import {
  isEmbeddedWalletDemoMode,
  isGarudaNativeWalletClientEnabled,
} from "./embeddedWalletConfig";

type Props = { children: React.ReactNode };

/** Garuda Native Embedded Wallet, server signing via GarudaWalletBridge. */
export function EmbeddedWalletProvider({ children }: Props) {
  const garudaNative = isGarudaNativeWalletClientEnabled();

  if (!garudaNative && !isEmbeddedWalletDemoMode()) {
    return <>{children}</>;
  }

  return (
    <>
      {garudaNative && <GarudaWalletBridge />}
      {children}
    </>
  );
}
