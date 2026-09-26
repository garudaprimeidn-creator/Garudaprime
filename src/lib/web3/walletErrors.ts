/** Map wallet connection errors to i18n toast keys */

export const walletErrorKey = (err: unknown): string => {
  const code = err && typeof err === "object" && "code" in err
    ? String((err as { code: string }).code)
    : "";

  switch (code) {
    case "wallet/trust-not-found":
      return "trustWalletNotFound";
    case "wallet/trust-mobile":
      return "trustWalletMobile";
    case "wallet/user-rejected":
      return "authPopupClosed";
    case "wallet/wc-not-configured":
      return "walletConnectNotConfigured";
    case "wallet/chain-not-supported":
      return "walletChainNotSupported";
    case "wallet/invalid-phrase":
      return "walletInvalidPhrase";
    case "wallet/invalid-signature":
      return "walletInvalidSignature";
    case "wallet/already-linked":
      return "walletAlreadyLinked";
    case "wallet/not-linked":
      return "walletNotLinked";
    case "wallet/primary-not-saved":
      return "switchWalletFailed";
    case "wallet/auth-exchange-failed":
      return "walletAuthExchangeFailed";
    case "wallet/auth-api-unavailable":
      return "walletAuthApiUnavailable";
    case "embedded/wallet-pending":
      return "embeddedWalletPending";
    case "embedded/invalid-address":
      return "walletInvalidAddress";
    case "embedded/not-ready":
      return "embeddedWalletNotReady";
    case "auth/not-signed-in":
      return "authSessionRequired";
    default:
      if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        if (msg.includes("user rejected") || msg.includes("user denied")) return "authPopupClosed";
        if (msg.includes("not configured")) return "walletConnectNotConfigured";
        if (msg.includes("chains are not supported") || msg.includes("chain not supported")) {
          return "walletChainNotSupported";
        }
      }
      return "authFailed";
  }
};
